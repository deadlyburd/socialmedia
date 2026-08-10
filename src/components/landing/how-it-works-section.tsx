"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Eye, Download, BarChart3 } from "lucide-react";

const STEPS = [
  {
    number: "I",
    icon: Sparkles,
    title: "We learn your brand and create content",
    description:
      "Tell us about your business, your audience, and your goals. Our team researches your industry, studies what works, and creates scroll-stopping content — videos, reels, carousels, and posts tailored to your brand voice.",
    highlight: "Strategy + creation handled by our team",
  },
  {
    number: "II",
    icon: Eye,
    title: "Your content appears on your calendar",
    description:
      "Log into your personal dashboard anytime. Every piece of content is there — with previews, captions, and scheduled dates. See exactly what's planned for the week, month, or quarter ahead.",
    highlight: "Full visibility, zero effort from you",
  },
  {
    number: "III",
    icon: Download,
    title: "You download and post — one click",
    description:
      "Like what you see? Download any content asset with one click. Or connect your social accounts and post directly from the dashboard. Instagram, TikTok, Facebook — all supported.",
    highlight: "Download or direct-post in seconds",
  },
  {
    number: "IV",
    icon: BarChart3,
    title: "We keep creating. You keep growing.",
    description:
      "New content arrives on your calendar consistently. You build a library of high-quality posts. Your audience grows. Your brand stays top-of-mind. All while you focus on running your actual business.",
    highlight: "Consistent content = consistent growth",
  },
];

export function HowItWorksSection() {
  const [activeStep, setActiveStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!isVisible) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % STEPS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [isVisible]);

  return (
    <section id="how-it-works" ref={ref} className="relative py-24 lg:py-32 bg-foreground text-background overflow-hidden">
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(-45deg, transparent, transparent 40px, currentColor 40px, currentColor 41px)",
          }}
        />
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="mb-16 lg:mb-24">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-background/50 mb-6">
            <span className="w-8 h-px bg-background/30" />
            How it works
          </span>
          <h2
            className={`text-4xl lg:text-6xl font-display tracking-tight transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            Four steps.
            <br />
            <span className="text-background/50">Zero hassle.</span>
          </h2>
          <p className="mt-4 text-background/50 max-w-xl">
            We do the heavy lifting. You get the results.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          <div className="space-y-0">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              const isActive = activeStep === i;
              return (
                <button
                  key={step.number}
                  type="button"
                  onClick={() => setActiveStep(i)}
                  className={`w-full text-left py-8 border-b border-background/10 transition-all duration-500 group ${
                    isActive ? "opacity-100" : "opacity-40 hover:opacity-70"
                  }`}
                >
                  <div className="flex items-start gap-6">
                    <span className="font-display text-3xl text-background/30">
                      {step.number}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Icon className="w-5 h-5 text-background/50" />
                        <h3 className="text-xl lg:text-2xl font-display group-hover:translate-x-2 transition-transform duration-300">
                          {step.title}
                        </h3>
                      </div>
                      <p className="text-background/60 leading-relaxed text-sm">
                        {step.description}
                      </p>
                      {isActive && (
                        <>
                          <p className="mt-3 text-xs font-mono text-background/40">
                            {step.highlight}
                          </p>
                          <div className="mt-4 h-px bg-background/20 overflow-hidden">
                            <div className="h-full bg-background animate-progress-bar" />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Visual panel */}
          <div className="lg:sticky lg:top-32 self-start">
            <div className="border border-background/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-background/10 flex items-center justify-between">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-background/20" />
                  <div className="w-3 h-3 rounded-full bg-background/20" />
                  <div className="w-3 h-3 rounded-full bg-background/20" />
                </div>
                <span className="text-xs font-mono text-background/40">
                  step-{activeStep + 1}
                </span>
              </div>

              <div className="p-8 flex items-center justify-center min-h-[280px]">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-background/5 border border-background/10 mb-6">
                    {(() => {
                      const StepIcon = STEPS[activeStep].icon;
                      return <StepIcon className="w-10 h-10 text-background/40" />;
                    })()}
                  </div>
                  <h4 className="text-lg font-display text-background/80 mb-2">
                    {STEPS[activeStep].title}
                  </h4>
                  <p className="text-sm text-background/40 max-w-xs mx-auto">
                    {STEPS[activeStep].highlight}
                  </p>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-background/10 flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs font-mono text-background/40">
                  {activeStep === STEPS.length - 1
                    ? "Content delivered"
                    : `${activeStep + 1} of ${STEPS.length}`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes progress-bar {
          from { width: 0%; }
          to { width: 100%; }
        }
        .animate-progress-bar {
          animation: progress-bar 5s linear forwards;
        }
      `}</style>
    </section>
  );
}
