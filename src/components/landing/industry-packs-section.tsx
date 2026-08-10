"use client";

import { useEffect, useRef, useState } from "react";
import { Plane, Home, UtensilsCrossed, Dumbbell, Stethoscope, Sparkles } from "lucide-react";

const PACKS = [
  { icon: Plane, name: "Travel & Tours", desc: "Agencies, tour operators, DMCs, cruise lines, hotels" },
  { icon: Home, name: "Real Estate", desc: "Agents, brokerages, luxury properties, rentals, developers" },
  { icon: UtensilsCrossed, name: "Restaurants", desc: "Cafes, bars, food trucks, caterers, delivery services" },
  { icon: Dumbbell, name: "Fitness", desc: "Gyms, personal trainers, nutrition coaches, wellness brands" },
  { icon: Stethoscope, name: "Medical & Dental", desc: "Clinics, dentists, dermatologists, med spas, therapists" },
  { icon: Sparkles, name: "Custom", desc: "Any business, any niche, any platform — we build your pack" },
];

export function IndustryPacksSection() {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="packs" ref={ref} className="relative py-24 lg:py-32">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="mb-16 lg:mb-24">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
            <span className="w-8 h-px bg-foreground/30" />
            Industry Packs
          </span>
          <h2
            className={`text-4xl lg:text-6xl font-display tracking-tight transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            Pre-built for your industry.
            <br />
            <span className="text-muted-foreground">Plug and play.</span>
          </h2>
          <p className="mt-4 text-muted-foreground max-w-xl">
            Every niche gets custom AI prompts, hashtag strategies, content templates, and a
            30-day calendar tuned to what actually works in your market.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 stagger-children">
          {PACKS.map((pack, i) => {
            const Icon = pack.icon;
            return (
              <div
                key={pack.name}
                className={`group text-center p-6 rounded-2xl border border-border/50 bg-card hover:border-foreground/20 hover:bg-foreground/[0.02] transition-all duration-500 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className="w-12 h-12 rounded-xl bg-foreground/[0.04] flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300">
                  <Icon className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
                <h3 className="text-sm font-semibold mb-1">{pack.name}</h3>
                <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
                  {pack.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
