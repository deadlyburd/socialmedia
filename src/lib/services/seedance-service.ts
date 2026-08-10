/**
 * Seedance 2.0 API Service — AI Video Generation
 *
 * ByteDance's multimodal video generation model.
 * Supports text-to-video, image-to-video, and reference-to-video.
 *
 * Flow:
 *   1. Submit generation task → get task_id
 *   2. Poll until complete OR register webhook
 *   3. Download video → upload to R2 → push to client calendar
 *
 * Providers (swap SEEDANCE_API_URL):
 *   - AI/ML API:    https://api.aimlapi.com/v2/video/generations
 *   - evoLink:       https://api.evolink.ai/v1/videos/generations
 *   - Ksyun:         https://kspmas.ksyun.com/{model}/v3/contents/generations/tasks
 */

// ── Types ────────────────────────────────────────────────────────────

export type SeedanceModel =
  | "seedance-2.0-text-to-video"
  | "seedance-2.0-fast-text-to-video"
  | "seedance-2.0-image-to-video"
  | "seedance-2.0-fast-image-to-video"
  | "seedance-2.0-reference-to-video"
  | "seedance-2.0-fast-reference-to-video";

export type VideoQuality = "480p" | "720p" | "1080p" | "4k";
export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9";

export interface SeedanceRequest {
  prompt: string;
  model?: SeedanceModel;
  duration?: number;         // 4-15 seconds
  quality?: VideoQuality;
  aspectRatio?: AspectRatio;
  generateAudio?: boolean;
  imageUrls?: string[];      // publicly accessible URLs
  webhookUrl?: string;       // callback when done
  seed?: number;
}

export interface SeedanceTask {
  taskId: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress?: number;         // 0-100
  videoUrl?: string;         // download URL (expires in 24h)
  thumbnailUrl?: string;
  duration?: number;
  error?: string;
}

// ── Pricing (per second, USD) ──────────────────────────────────────

export const SEEDANCE_PRICING: Record<VideoQuality, { standard: number; fast: number }> = {
  "480p":  { standard: 0.056, fast: 0.040 },
  "720p":  { standard: 0.122, fast: 0.080 },
  "1080p": { standard: 0.299, fast: 0.160 },
  "4k":    { standard: 0.450, fast: 0.250 }, // estimated
};

export function estimateCost(duration: number, quality: VideoQuality, fast: boolean): number {
  const tier = SEEDANCE_PRICING[quality];
  const rate = fast ? tier.fast : tier.standard;
  return Math.round(duration * rate * 100) / 100;
}

// ── API Client ─────────────────────────────────────────────────────

const API_URL = process.env.SEEDANCE_API_URL ?? "https://api.aimlapi.com/v2/video/generations";
const API_KEY = process.env.SEEDANCE_API_KEY ?? "";

export async function submitVideoGeneration(params: SeedanceRequest): Promise<{ taskId: string } | { error: string }> {
  if (!API_KEY) return { error: "SEEDANCE_API_KEY not configured" };

  const body: Record<string, any> = {
    model: params.model ?? "seedance-2.0-text-to-video",
    prompt: params.prompt.slice(0, 1000), // English limit
    duration: params.duration ?? 5,
    quality: params.quality ?? "720p",
    aspect_ratio: params.aspectRatio ?? "16:9",
    generate_audio: params.generateAudio ?? true,
  };

  if (params.imageUrls?.length) {
    body.image_urls = params.imageUrls.slice(0, 2);
  }
  if (params.webhookUrl) {
    body.callback_url = params.webhookUrl;
  }
  if (params.seed !== undefined) {
    body.seed = params.seed;
  }

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      return { error: data.message ?? data.error ?? `API error: ${res.status}` };
    }

    // Providers return different field names — normalize
    const taskId = data.task_id ?? data.generation_id ?? data.request_id ?? data.id;
    if (!taskId) {
      return { error: "No task_id in response: " + JSON.stringify(data).slice(0, 200) };
    }

    return { taskId };
  } catch (err: any) {
    return { error: `Network error: ${err.message}` };
  }
}

export async function pollTaskStatus(taskId: string): Promise<SeedanceTask> {
  if (!API_KEY) return { taskId, status: "failed", error: "API key not configured" };

  // Different providers have different polling URLs — try the standard pattern
  const pollUrl = `${API_URL.replace(/\/generations$/, "")}?generation_id=${taskId}`;

  try {
    const res = await fetch(pollUrl, {
      headers: { "Authorization": `Bearer ${API_KEY}` },
    });
    const data = await res.json();

    // Normalize across providers
    const status = normalizeStatus(data.status ?? data.state ?? "queued");
    const videoUrl = data.video_url ?? data.output?.video_url ?? data.result?.url ?? null;
    const thumbnailUrl = data.thumbnail_url ?? data.output?.thumbnail_url ?? null;

    return {
      taskId,
      status,
      progress: data.progress ?? (status === "completed" ? 100 : status === "processing" ? 50 : 0),
      videoUrl,
      thumbnailUrl,
      duration: data.duration ?? data.metadata?.duration,
      error: data.error ?? data.message,
    };
  } catch (err: any) {
    return { taskId, status: "failed", error: `Poll failed: ${err.message}` };
  }
}

function normalizeStatus(raw: string): SeedanceTask["status"] {
  const s = raw.toLowerCase();
  if (s.includes("complete") || s.includes("done") || s.includes("success")) return "completed";
  if (s.includes("fail") || s.includes("error")) return "failed";
  if (s.includes("process") || s.includes("generat") || s.includes("run")) return "processing";
  return "queued";
}

/**
 * Wait for a video generation task to complete (polling).
 * Default: polls every 10s, max 5 minutes.
 */
export async function waitForCompletion(
  taskId: string,
  pollInterval = 10_000,
  maxWait = 300_000,
): Promise<SeedanceTask> {
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const task = await pollTaskStatus(taskId);

    if (task.status === "completed" || task.status === "failed") {
      return task;
    }

    await new Promise(r => setTimeout(r, pollInterval));
  }

  return { taskId, status: "failed", error: "Timed out waiting for generation" };
}

/**
 * Download a video from a URL and return it as a Buffer.
 * Videos expire after ~24h on Seedance servers — save immediately.
 */
export async function downloadVideo(url: string): Promise<{ buffer: Buffer; contentType: string } | { error: string }> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { error: `Download failed: ${res.status}` };

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "video/mp4";
    return { buffer, contentType };
  } catch (err: any) {
    return { error: `Download failed: ${err.message}` };
  }
}
