/**
 * AnalyticsService — aggregates metrics across all tenants.
 */

import type {
  AiCostBreakdown,
  ContentTypeMetrics,
  FunnelAnalytics,
  GrowthTrends,
  TenantAnalytics,
} from "../types";

export class AnalyticsService {
  /** Get analytics for a specific tenant. */
  getTenantAnalytics(
    tenantId: string,
    _period?: { start: string; end: string },
  ): TenantAnalytics {
    const now = new Date().toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    return {
      tenantId,
      period: { start: thirtyDaysAgo, end: now },
      totalPublished: 0,
      byPlatform: {
        instagram: {
          platform: "instagram",
          posts: 0,
          impressions: 0,
          engagement: 0,
          engagementRate: 0,
          clicks: 0,
          saves: 0,
          shares: 0,
        },
        tiktok: {
          platform: "tiktok",
          posts: 0,
          impressions: 0,
          engagement: 0,
          engagementRate: 0,
          clicks: 0,
          saves: 0,
          shares: 0,
        },
        pinterest: {
          platform: "pinterest",
          posts: 0,
          impressions: 0,
          engagement: 0,
          engagementRate: 0,
          clicks: 0,
          saves: 0,
          shares: 0,
        },
      },
      byType: this.getDefaultContentTypeMetrics(),
      funnel: this.getDefaultFunnelAnalytics(),
      aiCost: this.getDefaultAiCostBreakdown(),
      topContent: [],
      trends: this.getDefaultGrowthTrends(),
    };
  }

  /** Get aggregated analytics across all tenants (admin dashboard). */
  getAggregatedAnalytics(): {
    totalTenants: number;
    activeTenants: number;
    totalContent: number;
    totalRevenue: number;
    averageConversionRate: number;
    platformBreakdown: Record<string, number>;
  } {
    return {
      totalTenants: 0,
      activeTenants: 0,
      totalContent: 0,
      totalRevenue: 0,
      averageConversionRate: 0,
      platformBreakdown: {
        instagram: 0,
        tiktok: 0,
        pinterest: 0,
        youtube: 0,
      },
    };
  }

  /** Get spending analytics for a tenant. */
  getSpendingAnalytics(_tenantId: string): {
    totalSpent: number;
    byService: Record<string, number>;
    thisMonth: number;
    lastMonth: number;
  } {
    return {
      totalSpent: 0,
      byService: {},
      thisMonth: 0,
      lastMonth: 0,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────

  private getDefaultContentTypeMetrics(): Record<string, ContentTypeMetrics> {
    return {
      blog: { type: "blog", count: 0, avgEngagement: 0, topPerformer: "" },
      reel: { type: "reel", count: 0, avgEngagement: 0, topPerformer: "" },
      carousel: {
        type: "carousel",
        count: 0,
        avgEngagement: 0,
        topPerformer: "",
      },
      pin: { type: "pin", count: 0, avgEngagement: 0, topPerformer: "" },
      story: { type: "story", count: 0, avgEngagement: 0, topPerformer: "" },
    };
  }

  private getDefaultFunnelAnalytics(): FunnelAnalytics {
    return {
      leadMagnetViews: 0,
      emailsCaptured: 0,
      nurtureOpens: 0,
      nurtureClicks: 0,
      consultationsBooked: 0,
      consultationsCompleted: 0,
      bookingsConfirmed: 0,
      conversionRate: 0,
      revenue: 0,
    };
  }

  private getDefaultAiCostBreakdown(): AiCostBreakdown {
    return {
      totalCost: 0,
      byService: {},
      imageCount: 0,
      videoCount: 0,
      blogWordCount: 0,
    };
  }

  private getDefaultGrowthTrends(): GrowthTrends {
    return {
      followerGrowth: 0,
      engagementGrowth: 0,
      bookingGrowth: 0,
      revenueGrowth: 0,
      wowChange: {},
    };
  }
}
