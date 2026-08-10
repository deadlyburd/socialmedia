/**
 * Stripe Price ID constants — maps SubscriptionTier to Stripe Price IDs.
 *
 * These are loaded from environment variables and set by the sync script.
 * Placeholder values are used until the sync script runs.
 */

import type { SubscriptionTier } from "@/lib/saas-core/types";

/** Stripe Price ID for each paid subscription tier. */
export const STRIPE_PRICES: Record<Exclude<SubscriptionTier, "free">, string> = {
  starter: process.env.STRIPE_PRICE_STARTER ?? "price_placeholder_starter",
  growth: process.env.STRIPE_PRICE_GROWTH ?? "price_placeholder_growth",
  empire: process.env.STRIPE_PRICE_EMPIRE ?? "price_placeholder_empire",
  custom: process.env.STRIPE_PRICE_CUSTOM ?? "price_placeholder_custom",
};

/** Get the Stripe Price ID for a given subscription tier. */
export function getPriceIdForTier(tier: SubscriptionTier): string | null {
  if (tier === "free") return null;
  return STRIPE_PRICES[tier] ?? null;
}

/** Map a Stripe Price ID back to a SubscriptionTier. */
export function getTierForPriceId(priceId: string): SubscriptionTier {
  for (const [tier, id] of Object.entries(STRIPE_PRICES)) {
    if (id === priceId) return tier as SubscriptionTier;
  }
  return "free";
}

/** Human-readable labels for each tier (used in UI). */
export const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: "Free",
  starter: "Starter",
  growth: "Pro",
  empire: "Agency",
  custom: "Enterprise",
};

/** Monthly price display for each tier. */
export const TIER_PRICE_DISPLAY: Record<SubscriptionTier, string> = {
  free: "$0",
  starter: "$199",
  growth: "$499",
  empire: "$999",
  custom: "$2,499",
};
