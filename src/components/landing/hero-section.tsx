"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { AnimatedSphere } from "./animated-sphere";

const CYCLING_WORDS = ["videos", "reels", "carousels", "stories", "posts"];

const STATS = [
  { value: "Daily", label: "fresh content delivered", highlight: "CONSISTENCY" },
  { value: "All formats", label: "video, image, carousel, reel", highlight: "VARIETY" },
  { value: "One click", label: "to download and post", highlight: "SIMPLICITY" },
  { value: "Zero", label: "effort from your team", highlight: "DONE FOR YOU" },
];

export function HeroSection() {
  const [isVisible, setIsVisible] = useState(false);
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    setIsVisible(true);
    const interval = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % CYCLING_WORDS.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative min-h-screen flex flex-col justify-center overflow-hidden">
      {/* Animated sphere background */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] lg:w-[800px] lg:h-[800px] opacity-25 pointer-events-none">
        <AnimatedSphere />
      </div>

      {/* Subtle grid lines */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.04]">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={`h-${i}`}
            className="absolute h-px bg-foreground/10"
            style={{ top: `${12.5 * (i + 1)}%`, left: 0, right: 0 }}
          />
        ))}
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={`v-${i}`}
            className="absolute w-px bg-foreground/10"
            style={{ left: `${8.33 * (i + 1)}%`, top: 0, bottom: 0 }}
          />
        ))}
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12 py-32 lg:py-40">
        {/* Eyebrow */}
        <div
          className={`mb-8 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground">
            <span className="w-8 h-px bg-foreground/30" />
            Done-for-you social media content
          </span>
        </div>

        {/* Main headline */}
        <div className="mb-12">
          <h1
            className={`text-[clamp(2.5rem,7vw,6.5rem)] font-display leading-[0.95] tracking-tight transition-all duration-1000 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <span className="block">We create your</span>
            <span className="block">
              <span className="relative inline-block">
                <span key={wordIndex} className="inline-flex">
                  {CYCLING_WORDS[wordIndex].split("").map((char, i) => (
                    <span
                      key={`${wordIndex}-${i}`}
                      className="inline-block animate-char-in"
                      style={{ animationDelay: `${i * 50}ms` }}
                    >
                      {char}
                    </span>
                  ))}
                </span>
                <span className="absolute -bottom-2 left-0 right-0 h-2 bg-foreground/10" />
              </span>
            </span>
            <span className="block">
              You just{" "}
              <span className="text-gradient-brand">post them</span>
            </span>
          </h1>
        </div>

        {/* Description + CTAs */}
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-24 items-end">
          <p
            className={`text-lg lg:text-xl text-muted-foreground leading-relaxed max-w-xl transition-all duration-700 delay-200 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            We handle everything — strategy, content creation, scheduling. You get
            a steady stream of scroll-stopping content delivered to your calendar.
            Just download and post, or connect your accounts and post with one click.
          </p>

          <div
            className={`flex items-start transition-all duration-700 delay-300 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <Button
              asChild
              size="lg"
              className="bg-foreground hover:bg-foreground/90 text-background px-10 h-16 text-lg rounded-full group"
            >
              <Link href="/login">
                Get Your Content Calendar
                <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Stats marquee */}
      <div
        className={`absolute bottom-16 left-0 right-0 transition-all duration-700 delay-500 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex gap-16 marquee whitespace-nowrap">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex gap-16">
              {STATS.map((stat) => (
                <div key={`${stat.highlight}-${i}`} className="flex items-baseline gap-4">
                  <span className="text-4xl lg:text-5xl font-display">{stat.value}</span>
                  <span className="text-sm text-muted-foreground">
                    {stat.label}
                    <span className="block font-mono text-xs mt-1 text-muted-foreground/50">{stat.highlight}</span>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
