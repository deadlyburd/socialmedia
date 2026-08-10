/**
 * LoginPage — Google OAuth sign-in/sign-up.
 * First page the user sees. New users go to onboarding. Existing users go to dashboard.
 */
import type React from "react";

interface Props {
  onLogin: (email: string) => void;
}

export const LoginPage: React.FC<Props> = ({ onLogin }) => {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>🚀</div>
        <h1 style={styles.title}>ContentFlow</h1>
        <p style={styles.subtitle}>
          AI-powered social media automation for your business. One click setup.
          Content that converts.
        </p>

        <button
          style={styles.googleBtn}
          onClick={() => onLogin("user@gmail.com")}
        >
          <span style={styles.googleIcon}>G</span>
          Continue with Google
        </button>

        <p style={styles.footer}>
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    backgroundColor: "#0a0a0a",
    color: "#ffffff",
    fontFamily: "system-ui, sans-serif",
  },
  card: {
    textAlign: "center",
    maxWidth: 400,
    padding: "48px 32px",
    backgroundColor: "#141414",
    borderRadius: 16,
    border: "1px solid #222",
  },
  logo: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 28, fontWeight: 700, margin: "0 0 8px" },
  subtitle: {
    fontSize: 14,
    color: "#999",
    marginBottom: 32,
    lineHeight: 1.6,
  },
  googleBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    width: "100%",
    padding: "14px 24px",
    backgroundColor: "#ffffff",
    color: "#000000",
    border: "none",
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
  },
  googleIcon: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    backgroundColor: "#4285F4",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    fontWeight: 700,
  },
  footer: { fontSize: 11, color: "#666", marginTop: 24 },
};
