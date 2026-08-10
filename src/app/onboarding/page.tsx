/**
 * Typeform-style onboarding — 2 simple steps.
 * Step 1: Pick your industry/niche
 * Step 2: Business name + website URL (no analysis)
 */

"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { ArrowRight, ArrowLeft, Check, Globe, Building2, Zap } from "lucide-react";

const INDUSTRIES = [
  { slug: "travel-agency", name: "Travel & Tourism", icon: "✈️", desc: "Hotels, operators, cruises, DMCs" },
  { slug: "real-estate", name: "Real Estate", icon: "🏠", desc: "Agents, brokerages, luxury properties" },
  { slug: "restaurant", name: "Restaurants & Food", icon: "🍽️", desc: "Cafes, bars, food trucks, caterers" },
  { slug: "fitness-coaching", name: "Fitness & Coaching", icon: "💪", desc: "Gyms, trainers, nutritionists, coaches" },
  { slug: "dental-clinic", name: "Dental & Medical", icon: "🦷", desc: "Dentists, dermatologists, med spas" },
  { slug: "ecommerce", name: "E-Commerce", icon: "🛍️", desc: "Online stores, DTC brands, retailers" },
  { slug: "agency", name: "Marketing Agency", icon: "📣", desc: "Creative, media, PR, and digital agencies" },
  { slug: "saas", name: "SaaS & Tech", icon: "💻", desc: "Software companies, startups, apps" },
  { slug: "custom", name: "Something Else", icon: "✨", desc: "Any business, any niche, any platform" },
];

export default function OnboardingPage() {
  const { user, isAuthenticated, isLoading, completeOnboarding } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/login");
  }, [isLoading, isAuthenticated, router]);

  // Pre-fill name from user metadata
  useEffect(() => {
    if (user?.name && user.name !== user.email?.split("@")[0]) {
      setBusinessName(user.name);
    }
  }, [user]);

  const handleIndustrySelect = useCallback((slug: string) => {
    setSelectedIndustry(slug);
    setError(null);
    // Small delay for visual feedback before transitioning
    setTimeout(() => setStep(2), 300);
  }, []);

  const handleBack = useCallback(() => {
    setError(null);
    setStep(1);
  }, []);

  const handleSubmit = async () => {
    if (!businessName.trim()) {
      setError("Please enter your business name.");
      return;
    }
    if (!websiteUrl.trim()) {
      setError("Please enter your website URL.");
      return;
    }
    if (!websiteUrl.match(/^https?:\/\/.+/)) {
      setError("Please enter a valid URL starting with http:// or https://");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Save onboarding data
      await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          niche: selectedIndustry,
          businessName: businessName.trim(),
          websiteUrl: websiteUrl.trim(),
        }),
      });

      await completeOnboarding();
      setStep(3);
      setTimeout(() => router.replace("/admin/dashboard"), 2000);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  const selectedIndustryData = INDUSTRIES.find((i) => i.slug === selectedIndustry);

  return (
    <div className="relative min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12">
      {/* Subtle grid background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.03]">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={`h-${i}`} className="absolute h-px bg-foreground" style={{ top: `${12.5 * (i + 1)}%`, left: 0, right: 0 }} />
        ))}
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={`v-${i}`} className="absolute w-px bg-foreground" style={{ left: `${10 * (i + 1)}%`, top: 0, bottom: 0 }} />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-[560px]">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-foreground/[0.04] border border-border/50 mb-5">
            <Zap className="w-5 h-5 text-foreground" />
          </div>
          <h1 className="text-2xl font-display tracking-tight text-foreground">
            {step === 3 ? "You're all set!" : "Welcome to Social Automations"}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {step === 3
              ? "Taking you to your dashboard..."
              : step === 2
                ? "Just one more thing"
                : "First — what industry are you in?"}
          </p>
        </div>

        {/* Progress dots */}
        {step !== 3 && (
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${step >= 1 ? "bg-foreground" : "bg-border"}`} />
            <div className={`w-8 h-0.5 rounded transition-all duration-500 ${step >= 2 ? "bg-foreground/60" : "bg-border"}`} />
            <div className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${step >= 2 ? "bg-foreground" : "bg-border"}`} />
          </div>
        )}

        {/* Card */}
        <div
          className="relative rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden transition-all duration-500"
          style={{ minHeight: step === 1 ? 380 : step === 2 ? 320 : 200 }}
        >
          {/* Step 1: Industry Picker */}
          <div
            className="p-6 md:p-8 transition-all duration-500"
            style={{
              opacity: step === 1 ? 1 : 0,
              transform: step === 1 ? "translateX(0)" : "translateX(-20px)",
              pointerEvents: step === 1 ? "auto" : "none",
              position: step === 1 ? "relative" : "absolute",
              inset: 0,
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {INDUSTRIES.map((industry) => (
                <button
                  key={industry.slug}
                  onClick={() => handleIndustrySelect(industry.slug)}
                  className="group flex flex-col items-center gap-2 p-4 rounded-xl border border-border/40 bg-background hover:border-foreground/20 hover:bg-accent/50 transition-all duration-200 text-left"
                >
                  <span className="text-xl">{industry.icon}</span>
                  <span className="text-xs font-semibold text-foreground text-center leading-tight">{industry.name}</span>
                  <span className="text-[10px] text-muted-foreground/60 text-center leading-snug">{industry.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Business Name + Website */}
          <div
            className="p-6 md:p-8 transition-all duration-500"
            style={{
              opacity: step === 2 ? 1 : 0,
              transform: step === 2 ? "translateX(0)" : "translateX(20px)",
              pointerEvents: step === 2 ? "auto" : "none",
              position: step === 2 ? "relative" : "absolute",
              inset: 0,
            }}
          >
            {/* Selected industry badge */}
            {selectedIndustryData && (
              <div className="flex items-center gap-2 mb-6">
                <span className="text-lg">{selectedIndustryData.icon}</span>
                <span className="text-sm font-medium text-foreground">{selectedIndustryData.name}</span>
                <button onClick={handleBack} className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Change
                </button>
              </div>
            )}

            <div className="space-y-4">
              {/* Business Name */}
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                  <Building2 className="w-3.5 h-3.5" />
                  Business Name
                </label>
                <input
                  type="text"
                  placeholder="Your business or agency name"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  autoFocus
                  className="w-full px-4 py-3 bg-background border border-input rounded-xl text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all"
                />
              </div>

              {/* Website URL */}
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                  <Globe className="w-3.5 h-3.5" />
                  Website URL
                </label>
                <input
                  type="url"
                  placeholder="https://yourbusiness.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  className="w-full px-4 py-3 bg-background border border-input rounded-xl text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all"
                />
                <p className="mt-1.5 text-[11px] text-muted-foreground/40">
                  Your website URL is saved for reference — no automated analysis
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-destructive/5 border border-destructive/10 text-destructive text-xs">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {error}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleBack}
                  className="flex items-center gap-1.5 px-4 py-3 rounded-full border border-border/50 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-all duration-200"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-full bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-all duration-200 disabled:opacity-40"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      Complete Setup
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Step 3: Done */}
          <div
            className="p-6 md:p-8 flex flex-col items-center justify-center text-center transition-all duration-500"
            style={{
              opacity: step === 3 ? 1 : 0,
              pointerEvents: step === 3 ? "auto" : "none",
              position: step === 3 ? "relative" : "absolute",
              inset: 0,
            }}
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-5">
              <Check className="w-7 h-7 text-emerald-600" />
            </div>
            <h2 className="text-lg font-display text-foreground">All done!</h2>
            <p className="text-sm text-muted-foreground mt-1.5">
              {selectedIndustryData && (
                <span>{selectedIndustryData.icon} {selectedIndustryData.name} · </span>
              )}
              {businessName || "Your business"} — taking you to your dashboard
            </p>
            <div className="flex items-center gap-1.5 mt-4 text-xs text-muted-foreground/50">
              <div className="w-3 h-3 border-2 border-muted-foreground/20 border-t-muted-foreground/50 rounded-full animate-spin" />
              Redirecting...
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground/30">
          You can update these details later in Settings
        </p>
      </div>
    </div>
  );
}
