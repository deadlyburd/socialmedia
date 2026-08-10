"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { TIER_FEATURES, type SubscriptionTier } from "@/lib/saas-core/types";
import { TIER_LABELS, TIER_PRICE_DISPLAY, getPriceIdForTier } from "@/lib/stripe-prices";

interface TierCard {
  tier: SubscriptionTier;
  name: string;
  price: string;
  period: string;
  desc: string;
  features: string[];
  cta: string;
  featured: boolean;
}

function buildTierCards(): TierCard[] {
  const tierDefs: { tier: SubscriptionTier; desc: string; featured: boolean }[] = [
    { tier: "free", desc: "Try it out — 5 posts per month on one platform.", featured: false },
    { tier: "starter", desc: "For small businesses that want consistent posting.", featured: false },
    { tier: "growth", desc: "For growing businesses that need regular content.", featured: true },
    { tier: "empire", desc: "For businesses that want full-platform coverage.", featured: false },
  ];

  return tierDefs.map(({ tier, desc, featured }) => {
    const f = TIER_FEATURES[tier];
    const features: string[] = [];

    if (tier === "free") {
      features.push(`${f.maxPostsPerMonth} posts per month`);
      features.push(`${f.maxPlatforms} platform`);
      features.push(`${f.maxBlogsPerMonth} blog post per month`);
      features.push("Your content calendar");
      features.push("Download and post");
    } else {
      features.push(`${f.maxPostsPerMonth >= 999 ? "Unlimited" : `${f.maxPostsPerMonth} posts`} per month`);
      features.push(`Up to ${f.maxPlatforms} platforms`);
      features.push(`${f.maxBlogsPerMonth >= 999 ? "Unlimited" : `${f.maxBlogsPerMonth} blog posts`} per month`);
      features.push("All content formats included");
      if (f.imageGeneration) features.push("Custom imagery & graphics");
      if (f.videoGeneration) features.push("Video content included");
      if (f.trendDetection) features.push("Trending topic coverage");
      if (f.whiteLabel) features.push("Priority content delivery");
      features.push("Your branded calendar");
      features.push("One-click posting");
    }

    return {
      tier,
      name: TIER_LABELS[tier],
      price: TIER_PRICE_DISPLAY[tier],
      period: tier === "free" ? "" : "/month",
      desc,
      features,
      cta: tier === "free" ? "Try free" : "Get started",
      featured,
    };
  });
}

export function PricingSection() {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tiers = buildTierCards();

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="pricing" ref={ref} className="relative py-32 lg:py-40 border-t border-border/50">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="text-center mb-16 lg:mb-24">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
            <span className="w-8 h-px bg-foreground/30" />
            Pricing
          </span>
          <h2
            className={`text-4xl lg:text-6xl font-display tracking-tight mb-4 transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            Simple pricing,
            <br />
            <span className="text-stroke">no surprises.</span>
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Start with a free trial. Upgrade when you're ready. Cancel anytime.
          </p>
        </div>

        {/* Pricing Cards — 4 columns */}
        <div className="grid md:grid-cols-4 gap-px bg-border/50 max-w-5xl mx-auto overflow-hidden rounded-2xl">
          {tiers.map((tier, i) => (
            <div
              key={tier.tier}
              className={`relative p-6 lg:p-8 bg-background transition-all duration-700 ${
                tier.featured
                  ? "md:-my-4 md:py-10 lg:py-14 border-2 border-foreground rounded-2xl z-10"
                  : ""
              } ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              {tier.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-brand-amber text-background text-xs font-mono uppercase tracking-widest rounded-full whitespace-nowrap">
                  Most popular
                </span>
              )}

              {/* Tier Header */}
              <div className="mb-6">
                <span className="font-mono text-xs text-muted-foreground">
                  {tier.tier === "free" ? "00" : String(i).padStart(2, "0")}
                </span>
                <h3 className="font-display text-2xl mt-2">{tier.name}</h3>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{tier.desc}</p>
              </div>

              {/* Price */}
              <div className="mb-6 pb-6 border-b border-border/50">
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-4xl lg:text-5xl">{tier.price}</span>
                  <span className="text-muted-foreground text-sm">{tier.period}</span>
                </div>
              </div>

              {/* Features */}
              <ul className="space-y-3 mb-8">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <Check className="w-3.5 h-3.5 text-foreground mt-0.5 shrink-0" />
                    <span className="text-xs text-muted-foreground leading-relaxed">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Button
                asChild
                size="lg"
                className={`w-full rounded-full group h-10 text-sm bg-foreground hover:bg-foreground/90 text-background`}
              >
                <Link href="/login">
                  {tier.cta}
                  <ArrowRight className="w-3.5 h-3.5 ml-2 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            </div>
          ))}
        </div>

        {/* Enterprise row */}
        <div className="max-w-5xl mx-auto mt-4">
          <div
            className={`p-6 lg:p-8 bg-background border border-border/50 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6 transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
            style={{ transitionDelay: "400ms" }}
          >
            <div>
              <h3 className="font-display text-xl">Enterprise</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Custom volume, dedicated support, priority delivery. For businesses with 5+ locations or franchises.
              </p>
            </div>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full shrink-0"
            >
              <a href="mailto:hello@socialautomations.xyz">Contact us</a>
            </Button>
          </div>
        </div>

        {/* Bottom Note */}
        <p className="mt-12 text-center text-sm text-muted-foreground">
          All plans include your branded content calendar and one-click posting.{" "}
          <Link href="/login" className="underline underline-offset-4 hover:text-foreground transition-colors">
            Start with a free account
          </Link>
        </p>
      </div>
    </section>
  );
}
