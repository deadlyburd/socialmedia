/**
 * BillingService — Stripe subscription management.
 *
 * Handles Checkout Sessions, Customer Portal, and subscription lookups.
 * All methods use the shared Stripe client from @/lib/stripe.
 */

import { stripe } from "@/lib/stripe";
import { getPriceIdForTier, getTierForPriceId } from "@/lib/stripe-prices";
import type { SubscriptionTier, Tenant } from "@/lib/saas-core/types";
import { tenantService } from "./tenant-service";

/** Generate a random suffix for integration_identifier (Stripe best practice). */
function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

export interface CreateCheckoutParams {
  priceId: string;
  customerEmail: string;
  tenantId: string;
  successUrl: string;
  cancelUrl: string;
  /** Optional: existing Stripe customer ID to reuse. */
  customerId?: string;
}

export interface CheckoutResult {
  url: string | null;
  error?: string;
}

export interface PortalResult {
  url: string | null;
  error?: string;
}

export interface SubscriptionInfo {
  tier: SubscriptionTier;
  status: string;
  currentPeriodEnd: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
}

class BillingService {
  /**
   * Create a Stripe Checkout Session for a subscription.
   * The client should redirect to `result.url`.
   */
  async createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutResult> {
    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer_email: params.customerEmail,
        customer: params.customerId ?? undefined,
        client_reference_id: params.tenantId,
        line_items: [{ price: params.priceId, quantity: 1 }],
        success_url: `${params.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: params.cancelUrl,
        subscription_data: {
          metadata: { tenant_id: params.tenantId },
        },
        metadata: { tenant_id: params.tenantId },
        // Tag sessions for tracking in Stripe Dashboard
        integration_identifier: `social-automations-${randomSuffix()}`,
        // Allow promo codes
        allow_promotion_codes: true,
        // Collect tax ID but don't auto-calculate tax (needs Stripe Tax registration)
      });

      return { url: session.url };
    } catch (err: any) {
      console.error("[billing] Checkout session error:", err.message);
      return { url: null, error: err.message };
    }
  }

  /**
   * Create a Stripe Customer Portal session for self-service billing management.
   */
  async createPortalSession(customerId: string, returnUrl: string): Promise<PortalResult> {
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      return { url: session.url };
    } catch (err: any) {
      console.error("[billing] Portal session error:", err.message);
      return { url: null, error: err.message };
    }
  }

  /**
   * Get subscription info for a customer.
   */
  async getSubscription(customerId: string): Promise<SubscriptionInfo | null> {
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 1,
        expand: ["data.items.data.price"],
      });

      const sub = subscriptions.data[0];
      if (!sub) {
        return {
          tier: "free",
          status: "inactive",
          currentPeriodEnd: null,
          customerId,
          subscriptionId: null,
          cancelAtPeriodEnd: false,
        };
      }

      const priceId = sub.items.data[0]?.price?.id ?? "";
      const tier = getTierForPriceId(priceId);

      return {
        tier,
        status: sub.status,
        currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
        customerId,
        subscriptionId: sub.id,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      };
    } catch (err: any) {
      console.error("[billing] Get subscription error:", err.message);
      return null;
    }
  }

  /**
   * Get subscription info for a tenant (looks up by stripe_customer_id on the tenant).
   */
  async getTenantSubscription(tenantId: string): Promise<SubscriptionInfo | null> {
    const tenant = tenantService.getTenant(tenantId);
    if (!tenant?.stripeCustomerId) {
      return {
        tier: tenant?.tier ?? "free",
        status: tenant?.status ?? "inactive",
        currentPeriodEnd: null,
        customerId: null,
        subscriptionId: null,
        cancelAtPeriodEnd: false,
      };
    }

    return this.getSubscription(tenant.stripeCustomerId);
  }

  /**
   * Handle a completed checkout session — activate the tenant's subscription.
   * Called from the webhook handler.
   */
  async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const tenantId = session.client_reference_id ?? session.metadata?.tenant_id;
    if (!tenantId) {
      console.error("[billing] No tenant_id in checkout session");
      return;
    }

    const customerId = session.customer as string;
    const subscriptionId = session.subscription as string;

    // Get the subscription to find the price/tier
    let tier: SubscriptionTier = "starter";
    let currentPeriodEnd: string | null = null;

    if (subscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["items.data.price"],
        });
        const priceId = sub.items.data[0]?.price?.id ?? "";
        tier = getTierForPriceId(priceId);
        currentPeriodEnd = new Date(sub.current_period_end * 1000).toISOString();
      } catch (err: any) {
        console.error("[billing] Failed to retrieve subscription:", err.message);
      }
    }

    // Update tenant tier and stripe IDs
    tenantService.updateTier(tenantId, tier);
    const tenant = tenantService.getTenant(tenantId);
    if (tenant) {
      tenant.stripeCustomerId = customerId;
      tenant.stripeSubscriptionId = subscriptionId;
      tenant.stripePriceId = getPriceIdForTier(tier) ?? undefined;
      tenant.currentPeriodEnd = currentPeriodEnd ?? undefined;

      // Update status to active
      const { getAdminClient } = await import("@/lib/supabase/admin");
      const supabase = getAdminClient();
      await supabase
        .from("tenants")
        .update({
          tier,
          status: "active",
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          stripe_price_id: getPriceIdForTier(tier),
          current_period_end: currentPeriodEnd,
          subscription_status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", tenantId);

      console.log(`[billing] Tenant ${tenantId} upgraded to ${tier} (customer: ${customerId})`);
    }
  }

  /**
   * Handle a subscription update — sync tier if price changed.
   * Called from the webhook handler.
   */
  async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const tenantId = subscription.metadata?.tenant_id;
    if (!tenantId) {
      console.error("[billing] No tenant_id in subscription metadata");
      return;
    }

    const customerId = subscription.customer as string;
    const priceId = subscription.items.data[0]?.price?.id ?? "";
    const tier = getTierForPriceId(priceId);
    const currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();

    // Update tenant
    tenantService.updateTier(tenantId, tier);
    const tenant = tenantService.getTenant(tenantId);
    if (tenant) {
      tenant.stripeCustomerId = customerId;
      tenant.stripeSubscriptionId = subscription.id;
      tenant.stripePriceId = priceId || undefined;
      tenant.currentPeriodEnd = currentPeriodEnd;

      const status = subscription.status === "active"
        ? "active"
        : subscription.status === "past_due"
          ? "active" // keep active but note past_due
          : "active";

      const { getAdminClient } = await import("@/lib/supabase/admin");
      const supabase = getAdminClient();
      await supabase
        .from("tenants")
        .update({
          tier,
          status,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          stripe_price_id: priceId,
          current_period_end: currentPeriodEnd,
          subscription_status: subscription.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tenantId);

      console.log(`[billing] Tenant ${tenantId} subscription updated to ${tier} (${subscription.status})`);
    }
  }

  /**
   * Handle a subscription deletion — downgrade tenant to free tier.
   * Called from the webhook handler.
   */
  async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const tenantId = subscription.metadata?.tenant_id;
    if (!tenantId) {
      console.error("[billing] No tenant_id in subscription metadata");
      return;
    }

    // Downgrade to free
    tenantService.updateTier(tenantId, "free");
    tenantService.updateStatus(tenantId, "active"); // keep active, just on free

    const { getAdminClient } = await import("@/lib/supabase/admin");
    const supabase = getAdminClient();
    await supabase
      .from("tenants")
      .update({
        tier: "free",
        subscription_status: "cancelled",
        stripe_subscription_id: null,
        stripe_price_id: null,
        current_period_end: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);

    console.log(`[billing] Tenant ${tenantId} subscription cancelled, downgraded to free`);
  }
}

export const billingService = new BillingService();
