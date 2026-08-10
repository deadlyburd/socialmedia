"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Zap } from "lucide-react";
import { AnimatedTetrahedron } from "./animated-tetrahedron";

export function CtaSection() {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

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

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  return (
    <section id="cta" ref={ref} className="relative py-24 lg:py-32 overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div
          className={`relative border border-foreground/10 rounded-2xl bg-background transition-all duration-1000 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
          onMouseMove={handleMouseMove}
        >
          {/* Spotlight effect */}
          <div
            className="absolute inset-0 rounded-2xl opacity-10 pointer-events-none transition-opacity duration-300"
            style={{
              background: `radial-gradient(600px circle at ${mousePosition.x}% ${mousePosition.y}%, rgba(0,0,0,0.15), transparent 40%)`,
            }}
          />

          <div className="relative z-10 px-8 lg:px-16 py-16 lg:py-24">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
              {/* Left content */}
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-foreground/[0.04] border border-border/50 text-xs font-medium mb-8">
                  <Zap className="w-3 h-3" />
                  Stop stressing about social media
                </div>

                <h2 className="text-4xl lg:text-6xl font-display tracking-tight mb-6 leading-[0.95]">
                  Ready to stop
                  <br />
                  <span className="text-muted-foreground">creating content?</span>
                </h2>

                <p className="text-lg text-muted-foreground mb-10 leading-relaxed max-w-xl">
                  Let us handle it. You'll get a steady stream of professional content
                  delivered to your calendar — ready to download and post. Focus on
                  running your business, not your Instagram.
                </p>

                <div className="flex flex-col sm:flex-row items-start gap-4">
                  <Button
                    asChild
                    size="lg"
                    className="btn-gradient text-background px-8 h-14 text-base rounded-full group"
                  >
                    <Link href="/login">
                      Get started
                      <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="h-14 px-8 text-base rounded-full border-foreground/20 hover:bg-foreground/5"
                  >
                    <a href="mailto:hello@socialautomations.xyz">Talk to us</a>
                  </Button>
                </div>

                <p className="text-sm text-muted-foreground mt-6 font-mono">
                  No long-term contracts. Cancel anytime.
                </p>
              </div>

              {/* Right: animated tetrahedron */}
              <div className="hidden lg:flex items-center justify-center w-[400px] h-[400px] -mr-8">
                <AnimatedTetrahedron />
              </div>
            </div>
          </div>

          {/* Decorative corners */}
          <div className="absolute top-0 right-0 w-32 h-32 border-b border-l border-border/10 rounded-tr-2xl" />
          <div className="absolute bottom-0 left-0 w-32 h-32 border-t border-r border-border/10 rounded-bl-2xl" />
        </div>
      </div>
    </section>
  );
}
