/**
 * ContentReview — notification-driven content approval page.
 * User arrives from email/SMS notification link, previews draft, approves/rejects.
 */
import React from "react";

interface ContentDraft {
  id: string;
  title: string;
  body: string;
  platform: string;
  type: string;
  imageUrls: string[];
  hashtags: string[];
  scheduledAt: string | null;
}

interface Props {
  content: ContentDraft;
  onApprove: (contentId: string) => void;
  onReject: (contentId: string, reason: string) => void;
  onRequestChanges: (contentId: string, notes: string) => void;
  onBack: () => void;
}

export const ContentReview: React.FC<Props> = ({
  content,
  onApprove,
  onReject,
  onRequestChanges,
  onBack,
}) => {
  const [notes, setNotes] = React.useState("");

  return (
    <div style={styles.container}>
      <button style={styles.backBtn} onClick={onBack}>
        ← Back
      </button>

      <div style={styles.header}>
        <span style={styles.badge}>{content.platform}</span>
        <span style={styles.type}>{content.type}</span>
        {content.scheduledAt && (
          <span style={styles.schedule}>
            Scheduled: {new Date(content.scheduledAt).toLocaleDateString()}
          </span>
        )}
      </div>

      <h1 style={styles.title}>{content.title}</h1>

      <div style={styles.body}>{content.body.slice(0, 500)}...</div>

      {content.hashtags.length > 0 && (
        <div style={styles.hashtags}>
          {content.hashtags.map((h, i) => (
            <span key={i} style={styles.tag}>
              {h}
            </span>
          ))}
        </div>
      )}

      {content.imageUrls.length > 0 && (
        <div style={styles.images}>
          {content.imageUrls.map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`Content image ${i + 1}`}
              style={styles.image}
            />
          ))}
        </div>
      )}

      <div style={styles.actions}>
        <button style={styles.approveBtn} onClick={() => onApprove(content.id)}>
          ✓ Approve & Publish
        </button>

        <button
          style={styles.changesBtn}
          onClick={() => {
            if (notes) onRequestChanges(content.id, notes);
          }}
        >
          🔄 Request Changes
        </button>

        {notes && (
          <textarea
            style={styles.textarea}
            placeholder="What needs to change? (Required for revision requests)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        )}

        <button
          style={styles.rejectBtn}
          onClick={() => {
            const reason = notes || "Rejected by user";
            onReject(content.id, reason);
          }}
        >
          ✗ Reject
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
    padding: "40px 32px",
    maxWidth: 700,
    margin: "0 auto",
  },
  backBtn: {
    backgroundColor: "transparent",
    border: "none",
    color: "#999",
    fontSize: 13,
    cursor: "pointer",
    marginBottom: 20,
  },
  header: { display: "flex", gap: 10, marginBottom: 16, alignItems: "center" },
  badge: {
    backgroundColor: "#4285F4",
    color: "#fff",
    padding: "2px 10px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
  },
  type: {
    color: "#999",
    fontSize: 12,
  },
  schedule: {
    color: "#666",
    fontSize: 12,
    marginLeft: "auto",
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 16,
    lineHeight: 1.3,
  },
  body: {
    fontSize: 15,
    color: "#ccc",
    lineHeight: 1.8,
    backgroundColor: "#141414",
    border: "1px solid #222",
    borderRadius: 10,
    padding: 20,
    marginBottom: 16,
    whiteSpace: "pre-wrap",
  },
  hashtags: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 },
  tag: {
    backgroundColor: "#1a1a3e",
    color: "#7c8aff",
    padding: "3px 8px",
    borderRadius: 4,
    fontSize: 11,
  },
  images: { display: "flex", gap: 8, marginBottom: 24, overflow: "auto" },
  image: {
    width: 200,
    height: 200,
    objectFit: "cover",
    borderRadius: 8,
    backgroundColor: "#1a1a1a",
  },
  actions: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  approveBtn: {
    padding: "16px 24px",
    backgroundColor: "#1a4d2e",
    border: "1px solid #2d8a4e",
    borderRadius: 10,
    color: "#4ade80",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
  },
  changesBtn: {
    padding: "14px 24px",
    backgroundColor: "#141414",
    border: "1px solid #333",
    borderRadius: 10,
    color: "#fff",
    fontSize: 14,
    cursor: "pointer",
  },
  textarea: {
    width: "100%",
    padding: "12px 16px",
    backgroundColor: "#0a0a0a",
    border: "1px solid #333",
    borderRadius: 8,
    color: "#fff",
    fontSize: 14,
    outline: "none",
    resize: "vertical",
    boxSizing: "border-box",
  },
  rejectBtn: {
    padding: "12px 24px",
    backgroundColor: "transparent",
    border: "1px solid #442222",
    borderRadius: 10,
    color: "#666",
    fontSize: 13,
    cursor: "pointer",
  },
};
