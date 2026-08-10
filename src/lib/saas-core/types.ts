/**
 * Core types for @elizaos/saas-core.
 *
 * Multi-tenant SaaS platform — any business, any niche.
 * Clients bring their API keys. We bring the automation engine.
 */

// ── Tenancy ──────────────────────────────────────────────────────────

/** Tenant subscription tier. */
export type SubscriptionTier =
  | "free"
  | "starter"
  | "growth"
  | "empire"
  | "custom";

/** Tenant status in the system. */
export type TenantStatus = "active" | "trial" | "suspended" | "cancelled";

/** A paying client (business using the platform). */
export interface Tenant {
  id: string;
  /** Display name for the dashboard. */
  name: string;
  /** Slug used in URLs and file paths. */
  slug: string;
  /** Contact email for billing and alerts. */
  email: string;
  /** The admin (agency) user ID that owns this tenant. */
  agencyId: string | null;
  /** Current subscription tier. */
  tier: SubscriptionTier;
  /** Tenant lifecycle status. */
  status: TenantStatus;
  /** When the trial ends (ISO 8601). Null if already on paid plan. */
  trialEndsAt: string | null;
  /** ISO 8601 when the tenant was created. */
  createdAt: string;
  /** ISO 8601 when the tenant was last modified. */
  updatedAt: string;
  /** Feature flags this tenant has access to. */
  features: TenantFeatures;
  /** Arbitrary metadata (custom branding, notes, etc.). */
  metadata: Record<string, string>;
  /** Stripe customer ID (set after first checkout). */
  stripeCustomerId?: string;
  /** Stripe subscription ID (set after first checkout). */
  stripeSubscriptionId?: string;
  /** Stripe price ID for the current subscription. */
  stripePriceId?: string;
  /** Current subscription period end (ISO 8601). */
  currentPeriodEnd?: string;
}

/** Feature flags gated by subscription tier. */
export interface TenantFeatures {
  /** Max posts per month across all platforms. */
  maxPostsPerMonth: number;
  /** Number of platforms the tenant can post to. */
  maxPlatforms: number;
  /** Number of blogs per month. */
  maxBlogsPerMonth: number;
  /** Whether AI image generation is enabled. */
  imageGeneration: boolean;
  /** Whether AI video generation is enabled. */
  videoGeneration: boolean;
  /** Whether trend detection is enabled. */
  trendDetection: boolean;
  /** Whether the booking funnel is enabled. */
  bookingFunnel: boolean;
  /** Whether the content approval gate is required. */
  approvalGate: boolean;
  /** Whether white-label is enabled (removes "Powered by" branding). */
  whiteLabel: boolean;
}

// ── Industry Packs ───────────────────────────────────────────────────

/** Registered industry pack definition. */
export interface IndustryPack {
  /** Unique slug (e.g. "travel-agency"). */
  slug: string;
  /** Display name. */
  name: string;
  /** Short description shown in pack selector. */
  description: string;
  /** Icon emoji. */
  icon: string;
  /** Categories this pack is designed for. */
  categories: string[];
  /** Example business types that fit this pack. */
  exampleBusinesses: string[];
  /** Path to the pack files relative to packs/. */
  path: string;
  /** Whether this pack is featured in the marketplace. */
  featured: boolean;
}

// ── Client Configuration ────────────────────────────────────────────

/** A client's complete configuration (character + products + settings). */
export interface ClientConfig {
  /** Unique client ID (maps to a tenant). */
  tenantId: string;
  /** Which industry pack this client uses. */
  packSlug: string;
  /** Brand voice and persona configuration. */
  character: ClientCharacter;
  /** Product/service catalog. */
  products: ClientProduct[];
  /** Custom prompt overrides (merges with pack defaults). */
  promptOverrides: Record<string, string>;
  /** Custom hashtag sets. */
  hashtags: ClientHashtags;
  /** Platform connection status. */
  platforms: PlatformConnection[];
  /** External API credentials (encrypted reference). */
  credentialIds: string[];
  /** ISO 8601 when config was last updated. */
  updatedAt: string;
}

/** Client brand voice — maps to elizaOS character.json. */
export interface ClientCharacter {
  name: string;
  bio: string[];
  lore: string[];
  knowledge: string[];
  style: {
    all: string[];
    chat: string[];
    post: string[];
  };
  /** Industry-specific tone modifiers. */
  toneModifiers: {
    formality: number; // 1-10, 10 = most formal
    humor: number; // 1-10
    salesAggression: number; // 1-10
    empathy: number; // 1-10
  };
}

/** A product or service the client sells. */
export interface ClientProduct {
  id: string;
  title: string;
  summary: string;
  category: string;
  /** Price in the client's currency. */
  price: number;
  /** Currency code (EUR, USD, etc.). */
  currency: string;
  /** Duration text (e.g. "2 hours 30 minutes"). */
  duration: string;
  /** URL to product image. */
  imageUrl: string;
  /** Direct booking link. */
  bookingUrl: string;
  /** Whether this product is featured in content. */
  featured: boolean;
}

/** Pre-configured hashtag sets for a client. */
export interface ClientHashtags {
  /** High-volume hashtags (100k+ posts). */
  tier1: string[];
  /** Mid-volume hashtags (10k-100k posts). */
  tier2: string[];
  /** Niche/branded hashtags. */
  tier3: string[];
  /** Location-specific hashtags. */
  geo: string[];
}

/** A social media platform connection for a client. */
export interface PlatformConnection {
  platform: string;
  /** Whether the client has connected this platform. */
  connected: boolean;
  /** Username or handle on this platform. */
  handle: string | null;
  /** ISO 8601 when the connection was established. */
  connectedAt: string | null;
  /** OAuth token reference (stored in vault). */
  tokenRef: string | null;
}

// ── Content Engine ───────────────────────────────────────────────────

/** Content lifecycle status. */
export type ContentStatus =
  | "draft"
  | "ai_generated"
  | "pending_approval"
  | "approved"
  | "scheduled"
  | "published"
  | "rejected"
  | "failed";

/** A single piece of content in the pipeline. */
export interface ContentItem {
  id: string;
  tenantId: string;
  /** Content type. */
  type:
    | "blog"
    | "reel"
    | "carousel"
    | "story"
    | "feed_post"
    | "pin"
    | "email"
    | "tiktok";
  /** Title for blogs, hook for reels, etc. */
  title: string;
  /** Full body content (markdown for blogs, caption for social). */
  body: string;
  /** Short excerpt or hook line. */
  excerpt: string;
  /** Target platform. */
  platform: string;
  /** Content category (60/30/10 rule). */
  category: "inspirational" | "educational" | "promotional";
  /** Current lifecycle status. */
  status: ContentStatus;
  /** Products featured in this content. */
  featuredProductIds: string[];
  /** Associated image URLs. */
  imageUrls: string[];
  /** SEO metadata for blogs. */
  seo: ContentSEO | null;
  /** ISO 8601 scheduled publish time. */
  scheduledAt: string | null;
  /** ISO 8601 when published. */
  publishedAt: string | null;
  /** ISO 8601 when created. */
  createdAt: string;
  /** Generated by which model (for auditing). */
  generatedBy: string;
}

/** SEO metadata for blog content. */
export interface ContentSEO {
  metaTitle: string;
  metaDescription: string;
  slug: string;
  keywords: string[];
  canonicalUrl?: string | undefined;
}

// ── Approval Workflow ────────────────────────────────────────────────

/** An approval event in the content pipeline. */
export interface ApprovalEvent {
  id: string;
  contentId: string;
  tenantId: string;
  /** Who took the action. */
  actor: "ai" | "client" | "admin" | "system";
  /** What action was taken. */
  action:
    | "generated"
    | "submitted"
    | "approved"
    | "rejected"
    | "revision_requested";
  /** Optional comment for rejections or revision requests. */
  comment: string | null;
  /** ISO 8601 timestamp. */
  timestamp: string;
}

// ── Analytics ────────────────────────────────────────────────────────

/** Aggregated analytics for a tenant dashboard. */
export interface TenantAnalytics {
  tenantId: string;
  /** Date range for these metrics. */
  period: { start: string; end: string };
  /** Total content published in period. */
  totalPublished: number;
  /** Content broken down by platform. */
  byPlatform: Record<string, PlatformMetrics>;
  /** Content broken down by type. */
  byType: Record<string, ContentTypeMetrics>;
  /** Funnel metrics. */
  funnel: FunnelAnalytics;
  /** AI usage cost in period. */
  aiCost: AiCostBreakdown;
  /** Top performing content. */
  topContent: ContentRanking[];
  /** Growth trends. */
  trends: GrowthTrends;
}

export interface PlatformMetrics {
  platform: string;
  posts: number;
  impressions: number;
  engagement: number;
  engagementRate: number;
  clicks: number;
  saves: number;
  shares: number;
}

export interface ContentTypeMetrics {
  type: string;
  count: number;
  avgEngagement: number;
  topPerformer: string;
}

export interface FunnelAnalytics {
  leadMagnetViews: number;
  emailsCaptured: number;
  nurtureOpens: number;
  nurtureClicks: number;
  consultationsBooked: number;
  consultationsCompleted: number;
  bookingsConfirmed: number;
  conversionRate: number;
  revenue: number;
}

export interface AiCostBreakdown {
  totalCost: number;
  byService: Record<string, number>;
  imageCount: number;
  videoCount: number;
  blogWordCount: number;
}

export interface ContentRanking {
  contentId: string;
  title: string;
  impressions: number;
  engagement: number;
  conversionRate: number;
}

export interface GrowthTrends {
  followerGrowth: number;
  engagementGrowth: number;
  bookingGrowth: number;
  revenueGrowth: number;
  /** Week-over-week percentage change. */
  wowChange: Record<string, number>;
}

// ── API Types ────────────────────────────────────────────────────────

/** Standard API response envelope. */
export interface ApiResponse<T> {
  success: boolean;
  data?: T | undefined;
  error?: string | undefined;
  meta?:
    | {
        total: number;
        page: number;
        limit: number;
      }
    | undefined;
}

/** Pagination params. */
export interface PaginationParams {
  page?: number | undefined;
  limit?: number | undefined;
  sort?: string | undefined;
  order?: "asc" | "desc" | undefined;
}

/** Content generation request. */
export interface GenerateContentRequest {
  tenantId: string;
  type: ContentItem["type"];
  topic: string;
  platform: string;
  category: ContentItem["category"];
  featuredProductIds?: string[] | undefined;
  tone?: string | undefined;
  length?: "short" | "medium" | "long" | undefined;
  includeImages?: boolean | undefined;
  seoKeywords?: string[] | undefined;
}

/** Content generation result. */
export interface GenerateContentResult {
  content: ContentItem;
  images: string[];
  seo: ContentSEO | null;
  socialVariants: SocialVariant[];
}

/** Platform-specific social media variant. */
export interface SocialVariant {
  platform: string;
  format: string;
  caption: string;
  hashtags: string[];
  imagePrompt: string;
}

// ── Pack Generator ───────────────────────────────────────────────────

/** Answers from the pack generator questionnaire. */
export interface PackGeneratorAnswers {
  /** What industry/niche? */
  industry: string;
  /** What does the business sell? */
  productsOrServices: string;
  /** Who is the ideal customer? */
  targetAudience: string;
  /** What's the brand personality? */
  brandPersonality: string;
  /** Price range (low/mid/high/luxury). */
  priceRange: string;
  /** Top 3 competitor names or URLs. */
  competitors: string[];
  /** What locations does the business serve? */
  locations: string[];
  /** What's the business URL? */
  websiteUrl: string;
  /** Any special requirements? */
  specialNotes: string;
}

// ── Constants ────────────────────────────────────────────────────────

export const SAAS_LOG_PREFIX = "[saas-core]" as const;

/** Feature mapping by subscription tier. */
export const TIER_FEATURES: Record<SubscriptionTier, TenantFeatures> = {
  free: {
    maxPostsPerMonth: 5,
    maxPlatforms: 1,
    maxBlogsPerMonth: 1,
    imageGeneration: false,
    videoGeneration: false,
    trendDetection: false,
    bookingFunnel: false,
    approvalGate: true,
    whiteLabel: false,
  },
  starter: {
    maxPostsPerMonth: 20,
    maxPlatforms: 2,
    maxBlogsPerMonth: 2,
    imageGeneration: true,
    videoGeneration: false,
    trendDetection: false,
    bookingFunnel: false,
    approvalGate: true,
    whiteLabel: false,
  },
  growth: {
    maxPostsPerMonth: 60,
    maxPlatforms: 4,
    maxBlogsPerMonth: 8,
    imageGeneration: true,
    videoGeneration: true,
    trendDetection: true,
    bookingFunnel: true,
    approvalGate: true,
    whiteLabel: false,
  },
  empire: {
    maxPostsPerMonth: 200,
    maxPlatforms: 6,
    maxBlogsPerMonth: 30,
    imageGeneration: true,
    videoGeneration: true,
    trendDetection: true,
    bookingFunnel: true,
    approvalGate: false,
    whiteLabel: true,
  },
  custom: {
    maxPostsPerMonth: 999,
    maxPlatforms: 6,
    maxBlogsPerMonth: 999,
    imageGeneration: true,
    videoGeneration: true,
    trendDetection: true,
    bookingFunnel: true,
    approvalGate: false,
    whiteLabel: true,
  },
};

/** Revenue share per tier. */
export const TIER_PRICING: Record<SubscriptionTier, number> = {
  free: 0,
  starter: 199,
  growth: 499,
  empire: 999,
  custom: 2499,
};

// ── Agency Content Model ───────────────────────────────────────────

/** User role for agency platform. */
export type UserRole = "admin" | "client";

/** Content types the agency can upload. */
export type ContentAssetType =
  | "video"
  | "image"
  | "carousel"
  | "reel"
  | "story"
  | "feed_post";

/** Lifecycle status of an uploaded content asset. */
export type ContentAssetStatus = "processing" | "ready" | "downloaded" | "posted";

/** A content asset uploaded by an admin for a client. */
export interface ContentAsset {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  fileUrl: string;
  thumbnailUrl: string | null;
  contentType: ContentAssetType;
  fileSize: number;
  mimeType: string | null;
  durationSeconds: number | null;
  platform: string;
  scheduledDate: string;
  status: ContentAssetStatus;
  createdAt: string;
  createdBy: string;
}

/** Client info returned to admin. */
export interface ClientInfo {
  userId: string;
  tenantId: string;
  name: string;
  email: string;
  businessName: string;
  status: TenantStatus;
  createdAt: string;
  contentCount: number;
}

/** Platform connection with OAuth tokens. */
export interface PlatformConnectionFull extends PlatformConnection {
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  platformUserId: string | null;
}
