"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Download, Share2, Sparkles, RefreshCw, MessageCircle } from "lucide-react";

const FEATURES = [
  {
    number: "01",
    icon: Sparkles,
    title: "We create. You post.",
    description:
      "Our team creates scroll-stopping content tailored to your brand — videos, images, carousels, reels, and stories. Every piece is designed to engage your audience and grow your following. You focus on running your business.",
  },
  {
    number: "02",
    icon: CalendarDays,
    title: "Your content calendar",
    description:
      "Log into your personal dashboard and see exactly what's scheduled. Every piece of content has a preview, description, and scheduled date. A full month of content, planned and ready — no spreadsheets, no chaos.",
  },
  {
    number: "03",
    icon: Download,
    title: "Download and post in seconds",
    description:
      "See something you like? One click to download any content asset. Or connect your Instagram, TikTok, or Facebook account and post directly from your dashboard. No complex tools, no learning curve.",
  },
  {
    number: "04",
    icon: RefreshCw,
    title: "Fresh content, consistently",
    description:
      "No more scrambling to post something. New content appears on your calendar regularly — daily, weekly, whatever cadence fits your business. Consistency is what grows audiences, and we make it effortless.",
  },
  {
    number: "05",
    icon: Share2,
    title: "Every platform, every format",
    description:
      "Instagram reels, TikTok videos, Facebook posts, LinkedIn articles, carousels, stories — we create for every platform your audience is on. One service, complete coverage.",
  },
  {
    number: "06",
    icon: MessageCircle,
    title: "Your brand, your voice",
    description:
      "We learn your brand's tone, style, and audience before creating anything. The content sounds like you — because it IS you. We just do the heavy lifting of researching, writing, designing, and scheduling.",
  },
];

export function FeaturesSection() {
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

  return (
    <section id="features" ref={ref} className="relative py-24 lg:py-32">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="mb-16 lg:mb-24">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
            <span className="w-8 h-px bg-foreground/30" />
            What you get
          </span>
          <h2
            className={`text-4xl lg:text-6xl font-display tracking-tight transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            Social media,
            <br />
            <span className="text-muted-foreground">done for you.</span>
          </h2>
          <p className="mt-4 text-muted-foreground max-w-xl">
            We create the content. You review, download, and post. That's it.
          </p>
        </div>

        <div>
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.number}
                className={`group transition-all duration-700 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
                }`}
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div className="flex flex-col lg:flex-row gap-8 lg:gap-16 py-10 lg:py-14 border-b border-border/50">
                  <span className="shrink-0 font-mono text-sm text-muted-foreground/40 group-hover:text-foreground/60 transition-colors duration-500">
                    {feature.number}
                  </span>
                  <div className="flex-1 grid lg:grid-cols-2 gap-8 items-start">
                    <div>
                      <div className="flex items-center gap-3 mb-3">
                        <Icon className="w-5 h-5 text-muted-foreground" />
                        <h3 className="text-2xl lg:text-3xl font-display group-hover:translate-x-2 transition-transform duration-500">
                          {feature.title}
                        </h3>
                      </div>
                      <p className="text-muted-foreground leading-relaxed max-w-lg">
                        {feature.description}
                      </p>
                    </div>
                    <div className="hidden lg:flex justify-end">
                      <div className="w-48 h-32 rounded-2xl bg-foreground/[0.03] border border-border/30 flex items-center justify-center">
                        <Icon className="w-12 h-12 text-foreground/10 group-hover:text-foreground/20 transition-colors duration-500" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
