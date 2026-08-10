/**
 * WorkflowEngine — orchestrates the end-to-end content pipeline per client.
 *
 * FLOW:
 *   Signup → Niche → Website URL → Dashboard → Select Platform →
 *   Posts/Week → API Key → Notifications → Content Generated →
 *   Notification Sent → User Approves → Published
 */

import type { ContentItem, Tenant } from "../types";
import type {
  AuthSession,
  OnboardingState,
  WebsiteAnalysis,
} from "./auth-service";
import { AuthService } from "./auth-service";
import { contentReverseEngineer } from "./content-reverse-engineer";
import { ContentService } from "./content-service";
import type {
  Notification,
  NotificationPreferences,
} from "./notification-service";
import { NotificationService } from "./notification-service";
import { PackService } from "./pack-service";
import type { PlatformSetup } from "./platform-setup-service";
import { PlatformSetupService } from "./platform-setup-service";
import { promptCache } from "./prompt-cache";
import { getTelegramBot, getTenantChat } from "./telegram-bot";
import { tenantService } from "./tenant-service";

export class WorkflowEngine {
  constructor(
    private auth: AuthService = new AuthService(),
    private tenants = tenantService,
    private content: ContentService = new ContentService(),
    private packs: PackService = new PackService(),
    private notifications: NotificationService = new NotificationService(),
    private platforms: PlatformSetupService = new PlatformSetupService(),
  ) {}

  // ── STEP 1: Sign up / Login with Google ──────────────────────────

  async handleGoogleLogin(
    code: string,
    redirectUri: string,
  ): Promise<{
    session: AuthSession;
    isNewUser: boolean;
  }> {
    const session = await this.auth.handleGoogleCallback({ code, redirectUri });
    const onboarding = this.auth.getOnboardingState(session.userId);
    return { session, isNewUser: onboarding?.step !== "done" };
  }

  // ── STEP 2: Select Niche ─────────────────────────────────────────

  async selectNiche(
    userId: string,
    niche: string,
    packSlug?: string,
    businessDescription?: string,
  ): Promise<{
    onboarding: OnboardingState;
    pack: unknown;
  }> {
    const slug = packSlug ?? niche.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    // setNiche now auto-creates onboarding state (serverless resilience — never returns null)
    const state = this.auth.setNiche(userId, niche, slug, businessDescription);

    const pack =
      this.packs.getPack(slug) ??
      this.packs.loadPacks().find((p) => p.slug === "custom");
    return { onboarding: state, pack };
  }

  // ── STEP 3: Submit Website URL → Analyze → Return Dashboard Data ──

  async submitWebsite(
    userId: string,
    url: string,
  ): Promise<{
    analysis: WebsiteAnalysis;
    tenant: Tenant;
  }> {
    // setWebsite now auto-creates onboarding state (serverless resilience)
    const state = await this.auth.setWebsite(userId, url);
    if (!state?.websiteAnalysis) throw new Error("Website analysis failed");

    // Create or reuse a session (Vercel cold starts lose in-memory sessions)
    const session = this.auth.getSession(userId) ?? {
      userId,
      email: `${userId}@optimus.ai`,
      name: "Business Owner",
      avatar: "",
      provider: "google" as const,
      accessToken: `tok_${userId}`,
      refreshToken: `ref_${userId}`,
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      createdAt: new Date().toISOString(),
    };

    // Auto-create a tenant for this user
    const tenant = this.tenants.createTenant({
      name: session.name,
      slug: session.email.replace(/[@.]/g, "-"),
      email: session.email,
    });

    this.auth.linkTenant(userId, tenant.id);

    return { analysis: state.websiteAnalysis, tenant };
  }

  // ── STEP 4: Setup Platform Content Pipeline ──────────────────────

  async setupPlatform(params: {
    userId: string;
    tenantId: string;
    platform: string;
    postsPerDay: number;
    duration: "1week" | "2weeks" | "1month";
    startDate: string;
    apiKey: string;
  }): Promise<{
    setup: PlatformSetup;
    estimatedCost: number;
    estimatedContent: number;
  }> {
    const tenant = this.tenants.getTenant(params.tenantId);
    if (!tenant) throw new Error("Tenant not found");

    const setup = this.platforms.createSetup(params);

    const days =
      params.duration === "1week" ? 7 : params.duration === "2weeks" ? 14 : 30;
    const totalContent = params.postsPerDay * days;

    return {
      setup,
      estimatedContent: totalContent,
      estimatedCost: totalContent * 0.001, // ~$0.001 per AI-generated post
    };
  }

  // ── STEP 5: Set Notifications ────────────────────────────────────

  async setNotifications(
    prefs: Omit<NotificationPreferences, "userId"> & { userId: string },
  ): Promise<NotificationPreferences> {
    return this.notifications.setPreferences(prefs);
  }

  // ── STEP 6: Generate Content (with prompt cache + reverse engineer) ─

  async generateAndNotify(params: {
    userId: string;
    tenantId: string;
    platform: string;
    count: number;
    topic?: string | undefined;
  }): Promise<{
    generated: ContentItem[];
    notification: Notification | null;
    telegramMessageId: number | null;
    cacheHit: boolean;
  }> {
    // Auto-create platform setup if none exists (so content gen works without manual setup)
    let setup = this.platforms
      .getSetupsByTenant(params.tenantId)
      .find((s) => s.platform === params.platform);
    if (!setup) {
      setup = this.platforms.createSetup({
        userId: params.userId,
        tenantId: params.tenantId,
        platform: params.platform,
        postsPerDay: 5,
        duration: "1week",
        startDate: new Date().toISOString().split("T")[0]!,
        apiKey: "auto-generated",
      });
    }

    this.platforms.updateStatus(setup.id, "generating");

    // Try reverse-engineer approach first (cheaper, better)
    const tenant = this.tenants.getTenant(params.tenantId);
    const generated: ContentItem[] = [];
    const cacheHit = false;

    for (let i = 0; i < params.count; i++) {
      const topic = params.topic ?? `${params.platform} content #${i + 1}`;
      const contentType =
        params.platform === "instagram"
          ? ("carousel" as const)
          : ("reel" as const);
      const category =
        i % 3 === 0
          ? ("inspirational" as const)
          : i % 3 === 1
            ? ("educational" as const)
            : ("promotional" as const);

      // Check prompt cache first
      const _cacheKey = promptCache.memoizeSync(
        `content:${params.tenantId}:${params.platform}:${contentType}:${category}:${topic}`,
        () => null, // placeholder — cache miss handled below
        contentType === "carousel"
          ? "carousel_template"
          : "video_script_template",
      );

      // Generate using reverse engineer (viral formula replay)
      const revResult = contentReverseEngineer.generateContent(
        contentReverseEngineer.matchFormula({
          niche: tenant?.metadata?.niche ?? "general",
          platform: params.platform as "instagram" | "tiktok",
          contentType: contentType === "carousel" ? "carousel" : "reel",
        }),
        {
          niche: tenant?.metadata?.niche ?? "general",
          platform: params.platform as "instagram" | "tiktok",
          contentType: contentType === "carousel" ? "carousel" : "reel",
          ...(tenant?.name ? { brandPersonality: tenant.name } : {}),
        },
      );

      // Use AI to refine the template-based content (only 1 API call instead of 5)
      const result = await this.content.generateContent({
        tenantId: params.tenantId,
        type: contentType === "carousel" ? "carousel" : "reel",
        topic: revResult?.hook || topic, // Use viral hook if available, else topic
        platform: params.platform,
        category,
      });

      // Merge reverse-engineered structure with AI-generated body if revResult exists
      if (revResult?.hook) {
        generated.push({
          ...result.content,
          title: revResult.hook,
          excerpt: `${revResult.body?.slice(0, 200) ?? result.content.body.slice(0, 200)}...`,
        });
      } else {
        generated.push(result.content);
      }

      // Cache the result
      promptCache.set(
        `content:${params.tenantId}:${params.platform}:${contentType}:${category}:${topic}`,
        result,
        contentType === "carousel" ? "carousel" : "video_script",
      );
    }

    this.platforms.updateContentProgress(setup.id, {
      generated: generated.length,
      pendingApproval: generated.length,
    });

    this.platforms.updateStatus(setup.id, "active");

    // Send Telegram notification for human approval
    let notification: Notification | null = null;
    let telegramMessageId: number | null = null;

    if (generated.length > 0 && generated[0]) {
      const sent = await this.notifications.notifyContentReady({
        userId: params.userId,
        contentId: generated[0].id,
        contentTitle: generated[0].title,
        contentPreview: generated[0].excerpt,
        platform: params.platform,
      });
      notification = sent[0] ?? null;

      // Also notify via Telegram
      const chatId = getTenantChat(params.tenantId);
      if (chatId) {
        const bot = getTelegramBot();
        telegramMessageId = await bot.sendContentForApproval(chatId, {
          contentId: generated[0].id,
          tenantId: params.tenantId,
          tenantName: tenant?.name ?? "Agency",
          title: generated[0].title,
          excerpt: generated[0].excerpt,
          platform: params.platform,
          contentType: generated[0].type,
          ...(generated[0].scheduledAt
            ? { scheduledDate: generated[0].scheduledAt }
            : {}),
        });
      }
    }

    return { generated, notification, telegramMessageId, cacheHit };
  }

  // ── STEP 7: User Approves Content → Publish ──────────────────────

  async approveAndPublish(
    userId: string,
    contentId: string,
  ): Promise<{
    content: ContentItem | null;
    notification: Notification | null;
  }> {
    const content = this.content.updateStatus(contentId, "approved");
    const notif = await this.notifications.approveContent(userId, contentId);

    if (content) {
      this.content.updateStatus(contentId, "published");
    }

    return { content, notification: notif };
  }

  // ── Dashboard Helpers ────────────────────────────────────────────

  /** Get the full dashboard state for a user. */
  getDashboard(userId: string): {
    session: AuthSession | undefined;
    onboarding: OnboardingState | undefined;
    tenants: Tenant[];
    platforms: PlatformSetup[];
    notifications: Notification[];
    pendingNotifications: number;
  } {
    const tenants = this.auth
      .getUserTenants(userId)
      .map((tid) => this.tenants.getTenant(tid))
      .filter((t): t is Tenant => t !== undefined);

    const platforms = tenants.flatMap((t) =>
      this.platforms.getSetupsByTenant(t.id),
    );

    return {
      session: this.auth.getSession(userId),
      onboarding: this.auth.getOnboardingState(userId),
      tenants,
      platforms,
      notifications: this.notifications.getNotifications(userId),
      pendingNotifications: this.notifications.getPendingCount(userId),
    };
  }
}
