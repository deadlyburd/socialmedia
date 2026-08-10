/**
 * TenantService — multi-tenant lifecycle with Supabase persistence.
 */

import { dbInsert, dbQuery, dbUpdate } from "../db/adapter";
import { type SubscriptionTier, type Tenant, TIER_FEATURES } from "../types";

export class TenantService {
  private tenants: Map<string, Tenant> = new Map();
  private loaded = false;

  async loadFromDB(): Promise<void> {
    if (this.loaded) return;
    try {
      const rows = await dbQuery<Record<string, unknown>>("tenants");
      for (const r of rows) {
        // Safe JSON parse — some rows may have malformed JSON or missing columns
        let features = {};
        let metadata = {};
        try {
          features = JSON.parse((r.features_json as string) ?? "{}");
        } catch {
          features = {};
        }
        try {
          metadata = JSON.parse((r.metadata_json as string) ?? "{}");
        } catch {
          metadata = {};
        }

        const id = r.id as string;
        const name = (r.name as string) ?? "Unknown";
        // Handle both full and minimal table schemas
        const slug = (r.slug as string) ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const email = (r.email as string) ?? `${slug}@optimus.ai`;
        const tier = ((r.tier as string) ?? "free") as SubscriptionTier;
        const status = ((r.status as string) ?? "trial") as Tenant["status"];
        const trialEndsAt = (r.trial_ends_at as string) ?? null;
        const createdAt = (r.created_at as string) ?? new Date().toISOString();
        const updatedAt = (r.updated_at as string) ?? (r.created_at as string) ?? new Date().toISOString();

        const tenant: Tenant = {
          id,
          name,
          slug,
          email,
          tier,
          status,
          trialEndsAt,
          createdAt,
          updatedAt,
          features: features as Tenant["features"],
          metadata: metadata as Record<string, string>,
          stripeCustomerId: (r.stripe_customer_id as string) ?? undefined,
          stripeSubscriptionId: (r.stripe_subscription_id as string) ?? undefined,
          stripePriceId: (r.stripe_price_id as string) ?? undefined,
          currentPeriodEnd: (r.current_period_end as string) ?? undefined,
        };
        this.tenants.set(id, tenant);
      }
      console.log(`[saas-core] Loaded ${rows.length} tenants from Supabase`);
    } catch (e: any) {
      console.log(
        "[saas-core] Could not load tenants from Supabase:",
        e?.message ?? e,
      );
    }
    this.loaded = true;
  }

  createTenant(params: {
    name: string;
    slug: string;
    email: string;
    tier?: SubscriptionTier;
  }): Tenant {
    const now = new Date().toISOString();
    const tier = params.tier ?? "free";
    const tenant: Tenant = {
      id: `tenant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: params.name,
      slug: params.slug,
      email: params.email,
      tier,
      status: "trial",
      trialEndsAt:
        tier === "free"
          ? null
          : new Date(Date.now() + 14 * 86400000).toISOString(),
      createdAt: now,
      updatedAt: now,
      features: { ...TIER_FEATURES[tier] },
      metadata: {},
    };
    this.tenants.set(tenant.id, tenant);
    dbInsert("tenants", {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      email: tenant.email,
      tier: tenant.tier,
      status: tenant.status,
      trial_ends_at: tenant.trialEndsAt,
      features_json: JSON.stringify(tenant.features),
      metadata_json: JSON.stringify(tenant.metadata),
      created_at: tenant.createdAt,
      updated_at: tenant.updatedAt,
    }).catch(() => {});
    return { ...tenant, features: { ...tenant.features } };
  }

  getTenant(id: string): Tenant | undefined {
    const t = this.tenants.get(id);
    return t ? { ...t, features: { ...t.features } } : undefined;
  }

  /**
   * Direct seed from Supabase JS client data.
   * Used by initUserStore() to populate the in-memory cache without going
   * through the REST adapter (which may fail on Vercel cold starts).
   */
  seedTenant(raw: {
    id: string;
    name: string;
    ownerId: string | null;
    createdAt: string;
  }): Tenant {
    const existing = this.tenants.get(raw.id);
    if (existing) return existing;

    const slug = raw.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const tenant: Tenant = {
      id: raw.id,
      name: raw.name,
      slug,
      email: `${slug}@optimus.ai`,
      tier: "free",
      status: "trial",
      trialEndsAt: null,
      createdAt: raw.createdAt,
      updatedAt: raw.createdAt,
      features: { ...TIER_FEATURES.free },
      metadata: {},
    };
    this.tenants.set(raw.id, tenant);
    this.loaded = true;
    return tenant;
  }

  listTenants(filter?: { status?: string; tier?: string }): Tenant[] {
    let result = [...this.tenants.values()];
    if (filter?.status)
      result = result.filter((t) => t.status === filter.status);
    if (filter?.tier) result = result.filter((t) => t.tier === filter.tier);
    return result.map((t) => ({ ...t, features: { ...t.features } }));
  }

  updateTier(id: string, tier: SubscriptionTier): Tenant | null {
    const t = this.tenants.get(id);
    if (!t) return null;
    t.tier = tier;
    t.features = { ...TIER_FEATURES[tier] };
    t.updatedAt = new Date().toISOString();
    dbUpdate("tenants", id, {
      tier,
      features_json: JSON.stringify(t.features),
      updated_at: t.updatedAt,
    }).catch(() => {});
    return { ...t, features: { ...t.features } };
  }

  updateStatus(id: string, status: Tenant["status"]): Tenant | null {
    const t = this.tenants.get(id);
    if (!t) return null;
    t.status = status;
    t.updatedAt = new Date().toISOString();
    dbUpdate("tenants", id, { status, updated_at: t.updatedAt }).catch(
      () => {},
    );
    return { ...t, features: { ...t.features } };
  }

  updateMetadata(id: string, metadata: Record<string, string>): Tenant | null {
    const t = this.tenants.get(id);
    if (!t) return null;
    t.metadata = { ...t.metadata, ...metadata };
    t.updatedAt = new Date().toISOString();
    dbUpdate("tenants", id, {
      metadata_json: JSON.stringify(t.metadata),
      updated_at: t.updatedAt,
    }).catch(() => {});
    return { ...t, features: { ...t.features } };
  }

  deleteTenant(id: string): boolean {
    return this.tenants.delete(id);
  }

  getActiveTenantCount(): number {
    return [...this.tenants.values()].filter(
      (t) => t.status === "active" || t.status === "trial",
    ).length;
  }
}

export const tenantService = new TenantService();
export async function initTenantStore(): Promise<void> {
  await tenantService.loadFromDB();
}
