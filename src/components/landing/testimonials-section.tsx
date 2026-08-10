"use client";

import { useEffect, useRef, useState } from "react";

const TESTIMONIALS = [
  {
    quote: "I used to spend every Sunday stressing about what to post. Now I log in, see a full month of content ready for me, and post in 30 seconds. My engagement is up and my stress is gone.",
    author: "Sarah Chen",
    role: "Owner, Bella Vita Tours",
    industry: "Travel & Tourism",
  },
  {
    quote: "We're a small restaurant — nobody has time for social media. Social Automations creates our reels and posts, we just download and share. Our Instagram following doubled in 3 months.",
    author: "Marcus Rodriguez",
    role: "Chef & Owner, Sol Kitchen",
    industry: "Restaurants & Food",
  },
  {
    quote: "As a dentist, I know nothing about TikTok. But my practice is showing up there every week with content that actually looks professional. My younger patients found us through social media.",
    author: "Dr. Priya Patel",
    role: "Founder, Radiant Dental",
    industry: "Healthcare",
  },
  {
    quote: "I run a real estate team of 12 agents. They all get their own content calendars. Each one has posts, reels, and stories ready to go. It's like having a marketing department without the overhead.",
    author: "James Wilson",
    role: "Team Lead, Wilson Properties",
    industry: "Real Estate",
  },
  {
    quote: "The blog posts they create actually rank on Google. I'm getting leads from content I didn't even write. That's what sold me — it's not just social media, it's actual business growth.",
    author: "Elena Torres",
    role: "Owner, Coastal Wellness",
    industry: "Health & Wellness",
  },
  {
    quote: "I was skeptical about outsourcing content. But the team actually learned our brand voice. The posts sound like us. Our clients have commented on how consistent and professional we look now.",
    author: "David Kim",
    role: "Managing Partner, Apex Legal",
    industry: "Professional Services",
  },
];

export function TestimonialsSection() {
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
    <section ref={ref} className="relative py-24 lg:py-32 border-t border-border/50">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="flex items-center gap-4 mb-16">
          <span className="text-sm font-mono text-muted-foreground">
            Success stories
          </span>
          <div className="flex-1 h-px bg-border/50" />
          <span className="font-mono text-xs text-muted-foreground">
            {String(TESTIMONIALS.length).padStart(2, "0")} businesses
          </span>
        </div>

        <div className="mb-16 lg:mb-24">
          <h2
            className={`text-4xl lg:text-6xl font-display tracking-tight transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            Trusted by businesses
            <br />
            <span className="text-muted-foreground">in every industry.</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <div
              key={t.author}
              className={`bg-card border border-border/50 rounded-2xl p-6 transition-all duration-500 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div className="flex items-center gap-1 mb-4">
                {Array.from({ length: 5 }).map((_, j) => (
                  <svg
                    key={j}
                    className="w-4 h-4 text-foreground/15 fill-foreground/15"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                ))}
              </div>

              <blockquote className="text-sm text-muted-foreground leading-relaxed mb-6">
                &ldquo;{t.quote}&rdquo;
              </blockquote>

              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-foreground/[0.04] border border-border/50 flex items-center justify-center">
                  <span className="font-display text-lg">{t.author.charAt(0)}</span>
                </div>
                <div>
                  <div className="text-sm font-semibold">{t.author}</div>
                  <div className="text-xs text-muted-foreground/70">{t.role}</div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-border/30">
                <span className="inline-block px-2 py-0.5 rounded-md bg-foreground/[0.03] text-[10px] font-mono text-muted-foreground/50">
                  {t.industry}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-24 pt-12 border-t border-border/50">
          <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase mb-8 text-center">
            Businesses we serve
          </p>
          <div className="w-full overflow-hidden">
            <div className="flex gap-16 items-center marquee">
              {Array.from({ length: 2 }).map((_, setIdx) => (
                <div key={setIdx} className="flex gap-16 items-center shrink-0">
                  {[
                    "Bella Vita Tours",
                    "Sol Kitchen",
                    "Radiant Dental",
                    "Wilson Properties",
                    "Coastal Wellness",
                    "Apex Legal",
                    "Nova Fitness",
                    "Atlas Realty",
                  ].map((company) => (
                    <span
                      key={`${setIdx}-${company}`}
                      className="font-display text-xl md:text-2xl text-foreground/20 whitespace-nowrap hover:text-foreground/50 transition-colors duration-300"
                    >
                      {company}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
