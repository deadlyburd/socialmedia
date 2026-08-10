/**
 * Dashboard — main view after onboarding.
 * Shows welcome, platform selection cards, content stats, notification center.
 */
import type React from "react";

interface PlatformCard {
  platform: string;
  icon: string;
  color: string;
  connected: boolean;
  postsThisWeek: number;
  status: string;
}

interface Props {
  userName: string;
  tenantName: string;
  platforms: PlatformCard[];
  pendingNotifications: number;
  onSelectPlatform: (platform: string) => void;
  onViewNotifications: () => void;
}

const DEFAULT_PLATFORMS: PlatformCard[] = [
  {
    platform: "instagram",
    icon: "📷",
    color: "#E4405F",
    connected: false,
    postsThisWeek: 0,
    status: "Not connected",
  },
  {
    platform: "tiktok",
    icon: "🎵",
    color: "#00F2EA",
    connected: false,
    postsThisWeek: 0,
    status: "Not connected",
  },
  {
    platform: "pinterest",
    icon: "📌",
    color: "#BD081C",
    connected: false,
    postsThisWeek: 0,
    status: "Not connected",
  },
  {
    platform: "youtube",
    icon: "▶️",
    color: "#FF0000",
    connected: false,
    postsThisWeek: 0,
    status: "Not connected",
  },
  {
    platform: "linkedin",
    icon: "💼",
    color: "#0A66C2",
    connected: false,
    postsThisWeek: 0,
    status: "Not connected",
  },
  {
    platform: "facebook",
    icon: "👥",
    color: "#1877F2",
    connected: false,
    postsThisWeek: 0,
    status: "Not connected",
  },
];

export const Dashboard: React.FC<Props> = ({
  userName,
  tenantName,
  platforms = DEFAULT_PLATFORMS,
  pendingNotifications,
  onSelectPlatform,
  onViewNotifications,
}) => {
  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.greeting}>Welcome back, {userName}</h1>
          <p style={styles.tenant}>{tenantName}</p>
        </div>
        <button style={styles.notifBtn} onClick={onViewNotifications}>
          🔔
          {pendingNotifications > 0 && (
            <span style={styles.badge}>{pendingNotifications}</span>
          )}
        </button>
      </header>

      {/* Quick Stats */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>
            {platforms.filter((p) => p.connected).length}
          </div>
          <div style={styles.statLabel}>Platforms Connected</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>
            {platforms.reduce((sum, p) => sum + p.postsThisWeek, 0)}
          </div>
          <div style={styles.statLabel}>Posts This Week</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>—</div>
          <div style={styles.statLabel}>Engagement Rate</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>0</div>
          <div style={styles.statLabel}>Pending Approval</div>
        </div>
      </div>

      {/* Platform Grid */}
      <h2 style={styles.sectionTitle}>Your Platforms</h2>
      <p style={styles.sectionSub}>
        Select a platform to set up automated content.
      </p>

      <div style={styles.platformGrid}>
        {platforms.map((p) => (
          <button
            key={p.platform}
            style={{
              ...styles.platformCard,
              borderColor: p.connected ? p.color : "#222",
            }}
            onClick={() => onSelectPlatform(p.platform)}
          >
            <span style={styles.platformIcon}>{p.icon}</span>
            <div style={styles.platformName}>
              {p.platform.charAt(0).toUpperCase() + p.platform.slice(1)}
            </div>
            <div
              style={{
                ...styles.platformStatus,
                color: p.connected ? "#4ade80" : "#666",
              }}
            >
              {p.connected ? "● Connected" : "○ Setup Required"}
            </div>
            {p.connected && (
              <div style={styles.postCount}>
                {p.postsThisWeek} posts this week
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#0a0a0a",
    color: "#fff",
    fontFamily: "system-ui, sans-serif",
    padding: "40px 32px",
    maxWidth: 1100,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 32,
  },
  greeting: { fontSize: 28, fontWeight: 700, margin: 0 },
  tenant: { fontSize: 14, color: "#999", margin: "4px 0 0" },
  notifBtn: {
    position: "relative",
    backgroundColor: "#141414",
    border: "1px solid #222",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 20,
    cursor: "pointer",
    color: "#fff",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#ef4444",
    color: "#fff",
    fontSize: 10,
    fontWeight: 700,
    width: 18,
    height: 18,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 12,
    marginBottom: 40,
  },
  statCard: {
    backgroundColor: "#141414",
    border: "1px solid #222",
    borderRadius: 10,
    padding: "20px 16px",
  },
  statNumber: { fontSize: 24, fontWeight: 700 },
  statLabel: { fontSize: 12, color: "#999", marginTop: 4 },
  sectionTitle: { fontSize: 20, fontWeight: 600, marginBottom: 4 },
  sectionSub: { fontSize: 13, color: "#999", marginBottom: 20 },
  platformGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: 12,
  },
  platformCard: {
    backgroundColor: "#141414",
    border: "2px solid #222",
    borderRadius: 12,
    padding: "24px 16px",
    textAlign: "center",
    cursor: "pointer",
    color: "#fff",
    transition: "all 0.2s",
  },
  platformIcon: { fontSize: 32, display: "block", marginBottom: 8 },
  platformName: { fontSize: 14, fontWeight: 600, marginBottom: 4 },
  platformStatus: { fontSize: 11 },
  postCount: { fontSize: 11, color: "#999", marginTop: 8 },
};
