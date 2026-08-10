import Link from "next/link";
import { ArrowUpRight, Zap } from "lucide-react";
import { AnimatedWave } from "./animated-wave";

const footerLinks = {
  Product: [
    { name: "Features", href: "#features" },
    { name: "How it works", href: "#how-it-works" },
    { name: "Pricing", href: "#pricing" },
    { name: "CTA", href: "#cta" },
  ],
  Resources: [
    { name: "Documentation", href: "/login" },
    { name: "API Reference", href: "/login" },
    { name: "Blog", href: "/login" },
    { name: "Help center", href: "mailto:support@socialautomations.xyz" },
  ],
  Company: [
    { name: "About", href: "/login" },
    { name: "Careers", href: "mailto:careers@socialautomations.xyz" },
    { name: "Contact", href: "mailto:sales@socialautomations.xyz" },
    { name: "Partners", href: "mailto:partners@socialautomations.xyz" },
  ],
  Legal: [
    { name: "Privacy policy", href: "/login" },
    { name: "Terms of service", href: "/login" },
    { name: "Cookie policy", href: "/login" },
    { name: "Security", href: "/login" },
  ],
};

const socialLinks: { name: string; href: string }[] = [];

export function FooterSection() {
  return (
    <footer className="relative border-t border-border/50">
      {/* Animated wave background */}
      <div className="absolute inset-0 h-64 opacity-20 pointer-events-none overflow-hidden">
        <AnimatedWave />
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Main Footer */}
        <div className="py-16 lg:py-24">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-12 lg:gap-8">
            {/* Brand Column */}
            <div className="col-span-2">
              <Link href="/" className="inline-flex items-center gap-2 mb-6">
                <Zap className="w-5 h-5" />
                <span className="text-2xl font-display">Social Automations</span>
              </Link>

              <p className="text-muted-foreground leading-relaxed mb-8 max-w-xs">
                Done-for-you social media content. We create scroll-stopping posts, reels, and stories — you download and post. Focus on your business, not your feed.
              </p>

              {/* Social Links */}
              {socialLinks.length > 0 && (
                <div className="flex gap-6">
                  {socialLinks.map((link) => (
                    <a
                      key={link.name}
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 group"
                    >
                      {link.name}
                      <ArrowUpRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Link Columns */}
            {Object.entries(footerLinks).map(([title, links]) => (
              <div key={title}>
                <h3 className="text-sm font-medium mb-6">{title}</h3>
                <ul className="space-y-4">
                  {links.map((link) => (
                    <li key={link.name}>
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2"
                      >
                        {link.name}
                        {"badge" in link && link.badge && (
                          <span className="text-xs px-2 py-0.5 bg-foreground text-background rounded-full">
                            {link.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="py-8 border-t border-border/50 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Social Automations. All rights reserved.
          </p>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              All systems operational
            </span>
            <span className="font-mono text-xs text-muted-foreground/50">
              Agency Content Management Platform
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
