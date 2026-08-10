/**
 * ElizaOS Bridge — Supabase Realtime → ElizaOS content posting pipeline.
 *
 * THE INTEGRATION POINT between the dashboard and ElizaOS:
 *   1. Client approves content in dashboard
 *   2. Content status flips to "approved" in Supabase
 *   3. Supabase Realtime fires → this bridge catches it
 *   4. Bridge hands content to ElizaOS plugin pipeline
 *   5. ElizaOS posts to connected platforms (Instagram, X, TikTok, etc.)
 *   6. Bridge updates content status to "published" or "failed"
 *
 * Architecture:
 *   Dashboard (React) → Supabase (DB) → Realtime channel → THIS BRIDGE
 *   → ElizaOS Agent → plugin-{instagram,x,tiktok,...} → Platform API
 *
 * Usage:
 *   import { startElizaOSBridge } from "./elizaos-bridge";
 *   await startElizaOSBridge(); // Called once at server startup
 */

import { getAdminClient } from "../../supabase/admin";
import { contentService } from "./content-service";
import type { ContentItem, ContentStatus } from "../types";

// ── Config ──────────────────────────────────────────────────────────────

const ELIZAOS_API_URL =
  process.env.ELIZAOS_API_URL ?? "http://localhost:3001/api";
const ELIZAOS_API_KEY = process.env.ELIZAOS_API_KEY ?? "";

let bridgeRunning = false;
let channelRef: ReturnType<ReturnType<typeof getAdminClient>["channel"]> | null = null;

// ── Bridge ──────────────────────────────────────────────────────────────

export async function startElizaOSBridge(): Promise<void> {
  if (bridgeRunning) {
    console.log("[elizaos-bridge] Already running");
    return;
  }

  const supabase = getAdminClient();
  console.log("[elizaos-bridge] Starting Realtime listener...");

  // CRITICAL: Uses Supabase Realtime to watch content_items table.
  // When a client approves content (status → "approved"), this fires.
  channelRef = supabase
    .channel("content_approvals")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "content_items",
        filter: "status=eq.approved",
      },
      async (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const contentId = payload.new.id as string;
        console.log(
          `[elizaos-bridge] Content approved: ${contentId}`,
        );

        try {
          await handleApprovedContent(payload.new);
        } catch (err: any) {
          console.error(
            `[elizaos-bridge] Failed to post ${contentId}:`,
            err.message ?? err,
          );
          // Mark as failed so client can retry
          await markContentStatus(contentId, "failed");
        }
      },
    )
    .subscribe((status: string) => {
      console.log(`[elizaos-bridge] Realtime status: ${status}`);
      if (status === "SUBSCRIBED") {
        bridgeRunning = true;
        console.log("[elizaos-bridge] Listening for content approvals");
      }
      if (status === "CLOSED" || status === "CHANNEL_ERROR") {
        bridgeRunning = false;
        console.warn("[elizaos-bridge] Channel closed — will reconnect");
        // Auto-reconnect after 5s
        setTimeout(() => {
          if (!bridgeRunning) startElizaOSBridge();
        }, 5000);
      }
    });

  console.log("[elizaos-bridge] Bridge started");
}

export function stopElizaOSBridge(): void {
  if (channelRef) {
    supabaseRemoveChannel();
    channelRef = null;
  }
  bridgeRunning = false;
  console.log("[elizaos-bridge] Stopped");
}

export function isBridgeRunning(): boolean {
  return bridgeRunning;
}

// ── Content posting pipeline ────────────────────────────────────────────

async function handleApprovedContent(
  row: Record<string, unknown>,
): Promise<void> {
  const contentId = row.id as string;
  const tenantId = row.tenant_id as string;
  const platform = row.platform as string;
  const body = row.body as string;
  const title = row.title as string;
  const imageUrls = parseJsonArray(row.image_urls_json);
  const type = row.type as string;

  console.log(
    `[elizaos-bridge] Posting: ${type} to ${platform} (${contentId})`,
  );

  // Step 1: Mark as scheduled (transitioning)
  await markContentStatus(contentId, "scheduled");

  // Step 2: Dispatch to ElizaOS posting pipeline
  const posted = await postToElizaOS({
    contentId,
    tenantId,
    platform,
    type,
    title,
    body,
    imageUrls,
  });

  // Step 3: Update final status
  if (posted) {
    await markContentStatus(contentId, "published");
    console.log(`[elizaos-bridge] Posted: ${contentId} to ${platform}`);

    // Also update in-memory content service
    contentService.updateStatus(contentId, "published");
  } else {
    await markContentStatus(contentId, "failed");
    contentService.updateStatus(contentId, "failed");
  }
}

// ── ElizaOS dispatch ────────────────────────────────────────────────────

interface PostRequest {
  contentId: string;
  tenantId: string;
  platform: string;
  type: string;
  title: string;
  body: string;
  imageUrls: string[];
}

async function postToElizaOS(req: PostRequest): Promise<boolean> {
  if (!ELIZAOS_API_KEY) {
    // No ElizaOS configured — log and simulate success for dev
    console.log(
      `[elizaos-bridge] ELIZAOS_API_KEY not set — would post to ${req.platform}: ${req.title}`,
    );
    return true; // Simulate success in dev mode
  }

  try {
    const res = await fetch(`${ELIZAOS_API_URL}/content/post`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ELIZAOS_API_KEY}`,
      },
      body: JSON.stringify({
        contentId: req.contentId,
        tenantId: req.tenantId,
        platform: req.platform,
        type: req.type,
        caption: req.body,
        title: req.title,
        mediaUrls: req.imageUrls,
        scheduledFor: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(
        `[elizaos-bridge] ElizaOS POST returned ${res.status}: ${errBody}`,
      );
      return false;
    }

    const data = await res.json().catch(() => ({}));
    return (data as any)?.success === true;
  } catch (err: any) {
    console.error(
      `[elizaos-bridge] ElizaOS connection failed:`,
      err.message ?? err,
    );
    return false;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

async function markContentStatus(
  contentId: string,
  status: ContentStatus,
): Promise<void> {
  const supabase = getAdminClient();
  const update: Record<string, unknown> = { status };
  if (status === "published") {
    update.published_at = new Date().toISOString();
  }
  const { error } = await supabase
    .from("content_items")
    .update(update)
    .eq("id", contentId);

  if (error) {
    console.error(
      `[elizaos-bridge] Status update failed for ${contentId}: ${error.message}`,
    );
  }
}

function parseJsonArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function supabaseRemoveChannel(): void {
  // Supabase channel removal — handled internally by the library
  if (channelRef) {
    try {
      (channelRef as any).unsubscribe?.();
    } catch {
      /* ignore */
    }
  }
}

// ── Manual trigger (for testing / manual approval flows) ────────────────

/**
 * Manually trigger posting for a content item.
 * Useful when Realtime isn't available or for testing.
 */
export async function manuallyPostContent(contentId: string): Promise<boolean> {
  const content = contentService.getContent(contentId);
  if (!content) {
    console.error(`[elizaos-bridge] Content not found: ${contentId}`);
    return false;
  }

  if (content.status !== "approved") {
    console.error(
      `[elizaos-bridge] Content ${contentId} is not approved (${content.status})`,
    );
    return false;
  }

  await handleApprovedContent({
    id: content.id,
    tenant_id: content.tenantId,
    platform: content.platform,
    body: content.body,
    title: content.title,
    image_urls_json: JSON.stringify(content.imageUrls),
    type: content.type,
  });

  return true;
}
