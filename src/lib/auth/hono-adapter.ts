/**
 * Hono middleware adapter — Supabase Auth.
 *
 * Uses @/auth (Supabase server client) to verify session cookies.
 * Replaces old Auth.js-based adapter.
 *
 * Usage:
 *   import { requireAuth, requireTenantAccess } from "@/lib/auth/hono-adapter";
 *   app.get("/api/dashboard", requireAuth, (c) => {
 *     const session = c.get("session"); // { sub, email, name }
 *   });
 */

import type { Context, Next } from "hono";
import { auth } from "@/auth";
import { AuthService } from "@/lib/saas-core/services/auth-service";
import { getUserRole } from "@/lib/auth/user-store";

// Extend Hono's ContextVariableMap for type safety
declare module "hono" {
  interface ContextVariableMap {
    session: SessionPayload;
  }
}

export interface SessionPayload {
  sub: string;   // Supabase user ID
  email: string;
  name: string;
  role: "admin" | "client" | null;
}

// Shared AuthService instance — created once, not per request
const authService = new AuthService();

/**
 * requireAuth — rejects unauthenticated requests with 401.
 * Reads session from Supabase auth cookie and attaches role.
 */
export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  const { user } = await auth();

  if (!user?.email) {
    return c.json(
      { success: false, error: "Authentication required. Please log in." },
      401,
    );
  }

  const role = await getUserRole(user.id);

  c.set("session", {
    sub: user.id,
    email: user.email,
    name: user.name,
    role,
  });

  await next();
}

/**
 * Optional auth — sets session if user is logged in, but doesn't reject.
 */
export async function optionalAuth(c: Context, next: Next): Promise<void> {
  const { user } = await auth();

  if (user?.email) {
    c.set("session", {
      sub: user.id,
      email: user.email,
      name: user.name,
    });
  }

  await next();
}

/**
 * requireTenantAccess — verifies the authenticated user owns the tenant.
 * Must be used AFTER requireAuth.
 */
export async function requireTenantAccess(c: Context, next: Next): Promise<Response | void> {
  const session = c.get("session");
  const tenantId = c.req.param("tenantId") ?? c.req.query("tenantId");

  if (!tenantId) {
    return c.json(
      { success: false, error: "Tenant ID is required." },
      400,
    );
  }

  // Check in-memory first, then Supabase
  let userTenants = authService.getUserTenants(session.sub);
  if (!userTenants.includes(tenantId)) {
    const dbTenants = await authService.getUserTenantsFromDB(session.sub);
    if (dbTenants.length > 0) {
      userTenants = dbTenants;
      for (const tid of dbTenants) {
        authService.linkTenant(session.sub, tid);
      }
    }
  }

  if (!userTenants.includes(tenantId)) {
    return c.json(
      { success: false, error: "Access denied. You do not own this tenant." },
      403,
    );
  }

  await next();
}

/**
 * requireAdmin — rejects non-admin users.
 * Must be used AFTER requireAuth.
 */
export async function requireAdmin(c: Context, next: Next): Promise<Response | void> {
  const session = c.get("session");
  if (!session.role) {
    return c.json(
      { success: false, error: "Account setup incomplete. Please complete onboarding." },
      403,
    );
  }
  if (session.role !== "admin") {
    return c.json(
      { success: false, error: "Admin access required." },
      403,
    );
  }
  await next();
}

/**
 * requireClient — rejects non-client users.
 * Must be used AFTER requireAuth.
 */
export async function requireClient(c: Context, next: Next): Promise<Response | void> {
  const session = c.get("session");
  if (!session.role) {
    return c.json(
      { success: false, error: "Account setup incomplete. Please complete onboarding." },
      403,
    );
  }
  if (session.role !== "client") {
    return c.json(
      { success: false, error: "Client access required." },
      403,
    );
  }
  await next();
}

/**
 * Resolve the effective agency owner ID for a user.
 *
 * Team members carry `agency_id` = their owner's user id; the owner themselves
 * have `agency_id` null. So the effective owner is `agency_id ?? id`. This lets
 * any team member pass agency-scoped checks without each endpoint knowing the
 * team-member model.
 */
export async function resolveAgencyOwnerId(userId: string): Promise<string> {
  const { getAdminClient } = await import("@/lib/supabase/admin");
  const supabase = getAdminClient();
  const { data } = await supabase
    .from("users")
    .select("agency_id")
    .eq("id", userId)
    .maybeSingle();
  return ((data as any)?.agency_id as string) ?? userId;
}

/**
 * requireAgencyAccess — verifies the tenant belongs to the admin's agency.
 * Allows team members (whose `agency_id` points at the owner) in addition to
 * the owner. Must be used AFTER requireAuth + requireAdmin.
 */
export async function requireAgencyAccess(c: Context, next: Next): Promise<Response | void> {
  const session = c.get("session");
  const tenantId = c.req.param("tenantId") ?? c.req.param("clientId") ?? c.req.param("id") ?? c.req.query("tenantId");

  if (!tenantId) {
    return c.json(
      { success: false, error: "Tenant ID is required." },
      400,
    );
  }

  // Resolve the effective owner: team members act on behalf of their agency owner.
  const ownerId = await resolveAgencyOwnerId(session.sub);

  const { data: tenant } = await (await import("@/lib/supabase/admin")).getAdminClient()
    .from("tenants")
    .select("agency_id")
    .eq("id", tenantId)
    .maybeSingle();

  if (!tenant || (tenant as any).agency_id !== ownerId) {
    return c.json(
      { success: false, error: "Access denied. This client does not belong to your agency." },
      403,
    );
  }

  await next();
}

/**
 * Get the client IP for rate limiting.
 */
export function getClientIP(c: Context): string {
  const forwarded = c.req.header("X-Forwarded-For");
  if (forwarded) {
    return forwarded.split(",")[0]!.trim();
  }
  return c.req.header("X-Real-IP") ?? "127.0.0.1";
}
