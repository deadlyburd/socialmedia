/**
 * NotificationService — email + SMS notifications for content approval.
 */

export type NotificationChannel = "email" | "sms" | "both";

export interface NotificationPreferences {
  userId: string;
  channels: NotificationChannel;
  email: string | null;
  phone: string | null;
  /** Only notify for content that needs approval (drafts ready for review). */
  approvalOnly: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  type:
    | "content_ready"
    | "content_approved"
    | "content_published"
    | "content_failed"
    | "weekly_report";
  title: string;
  body: string;
  contentId: string | null;
  /** Deep link to the content approval page. */
  actionUrl: string | null;
  channel: NotificationChannel;
  status: "pending" | "sent" | "delivered" | "failed";
  sentAt: string | null;
  createdAt: string;
}

export class NotificationService {
  private preferences: Map<string, NotificationPreferences> = new Map();
  private notifications: Map<string, Notification[]> = new Map();

  /** Set notification preferences for a user. */
  setPreferences(
    prefs: Omit<NotificationPreferences, "userId"> & { userId: string },
  ): NotificationPreferences {
    const p: NotificationPreferences = {
      userId: prefs.userId,
      channels: prefs.channels,
      email: prefs.email ?? null,
      phone: prefs.phone ?? null,
      approvalOnly: prefs.approvalOnly ?? true,
    };
    this.preferences.set(prefs.userId, p);
    return { ...p };
  }

  /** Get notification preferences. */
  getPreferences(userId: string): NotificationPreferences | undefined {
    return this.preferences.get(userId);
  }

  /**
   * Notify a user that content is ready for review.
   * This is the CORE notification — sends email/SMS with a link to approve/reject.
   */
  async notifyContentReady(params: {
    userId: string;
    contentId: string;
    contentTitle: string;
    contentPreview: string;
    platform: string;
  }): Promise<Notification[]> {
    const prefs = this.preferences.get(params.userId);
    if (!prefs) return [];

    const sent: Notification[] = [];
    const title = "Your content is ready for review";
    const body = [
      `Platform: ${params.platform}`,
      `Title: ${params.contentTitle}`,
      `Preview: ${params.contentPreview.slice(0, 100)}...`,
      "",
      `[Approve] [Reject] [Request Changes]`,
    ].join("\n");

    if (prefs.channels === "email" || prefs.channels === "both") {
      const notif: Notification = {
        id: `notif_${Date.now()}_email`,
        userId: params.userId,
        type: "content_ready",
        title,
        body,
        contentId: params.contentId,
        actionUrl: `/dashboard/content/${params.contentId}/review`,
        channel: "email",
        status: "sent",
        sentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      this.addNotification(params.userId, notif);
      sent.push(notif);
    }

    if (prefs.channels === "sms" || prefs.channels === "both") {
      const notif: Notification = {
        id: `notif_${Date.now()}_sms`,
        userId: params.userId,
        type: "content_ready",
        title,
        body: `Content ready: ${params.contentTitle}. Check your dashboard to review.`,
        contentId: params.contentId,
        actionUrl: `/dashboard/content/${params.contentId}/review`,
        channel: "sms",
        status: "sent",
        sentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      this.addNotification(params.userId, notif);
      sent.push(notif);
    }

    return sent;
  }

  /** Mark content as approved by user and proceed to publish. */
  async approveContent(
    userId: string,
    contentId: string,
  ): Promise<Notification | null> {
    const notif: Notification = {
      id: `notif_${Date.now()}_approve`,
      userId,
      type: "content_approved",
      title: "Content approved — publishing now",
      body: `Content ${contentId} has been approved and is being published.`,
      contentId,
      actionUrl: null,
      channel: "email",
      status: "sent",
      sentAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    this.addNotification(userId, notif);
    return notif;
  }

  /** Get all notifications for a user. */
  getNotifications(userId: string, limit = 20): Notification[] {
    const userNotifs = this.notifications.get(userId) ?? [];
    return userNotifs
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, limit);
  }

  /** Get pending notification count (badge number). */
  getPendingCount(userId: string): number {
    const userNotifs = this.notifications.get(userId) ?? [];
    return userNotifs.filter((n) => n.status === "sent").length;
  }

  // ── Private ──────────────────────────────────────────────────────

  private addNotification(userId: string, notification: Notification): void {
    const list = this.notifications.get(userId) ?? [];
    list.push(notification);
    this.notifications.set(userId, list);
  }
}
