/**
 * Stripe Webhook Handler — standalone Next.js App Router route.
 *
 * NOT routed through Hono because webhooks need:
 * 1. Raw request body for signature verification
 * 2. No auth middleware (Stripe signs requests, not users)
 */
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { billingService } from "@/lib/saas-core/services/billing-service";
import { initUserStore } from "@/lib/saas-core/api/router";
import type Stripe from "stripe";

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe signature header" },
      { status: 400 },
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // Only allow unverified webhooks in development
  if (!webhookSecret || webhookSecret.startsWith("whsec_placeholder")) {
    const isDev = process.env.NODE_ENV === "development" || !process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development";

    if (!isDev) {
      console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured in production — rejecting webhook");
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 },
      );
    }

    console.warn(
      "[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured — accepting unverified event in development",
    );
    try {
      const rawBody = await req.text();
      const event = JSON.parse(rawBody);
      await handleEvent(event);
      return NextResponse.json({ received: true });
    } catch (err: any) {
      console.error("[stripe-webhook] Error parsing event:", err.message);
      return NextResponse.json(
        { error: "Failed to parse webhook body" },
        { status: 400 },
      );
    }
  }

  // Production path: verify signature
  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.error(`[stripe-webhook] Signature verification failed: ${err.message}`);
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 },
    );
  }

  // Ensure the in-memory stores are initialized before handling
  try {
    await initUserStore();
  } catch {
    // Continue anyway — billing service hits Supabase directly
  }

  await handleEvent(event);

  return NextResponse.json({ received: true });
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  console.log(`[stripe-webhook] Received event: ${event.type}`);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription") {
        await billingService.handleCheckoutCompleted(session);
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      await billingService.handleSubscriptionUpdated(subscription);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await billingService.handleSubscriptionDeleted(subscription);
      break;
    }

    // Handle payment failures to notify admins
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      console.error(
        `[stripe-webhook] Payment failed for customer ${invoice.customer}` +
        ` — invoice ${invoice.id}. Attempt count: ${invoice.attempt_count}`,
      );
      break;
    }

    default:
      console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
  }
}
