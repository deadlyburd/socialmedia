/**
 * Stripe Product & Price Sync Script
 *
 * Creates Products and Prices in Stripe for all 4 paid subscription tiers.
 * Run once: npx tsx src/scripts/sync-stripe-products.ts
 *
 * Prints the Price IDs to copy into .env.local.
 */

import Stripe from "stripe";

// Load env vars manually (not through Next.js config)
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.error("❌ STRIPE_SECRET_KEY is not set.");
  console.error("   Make sure you have it in src/.env.local and run with: npx tsx src/scripts/sync-stripe-products.ts");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2026-07-29.dahlia",
});

interface TierDef {
  key: string;
  name: string;
  description: string;
  price: number; // in cents
  features: string[];
}

const TIERS: TierDef[] = [
  {
    key: "starter",
    name: "Starter",
    description: "For boutique agencies with a few clients. 20 posts/mo, 2 platforms, 2 AI blogs/mo.",
    price: 19900,
    features: ["20 posts/mo", "2 platforms", "2 AI blogs/mo", "AI image gen", "Approval workflow"],
  },
  {
    key: "growth",
    name: "Pro",
    description: "For growing agencies scaling their client base. 60 posts/mo, 4 platforms, 8 AI blogs/mo.",
    price: 49900,
    features: ["60 posts/mo", "4 platforms", "8 AI blogs/mo", "Image + video gen", "Trend detection", "Booking funnel"],
  },
  {
    key: "empire",
    name: "Agency",
    description: "For agencies managing many clients at scale. 200 posts/mo, 6 platforms, 30 AI blogs/mo.",
    price: 99900,
    features: ["200 posts/mo", "6 platforms", "30 AI blogs/mo", "White-label", "All AI features"],
  },
  {
    key: "custom",
    name: "Enterprise",
    description: "For large agencies with custom requirements. Unlimited everything + dedicated support.",
    price: 249900,
    features: ["Unlimited posts", "6 platforms", "Unlimited blogs", "White-label", "Dedicated support", "SLA"],
  },
];

async function main() {
  console.log("🚀 Syncing Stripe Products & Prices...\n");

  const results: Record<string, string> = {};

  for (const tier of TIERS) {
    // Check if product already exists (search by metadata key)
    const existing = await stripe.products.search({
      query: `metadata['tier_key']:'${tier.key}'`,
      limit: 1,
    });

    let product: Stripe.Product;

    if (existing.data.length > 0) {
      product = existing.data[0]!;
      console.log(`✅ Found existing product: ${tier.name} (${product.id})`);
    } else {
      product = await stripe.products.create({
        name: tier.name,
        description: tier.description,
        metadata: {
          tier_key: tier.key,
          app: "social-automations",
        },
        // Mark statement descriptor for customer statements
        statement_descriptor: tier.key === "empire" ? "SOCIAL AUTO AGENCY" : "SOCIAL AUTOMATIONS",
      });
      console.log(`✨ Created product: ${tier.name} (${product.id})`);
    }

    // Check if price already exists for this product (monthly, USD)
    const existingPrices = await stripe.prices.list({
      product: product.id,
      active: true,
      limit: 1,
    });

    let price: Stripe.Price;

    if (existingPrices.data.length > 0) {
      price = existingPrices.data[0]!;
      console.log(`   ✅ Found existing price: $${(tier.price / 100).toFixed(2)}/mo (${price.id})`);
    } else {
      price = await stripe.prices.create({
        product: product.id,
        currency: "usd",
        unit_amount: tier.price,
        recurring: { interval: "month" },
        metadata: {
          tier_key: tier.key,
        },
      });
      console.log(`   💰 Created price: $${(tier.price / 100).toFixed(2)}/mo (${price.id})`);
    }

    results[tier.key] = price.id;
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📋 Add these to your src/.env.local:\n");

  for (const [key, priceId] of Object.entries(results)) {
    const envKey = `STRIPE_PRICE_${key.toUpperCase()}`;
    console.log(`   ${envKey}=${priceId}`);
  }

  console.log("\n   STRIPE_WEBHOOK_SECRET=whsec_... (from `stripe listen --print-secret`)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  console.log("✅ Done! Products and prices synced successfully.");
  console.log("   Next steps:");
  console.log("   1. Copy the env vars above into src/.env.local");
  console.log("   2. Run: stripe listen --forward-to localhost:3000/api/stripe/webhook");
  console.log("   3. Set up the Customer Portal in Stripe Dashboard");
}

main().catch((err) => {
  console.error("❌ Sync failed:", err.message);
  process.exit(1);
});
