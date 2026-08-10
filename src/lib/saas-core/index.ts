/**
 * @elizaos/saas-core
 *
 * Multi-tenant SaaS platform for social media automation.
 * Any business, any niche — drop in a pack, add API keys, and go.
 *
 * Architecture:
 *   Engine (7 plugins)     — content gen, image, video, trends, funnel, calendar, prompts
 *   Packs (6 industries)   — travel, real estate, restaurant, fitness, dental, custom
 *   Tenants (N businesses) — isolated .env + character + products per client
 *   Dashboard API           — Hono router (37 endpoints + cache + reverse-engineer + telegram)
 *   Dashboard UI            — React components for the full user workflow
 *
 * User Flow:
 *   Login → Niche → Website URL → Loading/Analysis → Dashboard →
 *   Select Platform → Posts/Day → Duration → API Key →
 *   Notifications Setup → Content Generated → Notification Sent →
 *   User Approves → Published
 */

// ── API Router ───────────────────────────────────────────────────────
export { default as app, saasRouter } from "./api/router";
export * from "./db/adapter";
// ── DB ───────────────────────────────────────────────────────────────
export * from "./db/schema";
export { AnalyticsService } from "./services/analytics-service";
export type {
  AuthSession,
  OnboardingState,
  WebsiteAnalysis,
} from "./services/auth-service";
// ── Services ─────────────────────────────────────────────────────────
export { AuthService } from "./services/auth-service";
// ── Content Reverse-Engineer ─────────────────────────────────────────
export {
  ContentReverseEngineer,
  contentReverseEngineer,
} from "./services/content-reverse-engineer";
export type {
  ExtractedPattern,
  ReverseEngineeredContent,
  ScrapedTopPost,
  ViralContentRequest,
  ViralFormula,
} from "./services/content-reverse-engineer-types";
export { ContentService } from "./services/content-service";
export type {
  Notification,
  NotificationChannel,
  NotificationPreferences,
} from "./services/notification-service";
export { NotificationService } from "./services/notification-service";
export { PackService } from "./services/pack-service";
export type { PlatformSetup } from "./services/platform-setup-service";
export { PlatformSetupService } from "./services/platform-setup-service";
export type {
  CacheEntry,
  CacheStats,
  CacheTier,
} from "./services/prompt-cache";
// ── Prompt Cache ────────────────────────────────────────────────────
export { PromptCache, promptCache } from "./services/prompt-cache";
export type {
  ApprovalAction,
  ContentNotification,
  TelegramConfig,
} from "./services/telegram-bot";

// ── Telegram Bot ─────────────────────────────────────────────────────
export {
  getTelegramBot,
  getTenantChat,
  linkTenantChat,
  TelegramBot,
} from "./services/telegram-bot";
export { TenantService } from "./services/tenant-service";
// Agent-Reach Bridge & Trend Detector
export { AgentReachBridge, agentReachBridge } from "./services/agent-reach-bridge";
export { TrendDetector, trendDetector } from "./services/trend-detector";
export type { TrendingReport, TrendSignal } from "./services/trend-detector";

export { WorkflowEngine } from "./services/workflow-engine";
// ── Website Scraper (Firecrawl) ────────────────────────────────────────
export { WebsiteScraper, websiteScraper } from "./services/website-scraper";
// ── Types ────────────────────────────────────────────────────────────
export * from "./types";

// ── Dashboard UI Components ──────────────────────────────────────────
// UI components live in src/ui/ and are imported directly by the
// frontend consumer package. See the frontend's tsconfig for JSX support.
