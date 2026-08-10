/**
 * Stripe server client — singleton for API routes and webhooks.
 *
 * Lazily initialized — only creates the client when first used.
 * This prevents build-time errors when STRIPE_SECRET_KEY isn't set.
 */
import Stripe from "stripe";

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(key, {
      apiVersion: "2026-07-29.dahlia",
      appInfo: {
        name: "social-automations",
        version: "0.1.0",
      },
    });
  }
  return _stripe;
}

// Proxy that lazily initializes
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(getStripe(), prop, receiver);
  },
});
