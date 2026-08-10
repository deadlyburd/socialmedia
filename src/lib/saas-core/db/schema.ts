/**
 * Database schema types for the SaaS multi-tenant platform.
 *
 * These are plain TypeScript types — swap in Drizzle/Prisma/Kysely when DB is wired.
 */

// ── Tenants ──────────────────────────────────────────────────────────

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  email: string;
  agencyId: string | null;
  tier: "free" | "starter" | "growth" | "empire" | "custom";
  status: "active" | "trial" | "suspended" | "cancelled";
  trialEndsAt: string | null;
  featuresJson: string;
  metadataJson: string;
  createdAt: string;
  updatedAt: string;
}

// ── Client Configurations ───────────────────────────────────────────

export interface ClientConfigRow {
  id: string;
  tenantId: string;
  packSlug: string;
  characterJson: string;
  productsJson: string;
  promptOverridesJson: string;
  hashtagsJson: string;
  updatedAt: string;
}

// ── Content Items ────────────────────────────────────────────────────

export interface ContentItemRow {
  id: string;
  tenantId: string;
  type:
    | "blog"
    | "reel"
    | "carousel"
    | "story"
    | "feed_post"
    | "pin"
    | "email"
    | "tiktok";
  title: string;
  body: string;
  excerpt: string;
  platform: string;
  category: "inspirational" | "educational" | "promotional";
  status:
    | "draft"
    | "ai_generated"
    | "pending_approval"
    | "approved"
    | "scheduled"
    | "published"
    | "rejected"
    | "failed";
  featuredProductIdsJson: string;
  imageUrlsJson: string;
  seoJson: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  generatedBy: string;
}

// ── Approval Events ──────────────────────────────────────────────────

export interface ApprovalEventRow {
  id: string;
  contentId: string;
  tenantId: string;
  actor: "ai" | "client" | "admin" | "system";
  action:
    | "generated"
    | "submitted"
    | "approved"
    | "rejected"
    | "revision_requested";
  comment: string | null;
  timestamp: string;
}

// ── Platform Connections ─────────────────────────────────────────────

export interface PlatformConnectionRow {
  id: string;
  tenantId: string;
  platform: string;
  connected: boolean;
  handle: string | null;
  connectedAt: string | null;
  tokenRef: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  platformUserId: string | null;
}

// ── Analytics Snapshots ──────────────────────────────────────────────

export interface AnalyticsSnapshotRow {
  id: string;
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  dataJson: string;
  createdAt: string;
}

// ── API Usage Tracking ───────────────────────────────────────────────

export interface ApiUsageRow {
  id: string;
  tenantId: string;
  service: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: string;
}

// ── Content Assets (agency-uploaded) ─────────────────────────────────

export type ContentType = "video" | "image" | "carousel" | "reel" | "story" | "feed_post";
export type ContentAssetStatus = "processing" | "ready" | "downloaded" | "posted";

export interface ContentAssetRow {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  fileUrl: string;
  thumbnailUrl: string | null;
  contentType: ContentType;
  fileSize: number;
  mimeType: string | null;
  durationSeconds: number | null;
  platform: string;
  scheduledDate: string;
  status: ContentAssetStatus;
  createdAt: string;
  createdBy: string;
}

// ── User Roles ───────────────────────────────────────────────────────

export type UserRole = "admin" | "client";
