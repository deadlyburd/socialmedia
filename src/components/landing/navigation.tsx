"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Zap } from "lucide-react";

const navLinks = [
  { name: "Features", href: "#features" },
  { name: "How it works", href: "#how-it-works" },
  { name: "Pricing", href: "#pricing" },
];

export function Navigation() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed z-50 transition-all duration-500 ${
        scrolled ? "top-3 left-3 right-3" : "top-0 left-0 right-0"
      }`}
    >
      <nav
        className={`mx-auto transition-all duration-500 ${
          scrolled
            ? "bg-background/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg max-w-[1200px]"
            : "bg-transparent max-w-[1400px]"
        }`}
      >
        <div
          className={`flex items-center justify-between transition-all duration-500 px-6 lg:px-8 ${
            scrolled ? "h-14" : "h-20"
          }`}
        >
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <Zap className={`transition-all duration-500 text-brand-indigo ${scrolled ? "w-4 h-4" : "w-5 h-5"}`} />
            <span className={`font-display tracking-tight transition-all duration-500 ${scrolled ? "text-xl" : "text-2xl"}`}>
              Social Automations
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-12">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="text-sm text-foreground/70 hover:text-foreground transition-colors duration-300 relative group"
              >
                {link.name}
                <span className="absolute -bottom-1 left-0 w-0 h-px bg-foreground transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="flex items-center gap-3">
            <Button
              asChild
              size="sm"
              className={`bg-foreground hover:bg-foreground/90 text-background rounded-full transition-all duration-500 group ${
                scrolled ? "px-4 h-8 text-xs" : "px-6"
              }`}
            >
              <Link href="/login">
                Get started
                <ArrowRight className="w-3.5 h-3.5 ml-1.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </div>
        </div>
      </nav>
    </header>
  );
}
