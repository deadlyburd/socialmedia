/**
 * NicheImageWorkflow — generates styled images per niche using Fal.ai FLUX.
 *
 * Each niche has its own prompt template tuned for that industry's aesthetic.
 * Used for feed posts, story covers, and carousel slide backgrounds.
 *
 * Integrates with OpenMontage's FLUX best-practices:
 *   - Subject-forward composition
 *   - Platform-appropriate aspect ratios
 *   - Style consistency via shared style suffix per niche
 */

import { promptCache } from "./prompt-cache";

// ── Niche prompt templates ─────────────────────────────────────────────

const NICHE_STYLE_TEMPLATES: Record<string, {
  stylePrefix: string;
  lightingStyle: string;
  colorPalette: string;
  composition: string;
}> = {
  fitness: {
    stylePrefix: "Cinematic fitness photography,",
    lightingStyle: "high-contrast gym lighting, dramatic shadows",
    colorPalette: "deep blacks, vibrant accent colors, energetic",
    composition: "strong focal point, motivational atmosphere, 4K quality",
  },
  travel: {
    stylePrefix: "Award-winning travel photography,",
    lightingStyle: "golden hour magic light, atmospheric glow",
    colorPalette: "warm vibrant tones, rich saturation",
    composition: "wide establishing shot, wanderlust-inspiring, National Geographic style",
  },
  restaurant: {
    stylePrefix: "Professional food photography,",
    lightingStyle: "soft natural diffused light, warm tones",
    colorPalette: "appetizing warm palette, fresh and clean",
    composition: "overhead or 45-degree angle, minimal clean background, editorial style",
  },
  "real-estate": {
    stylePrefix: "Architectural real estate photography,",
    lightingStyle: "twilight blue hour or bright natural interior light",
    colorPalette: "crisp whites, warm neutrals, premium feel",
    composition: "wide angle interior or exterior, HDR balanced exposure",
  },
  dental: {
    stylePrefix: "Clean professional dental/medical photography,",
    lightingStyle: "bright clean studio lighting, clinical yet warm",
    colorPalette: "whites, soft blues, trustworthy tones",
    composition: "clean background, professional confidence, smile-forward",
  },
  lifestyle: {
    stylePrefix: "Aspirational lifestyle photography,",
    lightingStyle: "soft natural window light, airy and bright",
    colorPalette: "pastel tones, minimal aesthetic, Instagram-perfect",
    composition: "flatlay or environmental portrait, curated details",
  },
  business: {
    stylePrefix: "Professional business photography,",
    lightingStyle: "corporate studio lighting or bright office environment",
    colorPalette: "navy, white, confident tones",
    composition: "clean headshot or workspace scene, authoritative yet approachable",
  },
  default: {
    stylePrefix: "High quality professional photography,",
    lightingStyle: "natural balanced lighting",
    colorPalette: "vibrant social-media-ready colors",
    composition: "scroll-stopping composition, platform-optimized",
  },
};

const ASPECT_RATIO_SIZES: Record<string, string> = {
  "1:1": "square_hd",
  "4:5": "portrait_4_3",
  "9:16": "portrait_16_9",
  "16:9": "landscape_16_9",
  "3:2": "landscape_4_3",
};

// ── Types ──────────────────────────────────────────────────────────────

export interface NicheImageRequest {
  niche: string;
  topic: string;
  count?: number;
  aspectRatio?: string;
  tenantId?: string;
  styleOverride?: string;
}

export interface NicheImageResult {
  imageUrls: string[];
  niche: string;
  topic: string;
  promptUsed: string;
  generatedBy: "flux" | "template";
  generatedAt: string;
}

// ── Main function ──────────────────────────────────────────────────────

export async function generateNicheImages(req: NicheImageRequest): Promise<NicheImageResult> {
  const FAL_KEY = process.env.FAL_KEY;
  const count = req.count ?? 1;
  const aspectRatio = req.aspectRatio ?? "1:1";
  const imageSize = ASPECT_RATIO_SIZES[aspectRatio] ?? "square_hd";

  const nicheKey = Object.keys(NICHE_STYLE_TEMPLATES).find(k =>
    req.niche.toLowerCase().includes(k)
  ) ?? "default";
  const style = NICHE_STYLE_TEMPLATES[nicheKey]!;

  const prompt = req.styleOverride ?? [
    style.stylePrefix,
    req.topic + ",",
    style.lightingStyle + ",",
    style.colorPalette + ",",
    style.composition + ",",
    "photorealistic, social media optimized, no text overlay",
  ].join(" ");

  // Check cache
  const cacheKey = `niche_image:${req.niche}:${req.topic}:${aspectRatio}:${count}`;
  const cached = promptCache.get<NicheImageResult>(cacheKey);
  if (cached) return cached;

  if (!FAL_KEY) {
    // Return placeholder result
    const result: NicheImageResult = {
      imageUrls: [],
      niche: req.niche,
      topic: req.topic,
      promptUsed: prompt,
      generatedBy: "template",
      generatedAt: new Date().toISOString(),
    };
    return result;
  }

  const imageUrls: string[] = [];

  for (let i = 0; i < count; i++) {
    try {
      const res = await fetch("https://fal.run/fal-ai/flux-pro/v2", {
        method: "POST",
        headers: {
          Authorization: `Key ${FAL_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: count > 1 ? `${prompt} (variation ${i + 1})` : prompt,
          image_size: imageSize,
          num_inference_steps: 28,
          guidance_scale: 3.5,
        }),
      });

      if (!res.ok) {
        console.warn(`[niche-image-workflow] Fal.ai returned ${res.status} for image ${i + 1}`);
        continue;
      }

      const data = await res.json() as { images?: Array<{ url?: string }> };
      const url = data.images?.[0]?.url;
      if (url) imageUrls.push(url);
    } catch (err) {
      console.warn(`[niche-image-workflow] Image ${i + 1} failed:`, err);
    }
  }

  const result: NicheImageResult = {
    imageUrls,
    niche: req.niche,
    topic: req.topic,
    promptUsed: prompt,
    generatedBy: "flux",
    generatedAt: new Date().toISOString(),
  };

  if (imageUrls.length > 0) {
    promptCache.set(cacheKey, result, "image_prompt");
  }

  return result;
}

/**
 * Build a FLUX prompt string for a given niche + topic.
 * Exported so other workflows (carousel, video thumbnail) can reuse the style logic.
 */
export function buildNichePrompt(niche: string, topic: string, options?: {
  stylePrefix?: string;
  variation?: number;
}): string {
  const nicheKey = Object.keys(NICHE_STYLE_TEMPLATES).find(k =>
    niche.toLowerCase().includes(k)
  ) ?? "default";
  const style = NICHE_STYLE_TEMPLATES[nicheKey]!;

  const parts = [
    options?.stylePrefix ?? style.stylePrefix,
    topic + ",",
    style.lightingStyle + ",",
    style.colorPalette + ",",
    style.composition,
  ];

  if (options?.variation && options.variation > 1) {
    parts.push(`(variation ${options.variation})`);
  }

  return parts.join(" ");
}
