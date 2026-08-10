/**
 * PlatformSetupWizard — step-by-step platform configuration.
 * 1. Posts per day
 * 2. Duration (1 week / 1 month)
 * 3. API key
 * 4. Pre-launch summary
 */
import type React from "react";
import { useState } from "react";

interface Props {
  platform: string;
  onComplete: (config: {
    platform: string;
    postsPerDay: number;
    duration: "1week" | "2weeks" | "1month";
    apiKey: string;
  }) => void;
  onBack: () => void;
}

export const PlatformSetupWizard: React.FC<Props> = ({
  platform,
  onComplete,
  onBack,
}) => {
  const [step, setStep] = useState(0);
  const [postsPerDay, setPostsPerDay] = useState(2);
  const [duration, setDuration] = useState<"1week" | "2weeks" | "1month">(
    "1week",
  );
  const [apiKey, setApiKey] = useState("");

  const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
  const totalPosts =
    postsPerDay * (duration === "1week" ? 7 : duration === "2weeks" ? 14 : 30);

  const renderStep = () => {
    if (step === 0) {
      return (
        <>
          <h2 style={styles.title}>How many posts per day?</h2>
          <p style={styles.subtitle}>
            For {platformName}. You can change this anytime.
          </p>
          <div style={styles.postSelector}>
            {[1, 2, 3, 5, 7, 10].map((n) => (
              <button
                key={n}
                style={{
                  ...styles.countBtn,
                  backgroundColor: postsPerDay === n ? "#4285F4" : "#141414",
                  borderColor: postsPerDay === n ? "#4285F4" : "#222",
                }}
                onClick={() => setPostsPerDay(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <p style={styles.hint}>
            {postsPerDay} post{postsPerDay > 1 ? "s" : ""} per day
          </p>
          <button style={styles.nextBtn} onClick={() => setStep(1)}>
            Continue →
          </button>
        </>
      );
    }

    if (step === 1) {
      return (
        <>
          <h2 style={styles.title}>For how long?</h2>
          <div style={styles.durationGrid}>
            {(["1week", "2weeks", "1month"] as const).map((d) => (
              <button
                key={d}
                style={{
                  ...styles.durationCard,
                  backgroundColor: duration === d ? "#141414" : "#0a0a0a",
                  borderColor: duration === d ? "#4285F4" : "#222",
                }}
                onClick={() => setDuration(d)}
              >
                <strong>
                  {d === "1week"
                    ? "1 Week"
                    : d === "2weeks"
                      ? "2 Weeks"
                      : "1 Month"}
                </strong>
                <span style={styles.postCount}>
                  {postsPerDay * (d === "1week" ? 7 : d === "2weeks" ? 14 : 30)}{" "}
                  posts total
                </span>
              </button>
            ))}
          </div>
          <div style={styles.summaryBox}>
            {postsPerDay} posts/day ×{" "}
            {duration === "1week" ? "7" : duration === "2weeks" ? "14" : "30"}{" "}
            days = <strong>{totalPosts} posts</strong>
          </div>
          <div style={styles.buttonRow}>
            <button style={styles.backBtn} onClick={() => setStep(0)}>
              ← Back
            </button>
            <button style={styles.nextBtn} onClick={() => setStep(2)}>
              Continue →
            </button>
          </div>
        </>
      );
    }

    return (
      <>
        <h2 style={styles.title}>Connect your {platformName} account</h2>
        <p style={styles.subtitle}>
          Paste your {platformName} API key or access token. Don't have one?{" "}
          <a href="#" style={styles.link}>
            Here's how to get it →
          </a>
        </p>
        <input
          style={styles.input}
          type="password"
          placeholder={`${platformName} API key...`}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <div style={styles.summaryBox}>
          <strong>Summary</strong>
          <br />
          Platform: {platformName} | Posts/day: {postsPerDay} | Duration:{" "}
          {duration === "1week"
            ? "1 Week"
            : duration === "2weeks"
              ? "2 Weeks"
              : "1 Month"}{" "}
          | Total: {totalPosts} posts
        </div>
        <div style={styles.buttonRow}>
          <button style={styles.backBtn} onClick={() => setStep(1)}>
            ← Back
          </button>
          <button
            style={{
              ...styles.nextBtn,
              opacity: apiKey.length > 5 ? 1 : 0.5,
            }}
            disabled={apiKey.length < 6}
            onClick={() =>
              onComplete({ platform, postsPerDay, duration, apiKey })
            }
          >
            Launch Content Engine 🚀
          </button>
        </div>
      </>
    );
  };

  return (
    <div style={styles.container}>
      <button style={styles.topBack} onClick={onBack}>
        ← Back to Dashboard
      </button>
      <div style={styles.stepIndicator}>
        Step {step + 1} of 3 —{" "}
        {step === 0 ? "Posts/Day" : step === 1 ? "Duration" : "Connect"}
      </div>
      {renderStep()}
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
    maxWidth: 600,
    margin: "0 auto",
  },
  topBack: {
    backgroundColor: "transparent",
    border: "none",
    color: "#999",
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
    marginBottom: 16,
  },
  stepIndicator: { fontSize: 12, color: "#666", marginBottom: 24 },
  title: { fontSize: 24, fontWeight: 700, marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#999", marginBottom: 32, lineHeight: 1.6 },
  postSelector: { display: "flex", gap: 10, marginBottom: 12 },
  countBtn: {
    width: 56,
    height: 56,
    borderRadius: 10,
    border: "2px solid #222",
    backgroundColor: "#141414",
    color: "#fff",
    fontSize: 18,
    fontWeight: 600,
    cursor: "pointer",
  },
  hint: { fontSize: 13, color: "#999", marginBottom: 32 },
  durationGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginBottom: 20,
  },
  durationCard: {
    padding: "18px 20px",
    border: "2px solid #222",
    borderRadius: 10,
    textAlign: "left",
    cursor: "pointer",
    color: "#fff",
    backgroundColor: "#141414",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  postCount: { fontSize: 12, color: "#999" },
  summaryBox: {
    backgroundColor: "#141414",
    border: "1px solid #222",
    borderRadius: 8,
    padding: 14,
    fontSize: 13,
    color: "#ccc",
    lineHeight: 1.6,
    marginBottom: 20,
  },
  buttonRow: { display: "flex", gap: 12 },
  backBtn: {
    flex: 1,
    padding: "14px 24px",
    backgroundColor: "#141414",
    border: "1px solid #222",
    borderRadius: 8,
    color: "#fff",
    fontSize: 15,
    cursor: "pointer",
  },
  nextBtn: {
    flex: 2,
    padding: "14px 24px",
    backgroundColor: "#4285F4",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
  input: {
    width: "100%",
    padding: "14px 18px",
    backgroundColor: "#141414",
    border: "1px solid #333",
    borderRadius: 8,
    color: "#fff",
    fontSize: 16,
    outline: "none",
    boxSizing: "border-box",
    marginBottom: 20,
  },
  link: { color: "#4285F4", textDecoration: "none", fontSize: 13 },
};
