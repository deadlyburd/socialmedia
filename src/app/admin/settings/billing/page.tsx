"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, Check, ArrowRight, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { TIER_FEATURES, type SubscriptionTier, type TenantFeatures } from "@/lib/saas-core/types";
import { TIER_LABELS, TIER_PRICE_DISPLAY, getPriceIdForTier } from "@/lib/stripe-prices";

interface SubscriptionData {
  tier: SubscriptionTier;
  status: string;
  trialEndsAt: string | null;
  features: TenantFeatures;
  subscription: {
    status: string;
    currentPeriodEnd: string | null;
    customerId: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
}

const PAID_TIERS: SubscriptionTier[] = ["starter", "growth", "empire", "custom"];

const FEATURE_LABELS: { key: keyof TenantFeatures; label: string }[] = [
  { key: "maxPostsPerMonth", label: "Posts per month" },
  { key: "maxPlatforms", label: "Social platforms" },
  { key: "maxBlogsPerMonth", label: "AI blog posts per month" },
  { key: "imageGeneration", label: "AI image generation" },
  { key: "videoGeneration", label: "AI video generation" },
  { key: "trendDetection", label: "Trend detection" },
  { key: "bookingFunnel", label: "Booking funnel" },
  { key: "approvalGate", label: "Approval workflow" },
  { key: "whiteLabel", label: "White-label branding" },
];

export default function BillingSettingsPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) { router.replace("/login"); return; }
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchSubscription();
  }, [isAuthenticated]);

  // Check for checkout success/cancelled in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      toast.success("Subscription updated! Refreshing...");
      // Clean URL
      window.history.replaceState({}, "", "/admin/settings/billing");
    } else if (params.get("checkout") === "cancelled") {
      toast.info("Checkout cancelled.");
      window.history.replaceState({}, "", "/admin/settings/billing");
    }
  }, []);

  async function fetchSubscription() {
    try {
      // First, get the admin's tenants
      const clientsRes = await fetch("/api/admin/clients", { credentials: "include" });
      // Fallback: get tenants list
      const tenantsRes = await fetch("/api/tenants", { credentials: "include" });
      const tenantsData = await tenantsRes.json();

      if (tenantsData.success && tenantsData.data?.length > 0) {
        // For billing, use the first tenant or the admin's own tenant
        // Admin billing is per-agency, so we use the first tenant
        const tid = tenantsData.data[0].id;
        setTenantId(tid);

        const res = await fetch(`/api/billing/subscription?tenantId=${tid}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (data.success) {
          setSubscription(data.data);
        }
      }
    } catch (err) {
      console.error("Failed to fetch subscription:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleCheckout = useCallback(async (tier: SubscriptionTier) => {
    if (!tenantId) return;
    setCheckingOut(tier);

    try {
      const priceId = getPriceIdForTier(tier);
      if (!priceId) {
        toast.error("Price not configured for this tier.");
        return;
      }

      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ priceId, tenantId }),
      });
      const data = await res.json();

      if (data.success && data.data.url) {
        window.location.href = data.data.url;
      } else {
        toast.error(data.error ?? "Failed to start checkout.");
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setCheckingOut(null);
    }
  }, [tenantId]);

  const handlePortal = useCallback(async () => {
    if (!tenantId) return;

    try {
      const res = await fetch(`/api/billing/portal?tenantId=${tenantId}`, {
        credentials: "include",
      });
      const data = await res.json();

      if (data.success && data.data.url) {
        window.location.href = data.data.url;
      } else {
        toast.error(data.error ?? "Failed to open billing portal.");
      }
    } catch {
      toast.error("Network error.");
    }
  }, [tenantId]);

  if (isLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentTier = subscription?.tier ?? "free";
  const isPaid = currentTier !== "free";
  const subStatus = subscription?.subscription?.status ?? "inactive";

  return (
    <div className="flex flex-col gap-8 max-w-3xl mx-auto">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Billing</p>
        <h1 className="text-[32px] md:text-[42px] font-semibold tracking-tight leading-tight">
          Subscription & Billing
        </h1>
        <p className="text-muted-foreground mt-1.5 text-[15px]">
          Manage your plan and payment methods
        </p>
      </div>

      {/* Current Plan Card */}
      <div className="bg-white/50 rounded-[24px] p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current Plan</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-semibold">{TIER_LABELS[currentTier]}</span>
              <span className="text-muted-foreground">{TIER_PRICE_DISPLAY[currentTier]}/mo</span>
            </div>
          </div>
          <div className="text-right">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
              subStatus === "active" ? "bg-green-100 text-green-700" :
              subStatus === "past_due" ? "bg-amber-100 text-amber-700" :
              subStatus === "trialing" ? "bg-blue-100 text-blue-700" :
              "bg-muted text-muted-foreground"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                subStatus === "active" ? "bg-green-500" :
                subStatus === "past_due" ? "bg-amber-500" :
                subStatus === "trialing" ? "bg-blue-500" :
                "bg-muted-foreground"
              }`} />
              {subStatus === "active" ? "Active" :
               subStatus === "past_due" ? "Past Due" :
               subStatus === "trialing" ? "Trial" :
               subStatus === "cancelled" ? "Cancelled" : "Inactive"}
            </span>
          </div>
        </div>

        {subscription?.subscription?.currentPeriodEnd && (
          <p className="text-sm text-muted-foreground mb-4">
            {subscription.subscription.cancelAtPeriodEnd ? "Ends" : "Renews"} on{" "}
            {new Date(subscription.subscription.currentPeriodEnd).toLocaleDateString("en-US", {
              year: "numeric", month: "long", day: "numeric",
            })}
          </p>
        )}

        {subscription?.trialEndsAt && currentTier !== "free" && (
          <p className="text-sm text-blue-600 mb-4">
            Trial ends {new Date(subscription.trialEndsAt).toLocaleDateString("en-US", {
              year: "numeric", month: "long", day: "numeric",
            })}
          </p>
        )}

        {/* Features */}
        {subscription?.features && (
          <div className="border-t border-border/50 pt-5 mt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Your Features
            </p>
            <div className="grid grid-cols-2 gap-2">
              {FEATURE_LABELS.map(({ key, label }) => {
                const value = subscription.features[key];
                const display = typeof value === "boolean"
                  ? (value ? "✓" : "—")
                  : typeof value === "number"
                    ? (value >= 999 ? "Unlimited" : String(value))
                    : String(value);
                return (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    {typeof value === "boolean" && value ? (
                      <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    ) : (
                      <span className="w-3.5 shrink-0" />
                    )}
                    <span className="text-muted-foreground">{label}:</span>
                    <span className="font-medium">{display}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {isPaid && subscription?.subscription?.customerId && (
          <Button
            onClick={handlePortal}
            className="rounded-full bg-foreground hover:bg-foreground/90 text-background h-10 px-6"
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Manage Billing
            <ExternalLink className="h-3 w-3 ml-1.5" />
          </Button>
        )}
      </div>

      {/* Upgrade Options */}
      {currentTier !== "custom" && (
        <>
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
              {isPaid ? "Change Plan" : "Upgrade Your Plan"}
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              {PAID_TIERS.map((tier) => {
                const isCurrent = tier === currentTier;
                const features = TIER_FEATURES[tier];
                return (
                  <div
                    key={tier}
                    className={`relative p-6 rounded-[20px] bg-white/50 border transition-colors ${
                      isCurrent ? "border-foreground ring-1 ring-foreground" : "border-border/50"
                    }`}
                  >
                    {isCurrent && (
                      <span className="absolute -top-2.5 left-6 px-2.5 py-0.5 bg-foreground text-background text-[10px] font-mono uppercase tracking-widest rounded-full">
                        Current
                      </span>
                    )}
                    <p className="text-xs font-mono text-muted-foreground mb-1">{TIER_LABELS[tier]}</p>
                    <div className="flex items-baseline gap-1.5 mb-3">
                      <span className="text-2xl font-semibold">{TIER_PRICE_DISPLAY[tier]}</span>
                      <span className="text-xs text-muted-foreground">/month</span>
                    </div>
                    <ul className="space-y-1.5 mb-4">
                      <li className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Check className="h-3 w-3 text-green-500 shrink-0" />
                        {features.maxPostsPerMonth >= 999 ? "Unlimited" : features.maxPostsPerMonth} posts/mo
                      </li>
                      <li className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Check className="h-3 w-3 text-green-500 shrink-0" />
                        {features.maxBlogsPerMonth >= 999 ? "Unlimited" : features.maxBlogsPerMonth} AI blogs/mo
                      </li>
                      <li className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Check className="h-3 w-3 text-green-500 shrink-0" />
                        {features.maxPlatforms} platforms
                      </li>
                      {features.whiteLabel && (
                        <li className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Check className="h-3 w-3 text-green-500 shrink-0" />
                          White-label
                        </li>
                      )}
                    </ul>
                    <Button
                      onClick={() => handleCheckout(tier)}
                      disabled={isCurrent || checkingOut !== null}
                      className={`w-full rounded-full h-9 text-sm ${
                        isCurrent
                          ? "bg-muted text-muted-foreground cursor-default"
                          : "bg-foreground hover:bg-foreground/90 text-background"
                      }`}
                    >
                      {checkingOut === tier ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      ) : null}
                      {isCurrent ? "Current Plan" : tier === "custom" ? "Contact Sales" : `Switch to ${TIER_LABELS[tier]}`}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
