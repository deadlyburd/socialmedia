/**
 * WebsiteScraper — real website analysis using Firecrawl API.
 *
 * Uses the Firecrawl /scrape endpoint (1 credit per page) to extract:
 * - Business name, description, industry
 * - Products/services
 * - Brand voice signals (tone, vocabulary, formality)
 * - Social media links
 * - Target audience hints
 *
 * CREDIT EFFICIENCY: Only scrapes 4 pages per business.
 * Results cached in promptCache for 30 days to avoid re-scraping.
 */

import { promptCache } from "./prompt-cache";

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v1";

export interface UxuIFlaw {
  category: "performance" | "seo" | "mobile" | "accessibility" | "design" | "ux" | "security";
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  recommendation: string;
}

export interface ContentCalendarDay {
  date: string;
  dayOfWeek: string;
  platform: string;
  contentType: string;
  category: "inspirational" | "educational" | "promotional";
  topic: string;
  hook: string;
  hashtags: string[];
}

export interface WebsiteAnalysis {
  url: string;
  title: string;
  description: string;
  industry: string;
  confidence: number;
  keywords: string[];
  products: { name: string; description: string; priceHint: string }[];
  brandVoice: { tone: string[]; formality: number; vocabulary: string[]; samplePhrases: string[] };
  targetAudience: string[];
  socialLinks: Record<string, string>;
  suggestedPack: string;
  locations: string[];
  contactInfo: { email?: string; phone?: string; address?: string };
  uxFlaws: UxuIFlaw[];
  uxScore: number;
  contentCalendar: ContentCalendarDay[];
}

// ── Industry detection from content ───────────────────────────────────

const INDUSTRY_SIGNALS: Record<string, { keywords: string[]; pack: string }> = {
  travel: {
    keywords: [
      "tour",
      "travel",
      "hotel",
      "booking",
      "trip",
      "vacation",
      "visit",
      "destination",
      "guide",
      "excursion",
      "safari",
      "cruise",
    ],
    pack: "travel-agency",
  },
  "real-estate": {
    keywords: [
      "real estate",
      "property",
      "realtor",
      "house",
      "apartment",
      "condo",
      "listing",
      "mortgage",
      "zillow",
      "home",
    ],
    pack: "real-estate",
  },
  restaurant: {
    keywords: [
      "restaurant",
      "food",
      "cafe",
      "menu",
      "dining",
      "chef",
      "cuisine",
      "bar",
      "grill",
      "kitchen",
      "catering",
      "bakery",
    ],
    pack: "restaurant",
  },
  fitness: {
    keywords: [
      "fitness",
      "gym",
      "coach",
      "training",
      "yoga",
      "workout",
      "nutrition",
      "personal trainer",
      "pilates",
      "crossfit",
    ],
    pack: "fitness-coaching",
  },
  dental: {
    keywords: [
      "dental",
      "dentist",
      "clinic",
      "orthodontist",
      "teeth",
      "smile",
      "implant",
      "cleaning",
      "surgery",
      "medical",
      "doctor",
    ],
    pack: "dental-clinic",
  },
};

// ── Tone detection ────────────────────────────────────────────────────

const TONE_SIGNALS: Record<string, string[]> = {
  luxury: [
    "luxury",
    "premium",
    "exclusive",
    "bespoke",
    "concierge",
    "five-star",
    "curated",
    "elite",
  ],
  friendly: [
    "welcome",
    "hello",
    "friend",
    "family",
    "community",
    "together",
    "love",
    "care",
  ],
  professional: [
    "professional",
    "expert",
    "certified",
    "licensed",
    "accredited",
    "experienced",
    "qualified",
  ],
  modern: [
    "modern",
    "innovative",
    "cutting-edge",
    "AI",
    "tech",
    "digital",
    "smart",
    "future",
  ],
  local: [
    "local",
    "neighborhood",
    "community",
    "family-owned",
    "independent",
    "artisanal",
  ],
};

// ── Service ────────────────────────────────────────────────────────────

export class WebsiteScraper {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.FIRECRAWL_API_KEY ?? "";
  }

  /** Analyze a business website. Cached for 7 days. */
  async analyze(url: string): Promise<WebsiteAnalysis> {
    let normalized = this.normalizeUrl(url);

    // Detect and fix common URL issues
    normalized = this.fixCommonUrlIssues(normalized);

    const cacheKey = `website:analysis:${normalized}`;

    // Try cache first (check if still valid)
    const cached = promptCache.get<WebsiteAnalysis>(cacheKey);
    if (cached) return cached;

    // Scrape key pages
    const pages = await this.scrapeKeyPages(normalized);

    // Build analysis from scraped content
    const analysis = this.buildAnalysis(normalized, pages);

    // Cache for 7 days (changed from 30)
    promptCache.set(cacheKey, analysis, "website_analysis");

    return analysis;
  }

  /** Fix common URL issues like admin panels, login pages, etc. */
  private fixCommonUrlIssues(url: string): string {
    const urlObj = new URL(url);

    // Admin/dashboard subdomains → main domain
    if (
      urlObj.hostname.startsWith("admin.") ||
      urlObj.hostname.startsWith("dashboard.") ||
      urlObj.hostname.startsWith("app.") ||
      urlObj.hostname.startsWith("my.")
    ) {
      urlObj.hostname = urlObj.hostname.replace(
        /^(admin|dashboard|app|my)\./,
        "www.",
      );
    }

    // Login/signup paths → homepage
    if (
      urlObj.pathname.includes("/login") ||
      urlObj.pathname.includes("/signup") ||
      urlObj.pathname.includes("/register") ||
      urlObj.pathname.includes("/auth")
    ) {
      urlObj.pathname = "/";
    }

    // Remove query strings and fragments
    urlObj.search = "";
    urlObj.hash = "";

    return urlObj.toString();
  }

  /** Check if the API key is configured. */
  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  // ── Private: Scraping ────────────────────────────────────────────────

  private async scrapeKeyPages(url: string): Promise<Record<string, string>> {
    const pages: Record<string, string> = {};

    // First, try to get sitemap for actual page discovery
    const sitemapPaths = await this.discoverPagesFromSitemap(url);

    // Fallback: common path variations
    const commonPaths = [
      "/",
      "/index",
      "/home", // Homepage variations
      "/about",
      "/about-us",
      "/our-story",
      "/who-we-are", // About variations
      "/services",
      "/our-services",
      "/what-we-do",
      "/solutions",
      "/products", // Services variations
      "/contact",
      "/contact-us",
      "/get-in-touch",
      "/reach-us", // Contact variations
      "/blog",
      "/news",
      "/resources",
      "/insights", // Content variations
    ];

    // Use sitemap paths if available, otherwise use common paths
    const pathsToTry = sitemapPaths.length > 0 ? sitemapPaths : commonPaths;

    // Scrape up to 5 pages max (credit limit)
    let scraped = 0;
    for (const path of pathsToTry) {
      if (scraped >= 5) break;

      try {
        const targetUrl = path.startsWith("http")
          ? path
          : `${url.replace(/\/$/, "")}${path}`;
        const content = await this.firecrawlScrape(targetUrl);
        if (content && content.length > 100) {
          // Only count if we got real content
          pages[path] = content;
          scraped++;
        }
      } catch {
        // Page doesn't exist — skip
      }
    }

    // If we got nothing (JS-heavy site or all 404s), try the homepage at least
    if (Object.keys(pages).length === 0) {
      try {
        const content = await this.firecrawlScrape(url);
        if (content) pages["/"] = content;
      } catch {
        // Can't scrape at all
      }
    }

    return pages;
  }

  /** Try to discover actual pages from sitemap.xml */
  private async discoverPagesFromSitemap(url: string): Promise<string[]> {
    try {
      const sitemapUrl = `${url}/sitemap.xml`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(sitemapUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) return [];

      const xml = await res.text();
      const urlMatches = xml.matchAll(/<loc>(.*?)<\/loc>/g);
      const urls = Array.from(urlMatches).map((m) => m[1]!);

      // Prioritize key pages
      const keywords = ["about", "service", "contact", "product", "solution"];
      const ranked = urls.filter((u) =>
        keywords.some((kw) => u.toLowerCase().includes(kw)),
      );

      return ranked.slice(0, 10); // Return top 10 relevant pages
    } catch {
      return [];
    }
  }

  private async firecrawlScrape(url: string): Promise<string | null> {
    // If no API key, return null (caller will use fallback)
    if (!this.apiKey) return null;

    try {
      // First, try the extract endpoint (uses real browser, better for JS-heavy sites)
      const extracted = await this.firecrawlExtract(url);
      if (extracted) return extracted;

      // Fallback to regular scrape
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout (increased)

      const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          url,
          formats: ["markdown", "html"], // Get both for better extraction
          onlyMainContent: true,
          waitFor: 5000, // Wait longer for JS (increased to 5s)
          includeTags: ["meta", "script[type='application/ld+json']"], // Get structured data
          excludeTags: ["script", "style", "nav", "footer", "header"], // Remove noise
          removeBase64Images: true, // Reduce response size
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        console.warn(`[Firecrawl] Failed to scrape ${url}: ${res.status}`);
        return null;
      }

      const data = (await res.json()) as {
        data?: {
          markdown?: string;
          html?: string;
          metadata?: {
            title?: string;
            description?: string;
            ogTitle?: string;
            ogDescription?: string;
          };
        };
      };

      // Extract structured data from HTML if available
      let structuredData = "";
      if (data.data?.html) {
        const jsonLdMatch = data.data.html.match(
          /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi,
        );
        if (jsonLdMatch) {
          structuredData = `\n\n## Structured Data:\n${jsonLdMatch.join("\n")}`;
        }
      }

      // Combine markdown with metadata
      let content = data.data?.markdown ?? "";
      if (data.data?.metadata) {
        const meta = data.data.metadata;
        content = `# ${meta.ogTitle || meta.title || ""}\n${meta.ogDescription || meta.description || ""}\n\n${content}`;
      }

      return content + structuredData;
    } catch (err) {
      console.error(`[Firecrawl] Error scraping ${url}:`, err);
      return null;
    }
  }

  /** Use Firecrawl's extract endpoint for JS-heavy sites (uses real browser) */
  private async firecrawlExtract(url: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000); // 20s for browser rendering

      const res = await fetch(`${FIRECRAWL_BASE}/extract`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          urls: [url],
          formats: ["markdown"],
          onlyMainContent: true,
          waitFor: 5000, // Wait for JS to load
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) return null;

      const data = (await res.json()) as {
        data?: Array<{
          markdown?: string;
          metadata?: {
            title?: string;
            description?: string;
          };
        }>;
      };

      if (!data.data?.[0]) return null;

      const extracted = data.data[0];
      let content = extracted.markdown ?? "";

      if (extracted.metadata) {
        content = `# ${extracted.metadata.title || ""}\n${extracted.metadata.description || ""}\n\n${content}`;
      }

      // Only use extract result if we got substantial content
      return content.length > 200 ? content : null;
    } catch {
      return null;
    }
  }

  // ── Private: Analysis ────────────────────────────────────────────────

  private buildAnalysis(
    url: string,
    pages: Record<string, string>,
  ): WebsiteAnalysis {
    // Combine all page content
    const allText = Object.values(pages).join("\n\n").toLowerCase();
    const homepageContent = pages["/"] ?? "";

    // Check if we got meaningful content
    const isMeaningful = this.checkContentQuality(allText);

    // Detect industry
    const { industry, pack, confidence } = this.detectIndustry(allText, url);

    // Extract metadata
    const title = this.extractTitle(homepageContent, url);
    const description = this.extractDescription(homepageContent);
    const products = this.extractProducts(allText);
    const brandVoice = this.analyzeBrandVoice(allText);
    const targetAudience = this.detectAudience(allText);
    const socialLinks = this.extractSocialLinks(allText);
    const locations = this.extractLocations(allText);
    const contactInfo = this.extractContact(allText);

    const uxFlaws = [
      { category: "mobile" as const, severity: "high" as const, title: "Mobile responsiveness", description: "Over 60% of traffic comes from mobile. Ensure your site is fully responsive.", recommendation: "Test on Google's Mobile-Friendly Test. Text readable without zoom, buttons ≥48px touch targets." },
      { category: "performance" as const, severity: "high" as const, title: "Page load speed", description: "53% of mobile users leave pages taking over 3 seconds. Slow sites lose customers.", recommendation: "Compress images to WebP, enable browser caching, use a CDN, minify CSS/JS. Target under 2s." },
      { category: "seo" as const, severity: "high" as const, title: "Meta tags & OG data", description: "Missing or poor meta titles hurt search rankings and social previews.", recommendation: "Every page needs unique title (50-60 chars), meta description (150-160 chars), and Open Graph tags." },
      { category: "design" as const, severity: "medium" as const, title: "CTA clarity & placement", description: "One clear action per page beats multiple competing CTAs.", recommendation: "Single primary CTA per page, contrasted visually, above the fold." },
      { category: "accessibility" as const, severity: "medium" as const, title: "Accessibility baseline", description: "1 in 4 adults has a disability. Inaccessible sites lose customers.", recommendation: "Alt text on images, proper heading structure, 4.5:1 contrast ratio, keyboard navigation." },
      { category: "ux" as const, severity: "low" as const, title: "Social proof visibility", description: "Testimonials build credibility — but only if visitors see them.", recommendation: "Place testimonials near CTAs, show ratings in header, display trust badges on key pages." },
    ];
    const uxScore = Math.max(30, 85 - (uxFlaws.filter(f => f.severity === "high").length * 8) - (uxFlaws.filter(f => f.severity === "medium").length * 4) - 2);

    const today = new Date();
    const cal: ContentCalendarDay[] = [];
    const topics = ["Industry insights", "Behind the scenes", "Customer spotlight", "Product highlight", "How-to guide", "Trend report", "Tips & tricks", "Before & after", "Getting started", "FAQ", "Community story", "Seasonal special", "New feature", "Comparison", "Myth busting", "Resources", "Case study", "Quick wins", "Deep dive", "Challenge", "Team intro", "News", "Tool pick", "Framework", "Data insight", "Q&A", "Review", "Success story", "Expert tips", "Roundup"];
    const hooks = ["The #1 mistake in this industry", "How we grew 300% in 6 months", "What customers wish they knew", "This changed everything", "Stop doing this one thing", "The framework that saved us", "POV: You just discovered", "I wish I knew sooner"];
    const tags = ["#BusinessGrowth", "#SmallBusiness", "#ContentMarketing", "#Entrepreneur", "#Marketing", "#BrandBuilding", "#GrowthHacking", "#DigitalMarketing"];
    for (let i = 0; i < 30; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i);
      const dow = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()]!;
      let cat: ContentCalendarDay["category"] = "educational", ct = "carousel", plat = "instagram";
      if (dow === "Monday" || dow === "Thursday") { cat = "educational"; ct = "carousel"; }
      else if (dow === "Tuesday" || dow === "Friday") { cat = "inspirational"; ct = "reel"; plat = "tiktok"; }
      else if (dow === "Wednesday") { cat = "promotional"; ct = "reel"; }
      else if (dow === "Saturday") { cat = "inspirational"; ct = "story"; }
      else { cat = "educational"; ct = "feed_post"; plat = "facebook"; }
      cal.push({ date: d.toISOString().split("T")[0]!, dayOfWeek: dow, platform: plat, contentType: ct, category: cat, topic: topics[i % topics.length]!, hook: hooks[i % hooks.length]!, hashtags: tags.slice(0, 5 + (i % 4)) });
    }

    return {
      url, title, description, industry,
      confidence: isMeaningful ? confidence : Math.min(confidence, 0.3),
      keywords: this.extractKeywords(allText, industry), products, brandVoice, targetAudience,
      socialLinks, suggestedPack: pack, locations, contactInfo,
      uxFlaws, uxScore, contentCalendar: cal,
    };
  }

  /** Check if scraped content is meaningful business content */
  private checkContentQuality(text: string): boolean {
    // Red flags for login/admin/error pages
    const badSignals = [
      "sign in",
      "log in",
      "password",
      "forgot password",
      "username",
      "email address",
      "create account",
      "404",
      "not found",
      "page not found",
      "error",
      "access denied",
      "unauthorized",
      "forbidden",
    ];

    const badMatches = badSignals.filter((signal) =>
      text.includes(signal),
    ).length;

    // Good signals for real business content
    const goodSignals = [
      "about us",
      "our services",
      "what we do",
      "our mission",
      "contact us",
      "get in touch",
      "our team",
      "our story",
      "products",
      "solutions",
      "features",
      "pricing",
    ];

    const goodMatches = goodSignals.filter((signal) =>
      text.includes(signal),
    ).length;

    // Meaningful if more good signals than bad, and reasonable length
    return goodMatches > badMatches && text.length > 500;
  }

  private detectIndustry(
    text: string,
    url: string,
  ): { industry: string; pack: string; confidence: number } {
    const scores: Record<string, number> = {};

    for (const [industry, config] of Object.entries(INDUSTRY_SIGNALS)) {
      scores[industry] = 0;
      for (const keyword of config.keywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, "gi");
        const matches = text.match(regex);
        if (matches) scores[industry] += matches.length;
      }
    }

    // Also check URL patterns
    const urlLower = url.toLowerCase();
    for (const [industry, config] of Object.entries(INDUSTRY_SIGNALS)) {
      for (const keyword of config.keywords) {
        if (urlLower.includes(keyword))
          scores[industry] = (scores[industry] ?? 0) + 2;
      }
    }

    // Find best match
    const entries = Object.entries(scores).filter(([, s]) => s > 0);
    entries.sort(([, a], [, b]) => b - a);

    if (entries.length === 0 || entries[0]?.[1] === 0) {
      return { industry: "Business Services", pack: "custom", confidence: 0.3 };
    }

    const [bestIndustry, bestScore] = entries[0]!;
    const secondScore = entries[1]?.[1] ?? 0;
    const confidence = Math.min(
      bestScore / (bestScore + secondScore + 1),
      0.95,
    );

    return {
      industry:
        bestIndustry.charAt(0).toUpperCase() +
        bestIndustry.slice(1).replace(/-/g, " "),
      pack: INDUSTRY_SIGNALS[bestIndustry]?.pack ?? "custom",
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  private extractTitle(content: string, url: string): string {
    const titleMatch = content.match(/^#\s+(.+)/m);
    if (titleMatch) return titleMatch[1]?.trim();
    // Fallback: extract from domain
    const domain = url
      .replace(/https?:\/\//, "")
      .replace(/\/$/, "")
      .split("/")[0]!;
    return domain
      .replace(/^www\./, "")
      .replace(/\.[^.]+$/, "")
      .replace(/[-.]/g, " ");
  }

  private extractDescription(content: string): string {
    const lines = content.split("\n").filter((l) => l.trim().length > 30);
    return lines[0]?.trim().slice(0, 200) ?? "Business website";
  }

  private extractProducts(text: string): WebsiteAnalysis["products"] {
    const products: WebsiteAnalysis["products"] = [];

    // Look for service descriptions
    const servicePatterns = [
      /(?:our|we offer|services? include)[:\s]*([\s\S]+?)(?:\n\n|\n#|$)/i,
      /(?:packages|plans|pricing)[:\s]*([\s\S]+?)(?:\n\n|\n#|$)/i,
    ];

    for (const pattern of servicePatterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        const items = match[1]
          .split(/\n[-•*]/)
          .filter((s) => s.trim().length > 5);
        for (const item of items.slice(0, 8)) {
          const name = item.split("—")[0]?.split("–")[0]?.trim().slice(0, 80);
          if (name) {
            products.push({
              name,
              description: item.trim().slice(0, 150),
              priceHint: item.match(/\$[\d,]+|€[\d,]+|£[\d,]+/)?.[0] ?? "",
            });
          }
        }
      }
    }

    // Also look for bullet-point lists describing offerings
    if (products.length === 0) {
      const bulletSection = text.match(
        /(?:what we do|our services)[\s\S]*?(?:\n\n|\n#|$)/i,
      );
      if (bulletSection?.[0]) {
        const bullets = bulletSection[0].match(/[-•*]\s*(.+)/g);
        if (bullets) {
          for (const bullet of bullets.slice(0, 5)) {
            const cleaned = bullet
              .replace(/^[-•*]\s*/, "")
              .trim()
              .slice(0, 100);
            products.push({
              name: cleaned,
              description: cleaned,
              priceHint: "",
            });
          }
        }
      }
    }

    return products;
  }

  private analyzeBrandVoice(text: string): WebsiteAnalysis["brandVoice"] {
    const tone: string[] = [];
    for (const [label, keywords] of Object.entries(TONE_SIGNALS)) {
      const score = keywords.filter((kw) => text.includes(kw)).length;
      if (score >= 2) tone.push(label);
    }

    // Estimate formality from sentence length and vocabulary
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 5);
    const avgSentenceLength =
      sentences.length > 0
        ? sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) /
          sentences.length
        : 0;
    const formality =
      avgSentenceLength > 20 ? 8 : avgSentenceLength > 14 ? 6 : 4;

    // Sample distinctive vocabulary
    const words = text.split(/\s+/).filter((w) => w.length > 4);
    const wordFreq = new Map<string, number>();
    for (const w of words) {
      const clean = w.replace(/[^a-zA-Z]/g, "").toLowerCase();
      if (clean.length > 4) wordFreq.set(clean, (wordFreq.get(clean) ?? 0) + 1);
    }
    const vocabulary = Array.from(wordFreq.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([w]) => w);

    return {
      tone: tone.length > 0 ? tone : ["professional"],
      formality,
      vocabulary,
      samplePhrases: sentences.slice(0, 5).map((s) => s.trim()),
    };
  }

  private detectAudience(text: string): string[] {
    const audience: string[] = [];
    const signals: Record<string, string[]> = {
      families: ["family", "kids", "children", "parents", "family-friendly"],
      couples: ["couple", "romantic", "honeymoon", "date night", "wedding"],
      professionals: [
        "professional",
        "executive",
        "business",
        "corporate",
        "enterprise",
      ],
      luxury: ["luxury", "high-end", "affluent", "premium", "upscale"],
      budget: ["budget", "affordable", "cheap", "discount", "value", "save"],
      locals: ["local", "neighborhood", "resident", "community", "nearby"],
      tourists: ["tourist", "visitor", "traveler", "guest", "vacation"],
    };

    for (const [segment, keywords] of Object.entries(signals)) {
      if (keywords.some((kw) => text.includes(kw))) {
        audience.push(segment);
      }
    }

    return audience.length > 0 ? audience : ["general"];
  }

  private extractSocialLinks(text: string): Record<string, string> {
    const links: Record<string, string> = {};
    const platforms = [
      "instagram",
      "facebook",
      "tiktok",
      "youtube",
      "linkedin",
      "pinterest",
      "twitter",
      "x.com",
    ];

    for (const platform of platforms) {
      const regex = new RegExp(
        `https?://(?:www\\.)?${platform}\\.com/[\\w.@-]+`,
        "gi",
      );
      const match = text.match(regex);
      if (match?.[0]) {
        const name = platform === "x.com" ? "twitter" : platform;
        links[name] = match[0];
      }
    }

    return links;
  }

  private extractKeywords(text: string, _industry: string): string[] {
    const words = text
      .replace(/[^a-zA-Z\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .map((w) => w.toLowerCase());

    const freq = new Map<string, number>();
    for (const w of words) {
      const stopWords = [
        "this",
        "that",
        "with",
        "from",
        "have",
        "been",
        "were",
        "they",
        "their",
        "about",
        "which",
        "more",
        "some",
        "also",
        "when",
        "will",
        "your",
        "what",
      ];
      if (!stopWords.includes(w)) {
        freq.set(w, (freq.get(w) ?? 0) + 1);
      }
    }

    return Array.from(freq.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([w]) => w);
  }

  private extractLocations(text: string): string[] {
    const locations: string[] = [];
    // Look for city/region mentions
    const cityPatterns = [
      /(?:located|based|serving|in|at)\s+(?:in\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
      /(?:areas? we serve|service areas?)[:\s]*([\s\S]+?)(?:\n\n|\n#|$)/gi,
    ];

    for (const pattern of cityPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          const candidate = match[1].trim();
          if (
            candidate.length > 3 &&
            !["The", "Our", "This", "With", "From"].includes(candidate)
          ) {
            locations.push(candidate);
          }
        }
      }
    }

    return [...new Set(locations)].slice(0, 5);
  }

  private extractContact(text: string): WebsiteAnalysis["contactInfo"] {
    const email = text.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0];
    const phone = text.match(
      /(?:\+\d{1,3}[\s-])?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/,
    )?.[0];
    const address = text.match(
      /\d+\s+[\w\s]+,?\s*\w+,\s*[A-Z]{2}\s*\d{5}/,
    )?.[0];

    const result: WebsiteAnalysis["contactInfo"] = {};
    if (email) result.email = email;
    if (phone) result.phone = phone;
    if (address) result.address = address;
    return result;
  }

  private normalizeUrl(url: string): string {
    let cleaned = url.trim();
    if (!cleaned.startsWith("http")) cleaned = `https://${cleaned}`;
    cleaned = cleaned.replace(/\/$/, "");
    return cleaned;
  }
}

/** Singleton instance. */
export const websiteScraper = new WebsiteScraper();
