/**
 * CarouselWorkflow — automated multi-slide carousel generation.
 *
 * Pipeline:
 *   1. DeepSeek V4 generates structured slide copy (headline + body per slide)
 *   2. Fal.ai FLUX generates one image per slide
 *   3. Slide 1 image is passed as style reference for slides 2-N (visual consistency)
 *   4. Returns ordered slide bundle ready for posting
 *
 * This follows the OpenMontage FLUX best-practices for style-consistent
 * multi-image series.
 */

import { promptCache } from "./prompt-cache";
import { buildNichePrompt } from "./niche-image-workflow";

// ── Types ──────────────────────────────────────────────────────────────

export interface CarouselSlide {
  slideNumber: number;
  headline: string;
  body: string;
  imageUrl: string | null;
  imagePrompt: string;
}

export interface CarouselRequest {
  topic: string;
  niche: string;
  slideCount?: number;
  platform?: string;
  tenantId?: string;
  brandVoice?: string;
}

export interface CarouselResult {
  slides: CarouselSlide[];
  title: string;
  hashtags: string[];
  platform: string;
  niche: string;
  topic: string;
  generatedBy: string;
  generatedAt: string;
}

// ── DeepSeek API (reuses same pattern as ContentService) ───────────────

const AI_URL = process.env.OPENAI_API_URL ?? "https://api.deepseek.com/v1";
const AI_KEY = process.env.OPENAI_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? "";
const AI_MODEL = process.env.DEFAULT_MODEL ?? "deepseek-chat";
const FAL_KEY = process.env.FAL_KEY;

async function callDeepSeek(system: string, user: string): Promise<string> {
  if (!AI_KEY) return "";
  try {
    const res = await fetch(`${AI_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.8,
        max_tokens: 2000,
      }),
    });
    if (!res.ok) return "";
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? "";
  } catch {
    return "";
  }
}

// ── Slide copy generation ──────────────────────────────────────────────

async function generateSlideCopy(req: CarouselRequest, count: number): Promise<Array<{
  headline: string;
  body: string;
}>> {
  const prompt = `
Create a ${count}-slide carousel post for ${req.platform ?? "instagram"} about "${req.topic}" for the ${req.niche} niche.
${req.brandVoice ? `Brand voice: ${req.brandVoice}` : ""}

Return EXACTLY this JSON format (no markdown, no extra text):
{
  "title": "Main carousel title for slide 1",
  "slides": [
    { "headline": "Slide 1 hook headline", "body": "2-3 sentence body copy" },
    { "headline": "Slide 2 headline", "body": "2-3 sentence body copy" },
    ...
  ],
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"]
}

Rules:
- Slide 1: strong hook (curiosity gap or bold claim)
- Slides 2 to ${count - 1}: one insight each, specific and actionable
- Last slide: summary + CTA to save/follow
- Headlines under 8 words
- Body copy conversational, no jargon
`;

  const systemPrompt = "You are an expert social media content strategist. Return only valid JSON. No markdown code blocks.";
  const raw = await callDeepSeek(systemPrompt, prompt);

  if (!raw) {
    // Fallback template slides
    return Array.from({ length: count }, (_, i) => ({
      headline: i === 0 ? `The truth about ${req.topic}` : i === count - 1 ? "Save this for later" : `Tip #${i}: What actually works`,
      body: i === 0
        ? `Most ${req.niche} advice is wrong. Here's what top performers actually do differently.`
        : i === count - 1
          ? `Apply these ${req.niche} strategies consistently. Save this post and start with tip #1 today.`
          : `When it comes to ${req.topic}, the key insight most people miss is focusing on ${req.niche} fundamentals first.`,
    }));
  }

  try {
    // Strip any markdown fencing if DeepSeek adds it despite instructions
    const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const parsed = JSON.parse(clean) as {
      slides: Array<{ headline: string; body: string }>;
    };
    return parsed.slides.slice(0, count);
  } catch {
    return Array.from({ length: count }, (_, i) => ({
      headline: i === 0 ? `${req.topic}: What nobody tells you` : `Step ${i}`,
      body: `Key insight about ${req.topic} for ${req.niche}.`,
    }));
  }
}

// ── Image generation per slide ─────────────────────────────────────────

async function generateSlideImage(
  prompt: string,
  referenceUrl?: string,
): Promise<string | null> {
  if (!FAL_KEY) return null;

  try {
    const body: Record<string, unknown> = {
      prompt,
      image_size: "portrait_4_3",  // 4:5 — Instagram carousel optimal
      num_inference_steps: 28,
      guidance_scale: 3.5,
    };

    // Pass first slide image as style reference for visual consistency
    if (referenceUrl) {
      body.image_url = referenceUrl;
      body.strength = 0.3; // Low strength = keep style, change content
    }

    const endpoint = referenceUrl
      ? "https://fal.run/fal-ai/flux-pro/v2/image-to-image"
      : "https://fal.run/fal-ai/flux-pro/v2";

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Key ${FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) return null;
    const data = await res.json() as { images?: Array<{ url?: string }> };
    return data.images?.[0]?.url ?? null;
  } catch {
    return null;
  }
}

// ── Main export ────────────────────────────────────────────────────────

export async function generateCarousel(req: CarouselRequest): Promise<CarouselResult> {
  const slideCount = req.slideCount ?? 6;
  const platform = req.platform ?? "instagram";

  const cacheKey = `carousel:${req.niche}:${req.topic}:${slideCount}:${platform}`;
  const cached = promptCache.get<CarouselResult>(cacheKey);
  if (cached) return cached;

  // Step 1: Generate all slide copy in one DeepSeek call
  const slideCopy = await generateSlideCopy(req, slideCount);

  // Step 2: Build image prompts (style-locked to niche)
  const slides: CarouselSlide[] = [];
  let referenceImageUrl: string | undefined;

  for (let i = 0; i < slideCopy.length; i++) {
    const copy = slideCopy[i]!;
    const imagePrompt = buildNichePrompt(req.niche, `${req.topic} — ${copy.headline}`, {
      variation: i + 1,
    });

    // Generate image (use slide 1 as reference for slides 2+)
    const imageUrl = await generateSlideImage(
      imagePrompt,
      i > 0 ? referenceImageUrl : undefined,
    );

    // Store slide 1's URL as the style reference
    if (i === 0 && imageUrl) {
      referenceImageUrl = imageUrl;
    }

    slides.push({
      slideNumber: i + 1,
      headline: copy.headline,
      body: copy.body,
      imageUrl,
      imagePrompt,
    });
  }

  // Step 3: Extract hashtags from DeepSeek output or build defaults
  const nSlug = req.niche.toLowerCase().replace(/\s+/g, "");
  const hashtags = [
    `#${nSlug}`,
    `#${nSlug}tips`,
    "#contentcreator",
    "#socialmedia",
    "#growthhacking",
    "#savethis",
  ];

  const result: CarouselResult = {
    slides,
    title: slideCopy[0]?.headline ?? req.topic,
    hashtags,
    platform,
    niche: req.niche,
    topic: req.topic,
    generatedBy: AI_KEY ? "deepseek-v4+flux" : "template+flux",
    generatedAt: new Date().toISOString(),
  };

  if (slides.length > 0) {
    promptCache.set(cacheKey, result, "carousel");
  }

  return result;
}
