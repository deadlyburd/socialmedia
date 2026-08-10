/**
 * NotificationPrefs — notification settings after platform setup.
 * User chooses: Email, SMS, or Both for content draft approval notifications.
 */
import type React from "react";
import { useState } from "react";

interface Props {
  onComplete: (prefs: {
    channels: "email" | "sms" | "both";
    email?: string;
    phone?: string;
  }) => void;
  onSkip: () => void;
}

export const NotificationPrefs: React.FC<Props> = ({ onComplete, onSkip }) => {
  const [channels, setChannels] = useState<"email" | "sms" | "both">("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const handleContinue = () => {
    onComplete({
      channels,
      email: email || undefined,
      phone: phone || undefined,
    });
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>How should we notify you?</h1>
      <p style={styles.subtitle}>
        When your AI-generated content is ready for review, we'll send you a
        notification. You review, approve, and we publish.
      </p>

      <div style={styles.options}>
        <button
          style={{
            ...styles.optionCard,
            borderColor: channels === "email" ? "#4285F4" : "#222",
          }}
          onClick={() => setChannels("email")}
        >
          <span style={styles.optionIcon}>📧</span>
          <strong>Email</strong>
          <span style={styles.optionDesc}>
            Get a link to review drafts in your inbox
          </span>
        </button>

        <button
          style={{
            ...styles.optionCard,
            borderColor: channels === "sms" ? "#4285F4" : "#222",
          }}
          onClick={() => setChannels("sms")}
        >
          <span style={styles.optionIcon}>📱</span>
          <strong>SMS / Text</strong>
          <span style={styles.optionDesc}>
            Get a text message when content is ready
          </span>
        </button>

        <button
          style={{
            ...styles.optionCard,
            borderColor: channels === "both" ? "#4285F4" : "#222",
          }}
          onClick={() => setChannels("both")}
        >
          <span style={styles.optionIcon}>🔔</span>
          <strong>Both</strong>
          <span style={styles.optionDesc}>Email + SMS for instant alerts</span>
        </button>
      </div>

      {(channels === "email" || channels === "both") && (
        <input
          style={styles.input}
          type="email"
          placeholder="Your email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      )}

      {(channels === "sms" || channels === "both") && (
        <input
          style={styles.input}
          type="tel"
          placeholder="Your phone number (+39...)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      )}

      <div style={styles.buttonRow}>
        <button style={styles.skipBtn} onClick={onSkip}>
          Skip for now
        </button>
        <button style={styles.saveBtn} onClick={handleContinue}>
          Save & Continue →
        </button>
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
    padding: "80px 32px",
    maxWidth: 560,
    margin: "0 auto",
  },
  title: { fontSize: 24, fontWeight: 700, marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#999", marginBottom: 32, lineHeight: 1.6 },
  options: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginBottom: 24,
  },
  optionCard: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    backgroundColor: "#141414",
    border: "2px solid #222",
    borderRadius: 10,
    padding: "18px 20px",
    color: "#fff",
    cursor: "pointer",
    textAlign: "left",
  },
  optionIcon: { fontSize: 24, marginBottom: 4 },
  optionDesc: { fontSize: 12, color: "#999", fontWeight: 400 },
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
    marginBottom: 12,
  },
  buttonRow: { display: "flex", gap: 12, marginTop: 16 },
  skipBtn: {
    flex: 1,
    padding: "14px 24px",
    backgroundColor: "transparent",
    border: "1px solid #333",
    borderRadius: 8,
    color: "#999",
    fontSize: 15,
    cursor: "pointer",
  },
  saveBtn: {
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
};
