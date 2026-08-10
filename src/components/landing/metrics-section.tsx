"use client";

import { useEffect, useRef, useState } from "react";

const METRICS = [
  { value: "Daily", label: "Content delivered to your calendar" },
  { value: "All formats", label: "Video, image, carousel, reel, story" },
  { value: "1 click", label: "Download or post to any platform" },
  { value: "0 hours", label: "Of your time spent creating content" },
];

export function MetricsSection() {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.2 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className="relative py-24 lg:py-32 border-t border-border/50">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-16">
          {METRICS.map((metric, i) => (
            <div
              key={metric.label}
              className={`text-center lg:text-left transition-all duration-700 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div className="text-4xl lg:text-5xl font-display text-foreground mb-3">
                {metric.value}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{metric.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
