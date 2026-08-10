/**
 * Notification Service — email + in-app notifications.
 *
 * Uses Resend for transactional emails. Falls back to console logging
 * when no API key is configured (development mode).
 *
 * To enable: set RESEND_API_KEY in .env.local
 */

// ── Types ──────────────────────────────────────────────────────────────

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  /** Optional: plain text fallback */
  text?: string;
}

interface NotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ── Email sending ─────────────────────────────────────────────────────

async function sendWithResend(payload: EmailPayload): Promise<NotificationResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY not configured");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM_ADDRESS ?? "Social Automations <noreply@socialautomations.dev>",
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return { success: true, messageId: data.id };
}

async function sendToConsole(payload: EmailPayload): Promise<NotificationResult> {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`[notifications] EMAIL TO: ${payload.to}`);
  console.log(`[notifications] SUBJECT: ${payload.subject}`);
  console.log(`[notifications] BODY: ${payload.text ?? payload.html}`);
  console.log("═══════════════════════════════════════════════════════════");
  return { success: true, messageId: `dev_${Date.now()}` };
}

/**
 * Send a transactional email.
 * In production: uses Resend API.
 * In development: logs to console.
 */
export async function sendEmail(payload: EmailPayload): Promise<NotificationResult> {
  const isDev = process.env.NODE_ENV === "development" || !process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development";

  if (process.env.RESEND_API_KEY) {
    try {
      return await sendWithResend(payload);
    } catch (err: any) {
      console.error(`[notifications] Email send failed: ${err.message}`);
      if (isDev) {
        return sendToConsole(payload);
      }
      return { success: false, error: err.message };
    }
  }

  if (isDev) {
    return sendToConsole(payload);
  }

  console.warn("[notifications] RESEND_API_KEY not configured — email not sent");
  return { success: false, error: "Email service not configured" };
}

// ── Notification Templates ────────────────────────────────────────────

function emailTemplate(title: string, body: string, cta?: { text: string; url: string }): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 16px; background: #fafafa;">
  <div style="background: #ffffff; border-radius: 16px; padding: 32px; border: 1px solid #e5e5e5;">
    <div style="font-size: 24px; font-weight: 700; margin-bottom: 24px; color: #171717;">
      ${title}
    </div>
    <div style="font-size: 16px; line-height: 1.6; color: #525252; margin-bottom: 24px;">
      ${body}
    </div>
    ${cta ? `
    <a href="${cta.url}" style="display: inline-block; padding: 12px 24px; background: #171717; color: #ffffff; border-radius: 9999px; text-decoration: none; font-size: 14px; font-weight: 600;">
      ${cta.text}
    </a>
    ` : ""}
  </div>
  <div style="text-align: center; margin-top: 24px; font-size: 12px; color: #a3a3a3;">
    Social Automations — Agency Content Platform
  </div>
</body>
</html>`;
}

// ── Specific Notifications ────────────────────────────────────────────

/** Notify a client that new content has been uploaded for them. */
export async function notifyNewContent(params: {
  clientEmail: string;
  clientName: string;
  contentTitle: string;
  contentType: string;
  dashboardUrl: string;
}): Promise<void> {
  const subject = `New ${params.contentType} content uploaded for you`;
  const body = `
    <p>Hi ${params.clientName},</p>
    <p>Your agency just uploaded new content for you:</p>
    <p style="font-weight: 600; font-size: 18px;">${params.contentTitle}</p>
    <p>Type: ${params.contentType}</p>
    <p>It's ready for download on your content calendar. Log in to view, download, and post it.</p>
  `;

  await sendEmail({
    to: params.clientEmail,
    subject,
    html: emailTemplate(subject, body, {
      text: "View Content Calendar",
      url: params.dashboardUrl,
    }),
  });
}

/** Send a password reset code to a user. */
export async function sendPasswordResetCode(params: {
  email: string;
  code: string;
}): Promise<NotificationResult> {
  const subject = "Your password reset code";
  const body = `
    <p>You requested a password reset for your Social Automations account.</p>
    <p style="font-size: 32px; font-weight: 700; letter-spacing: 0.2em; text-align: center; padding: 24px; background: #f5f5f5; border-radius: 8px; margin: 24px 0;">
      ${params.code}
    </p>
    <p>This code expires in 15 minutes. If you didn't request this reset, you can safely ignore this email.</p>
  `;

  return sendEmail({
    to: params.email,
    subject,
    html: emailTemplate(subject, body),
    text: `Your password reset code is: ${params.code}. It expires in 15 minutes.`,
  });
}

/** Notify admin that a client was created. */
export async function notifyClientCreated(params: {
  adminEmail: string;
  clientName: string;
  clientEmail: string;
  businessName: string;
}): Promise<void> {
  const subject = `New client created: ${params.businessName}`;
  const body = `
    <p>A new client was added to your agency:</p>
    <ul>
      <li><strong>Client:</strong> ${params.clientName}</li>
      <li><strong>Business:</strong> ${params.businessName}</li>
      <li><strong>Email:</strong> ${params.clientEmail}</li>
    </ul>
  `;

  await sendEmail({
    to: params.adminEmail,
    subject,
    html: emailTemplate(subject, body),
  });
}

export const notifications = {
  sendEmail,
  notifyNewContent,
  sendPasswordResetCode,
  notifyClientCreated,
};
