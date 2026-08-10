/**
 * Types for the ContentReverseEngineer service.
 */

// ── Scraped content ────────────────────────────────────────────────────

export interface ScrapedTopPost {
  id: string;
  platform: "instagram" | "tiktok" | "youtube" | "pinterest";
  url: string;
  caption: string;
  hook: string;
  hashtags: string[];
  contentType: "reel" | "carousel" | "feed_post" | "pin" | "short";
  metrics: {
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    views: number;
  };
  engagementRate: number;
  publishedAt: string;
  creatorHandle: string;
  /** Detected niche/category. */
  category: string;
  /** Whether this is trending upward. */
  isRising: boolean;
  /** Visual composition description (what's in the image/video). */
  visualDescription: string;
  /** Audio used (track name or "original" / "voiceover" / "trending"). */
  audioType: "trending_sound" | "voiceover" | "original" | "none";
}

// ── Extracted patterns ─────────────────────────────────────────────────

export interface HookPattern {
  name: string;
  category:
    | "curiosity_gap"
    | "controversial_take"
    | "storytelling"
    | "listicle"
    | "comparison"
    | "emotional"
    | "urgent"
    | "pov";
  templates: string[];
  /** Average scroll-stop rate for this hook type. */
  stopRate: string;
}

export interface StructurePattern {
  name: string;
  description: string;
  /** Number of slides/segments. */
  segments: number;
  /** How each segment is structured. */
  segmentTemplate: string[];
  /** Best content types for this structure. */
  bestFor: string[];
}

export interface HashtagCluster {
  name: string;
  hashtags: string[];
  totalPosts: number;
  avgEngagement: number;
  /** Whether this cluster is growing. */
  growthDirection: "up" | "stable" | "down";
}

export interface ExtractedPattern {
  hooks: HookPattern[];
  structures: StructurePattern[];
  hashtagClusters: HashtagCluster[];
  /** Common visual composition patterns. */
  visualPatterns: string[];
  /** Audio trends detected. */
  audioTrends: string[];
  /** Best posting times observed. */
  timingPatterns: { dayOfWeek: string; hourUTC: number; engagement: number }[];
}

// ── Viral formula ──────────────────────────────────────────────────────

export interface ViralFormula {
  id: string;
  name: string;
  /** The hook pattern this formula uses. */
  hook: HookPattern;
  /** The content structure. */
  structure: StructurePattern;
  /** How to style the visual. */
  visualStyle: string;
  /** Recommended audio approach. */
  audioApproach: string;
  /** Hashtag set to use. */
  hashtagCluster: HashtagCluster;
  /** Which niches this works for. */
  applicableNiches: string[];
  /** Which platforms this performs on. */
  bestPlatforms: string[];
  /** Proven CTA that works with this formula. */
  provenCTA: string;
  /** Example of a real viral post using this formula. */
  exampleUrl: string;
  /** Estimated engagement rate when recreated correctly. */
  expectedEngagementRate: string;
  /** Step-by-step generation instructions. */
  generationPrompt: string;
}

// ── Reverse-engineered content output ───────────────────────────────────

export interface ReverseEngineeredContent {
  id: string;
  /** Which viral formula was used. */
  formulaUsed: ViralFormula;
  /** The generated hook. */
  hook: string;
  /** Full caption / script. */
  body: string;
  /** Platform-specific variants. */
  variants: {
    instagram?: { caption: string; hashtags: string[]; format: string };
    tiktok?: { caption: string; hashtags: string[]; format: string };
    pinterest?: { caption: string; hashtags: string[]; format: string };
  };
  /** Image/video generation prompt. */
  visualPrompt: string;
  /** Hashtag set to use. */
  hashtags: string[];
  /** Recommended CTA. */
  cta: string;
  /** Content category (inspirational/educational/promotional). */
  category: "inspirational" | "educational" | "promotional";
  /** Target platform. */
  platform: string;
}

// ── Request type ───────────────────────────────────────────────────────

export interface ViralContentRequest {
  niche: string;
  platform: "instagram" | "tiktok" | "youtube" | "pinterest";
  contentType: "reel" | "carousel" | "feed_post" | "pin" | "short";
  /** How many top posts to scrape (max 50). */
  scrapeCount?: number;
  /** Specific competitors to analyze (handles). */
  competitors?: string[];
  /** Location for geo-targeting. */
  location?: string;
  /** Brand voice overrides. */
  brandPersonality?: string;
  /** Products to feature. */
  products?: string[];
}
