/**
 * OnboardingNiche — industry pack selection grid.
 * Step 1 of onboarding: user picks their industry/niche.
 */
import type React from "react";

interface Pack {
  slug: string;
  name: string;
  description: string;
  icon: string;
  exampleBusinesses: string[];
  featured: boolean;
}

interface Props {
  packs: Pack[];
  onSelect: (slug: string, name: string) => void;
}

export const OnboardingNiche: React.FC<Props> = ({ packs, onSelect }) => {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>What's your business?</h1>
        <p style={styles.subtitle}>
          Select your industry so we can customize your content engine.
        </p>

        <div style={styles.grid}>
          {packs.map((pack) => (
            <button
              key={pack.slug}
              style={styles.packCard}
              onClick={() => onSelect(pack.slug, pack.name)}
            >
              <span style={styles.packIcon}>{pack.icon}</span>
              <div style={styles.packName}>{pack.name}</div>
              <div style={styles.packDesc}>{pack.description}</div>
              {pack.featured && <span style={styles.badge}>Popular</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    justifyContent: "center",
    minHeight: "100vh",
    backgroundColor: "#0a0a0a",
    paddingTop: 60,
    fontFamily: "system-ui, sans-serif",
    color: "#fff",
  },
  card: { maxWidth: 800, textAlign: "center", padding: "0 24px" },
  title: { fontSize: 28, fontWeight: 700, marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#999", marginBottom: 40 },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
    gap: 16,
  },
  packCard: {
    position: "relative",
    backgroundColor: "#141414",
    border: "1px solid #222",
    borderRadius: 12,
    padding: "24px 20px",
    textAlign: "left",
    cursor: "pointer",
    color: "#fff",
    transition: "border-color 0.2s",
  },
  packIcon: { fontSize: 32, display: "block", marginBottom: 12 },
  packName: { fontSize: 16, fontWeight: 600, marginBottom: 6 },
  packDesc: { fontSize: 12, color: "#999", lineHeight: 1.5 },
  badge: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "#1a4d2e",
    color: "#4ade80",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
  },
};
