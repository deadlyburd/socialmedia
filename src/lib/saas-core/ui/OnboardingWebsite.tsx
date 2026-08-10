/**
 * OnboardingWebsite — URL input with loading/analysis screen.
 * Step 2 of onboarding: enter company website, see analysis results.
 */
import type React from "react";
import { useState } from "react";

interface Props {
  onSubmit: (url: string) => void;
  onAnalysisComplete?: (result: any) => void;
}

export const OnboardingWebsite: React.FC<Props> = ({ onSubmit }) => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);

  const handleSubmit = async () => {
    if (!url.startsWith("http")) {
      alert("Please enter a full URL starting with https://");
      return;
    }
    setLoading(true);
    // Call the API
    onSubmit(url);
    // Simulate analysis delay
    setTimeout(() => {
      setLoading(false);
      setAnalysis({
        title: "Pointours — Rome Travel Experiences",
        description: "Premium Rome and Italy tours for curious travelers.",
        industry: "travel",
        socialLinks: { instagram: "@pointours", facebook: "pointours" },
        suggestedPack: "travel-agency",
      });
    }, 3000);
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.spinner} />
          <h1 style={styles.title}>Analyzing your website...</h1>
          <p style={styles.subtitle}>
            We're scanning {url} to understand your business, brand voice,
            products, and target audience.
          </p>
          <div style={styles.progressBar}>
            <div style={styles.progressFill} />
          </div>
          <p style={styles.steps}>
            ✓ Extracting metadata &nbsp;|&nbsp; ✓ Analyzing content
            &nbsp;|&nbsp; ● Detecting industry &nbsp;|&nbsp; ○ Building your
            pack
          </p>
        </div>
      </div>
    );
  }

  if (analysis) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.checkmark}>✓</div>
          <h1 style={styles.title}>Analysis Complete!</h1>
          <div style={styles.analysisBox}>
            <div style={styles.analysisRow}>
              <span style={styles.label}>Business</span>
              <span style={styles.value}>{analysis.title}</span>
            </div>
            <div style={styles.analysisRow}>
              <span style={styles.label}>Industry</span>
              <span style={styles.value}>{analysis.industry}</span>
            </div>
            <div style={styles.analysisRow}>
              <span style={styles.label}>Pack</span>
              <span style={styles.value}>{analysis.suggestedPack}</span>
            </div>
            <div style={styles.analysisRow}>
              <span style={styles.label}>Social</span>
              <span style={styles.value}>
                {analysis.socialLinks?.instagram},{" "}
                {analysis.socialLinks?.facebook}
              </span>
            </div>
          </div>
          <p style={styles.readyText}>
            Your content engine is ready. Taking you to the dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Your website URL</h1>
        <p style={styles.subtitle}>
          Paste your company website so we can analyze your brand and
          auto-configure your content engine.
        </p>
        <input
          style={styles.input}
          type="url"
          placeholder="https://yourbusiness.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
        <button
          style={styles.button}
          onClick={handleSubmit}
          disabled={!url.startsWith("http")}
        >
          Analyze My Website →
        </button>
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
    paddingTop: 80,
    fontFamily: "system-ui, sans-serif",
    color: "#fff",
  },
  card: { maxWidth: 500, textAlign: "center", padding: "0 24px" },
  title: { fontSize: 28, fontWeight: 700, marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#999", marginBottom: 32, lineHeight: 1.6 },
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
  },
  button: {
    width: "100%",
    marginTop: 16,
    padding: "14px 24px",
    backgroundColor: "#4285F4",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
  },
  spinner: {
    width: 48,
    height: 48,
    border: "3px solid #333",
    borderTopColor: "#4285F4",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    margin: "0 auto 24px",
  },
  progressBar: {
    width: "100%",
    height: 4,
    backgroundColor: "#222",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 16,
  },
  progressFill: {
    width: "60%",
    height: "100%",
    backgroundColor: "#4285F4",
    animation: "pulse 1.5s ease-in-out infinite",
  },
  steps: { fontSize: 12, color: "#666", lineHeight: 1.8 },
  checkmark: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    backgroundColor: "#1a4d2e",
    color: "#4ade80",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 28,
    margin: "0 auto 16px",
  },
  analysisBox: {
    backgroundColor: "#141414",
    border: "1px solid #222",
    borderRadius: 12,
    padding: 20,
    textAlign: "left",
    marginBottom: 24,
  },
  analysisRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: "1px solid #1a1a1a",
  },
  label: { color: "#666", fontSize: 13 },
  value: { color: "#fff", fontSize: 13, fontWeight: 500 },
  readyText: { fontSize: 14, color: "#4ade80" },
};
