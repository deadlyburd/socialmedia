/**
 * SaaS Core API — Hono router for the multi-tenant dashboard.
 *
 * AUTH (delegated to Auth.js v5 — next-auth@beta):
 *   Auth.js handles: /api/auth/* (sign-in, callback, session, sign-out)
 *   Remaining custom endpoints below:
 *     POST   /api/auth/email/signup        — Email + password signup (user creation)
 *     POST   /api/auth/forgot-password    — Send reset code
 *     POST   /api/auth/reset-password     — Reset password with code
 *
 * PROTECTED (require auth session via Auth.js):
 *   POST   /api/onboarding/niche         — Select niche
 *   POST   /api/onboarding/website       — Submit website URL
 *   POST   /api/auth/onboarding-complete — Mark onboarding done
 *   GET    /api/dashboard               — Full dashboard state
 *   ...all content/tenant/platform routes...
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  requireAuth,
  requireTenantAccess,
  requireAdmin,
  requireClient,
  requireAgencyAccess,
  getClientIP,
} from "../../auth/hono-adapter";
import { hashPassword, verifyPassword } from "../../auth/password";
import { rateLimitByIP, rateLimitByEmail } from "../../auth/rate-limit";
import { createUser as storeCreateUser, getUserByEmail, getUserById, markOnboardingComplete as storeMarkOnboardingComplete, updateUser, getClientsByAdmin } from "../../auth/user-store";
import { getAdminClient } from "../../supabase/admin";
import { AnalyticsService } from "../services/analytics-service";
import { AuthService } from "../services/auth-service";
import { contentReverseEngineer } from "../services/content-reverse-engineer";
import { contentService } from "../services/content-service";
import { PackService } from "../services/pack-service";
import { promptCache } from "../services/prompt-cache";
import { getTelegramBot, linkTenantChat } from "../services/telegram-bot";
import { tenantService } from "../services/tenant-service";
import { websiteScraper } from "../services/website-scraper";
import { WorkflowEngine } from "../services/workflow-engine";
import { validate, honoErrorHandler, ValidationError, ApiError, logger, schemas } from "../../api-utils";
import type { ApiResponse } from "../types";

const app = new Hono();

// ── Global middleware ────────────────────────────────────────────────

app.use("*", cors({
  origin: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

app.onError(honoErrorHandler);

app.notFound((c) => {
  return c.json({ success: false, error: `Route not found: ${c.req.method} ${c.req.path}` }, 404);
});

// ── Shared services ──────────────────────────────────────────────────

const authService = new AuthService();
const packService = new PackService();
const analyticsService = new AnalyticsService();
const workflow = new WorkflowEngine(authService, undefined, contentService, undefined, undefined, undefined);

// ── Reset codes (in-memory — use Redis/DB in production) ───────────

const resetCodes = new Map<string, { code: string; expiresAt: number }>();

// ── Health ───────────────────────────────────────────────────────────

app.get("/api/health", (c) => {
  return c.json({
    success: true,
    data: { status: "healthy", version: "2.0.0", activeTenants: tenantService.getActiveTenantCount() },
  });
});

// ═══════════════════════════════════════════════════════════════════════
// AUTH ENDPOINTS — complementary to Auth.js
// Auth.js handles: sign-in, callback, session, sign-out at /api/auth/*
// These endpoints handle signup + password reset (not provided by Auth.js)
// ═══════════════════════════════════════════════════════════════════════

// ── Email signup (user creation — Auth.js credentials provider handles login) ──

app.post("/api/auth/email/signup", async (c) => {
  const ip = getClientIP(c);
  const rl = rateLimitByIP(ip, "signup");
  if (!rl.allowed) {
    return c.json({ success: false, error: "Too many signup attempts. Try again later." }, 429);
  }

  const body = await validate(c, schemas.signup);
  const { email, password, name } = body;

  const existing = await getUserByEmail(email);
  if (existing) {
    return c.json({ success: false, error: "An account with this email already exists." }, 409);
  }

  const user = await storeCreateUser({ email, password, name });

  // Also create AuthService session for tenant/onboarding tracking
  authService.ensureSession(user.id, user.email, user.name);

  return c.json({
    success: true,
    data: {
      userId: user.id,
      name: user.name,
      email: user.email,
      onboardingComplete: false,
    },
  });
});

// ── Forgot password ──────────────────────────────────────────────────

app.post("/api/auth/forgot-password", async (c) => {
  const ip = getClientIP(c);
  const rl = rateLimitByIP(ip, "forgot");
  if (!rl.allowed) {
    return c.json({ success: false, error: "Too many attempts. Try again later." }, 429);
  }

  const body = await validate(c, schemas.forgotPassword);
  const { email } = body;

  const user = await getUserByEmail(email);
  // Always return success to prevent email enumeration
  if (!user) {
    return c.json({ success: true, data: { message: "If an account exists, a reset code has been sent." } });
  }

  // Use crypto.randomInt for secure random codes
  const crypto = await import("node:crypto");
  const code = String(crypto.randomInt(100000, 999999));
  resetCodes.set(email.toLowerCase(), { code, expiresAt: Date.now() + 15 * 60_000 });

  // Send email notification (or log in dev)
  try {
    const { sendPasswordResetCode } = await import("../../notifications");
    await sendPasswordResetCode({ email, code });
  } catch {
    // Non-blocking — don't fail the request if email fails
  }

  const isDev = !process.env.NODE_ENV?.startsWith("prod");
  if (isDev) {
    console.log(`[auth] Reset code for ${email}: ${code}`);
  }

  return c.json({
    success: true,
    data: {
      message: "If an account exists, a reset code has been sent.",
      resetCode: isDev ? code : undefined,
    },
  });
});

// ── Reset password ───────────────────────────────────────────────────

app.post("/api/auth/reset-password", async (c) => {
  const ip = getClientIP(c);
  const rl = rateLimitByIP(ip, "reset");
  if (!rl.allowed) {
    return c.json({ success: false, error: "Too many attempts. Try again later." }, 429);
  }

  const body = await validate(c, schemas.resetPassword);
  const { email, code, newPassword } = body;

  const stored = resetCodes.get(email.toLowerCase());
  if (!stored || stored.code !== code || Date.now() > stored.expiresAt) {
    return c.json({ success: false, error: "Invalid or expired reset code." }, 400);
  }

  const user = await getUserByEmail(email);
  if (!user) {
    return c.json({ success: false, error: "Account not found." }, 404);
  }

  await updateUser(email, { passwordHash: hashPassword(newPassword) });
  resetCodes.delete(email.toLowerCase());

  return c.json({ success: true, data: { message: "Password updated. You can now log in." } });
});

// ═══════════════════════════════════════════════════════════════════════
// PROTECTED ENDPOINTS — require auth cookie
// ═══════════════════════════════════════════════════════════════════════

// ── Onboarding: Select Niche ─────────────────────────────────────────

app.post("/api/onboarding/niche", requireAuth, async (c) => {
  const session = c.get("session");
  const { niche, packSlug, businessDescription } = await c.req.json();
  if (!niche) {
    return c.json({ success: false, error: "Niche is required." }, 400);
  }

  const state = authService.setNiche(session.sub, niche, packSlug ?? niche, businessDescription);
  const pack = packService.getPack(packSlug) ?? packService.loadPacks().find(p => p.slug === "custom");

  return c.json({ success: true, data: { onboarding: state, pack } });
});

// ── Onboarding: Submit Website ───────────────────────────────────────

app.post("/api/onboarding/website", requireAuth, async (c) => {
  const session = c.get("session");
  const { url } = await c.req.json();
  if (!url?.match(/^https?:\/\/.+/)) {
    return c.json({ success: false, error: "Valid URL starting with http:// or https:// is required." }, 400);
  }

  const state = await authService.setWebsite(session.sub, url);
  const tenant = tenantService.createTenant({
    name: session.name,
    slug: session.email.replace(/[@.]/g, "-"),
    email: session.email,
  });
  authService.linkTenant(session.sub, tenant.id);

  return c.json({ success: true, data: { analysis: state.websiteAnalysis, tenant } });
});

// ── Mark onboarding complete ─────────────────────────────────────────

app.post("/api/auth/onboarding-complete", requireAuth, async (c) => {
  const session = c.get("session");
  authService.markOnboardingComplete(session.sub);
  return c.json({ success: true, data: { onboardingComplete: true } });
});

// ── Simple onboarding — niche + business name + website (no analysis) ─

app.post("/api/onboarding/complete", requireAuth, async (c) => {
  const session = c.get("session");
  const body = await validate(c, schemas.onboardingComplete);
  const { niche, businessName, websiteUrl } = body;

  const supabase = getAdminClient();

  try {
    // Save niche + website to onboarding state (in-memory)
    const state = authService.setNiche(session.sub, niche, niche, businessName);

    // Save website URL without analysis
    if (websiteUrl) {
      authService.setWebsiteUrlOnly(session.sub, websiteUrl);
    }

    // Update users table with business name
    const { error: updateErr } = await supabase
      .from("users")
      .update({
        name: businessName ?? session.name,
        onboarding_complete: true,
      })
      .eq("id", session.sub);

    if (updateErr) {
      console.error("[onboarding/complete] Failed to update user:", updateErr.message);
    }

    // Mark onboarding complete
    authService.markOnboardingComplete(session.sub);

    // Create tenant for this user
    const slug = (businessName ?? session.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const tenant = tenantService.createTenant({
      name: businessName ?? session.name,
      slug,
      email: session.email,
    });
    authService.linkTenant(session.sub, tenant.id);

    // Persist tenant to Supabase
    await supabase.from("tenants").upsert({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      email: session.email,
      owner_id: session.sub,
      status: "active",
      created_at: new Date().toISOString(),
    });

    // Persist onboarding to Supabase
    await supabase.from("onboarding").upsert({
      user_id: session.sub,
      step: "done",
      selected_niche: niche,
      business_description: businessName ?? null,
      website_url: websiteUrl ?? null,
      updated_at: new Date().toISOString(),
    });

    return c.json({
      success: true,
      data: {
        niche,
        businessName: businessName ?? session.name,
        websiteUrl: websiteUrl ?? null,
        tenantId: tenant.id,
        onboardingComplete: true,
      },
    });
  } catch (err: any) {
    console.error("[onboarding/complete] Error:", err.message);
    return c.json({ success: false, error: "Failed to save onboarding data." }, 500);
  }
});

// ── Dashboard ────────────────────────────────────────────────────────

app.get("/api/dashboard", requireAuth, async (c) => {
  const session = c.get("session");
  // Resolve to stored user ID (Supabase UUID → old custom ID via email bridge)
  let userId = authService.resolveUserId(session.sub) ?? authService.resolveUserId(session.email) ?? session.sub;
  const dashboard = workflow.getDashboard(userId);
  return c.json({ success: true, data: dashboard });
});

// ── Platforms ────────────────────────────────────────────────────────

app.post("/api/platforms/setup", requireAuth, async (c) => {
  const session = c.get("session");
  const body = await c.req.json();
  const result = await workflow.setupPlatform({ userId: session.sub, ...body });
  return c.json({ success: true, data: result });
});

app.get("/api/platforms/:tenantId", requireAuth, requireTenantAccess, async (c) => {
  const tenantId = c.req.param("tenantId");
  // PlatformSetupService is internal to WorkflowEngine
  const dashboard = workflow.getDashboard(c.get("session").sub);
  const platforms = dashboard.platforms.filter(p => {
    // Filter by tenant — platforms are keyed by tenant ID inside the service
    return true; // getDashboard already filters by user's tenants
  });
  return c.json({ success: true, data: platforms });
});

// ── Content ──────────────────────────────────────────────────────────

app.post("/api/content/generate", requireAuth, async (c) => {
  const session = c.get("session");
  const body = await c.req.json();
  const result = await workflow.generateAndNotify({ userId: session.sub, ...body });
  return c.json({ success: true, data: result });
});

// Auto-resolve tenant from session (no tenant ID param needed)
app.get("/api/content", requireAuth, async (c) => {
  const session = c.get("session");
  console.log("[api/content] session.sub:", session.sub, "email:", session.email);
  // Try Supabase UUID first, then email, then stored custom ID
  let tenantIds = authService.getUserTenants(session.sub);
  console.log("[api/content] by UUID:", tenantIds);
  if (!tenantIds || tenantIds.length === 0) {
    tenantIds = authService.getUserTenants(session.email);
    console.log("[api/content] by email:", tenantIds);
  }
  if (!tenantIds || tenantIds.length === 0) {
    console.log("[api/content] No tenants found for user");
    return c.json({ success: true, data: [] });
  }
  const content = await contentService.listContent(tenantIds[0]!);
  console.log("[api/content] tenantId:", tenantIds[0], "content count:", content.length);
  if (content.length > 0) {
    console.log("[api/content] First item scheduledAt:", content[0]?.scheduledAt, "title:", content[0]?.title?.slice(0, 40));
  }
  return c.json({ success: true, data: content });
});

app.get("/api/content/:tenantId", requireAuth, requireTenantAccess, async (c) => {
  const tenantId = c.req.param("tenantId");
  const content = await contentService.listContent(tenantId);
  return c.json({ success: true, data: content });
});

app.patch("/api/content/:id/status", requireAuth, async (c) => {
  const { id } = c.req.param();
  const { status } = await c.req.json();
  const updated = contentService.updateStatus(id, status);
  return c.json({ success: true, data: updated });
});

// ── Packs ────────────────────────────────────────────────────────────

app.get("/api/packs", (c) => {
  return c.json({ success: true, data: packService.loadPacks() });
});

app.get("/api/packs/:slug", (c) => {
  const pack = packService.getPack(c.req.param("slug"));
  if (!pack) return c.json({ success: false, error: "Pack not found." }, 404);
  return c.json({ success: true, data: pack });
});

// ── Reverse Engineer ─────────────────────────────────────────────────

app.get("/api/reverse-engineer/formulas", (c) => {
  const formulas = contentReverseEngineer.listFormulas();
  return c.json({ success: true, data: formulas });
});

app.post("/api/reverse-engineer/generate", async (c) => {
  const body = await c.req.json();
  const result = await contentReverseEngineer.reverseEngineer(body);
  return c.json({ success: true, data: result });
});

// ── Analytics ────────────────────────────────────────────────────────

// Auto-resolve tenant from session (no tenant ID param needed)
app.get("/api/analytics", requireAuth, async (c) => {
  const session = c.get("session");
  let tenantIds = authService.getUserTenants(session.sub);
  if (!tenantIds || tenantIds.length === 0) {
    tenantIds = authService.getUserTenants(session.email);
  }
  if (!tenantIds || tenantIds.length === 0) {
    return c.json({ success: true, data: { totalContent: 0, platformBreakdown: {}, trends: [], aiUsage: {} } });
  }
  const analytics = await analyticsService.getTenantAnalytics(tenantIds[0]!);
  return c.json({ success: true, data: analytics });
});

app.get("/api/analytics/:tenantId", requireAuth, requireTenantAccess, async (c) => {
  const tenantId = c.req.param("tenantId");
  const analytics = await analyticsService.getTenantAnalytics(tenantId);
  return c.json({ success: true, data: analytics });
});

// ── Prompt Cache ─────────────────────────────────────────────────────

app.get("/api/cache/stats", (c) => {
  return c.json({ success: true, data: promptCache.getStats() });
});

// ── Telegram ─────────────────────────────────────────────────────────

app.get("/api/telegram/status", (c) => {
  const bot = getTelegramBot();
  return c.json({ success: true, data: { running: bot.isRunning(), username: bot.getUsername() } });
});

app.post("/api/telegram/link", requireAuth, async (c) => {
  const session = c.get("session");
  const { tenantId, chatId } = await c.req.json();
  linkTenantChat(tenantId, chatId);
  return c.json({ success: true, data: { linked: true } });
});

// ── Tenants ──────────────────────────────────────────────────────────

app.get("/api/tenants", requireAuth, async (c) => {
  const session = c.get("session");
  let tenantIds = authService.getUserTenants(session.sub);
  if (!tenantIds || tenantIds.length === 0) tenantIds = authService.getUserTenants(session.email);
  const tenants = tenantIds.map(id => tenantService.getTenant(id)).filter(Boolean);
  return c.json({ success: true, data: tenants });
});

app.post("/api/tenants", requireAuth, async (c) => {
  const session = c.get("session");
  const body = await c.req.json();
  const tenant = tenantService.createTenant(body);
  authService.linkTenant(session.sub, tenant.id);
  return c.json({ success: true, data: tenant }, 201);
});

// ── Queue (alias for content with pending status) ────────────────────

app.get("/api/queue/:tenantId", requireAuth, async (c) => {
  const tenantId = c.req.param("tenantId");
  const items = await contentService.listContent(tenantId);
  const pending = items.filter((i: any) => i.status === "pending_approval" || i.status === "draft");
  return c.json({ success: true, data: pending });
});

app.post("/api/queue/bulk-approve", requireAuth, async (c) => {
  const body = await c.req.json();
  const results: any[] = [];
  for (const id of (body.ids ?? [])) {
    const updated = contentService.updateStatus(id, "published");
    if (updated) results.push(updated);
  }
  return c.json({ success: true, data: results });
});

// ── Trends (stub for now) ───────────────────────────────────────────

app.get("/api/trends", requireAuth, async (c) => {
  const session = c.get("session");
  let tenantIds = authService.getUserTenants(session.sub);
  if (!tenantIds || tenantIds.length === 0) tenantIds = authService.getUserTenants(session.email);
  const tenantId = tenantIds[0];
  if (!tenantId) return c.json({ success: true, data: { trends: [] } });
  const content = await contentService.listContent(tenantId);
  return c.json({ success: true, data: { trends: content ?? [] } });
});

app.post("/api/trends/generate", requireAuth, async (c) => {
  return c.json({ success: true, data: { message: "Trend generation queued" } });
});

// ── Notifications ────────────────────────────────────────────────────

app.get("/api/notifications", requireAuth, async (c) => {
  const session = c.get("session");
  const userId = authService.resolveUserId(session.sub) ?? authService.resolveUserId(session.email) ?? session.sub;
  const notifications = workflow.getDashboard(userId).notifications;
  return c.json({ success: true, data: notifications });
});

// ═══════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════

// ── List all clients for admin ───────────────────────────────────────

app.get("/api/admin/clients", requireAuth, requireAdmin, async (c) => {
  const session = c.get("session");
  const supabase = getAdminClient();

  // Get all tenants owned by this admin
  const { data: tenants } = await supabase
    .from("tenants")
    .select("*")
    .eq("agency_id", session.sub);

  if (!tenants?.length) {
    return c.json({ success: true, data: [] });
  }

  // Get client users + content counts
  const result = [];
  for (const t of tenants) {
    const { count } = await supabase
      .from("content_assets")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", t.id);

    // Find the user linked to this tenant
    const { data: users } = await supabase
      .from("users")
      .select("id, email, name")
      .eq("email", t.email)
      .limit(1);

    result.push({
      userId: users?.[0]?.id ?? "",
      tenantId: t.id,
      name: users?.[0]?.name ?? t.name,
      email: t.email,
      businessName: t.name,
      status: t.status,
      createdAt: t.created_at,
      contentCount: count ?? 0,
    });
  }

  return c.json({ success: true, data: result });
});

// ── Create client ─────────────────────────────────────────────────────

app.post("/api/admin/clients", requireAuth, requireAdmin, async (c) => {
  const session = c.get("session");
  const ip = getClientIP(c);
  const rl = rateLimitByIP(ip, "admin-create-client");
  if (!rl.allowed) {
    return c.json({ success: false, error: "Too many requests. Try again later." }, 429);
  }

  const body = await validate(c, schemas.createClient);
  const { name, email, businessName, password } = body;

  if (!name || !email || !businessName || !password) {
    return c.json({ success: false, error: "All fields are required." }, 400);
  }

  try {
    const supabase = getAdminClient();

    // Create user in Supabase Auth
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (authError) {
      return c.json({ success: false, error: authError.message }, 400);
    }

    // Create user record in users table
    const user = await storeCreateUser({ email, password, name, role: "client" });

    // Create tenant
    const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const tenant = tenantService.createTenant({
      name: businessName,
      slug,
      email,
    });

    // Link tenant to admin
    tenantService.updateMetadata(tenant.id, { ownerName: name });
    const supabase2 = getAdminClient();
    await supabase2
      .from("tenants")
      .update({ agency_id: session.sub })
      .eq("id", tenant.id);

    authService.linkTenant(user.id, tenant.id);
    authService.ensureSession(user.id, email, name);

    return c.json({
      success: true,
      data: {
        userId: user.id,
        tenantId: tenant.id,
        name: user.name,
        email: user.email,
        businessName: tenant.name,
        temporaryPassword: password,
      },
    }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ── Delete client ─────────────────────────────────────────────────────

app.delete("/api/admin/clients/:id", requireAuth, requireAdmin, requireAgencyAccess, async (c) => {
  const tenantId = c.req.param("id");
  tenantService.deleteTenant(tenantId);

  const supabase = getAdminClient();
  await supabase.from("content_assets").delete().eq("tenant_id", tenantId);
  await supabase.from("tenants").delete().eq("id", tenantId);

  return c.json({ success: true });
});

// ── Admin content list (all clients) ──────────────────────────────────

app.get("/api/admin/content", requireAuth, requireAdmin, async (c) => {
  const session = c.get("session");
  const supabase = getAdminClient();

  // Get all tenants for this admin
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id")
    .eq("agency_id", session.sub);

  if (!tenants?.length) {
    return c.json({ success: true, data: [] });
  }

  const tenantIds = tenants.map(t => t.id);
  const { data: assets } = await supabase
    .from("content_assets")
    .select("*")
    .in("tenant_id", tenantIds)
    .order("created_at", { ascending: false })
    .limit(50);

  return c.json({ success: true, data: assets ?? [] });
});

// ── Admin calendar for specific client ────────────────────────────────

app.get("/api/admin/calendar/:clientId", requireAuth, requireAdmin, requireAgencyAccess, async (c) => {
  const clientId = c.req.param("clientId");
  const supabase = getAdminClient();

  const { data: assets } = await supabase
    .from("content_assets")
    .select("*")
    .eq("tenant_id", clientId)
    .order("scheduled_date", { ascending: true });

  return c.json({ success: true, data: assets ?? [] });
});

// ── Admin upload content ──────────────────────────────────────────────

app.post("/api/admin/upload", requireAuth, requireAdmin, async (c) => {
  const session = c.get("session");
  const ip = getClientIP(c);
  const rl = rateLimitByIP(ip, "admin-upload");
  if (!rl.allowed) {
    return c.json({ success: false, error: "Too many uploads. Try again later." }, 429);
  }

  const contentType = c.req.header("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return c.json({ success: false, error: "Multipart form data required." }, 400);
  }

  try {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    const tenantId = formData.get("tenantId") as string;
    const title = formData.get("title") as string;
    const description = (formData.get("description") as string) ?? "";
    const contentAssetType = (formData.get("contentType") as string) ?? "video";
    const platform = (formData.get("platform") as string) ?? "all";
    const scheduledDate = (formData.get("scheduledDate") as string) ?? new Date().toISOString().split("T")[0];

    if (!file || !tenantId || !title) {
      return c.json({ success: false, error: "file, tenantId, and title are required." }, 400);
    }

    // Verify tenant belongs to this admin
    const supabase = getAdminClient();
    const { data: tenant } = await supabase
      .from("tenants")
      .select("agency_id")
      .eq("id", tenantId)
      .maybeSingle();

    if (!tenant || tenant.agency_id !== session.sub) {
      return c.json({ success: false, error: "Access denied." }, 403);
    }

    // Upload file to storage (Vercel Blob → R2 → Base64 fallback)
    const { uploadFile } = await import("../../storage");
    const arrayBuffer = await file.arrayBuffer();
    const mimeType = file.type || "application/octet-stream";
    const ext = file.name.split(".").pop() ?? "bin";
    const storageResult = await uploadFile({
      data: Buffer.from(arrayBuffer),
      filename: `${title.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 50)}.${ext}`,
      contentType: mimeType,
      tenantId,
    });

    const assetId = `asset_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const asset = {
      id: assetId,
      tenant_id: tenantId,
      title,
      description,
      file_url: storageResult.url,
      thumbnail_url: null,
      content_type: contentAssetType,
      file_size: storageResult.size,
      mime_type: mimeType,
      duration_seconds: null,
      platform,
      scheduled_date: scheduledDate,
      status: "ready",
      created_at: now,
      created_by: session.sub,
    };

    const { error } = await supabase.from("content_assets").insert(asset);
    if (error) {
      console.error("[api] Failed to insert content asset:", error.message);
      return c.json({ success: false, error: "Failed to save asset." }, 500);
    }

    return c.json({
      success: true,
      data: {
        id: assetId,
        title,
        contentType: contentAssetType,
        scheduledDate,
        fileSize: file.size,
      },
    }, 201);
  } catch (err: any) {
    console.error("[api] Upload error:", err.message);
    return c.json({ success: false, error: "Upload failed." }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// CLIENT ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════

function getClientTenantId(c: any): string | null {
  const session = c.get("session");
  if (!session?.email) return null;
  // Resolve tenant from session
  const tenantIds = authService.getUserTenants(session.sub);
  if (tenantIds?.length) return tenantIds[0]!;
  const emailIds = authService.getUserTenants(session.email);
  if (emailIds?.length) return emailIds[0]!;
  return null;
}

// ── Client calendar ───────────────────────────────────────────────────

app.get("/api/client/calendar", requireAuth, async (c) => {
  const tenantId = getClientTenantId(c);
  if (!tenantId) {
    return c.json({ success: true, data: [] });
  }

  const supabase = getAdminClient();
  const { data: assets } = await supabase
    .from("content_assets")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("scheduled_date", { ascending: true });

  return c.json({ success: true, data: assets ?? [] });
});

// ── Client content download (mark as downloaded) ──────────────────────

app.post("/api/client/content/:id/download", requireAuth, async (c) => {
  const assetId = c.req.param("id");
  const supabase = getAdminClient();

  const { error } = await supabase
    .from("content_assets")
    .update({ status: "downloaded" })
    .eq("id", assetId);

  if (error) {
    return c.json({ success: false, error: "Update failed." }, 500);
  }

  return c.json({ success: true });
});

// ── Client post to platform (actual social media posting) ────────────

app.post("/api/client/content/:id/post", requireAuth, async (c) => {
  const assetId = c.req.param("id");
  const body = await validate(c, schemas.postContent);
  const { platform } = body;
  const tenantId = getClientTenantId(c);

  if (!tenantId) {
    return c.json({ success: false, error: "No account found." }, 400);
  }

  const supabase = getAdminClient();

  // Get the content asset
  const { data: asset } = await supabase
    .from("content_assets")
    .select("*")
    .eq("id", assetId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!asset) {
    return c.json({ success: false, error: "Content not found." }, 404);
  }

  // Try to post to the actual platform
  const { postToPlatform } = await import("../../social-oauth");
  const result = await postToPlatform(tenantId, platform as any, {
    platform: platform as any,
    mediaUrl: asset.file_url,
    caption: `${asset.title}\n\n${asset.description}`,
    mediaType: asset.content_type === "reel" ? "reel" : "feed",
  });

  if (result.success) {
    // Mark as posted with platform URL
    await supabase
      .from("content_assets")
      .update({
        status: "posted",
        description: asset.description
          ? `${asset.description}\n\nPosted to ${platform}: ${result.platformPostUrl ?? ""}`
          : `Posted to ${platform}: ${result.platformPostUrl ?? ""}`,
      })
      .eq("id", assetId);

    return c.json({
      success: true,
      data: {
        posted: true,
        assetId,
        platformPostId: result.platformPostId,
        platformPostUrl: result.platformPostUrl,
      },
    });
  }

  // If real posting fails (token expired, not connected, etc.),
  // mark as downloaded so client can post manually
  if (result.error?.includes("not connected") || result.error?.includes("token expired")) {
    return c.json({
      success: false,
      error: result.error,
      needsReauth: true,
    }, 400);
  }

  // Generic posting failure — still mark as ready for manual posting
  return c.json({
    success: false,
    error: result.error ?? "Post failed. Try downloading and posting manually.",
  }, 500);
});

// ── Client accounts list ──────────────────────────────────────────────

app.get("/api/client/accounts", requireAuth, async (c) => {
  const tenantId = getClientTenantId(c);
  if (!tenantId) {
    return c.json({ success: true, data: [] });
  }

  const supabase = getAdminClient();
  const { data: connections } = await supabase
    .from("platform_connections")
    .select("*")
    .eq("tenant_id", tenantId);

  return c.json({
    success: true,
    data: (connections ?? []).map((conn: any) => ({
      platform: conn.platform,
      connected: conn.connected,
      handle: conn.handle,
    })),
  });
});

// ── Client connect platform (initiates real OAuth flow) ──────────────

app.post("/api/client/accounts/connect", requireAuth, async (c) => {
  const body = await validate(c, schemas.connectPlatform);
  const { platform } = body;
  const tenantId = getClientTenantId(c);

  if (!tenantId) {
    return c.json({ success: false, error: "No tenant found." }, 400);
  }

  // Get OAuth URL for real platform authentication
  const { getOAuthUrl, getAvailablePlatforms } = await import("../../social-oauth");
  const availablePlatforms = getAvailablePlatforms();

  if (availablePlatforms.includes(platform)) {
    const authUrl = getOAuthUrl(platform, tenantId);
    if (authUrl) {
      return c.json({
        success: true,
        data: { platform, authUrl, needsOAuth: true },
      });
    }
  }

  // Fallback: if no OAuth credentials are configured, mark as pending
  // The platform will work once credentials are set up
  const supabase = getAdminClient();
  const id = `pc_${tenantId}_${platform}`;

  await supabase.from("platform_connections").upsert({
    id,
    tenant_id: tenantId,
    platform,
    connected: false,
    handle: null,
    connected_at: null,
  });

  return c.json({
    success: true,
    data: {
      platform,
      connected: false,
      needsSetup: true,
      message: `OAuth credentials not yet configured for ${platform}. Contact your agency admin to set up ${platform} integration.`,
    },
  });
});

// ── Check platform connection status ────────────────────────────────

app.get("/api/client/accounts/:platform/status", requireAuth, async (c) => {
  const platform = c.req.param("platform");
  const tenantId = getClientTenantId(c);

  if (!tenantId) {
    return c.json({ success: false, error: "No tenant found." }, 400);
  }

  const { getStoredTokens } = await import("../../social-oauth");
  const tokens = await getStoredTokens(tenantId, platform as any);

  return c.json({
    success: true,
    data: {
      platform,
      connected: !!tokens,
      handle: tokens?.handle ?? null,
      expiresAt: tokens?.expiresAt ? new Date(tokens.expiresAt * 1000).toISOString() : null,
    },
  });
});

// ── Client disconnect platform ───────────────────────────────────────

app.delete("/api/client/accounts/:platform", requireAuth, async (c) => {
  const platform = c.req.param("platform");
  const tenantId = getClientTenantId(c);

  if (!tenantId) {
    return c.json({ success: false, error: "No tenant found." }, 400);
  }

  const supabase = getAdminClient();
  await supabase
    .from("platform_connections")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("platform", platform);

  return c.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════
// AI VIDEO GENERATION — Seedance 2.0
// ═══════════════════════════════════════════════════════════════════════

app.post("/api/admin/generate-video", requireAuth, requireAdmin, async (c) => {
  const body = await c.req.json();
  const { prompt, model, duration, quality, aspectRatio, generateAudio, tenantId } = body;

  if (!prompt || !tenantId) {
    return c.json({ success: false, error: "prompt and tenantId are required." }, 400);
  }

  const { submitVideoGeneration } = await import("@/lib/services/seedance-service");
  const result = await submitVideoGeneration({
    prompt,
    model: model ?? "seedance-2.0-text-to-video",
    duration: duration ?? 5,
    quality: quality ?? "720p",
    aspectRatio: aspectRatio ?? "16:9",
    generateAudio,
  });

  if ("error" in result) {
    return c.json({ success: false, error: result.error }, 500);
  }

  return c.json({ success: true, data: { taskId: result.taskId } });
});

app.get("/api/admin/generate-video", requireAuth, requireAdmin, async (c) => {
  const taskId = c.req.query("taskId");
  if (!taskId) {
    return c.json({ success: false, error: "taskId query param is required." }, 400);
  }

  const { pollTaskStatus } = await import("@/lib/services/seedance-service");
  const task = await pollTaskStatus(taskId);

  return c.json({ success: true, data: task });
});

app.post("/api/admin/generate-video/push", requireAuth, requireAdmin, async (c) => {
  const { videoUrl, tenantId, title, prompt } = await c.req.json();

  if (!videoUrl || !tenantId) {
    return c.json({ success: false, error: "videoUrl and tenantId are required." }, 400);
  }

  try {
    // Step 1: Download the video from Seedance
    const { downloadVideo } = await import("@/lib/services/seedance-service");
    const result = await downloadVideo(videoUrl);
    if ("error" in result) {
      return c.json({ success: false, error: result.error }, 500);
    }

    // Step 2: Upload to R2 (or store as base64 if R2 isn't configured)
    const supabase = getAdminClient();
    const assetId = `video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const today = new Date().toISOString().split("T")[0]!;

    let fileUrl: string;
    const r2Endpoint = process.env.R2_ENDPOINT;
    const r2Bucket = process.env.R2_BUCKET;
    const r2Key = process.env.R2_ACCESS_KEY_ID;
    const r2Secret = process.env.R2_SECRET_ACCESS_KEY;
    const r2Public = process.env.R2_PUBLIC_URL;

    if (r2Endpoint && r2Bucket && r2Key && r2Secret) {
      // Upload to R2
      const filename = `${tenantId}/${assetId}.mp4`;
      const uploadRes = await fetch(`${r2Endpoint}/${r2Bucket}/${filename}`, {
        method: "PUT",
        headers: {
          "Content-Type": result.contentType,
          "Authorization": `Basic ${Buffer.from(`${r2Key}:${r2Secret}`).toString("base64")}`,
        },
        body: result.buffer,
      });

      if (!uploadRes.ok) {
        // Fallback to base64 if R2 upload fails
        fileUrl = `data:${result.contentType};base64,${result.buffer.toString("base64")}`;
      } else {
        fileUrl = r2Public ? `${r2Public}/${filename}` : `${r2Endpoint}/${r2Bucket}/${filename}`;
      }
    } else {
      // No R2 config — store as base64
      fileUrl = `data:${result.contentType};base64,${result.buffer.toString("base64")}`;
    }

    // Step 3: Store in content_assets → appears on client calendar
    const { error } = await supabase.from("content_assets").insert({
      id: assetId,
      tenant_id: tenantId,
      title: title ?? "AI Generated Video",
      description: prompt ?? "",
      file_url: fileUrl,
      content_type: "video",
      file_size: result.buffer.length,
      mime_type: result.contentType,
      platform: "all",
      scheduled_date: today,
      status: "ready",
      created_at: new Date().toISOString(),
      created_by: c.get("session").sub,
    });

    if (error) {
      return c.json({ success: false, error: `Database error: ${error.message}` }, 500);
    }

    // Get client name for response
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name")
      .eq("id", tenantId)
      .maybeSingle();

    return c.json({
      success: true,
      data: {
        assetId,
        clientName: tenant?.name ?? "Client",
        fileUrl,
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// CRON ENDPOINTS (called by Vercel Cron Jobs)
// ═══════════════════════════════════════════════════════════════════════

app.get("/api/cron/daily-blogs", async (c) => {
  // Verify cron secret to prevent abuse
  const cronSecret = c.req.header("x-cron-secret") ?? c.req.query("secret");
  if (cronSecret !== process.env.CRON_SECRET) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  try {
    const { runDailyBlogAutomation } = await import("../services/blog-automation");
    const result = await runDailyBlogAutomation();
    return c.json({ success: true, data: result });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ── Blog automation config per client ───────────────────────────────

app.post("/api/admin/clients/:id/blog-automation", requireAuth, requireAdmin, async (c) => {
  const tenantId = c.req.param("id");
  const config = await c.req.json();

  const supabase = getAdminClient();
  const { error } = await supabase
    .from("tenants")
    .update({ automation_config: config })
    .eq("id", tenantId);

  if (error) {
    return c.json({ success: false, error: error.message }, 500);
  }

  return c.json({ success: true, data: config });
});

app.get("/api/admin/clients/:id/blog-automation", requireAuth, requireAdmin, async (c) => {
  const tenantId = c.req.param("id");

  const supabase = getAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select("automation_config")
    .eq("id", tenantId)
    .maybeSingle();

  return c.json({ success: true, data: data?.automation_config ?? {} });
});

// ── On-demand blog generation (admin triggers for a client) ─────────

app.post("/api/admin/clients/:id/generate-blog", requireAuth, requireAdmin, async (c) => {
  const tenantId = c.req.param("id");
  const { topic } = await c.req.json();

  const { getClientBlogConfig, generateSingleBlog } = await import("../services/blog-automation");
  const config = await getClientBlogConfig(tenantId);

  if (!config) {
    return c.json({ success: false, error: "Blog automation not configured for this client." }, 400);
  }

  const result = await generateSingleBlog(
    topic ?? `${config.niche} best practices ${new Date().getFullYear()}`,
    config,
  );

  if (result.error || !result.blog) {
    return c.json({ success: false, error: result.error ?? "Generation failed" }, 500);
  }

  return c.json({
    success: true,
    data: {
      title: result.blog.title,
      excerpt: result.blog.excerpt,
      qualityScore: result.qualityScore,
      competitorCount: result.competitorCount,
      pushed: result.pushed,
      topic: result.topic,
    },
  });
});

// ── Client-side: generate blog for own account ──────────────────────

app.post("/api/client/generate-blog", requireAuth, async (c) => {
  const session = c.get("session");
  const { topic } = await c.req.json();

  // Resolve tenant from session
  const tenantId = getClientTenantId(c);
  if (!tenantId) {
    return c.json({ success: false, error: "No account found." }, 400);
  }

  const { getClientBlogConfig, generateSingleBlog } = await import("../services/blog-automation");
  const config = await getClientBlogConfig(tenantId);

  if (!config) {
    return c.json({ success: false, error: "Blog automation not configured for your account. Contact your agency." }, 400);
  }

  const result = await generateSingleBlog(
    topic ?? `${config.niche} trends and insights ${new Date().getFullYear()}`,
    config,
  );

  if (result.error || !result.blog) {
    return c.json({ success: false, error: result.error ?? "Generation failed" }, 500);
  }

  return c.json({
    success: true,
    data: {
      title: result.blog.title,
      excerpt: result.blog.excerpt,
      body: result.blog.body,
      qualityScore: result.qualityScore,
      competitorCount: result.competitorCount,
      pushed: result.pushed,
      topic: result.topic,
    },
  });
});

// ── Client: blog auto-generation toggle ───────────────────────────

app.get("/api/client/blog-auto-status", requireAuth, async (c) => {
  const tenantId = getClientTenantId(c);
  if (!tenantId) return c.json({ success: true, data: { dailyAutoEnabled: false } });

  const supabase = getAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select("automation_config")
    .eq("id", tenantId)
    .maybeSingle();

  const cfg = (data?.automation_config as Record<string, any>) ?? {};
  return c.json({ success: true, data: { dailyAutoEnabled: cfg.dailyAutoEnabled ?? false } });
});

app.post("/api/client/blog-auto-toggle", requireAuth, async (c) => {
  const tenantId = getClientTenantId(c);
  if (!tenantId) return c.json({ success: false, error: "No account found." }, 400);

  const { enabled } = await c.req.json();

  const supabase = getAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select("automation_config")
    .eq("id", tenantId)
    .maybeSingle();

  const cfg = (data?.automation_config as Record<string, any>) ?? {};
  cfg.dailyAutoEnabled = enabled;

  await supabase
    .from("tenants")
    .update({ automation_config: cfg })
    .eq("id", tenantId);

  return c.json({ success: true, data: { dailyAutoEnabled: enabled } });
});

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC BLOG API (for client developers)
// ═══════════════════════════════════════════════════════════════════════

app.get("/api/v1/blogs/:tenantId", async (c) => {
  const tenantId = c.req.param("tenantId");
  const apiKey = c.req.query("apiKey") ?? c.req.header("x-api-key") ?? "";
  const limit = Math.min(parseInt(c.req.query("limit") ?? "10"), 50);

  if (!apiKey) {
    return c.json(
      { success: false, error: "API key required. Get yours from your agency dashboard." },
      401,
    );
  }

  const { validateApiKey, getPublicBlogPosts, checkRateLimit } =
    await import("../services/blog-api-service");

  // Rate limit check
  const rateLimit = checkRateLimit(apiKey);
  if (!rateLimit.allowed) {
    return c.json(
      { success: false, error: "Rate limit exceeded. Try again later." },
      429,
    );
  }

  const valid = await validateApiKey(tenantId, apiKey);
  if (!valid) {
    return c.json(
      { success: false, error: "Invalid API key." },
      403,
    );
  }

  // Add rate limit header
  c.header("X-RateLimit-Remaining", String(rateLimit.remaining));
  c.header("X-RateLimit-Reset", String(rateLimit.resetAt));

  const posts = await getPublicBlogPosts(tenantId, limit);
  const { data: tenant } = await getAdminClient()
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle();

  return c.json({
    success: true,
    tenant: tenant?.name ?? tenantId,
    posts,
    meta: {
      total: posts.length,
      limit,
      apiDocs: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/v1/docs`,
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════
// BILLING ENDPOINTS — Stripe Checkout + Customer Portal
// ═══════════════════════════════════════════════════════════════════════

app.post("/api/billing/checkout", requireAuth, requireAdmin, async (c) => {
  const body = await validate(c, schemas.billingCheckout);
  const { priceId, tenantId, successUrl, cancelUrl } = body;

  const session = c.get("session");
  const tenant = tenantService.getTenant(tenantId);

  if (!tenant) {
    return c.json({ success: false, error: "Tenant not found." }, 404);
  }

  const { billingService } = await import("../services/billing-service");
  const result = await billingService.createCheckoutSession({
    priceId,
    customerEmail: tenant.email,
    tenantId,
    customerId: tenant.stripeCustomerId,
    successUrl: successUrl ?? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/admin/settings/billing?checkout=success`,
    cancelUrl: cancelUrl ?? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/admin/settings/billing?checkout=cancelled`,
  });

  if (result.error) {
    return c.json({ success: false, error: result.error }, 500);
  }

  return c.json({ success: true, data: { url: result.url } });
});

app.get("/api/billing/portal", requireAuth, requireAdmin, async (c) => {
  const tenantId = c.req.query("tenantId");
  if (!tenantId) {
    return c.json({ success: false, error: "tenantId query param is required." }, 400);
  }

  const tenant = tenantService.getTenant(tenantId);
  if (!tenant?.stripeCustomerId) {
    return c.json({ success: false, error: "No Stripe customer found. Subscribe first." }, 400);
  }

  const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/admin/settings/billing`;
  const { billingService } = await import("../services/billing-service");
  const result = await billingService.createPortalSession(tenant.stripeCustomerId, returnUrl);

  if (result.error) {
    return c.json({ success: false, error: result.error }, 500);
  }

  return c.json({ success: true, data: { url: result.url } });
});

app.get("/api/billing/subscription", requireAuth, requireAdmin, async (c) => {
  const tenantId = c.req.query("tenantId");
  if (!tenantId) {
    return c.json({ success: false, error: "tenantId query param is required." }, 400);
  }

  const tenant = tenantService.getTenant(tenantId);
  if (!tenant) {
    return c.json({ success: false, error: "Tenant not found." }, 404);
  }

  const { billingService } = await import("../services/billing-service");
  const subInfo = await billingService.getTenantSubscription(tenantId);

  return c.json({
    success: true,
    data: {
      tier: tenant.tier,
      status: tenant.status,
      trialEndsAt: tenant.trialEndsAt,
      features: tenant.features,
      subscription: subInfo,
    },
  });
});

// ── API key management (admin only) ──────────────────────────────────

app.post("/api/admin/clients/:id/api-key", requireAuth, requireAdmin, async (c) => {
  const tenantId = c.req.param("id");
  const { generateApiKey } = await import("../services/blog-api-service");
  const key = await generateApiKey(tenantId);
  return c.json({ success: true, data: { apiKey: key } });
});

app.get("/api/admin/clients/:id/api-key", requireAuth, requireAdmin, async (c) => {
  const tenantId = c.req.param("id");
  const { getApiKey } = await import("../services/blog-api-service");
  const key = await getApiKey(tenantId);
  return c.json({ success: true, data: { apiKey: key } });
});

// ── Export ───────────────────────────────────────────────────────────

export default app;
export { app as saasRouter };

/**
 * Initialize ALL in-memory stores from Supabase on cold start.
 * Vercel serverless functions lose all in-memory state on cold start.
 * This restores sessions, onboarding states, tenants, and content so the
 * dashboard and calendar have data on the very first request.
 */
export async function initUserStore(): Promise<void> {
  const supabase = getAdminClient();
  try {
    // Load all users and create sessions keyed by both ID and email
    // (Supabase Auth UUIDs differ from old custom IDs; email is the bridge)
    const { data: users } = await supabase.from("users").select("id, email, name");
    if (users) {
      for (const u of users) {
        const name = (u.name as string) ?? (u.email as string)?.split("@")[0] ?? "User";
        const email = u.email as string;
        const id = u.id as string;
        // Store by both ID and email so lookups work regardless of auth provider
        authService.ensureSession(id, email, name);
        authService.ensureSession(email, email, name);
      }
      console.log(`[initUserStore] Restored ${users.length} user sessions`);
    }

    // Load tenants and link to users (needed for analytics/dashboard APIs)
    const { data: tenants } = await supabase.from("tenants").select("*");
    if (tenants) {
      for (const t of tenants) {
        if (t.owner_id) {
          authService.linkTenant(t.owner_id, t.id);
        }
      }
      console.log(`[initUserStore] Restored ${tenants.length} tenant links`);
    }

    // Load completed onboarding records and restore state
    const { data: onboardings } = await supabase
      .from("onboarding")
      .select("*")
      .eq("step", "done");
    if (onboardings) {
      for (const o of onboardings) {
        const session = authService.getSession(o.user_id);
        if (!session) continue;
        // Restore onboarding state as done
        const state = authService.getOnboardingState(o.user_id);
        if (state) {
          state.step = "done";
          state.selectedNiche = o.selected_niche ?? null;
          state.packSlug = o.pack_slug ?? null;
          state.businessDescription = o.business_description ?? null;
          state.websiteUrl = o.website_url ?? null;
          state.websiteAnalysis = o.website_analysis ?? null;
        }
      }
      console.log(`[initUserStore] Restored ${onboardings.length} onboarding states`);
    }

    // Restore tenant objects into TenantService (needed for getDashboard).
    // Seed directly from Supabase JS client data (already loaded above),
    // so we don't depend on the REST adapter which may fail on Vercel.
    if (tenants) {
      const { tenantService } = await import("../services/tenant-service");
      for (const t of tenants) {
        tenantService.seedTenant({
          id: t.id as string,
          name: (t.name as string) ?? "Unknown",
          ownerId: (t.owner_id as string) ?? null,
          createdAt: (t.created_at as string) ?? new Date().toISOString(),
        });
      }
    }

    // Seed content from Supabase JS client (REST adapter may fail on Vercel).
    const { data: contentItems } = await supabase
      .from("content_items")
      .select("*")
      .order("created_at", { ascending: false });
    if (contentItems) {
      const { contentService } = await import("../services/content-service");
      for (const c of contentItems) {
        contentService.seedContent(c as Record<string, unknown>);
      }
      console.log(`[initUserStore] Seeded ${contentItems.length} content items`);
    }
  } catch (err: any) {
    console.error("[initUserStore] Failed to load from Supabase:", err.message);
  }
}
