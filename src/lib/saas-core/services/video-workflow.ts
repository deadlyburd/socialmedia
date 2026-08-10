/**
 * VideoWorkflow — automated video generation using the OpenMontage pipeline.
 *
 * Integrates:
 *   - DeepSeek V4 for scene/script breakdown
 *   - Seedance 2.0 (preferred) or Kling V3 via Fal.ai for per-scene clip generation
 *     (same API pattern as OpenMontage/tools/video/seedance_video.py and kling_video.py)
 *   - FFmpeg for stitching clips into the final MP4
 *     (same pattern as OpenMontage/tools/video/video_stitch.py)
 *
 * Pipeline:
 *   1. DeepSeek breaks topic into N scenes (4-8s each)
 *   2. Each scene → Fal.ai video generation (submit → poll → download)
 *   3. All clip URLs stitched together via ffmpeg concat
 *   4. Optional: thumbnail generated via FLUX
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { promptCache } from "./prompt-cache";

const execAsync = promisify(exec);

// ── Config ─────────────────────────────────────────────────────────────

const AI_URL = process.env.OPENAI_API_URL ?? "https://api.deepseek.com/v1";
const AI_KEY = process.env.OPENAI_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? "";
const AI_MODEL = process.env.DEFAULT_MODEL ?? "deepseek-chat";
const FAL_KEY = process.env.FAL_KEY;

// Supported video models (OpenMontage pattern)
const VIDEO_MODELS = {
  seedance: "bytedance/seedance-2.0/text-to-video",
  seedance_fast: "bytedance/seedance-2.0/fast/text-to-video",
  kling: "kling-video/v3/standard/text-to-video",
  kling_pro: "kling-video/v2.1/pro/text-to-video",
} as const;

// ── Types ──────────────────────────────────────────────────────────────

export interface VideoScene {
  sceneNumber: number;
  durationSec: number;
  visualPrompt: string;
  cameraMove: string;
  narration?: string;
}

export interface VideoRequest {
  topic: string;
  niche: string;
  totalDuration?: number;  // seconds, default 30
  aspectRatio?: string;    // "9:16" | "16:9" | "1:1"
  model?: keyof typeof VIDEO_MODELS;
  tenantId?: string;
  avatarUrl?: string;      // optional face-swap reference
}

export interface VideoResult {
  outputUrl: string | null;    // final stitched video URL or local path
  clipUrls: string[];          // individual scene clip URLs
  scenes: VideoScene[];
  thumbnailUrl: string | null;
  duration: number;
  model: string;
  generatedAt: string;
  error?: string;
}

// ── DeepSeek scene breakdown ───────────────────────────────────────────

async function generateSceneBreakdown(req: VideoRequest): Promise<VideoScene[]> {
  const totalDuration = req.totalDuration ?? 30;
  const sceneCount = Math.ceil(totalDuration / 7); // ~7s average per scene

  if (!AI_KEY) {
    // Fallback scenes
    return Array.from({ length: sceneCount }, (_, i) => ({
      sceneNumber: i + 1,
      durationSec: Math.round(totalDuration / sceneCount),
      visualPrompt: `${req.niche} scene ${i + 1}: ${req.topic}, cinematic quality, ${req.aspectRatio ?? "9:16"} vertical video`,
      cameraMove: ["slow zoom in", "pan left", "static wide shot", "push forward", "tilt up"][i % 5]!,
      narration: `Scene ${i + 1} about ${req.topic}`,
    }));
  }

  const prompt = `
Break this ${totalDuration}-second social media video into exactly ${sceneCount} scenes about "${req.topic}" for the ${req.niche} niche.

Return ONLY valid JSON (no markdown):
[
  {
    "sceneNumber": 1,
    "durationSec": 7,
    "visualPrompt": "Cinematic shot of [specific visual], [lighting], [mood], photorealistic",
    "cameraMove": "slow zoom in",
    "narration": "Hook: [first spoken words]"
  }
]

Rules:
- Each visualPrompt must be specific and cinematic (not generic)
- cameraMove options: slow zoom in, pan left, pan right, push forward, tilt up, static wide
- First scene: attention-grabbing hook visual
- Last scene: CTA-appropriate visual
- Total scene durations must sum to exactly ${totalDuration}
`;

  try {
    const res = await fetch(`${AI_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_KEY}` },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: "You are a video director. Return only valid JSON arrays. No markdown." },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });

    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? "[]";
    const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const scenes = JSON.parse(clean) as VideoScene[];
    return scenes.slice(0, sceneCount);
  } catch {
    return Array.from({ length: sceneCount }, (_, i) => ({
      sceneNumber: i + 1,
      durationSec: Math.round(totalDuration / sceneCount),
      visualPrompt: `Professional ${req.niche} content: ${req.topic}, scene ${i + 1}, cinematic quality`,
      cameraMove: "slow zoom in",
    }));
  }
}

// ── Fal.ai video generation (OpenMontage pattern) ─────────────────────

async function generateClip(
  scene: VideoScene,
  modelPath: string,
  aspectRatio: string,
): Promise<string | null> {
  if (!FAL_KEY) return null;

  const payload: Record<string, unknown> = {
    prompt: `${scene.visualPrompt}. Camera: ${scene.cameraMove}. Duration: ${scene.durationSec} seconds.`,
    duration: String(Math.min(scene.durationSec, 10)), // Seedance max 15s, Kling max 10s
    aspect_ratio: aspectRatio,
    generate_audio: false, // add audio in post if needed
  };

  try {
    // Submit to queue (async — matches OpenMontage pattern exactly)
    const submitRes = await fetch(`https://queue.fal.run/${modelPath}`, {
      method: "POST",
      headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!submitRes.ok) {
      console.warn(`[video-workflow] Fal.ai submit failed ${submitRes.status} for scene ${scene.sceneNumber}`);
      return null;
    }

    const queue = await submitRes.json() as { status_url: string; response_url: string };

    // Poll until completed (same pattern as OpenMontage seedance_video.py)
    const maxAttempts = 60; // 5 minutes max
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, 5000)); // poll every 5s

      const statusRes = await fetch(queue.status_url, {
        headers: { Authorization: `Key ${FAL_KEY}` },
      });

      const status = await statusRes.json() as { status: string };

      if (status.status === "COMPLETED") {
        const resultRes = await fetch(queue.response_url, {
          headers: { Authorization: `Key ${FAL_KEY}` },
        });
        const result = await resultRes.json() as { video?: { url: string } };
        return result.video?.url ?? null;
      }

      if (status.status === "FAILED" || status.status === "CANCELLED") {
        console.warn(`[video-workflow] Scene ${scene.sceneNumber} generation ${status.status}`);
        return null;
      }
    }

    console.warn(`[video-workflow] Scene ${scene.sceneNumber} timed out`);
    return null;
  } catch (err) {
    console.warn(`[video-workflow] Scene ${scene.sceneNumber} error:`, err);
    return null;
  }
}

// ── FFmpeg stitch (OpenMontage video_stitch.py pattern) ───────────────

async function stitchClips(clipUrls: string[], outputPath: string): Promise<boolean> {
  if (clipUrls.length === 0) return false;
  if (clipUrls.length === 1) {
    // Single clip — just download it
    try {
      const res = await fetch(clipUrls[0]!);
      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(outputPath, buffer);
      return true;
    } catch {
      return false;
    }
  }

  const tmpDir = path.join(os.tmpdir(), `video_stitch_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // Download all clips
    const clipPaths: string[] = [];
    for (let i = 0; i < clipUrls.length; i++) {
      const clipPath = path.join(tmpDir, `clip_${String(i).padStart(4, "0")}.mp4`);
      const res = await fetch(clipUrls[i]!);
      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(clipPath, buffer);
      clipPaths.push(clipPath);
    }

    // Write ffmpeg concat list (OpenMontage _stitch_cut pattern)
    const concatListPath = path.join(tmpDir, "concat_list.txt");
    const concatContent = clipPaths
      .map(p => `file '${p.replace(/'/g, "\\'")}'`)
      .join("\n");
    fs.writeFileSync(concatListPath, concatContent);

    // Run ffmpeg concat (no re-encode — fast copy, same as OpenMontage concat demuxer)
    await execAsync(
      `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${outputPath}"`,
    );

    return fs.existsSync(outputPath);
  } catch (err) {
    console.warn("[video-workflow] ffmpeg stitch failed:", err);
    // Try normalize + stitch if direct copy fails
    try {
      const clipPaths = clipUrls.map((_, i) => path.join(tmpDir, `clip_${String(i).padStart(4, "0")}.mp4`));
      const normalizedPaths: string[] = [];

      for (let i = 0; i < clipPaths.length; i++) {
        if (!fs.existsSync(clipPaths[i]!)) continue;
        const normPath = path.join(tmpDir, `norm_${String(i).padStart(4, "0")}.mp4`);
        await execAsync(
          `ffmpeg -y -i "${clipPaths[i]}" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -crf 23 -preset medium -pix_fmt yuv420p -r 30 "${normPath}"`
        );
        normalizedPaths.push(normPath);
      }

      const normConcatPath = path.join(tmpDir, "norm_concat_list.txt");
      fs.writeFileSync(normConcatPath, normalizedPaths.map(p => `file '${p}'`).join("\n"));
      await execAsync(`ffmpeg -y -f concat -safe 0 -i "${normConcatPath}" -c copy "${outputPath}"`);
      return fs.existsSync(outputPath);
    } catch {
      return false;
    }
  } finally {
    // Clean up temp dir
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// ── Main export ────────────────────────────────────────────────────────

export async function generateVideo(req: VideoRequest): Promise<VideoResult> {
  const model = req.model ?? "seedance";
  const modelPath = VIDEO_MODELS[model] ?? VIDEO_MODELS.seedance;
  const aspectRatio = req.aspectRatio ?? "9:16";
  const totalDuration = req.totalDuration ?? 30;

  const cacheKey = `video:${req.niche}:${req.topic}:${totalDuration}:${aspectRatio}:${model}`;
  const cached = promptCache.get<VideoResult>(cacheKey);
  if (cached) return cached;

  console.log(`[video-workflow] Starting video generation: "${req.topic}" — ${model}`);

  // Step 1: Scene breakdown
  const scenes = await generateSceneBreakdown(req);
  console.log(`[video-workflow] ${scenes.length} scenes planned`);

  if (!FAL_KEY) {
    return {
      outputUrl: null,
      clipUrls: [],
      scenes,
      thumbnailUrl: null,
      duration: totalDuration,
      model: modelPath,
      generatedAt: new Date().toISOString(),
      error: "FAL_KEY not configured — set FAL_KEY to enable video generation",
    };
  }

  // Step 2: Generate clips in sequence (avoid rate limits)
  const clipUrls: string[] = [];
  for (const scene of scenes) {
    const url = await generateClip(scene, modelPath, aspectRatio);
    if (url) clipUrls.push(url);
    else console.warn(`[video-workflow] Scene ${scene.sceneNumber} failed — skipping`);
  }

  if (clipUrls.length === 0) {
    return {
      outputUrl: null,
      clipUrls: [],
      scenes,
      thumbnailUrl: null,
      duration: totalDuration,
      model: modelPath,
      generatedAt: new Date().toISOString(),
      error: "All scene generations failed",
    };
  }

  // Step 3: Stitch clips with ffmpeg
  const outputPath = path.join(os.tmpdir(), `video_${Date.now()}.mp4`);
  const stitched = await stitchClips(clipUrls, outputPath);

  // Step 4: Generate thumbnail via FLUX (first scene visual)
  let thumbnailUrl: string | null = null;
  const FLUX_KEY = process.env.FAL_KEY;
  if (FLUX_KEY && scenes[0]) {
    try {
      const thumbRes = await fetch("https://fal.run/fal-ai/flux-pro/v2", {
        method: "POST",
        headers: { Authorization: `Key ${FLUX_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `${scenes[0].visualPrompt}, thumbnail quality, highly detailed`,
          image_size: aspectRatio === "9:16" ? "portrait_16_9" : "landscape_16_9",
          num_inference_steps: 20,
        }),
      });
      if (thumbRes.ok) {
        const thumbData = await thumbRes.json() as { images?: Array<{ url?: string }> };
        thumbnailUrl = thumbData.images?.[0]?.url ?? null;
      }
    } catch { /* thumbnail is optional */ }
  }

  const result: VideoResult = {
    outputUrl: stitched ? outputPath : clipUrls[0] ?? null,
    clipUrls,
    scenes,
    thumbnailUrl,
    duration: totalDuration,
    model: modelPath,
    generatedAt: new Date().toISOString(),
  };

  if (stitched) {
    promptCache.set(cacheKey, result, "video_script");
  }

  console.log(`[video-workflow] Done — ${clipUrls.length}/${scenes.length} clips, output: ${result.outputUrl}`);
  return result;
}
