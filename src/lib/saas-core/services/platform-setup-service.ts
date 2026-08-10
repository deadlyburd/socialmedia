/**
 * PlatformSetupService — manages platform connections and posting schedules per client.
 */

export interface PlatformSetup {
  id: string;
  userId: string;
  tenantId: string;
  platform: string;
  /** How many posts per day. */
  postsPerDay: number;
  /** Content duration: "1week", "2weeks", "1month", "custom". */
  duration: string;
  /** Start date for the schedule. */
  startDate: string;
  /** End date for the schedule. */
  endDate: string;
  /** Total posts to generate. */
  totalPosts: number;
  /** Platform API key or OAuth token ref. */
  apiKeyRef: string;
  /** Connected status. */
  status: "setup" | "connected" | "generating" | "active" | "paused";
  /** Content status per platform. */
  contentStatus: {
    generated: number;
    pendingApproval: number;
    approved: number;
    published: number;
  };
  createdAt: string;
  updatedAt: string;
}

export class PlatformSetupService {
  private setups: Map<string, PlatformSetup> = new Map();

  /** Create a new platform setup for a client. */
  createSetup(params: {
    userId: string;
    tenantId: string;
    platform: string;
    postsPerDay: number;
    duration: "1week" | "2weeks" | "1month";
    startDate: string;
    apiKey: string;
  }): PlatformSetup {
    const now = new Date().toISOString();

    const days =
      params.duration === "1week" ? 7 : params.duration === "2weeks" ? 14 : 30;

    const endDate = new Date(params.startDate);
    endDate.setDate(endDate.getDate() + days);

    const setup: PlatformSetup = {
      id: `psetup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: params.userId,
      tenantId: params.tenantId,
      platform: params.platform,
      postsPerDay: params.postsPerDay,
      duration: params.duration,
      startDate: params.startDate,
      endDate: endDate.toISOString(),
      totalPosts: params.postsPerDay * days,
      apiKeyRef: `vault:${params.platform}:${params.tenantId}`,
      status: "setup",
      contentStatus: {
        generated: 0,
        pendingApproval: 0,
        approved: 0,
        published: 0,
      },
      createdAt: now,
      updatedAt: now,
    };

    this.setups.set(setup.id, setup);
    return { ...setup };
  }

  /** Get setup by ID. */
  getSetup(id: string): PlatformSetup | undefined {
    return this.setups.get(id);
  }

  /** Get all setups for a tenant. */
  getSetupsByTenant(tenantId: string): PlatformSetup[] {
    return [...this.setups.values()]
      .filter((s) => s.tenantId === tenantId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }

  /** Get all setups for a user. */
  getSetupsByUser(userId: string): PlatformSetup[] {
    return [...this.setups.values()]
      .filter((s) => s.userId === userId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }

  /** Update setup status. */
  updateStatus(
    id: string,
    status: PlatformSetup["status"],
  ): PlatformSetup | null {
    const setup = this.setups.get(id);
    if (!setup) return null;
    setup.status = status;
    setup.updatedAt = new Date().toISOString();
    return { ...setup };
  }

  /** Update content progress. */
  updateContentProgress(
    id: string,
    progress: Partial<PlatformSetup["contentStatus"]>,
  ): PlatformSetup | null {
    const setup = this.setups.get(id);
    if (!setup) return null;
    setup.contentStatus = { ...setup.contentStatus, ...progress };
    setup.updatedAt = new Date().toISOString();
    return { ...setup };
  }
}
