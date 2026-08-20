/**
 * Entitlements — plan/tier access control + quota enforcement.
 *
 * Single source of truth for "does this tenant have feature X / quota left".
 * Reads the tenant directly from Supabase (NOT the in-memory TenantService Map)
 * so billing, trial gating, and paywall checks survive cold starts and reflect
 * the real DB state.
 */

import type { Context, Next } from "hono";
import { getAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/api-utils";
import { TIER_FEATURES, type SubscriptionTier, type TenantFeatures } from "../types";

const TIERS: SubscriptionTier[] = ["free", "starter", "growth", "empire", "custom"];

/** A tenant row as returned by Supabase (fields may be absent pre-migration-003). */
export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  agency_id: string | null;
  client_user_id: string | null;
  tier?: string | null;
  status?: string | null;
  trial_ends_at?: string | null;
  features_json?: string | Record<string, unknown> | null;
  metadata_json?: string | Record<string, unknown> | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_price_id?: string | null;
  current_period_end?: string | null;
  subscription_status?: string | null;
  automation_config?: unknown;
  api_key?: string | null;
  [key: string]: unknown;
}

export type QuotaMetric = "posts" | "blogs" | "platforms";

export interface Entitlements {
  tenant: TenantRecord;
  tier: SubscriptionTier;
  features: TenantFeatures;
  blocked: boolean;
  blockedReason: string | null;
  trialExpired: boolean;
}

// ── Tenant lookup (DB-direct) ─────────────────────────────────────────

export async function getTenantFromDB(tenantId: string): Promise<TenantRecord | null> {
  if (!tenantId) return null;
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", tenantId)
    .maybeSingle();
  if (error || !data) return null;
  return data as TenantRecord;
}

// ── Tier / feature resolution ─────────────────────────────────────────

export function resolveTier(row: TenantRecord): SubscriptionTier {
  const t = row?.tier;
  return (TIERS as string[]).includes(t as string) ? (t as SubscriptionTier) : "free";
}

function parseJsonObject(v: unknown): Record<string, unknown> {
  if (!v) return {};
  if (typeof v === "object") return v as Record<string, unknown>;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Features = TIER_FEATURES[tier], overlaid with any persisted per-tenant overrides. */
export function resolveFeatures(row: TenantRecord): TenantFeatures {
  const tier = resolveTier(row);
  const base: Record<string, unknown> = { ...TIER_FEATURES[tier] };
  const overrides = parseJsonObject(row?.features_json);
  if (Object.keys(overrides).length === 0) return base as unknown as TenantFeatures;

  const merged: Record<string, unknown> = { ...base };
  for (const key of Object.keys(base)) {
    if (!(key in overrides)) continue;
    const stored = overrides[key];
    const def = base[key];
    if (typeof def === "number") merged[key] = typeof stored === "number" ? stored : def;
    else if (typeof def === "boolean") merged[key] = typeof stored === "boolean" ? stored : def;
  }
  return merged as unknown as TenantFeatures;
}

// ── Trial / status gating ─────────────────────────────────────────────

export function isTrialExpired(row: TenantRecord): boolean {
  if (row?.status !== "trial") return false;
  const end = row?.trial_ends_at;
  if (!end) return false;
  const t = Date.parse(end);
  if (Number.isNaN(t)) return false;
  return Date.now() > t;
}

export function getBlockedReason(row: TenantRecord): string | null {
  if (row?.status === "suspended") return "This account is suspended. Contact support to restore access.";
  if (row?.status === "cancelled") return "This account has been cancelled.";
  if (isTrialExpired(row)) return "Your free trial has ended. Upgrade your plan to continue.";
  return null;
}

export async function getEntitlements(tenantId: string): Promise<Entitlements | null> {
  const tenant = await getTenantFromDB(tenantId);
  if (!tenant) return null;
  const reason = getBlockedReason(tenant);
  return {
    tenant,
    tier: resolveTier(tenant),
    features: resolveFeatures(tenant),
    blocked: reason !== null,
    blockedReason: reason,
    trialExpired: isTrialExpired(tenant),
  };
}

// ── Error ─────────────────────────────────────────────────────────────

export class PlanError extends ApiError {
  constructor(statusCode: number, message: string, code: string) {
    super(statusCode, message, code);
    this.name = "PlanError";
  }
}

// ── Quota counting ────────────────────────────────────────────────────

export async function countMonthUsage(tenantId: string, metric: QuotaMetric): Promise<number> {
  const supabase = getAdminClient();

  if (metric === "platforms") {
    const { count } = await supabase
      .from("platform_connections")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("connected", true);
    return count ?? 0;
  }

  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  let query = supabase
    .from("content_assets")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("created_at", start.toISOString());

  if (metric === "blogs") query = query.eq("content_type", "blog");

  const { count } = await query;
  return count ?? 0;
}

// ── Assertion helpers (handler-level) ─────────────────────────────────

async function assertNotBlocked(c: Context, tenantId: string): Promise<Entitlements> {
  const ent = await getEntitlements(tenantId);
  if (!ent) throw new ApiError(404, "Tenant not found.", "NOT_FOUND");
  if (ent.blocked) {
    throw new PlanError(403, ent.blockedReason ?? "Account is not active.", ent.trialExpired ? "TRIAL_EXPIRED" : "TENANT_BLOCKED");
  }
  return ent;
}

export async function assertFeature(
  c: Context,
  tenantId: string,
  feature: keyof TenantFeatures,
): Promise<void> {
  const ent = await assertNotBlocked(c, tenantId);
  if (ent.features[feature] !== true) {
    throw new PlanError(
      403,
      `This feature is not included in the ${ent.tier} plan. Upgrade to enable it.`,
      "PLAN_FEATURE_LOCKED",
    );
  }
}

export async function assertQuota(
  c: Context,
  tenantId: string,
  metric: QuotaMetric,
): Promise<void> {
  const ent = await assertNotBlocked(c, tenantId);
  const limits: Record<QuotaMetric, number> = {
    posts: ent.features.maxPostsPerMonth,
    blogs: ent.features.maxBlogsPerMonth,
    platforms: ent.features.maxPlatforms,
  };
  const limit = limits[metric];
  if (limit >= 999) return; // unlimited
  const used = await countMonthUsage(tenantId, metric);
  if (used >= limit) {
    throw new PlanError(
      402,
      `Monthly ${metric} limit reached (${limit}). Upgrade your plan to add more.`,
      "PLAN_QUOTA_EXCEEDED",
    );
  }
}

// ── Hono middleware forms (tenantId from path/query) ──────────────────

function resolveTenantId(c: Context): string {
  return (c.req.param("tenantId") ??
    c.req.param("clientId") ??
    c.req.param("id") ??
    c.req.query("tenantId") ??
    "") as string;
}

export function requireFeature(feature: keyof TenantFeatures) {
  return async (c: Context, next: Next) => {
    await assertFeature(c, resolveTenantId(c), feature);
    await next();
  };
}

export function checkQuota(metric: QuotaMetric) {
  return async (c: Context, next: Next) => {
    await assertQuota(c, resolveTenantId(c), metric);
    await next();
  };
}
