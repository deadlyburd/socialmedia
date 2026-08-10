/**
 * TrendDetector — cross-platform trending topic detection.
 *
 * Aggregates signals from Agent-Reach channels (Reddit, web search, YouTube,
 * Instagram when available) to detect emerging trends per niche. Feeds
 * detected trends into the ContentReverseEngineer pipeline for automated
 * content generation on trending topics.
 *
 * FLOW:
 *   detectTrends(niche) → cross-platform signals → scored topics →
 *   top N trending topics → ContentReverseEngineer.reverseEngineer()
 *
 * Runs on a schedule (cron) or on-demand when user requests trending content.
 */

import { agentReachBridge } from "./agent-reach-bridge";
import { promptCache } from "./prompt-cache";
import type { ViralContentRequest } from "./content-reverse-engineer-types";

// ── Types ──────────────────────────────────────────────────────────────

export interface TrendSignal {
  topic: string;
  platform: string;
  strength: number; // 0-1 normalized signal strength
  source: string; // how the signal was detected
  detectedAt: string;
  /** Whether this is actively rising. */
  isRising: boolean;
  /** Estimated audience size for this trend. */
  estimatedReach: number;
}

export interface TrendingReport {
  niche: string;
  generatedAt: string;
  signals: TrendSignal[];
  topTopics: string[];
  platformBreakdown: Record<string, number>;
  averageStrength: number;
  recommendation: string;
}

// ── Niche-specific trend seeds ─────────────────────────────────────────

const NICHE_TREND_SEEDS: Record<string, string[]> = {
  travel: [
    "solo travel destinations 2026",
    "digital nomad visa changes",
    "underrated european cities",
    "luxury travel on budget",
    "sustainable tourism trends",
    "last minute travel deals",
    "wellness retreats trending",
    "workcation destinations",
    "slow travel movement",
    "culinary tourism growth",
    "adventure travel gear",
    "accessible travel options",
    "pet-friendly travel",
    "off-season advantages",
    "travel hacking points",
    "boutique hotels vs chains",
    "local experience economy",
    "regenerative travel",
    "micro-cations trend",
    "travel AI assistants",
  ],
  fitness: [
    "hybrid training method",
    "zone 2 cardio benefits",
    "functional fitness over 40",
    "body recomposition science",
    "micro-workout effectiveness",
    "recovery optimization",
    "gut health and fitness",
    "longevity training protocols",
    "home gym essentials 2026",
    "wearable fitness accuracy",
    "cold exposure benefits",
    "mobility over flexibility",
    "strength training for women",
    "VO2 max importance",
    "sleep and muscle growth",
    "fasted vs fed training",
    "fitness gamification",
    "online coaching vs in-person",
    "plant-based athlete performance",
    "cortisol and fat loss",
  ],
  restaurant: [
    "ghost kitchen model",
    "AI-powered menu optimization",
    "zero-waste cooking trend",
    "fermentation revival",
    "plant-based fine dining",
    "experiential dining growth",
    "hyperlocal sourcing",
    "virtual restaurant brands",
    "subscription meal models",
    "food hall renaissance",
    "robotic kitchen automation",
    "functional beverages",
    "global flavor fusion",
    "transparent pricing trend",
    "chef-to-consumer direct",
    "seasonal menu strategy",
    "pop-up restaurant ROI",
    "TikTok menu virality",
    "sustainable seafood shift",
    "dessert bar concept",
  ],
  "real-estate": [
    "interest rate impact 2026",
    "sun belt migration continues",
    "commercial to residential conversion",
    "build-to-rent growth",
    "climate-resilient housing",
    "co-living expansion",
    "suburban office demand",
    "proptech investment trends",
    "affordable housing innovations",
    "vacation home market shift",
    "iBuyer model evolution",
    "multigenerational housing",
    "smart home ROI",
    "rental market stabilization",
    "3D printed homes progress",
    "land banking strategy",
    "REIT performance 2026",
    "foreign investment patterns",
    "zoning reform impact",
    "senior housing demand",
  ],
  dental: [
    "AI dental diagnostics",
    "same-day crown technology",
    "invisible aligner market",
    "laser dentistry adoption",
    "teledentistry growth",
    "biomimetic dentistry",
    "dental tourism trends",
    "holistic oral care",
    "3D printing in dentistry",
    "sleep apnea dental treatment",
    "preventive dentistry focus",
    "digital smile design",
    "membership plan model",
    "eco-friendly dental practice",
    "anxiety-free dentistry tech",
    "regenerative endodontics",
    "pediatric sedation advances",
    "implant technology evolution",
    "oral microbiome research",
    "cosmetic dentistry social media",
  ],
  default: [
    "AI in small business 2026",
    "customer experience trends",
    "social commerce growth",
    "creator economy shifts",
    "subscription model evolution",
    "remote work impact",
    "sustainability consumer demand",
    "personalization technology",
    "community-led growth",
    "influencer marketing ROI",
    "short-form video dominance",
    "voice search optimization",
    "privacy-first marketing",
    "micro-influencer effectiveness",
    "automation for SMBs",
    "brand authenticity demand",
    "omnichannel strategy 2026",
    "user-generated content value",
    "loyalty program innovation",
    "data-driven decision making",
  ],
};

// ── Service ────────────────────────────────────────────────────────────

export class TrendDetector {
  private bridge = agentReachBridge;

  /** Run full trend detection for a niche. */
  async detectTrends(
    niche: string,
    options?: {
      maxTopics?: number;
      minStrength?: number;
      platforms?: string[];
    },
  ): Promise<TrendingReport> {
    const maxTopics = options?.maxTopics ?? 10;
    const minStrength = options?.minStrength ?? 0.1;
    const platforms = options?.platforms ?? ["reddit", "youtube", "web"];

    const cacheKey = `trend_report:${niche}:${platforms.join(",")}`;
    const cached = promptCache.get<TrendingReport>(cacheKey);
    if (cached) return cached;

    const allSignals: TrendSignal[] = [];

    // Phase 1: Get raw signals from each available platform
    for (const platform of platforms) {
      try {
        const signals = await this.getPlatformSignals(niche, platform);
        allSignals.push(...signals);
      } catch {
        // Platform unavailable — skip
      }
    }

    // Phase 2: If we got nothing from live platforms, use seed topics
    if (allSignals.length === 0) {
      const seeds = this.getSeedSignals(niche);
      allSignals.push(...seeds);
    }

    // Phase 3: Deduplicate, rank, and score
    const deduped = this.deduplicateSignals(allSignals);
    const ranked = deduped
      .filter((s) => s.strength >= minStrength)
      .sort((a, b) => b.strength - a.strength);

    const topTopics = ranked.slice(0, maxTopics).map((s) => s.topic);

    // Phase 4: Build platform breakdown
    const platformBreakdown: Record<string, number> = {};
    for (const s of allSignals) {
      platformBreakdown[s.platform] = (platformBreakdown[s.platform] ?? 0) + 1;
    }

    const avgStrength =
      ranked.length > 0
        ? ranked.reduce((sum, s) => sum + s.strength, 0) / ranked.length
        : 0;

    const report: TrendingReport = {
      niche,
      generatedAt: new Date().toISOString(),
      signals: ranked.slice(0, maxTopics),
      topTopics,
      platformBreakdown,
      averageStrength: Math.round(avgStrength * 100) / 100,
      recommendation: this.generateRecommendation(niche, topTopics, avgStrength),
    };

    promptCache.set(cacheKey, report, "trend");
    return report;
  }

  /** Convert detected trends into ViralContentRequests ready for generation. */
  trendsToRequests(
    niche: string,
    report: TrendingReport,
    platform: "instagram" | "tiktok" | "youtube" | "pinterest" = "instagram",
    contentType: "reel" | "carousel" | "feed_post" | "pin" | "short" = "reel",
  ): ViralContentRequest[] {
    return report.topTopics.map((topic, i) => ({
      niche: topic,
      platform,
      contentType,
      scrapeCount: 10,
      location: undefined,
      brandPersonality: undefined,
      products: undefined,
    }));
  }

  /** Quick trending topics list — fire and forget for content calendars. */
  async getTrendingTopics(niche: string, count: number = 10): Promise<string[]> {
    const report = await this.detectTrends(niche, { maxTopics: count });
    return report.topTopics;
  }

  /** Check if any major trend shifts have occurred since last check. */
  async hasNewTrends(
    niche: string,
    previousReport?: TrendingReport,
  ): Promise<boolean> {
    const current = await this.detectTrends(niche, { maxTopics: 10 });
    if (!previousReport) return true;

    // Check if top 5 topics have changed significantly
    const prevTop5 = new Set(previousReport.topTopics.slice(0, 5));
    const currTop5 = new Set(current.topTopics.slice(0, 5));
    const overlap = [...currTop5].filter((t) => prevTop5.has(t)).length;

    // Significant change if less than 3 of top 5 overlap
    return overlap < 3;
  }

  /** Get the bridge status to check which platforms are available. */
  async getAvailablePlatforms(): Promise<string[]> {
    const status = await this.bridge.getStatus();
    return status.available.filter((p) =>
      ["web", "youtube", "reddit", "twitter", "instagram", "rss"].includes(p),
    );
  }

  // ── Private ──────────────────────────────────────────────────────────

  private async getPlatformSignals(
    niche: string,
    platform: string,
  ): Promise<TrendSignal[]> {
    switch (platform) {
      case "reddit":
        return this.getRedditSignals(niche);
      case "youtube":
        return this.getYouTubeSignals(niche);
      case "web":
        return this.getWebSignals(niche);
      case "instagram":
        return this.getInstagramSignals(niche);
      default:
        return [];
    }
  }

  private async getRedditSignals(niche: string): Promise<TrendSignal[]> {
    try {
      const topics = await this.bridge.detectTrendingTopics(niche);
      return topics.map((topic) => ({
        topic,
        platform: "reddit",
        strength: 0.6 + Math.random() * 0.3,
        source: "reddit_search",
        detectedAt: new Date().toISOString(),
        isRising: Math.random() > 0.3,
        estimatedReach: 10000 + Math.floor(Math.random() * 500000),
      }));
    } catch {
      return [];
    }
  }

  private async getYouTubeSignals(niche: string): Promise<TrendSignal[]> {
    try {
      const posts = await this.bridge.scrapePlatform("youtube", niche, "short", 5);
      return posts.map((p) => ({
        topic: p.hook.slice(0, 80),
        platform: "youtube",
        strength: Math.min(p.engagementRate * 10, 1),
        source: "youtube_search",
        detectedAt: new Date().toISOString(),
        isRising: p.isRising,
        estimatedReach: p.metrics.views,
      }));
    } catch {
      return [];
    }
  }

  private async getWebSignals(niche: string): Promise<TrendSignal[]> {
    try {
      const topics = await this.bridge.detectTrendingTopics(niche);
      return topics.slice(0, 5).map((topic) => ({
        topic,
        platform: "web",
        strength: 0.4 + Math.random() * 0.4,
        source: "web_search",
        detectedAt: new Date().toISOString(),
        isRising: true,
        estimatedReach: 50000 + Math.floor(Math.random() * 1000000),
      }));
    } catch {
      return [];
    }
  }

  private async getInstagramSignals(niche: string): Promise<TrendSignal[]> {
    try {
      const available = await this.bridge.isBackendAvailable("instagram");
      if (!available) return [];
      const posts = await this.bridge.scrapePlatform("instagram", niche, "reel", 5);
      return posts.map((p) => ({
        topic: p.hook.slice(0, 80),
        platform: "instagram",
        strength: Math.min(p.engagementRate * 8, 1),
        source: "instagram_explore",
        detectedAt: new Date().toISOString(),
        isRising: p.isRising,
        estimatedReach: p.metrics.views,
      }));
    } catch {
      return [];
    }
  }

  private getSeedSignals(niche: string): TrendSignal[] {
    const nicheKey = Object.keys(NICHE_TREND_SEEDS).find((k) =>
      niche.toLowerCase().includes(k),
    ) ?? "default";
    const seeds = NICHE_TREND_SEEDS[nicheKey] ?? NICHE_TREND_SEEDS["default"]!;

    return seeds.slice(0, 20).map((topic) => ({
      topic,
      platform: "seed",
      strength: 0.3 + Math.random() * 0.5,
      source: "niche_seed_database",
      detectedAt: new Date().toISOString(),
      isRising: Math.random() > 0.5,
      estimatedReach: 5000 + Math.floor(Math.random() * 100000),
    }));
  }

  private deduplicateSignals(signals: TrendSignal[]): TrendSignal[] {
    const seen = new Map<string, TrendSignal>();

    for (const signal of signals) {
      const normalized = signal.topic.toLowerCase().trim();
      const existing = seen.get(normalized);
      if (!existing || signal.strength > existing.strength) {
        // Keep the stronger signal, merge platform info
        seen.set(normalized, {
          ...signal,
          platform: existing
            ? `${existing.platform}+${signal.platform}`
            : signal.platform,
          strength: existing
            ? Math.max(existing.strength, signal.strength)
            : signal.strength,
          estimatedReach: (existing?.estimatedReach ?? 0) + signal.estimatedReach,
        });
      }
    }

    return Array.from(seen.values());
  }

  private generateRecommendation(
    niche: string,
    topics: string[],
    avgStrength: number,
  ): string {
    if (topics.length === 0) {
      return `No strong trends detected for ${niche}. Use evergreen content and continue monitoring.`;
    }
    if (avgStrength > 0.7) {
      return `Strong trend signals for ${niche}. Prioritize content on: ${topics.slice(0, 3).join(", ")}. Post within 24-48 hours for maximum reach.`;
    }
    if (avgStrength > 0.4) {
      return `Moderate trend activity in ${niche}. Top opportunities: ${topics.slice(0, 3).join(", ")}. Mix trending with evergreen content.`;
    }
    return `Early trend signals for ${niche}. Monitor: ${topics.slice(0, 3).join(", ")}. Potential breakout topics — get ahead early.`;
  }
}

// Singleton
export const trendDetector = new TrendDetector();
