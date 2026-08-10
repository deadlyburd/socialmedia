/**
 * ContentService — content generation, Supabase persistence, lifecycle.
 */

import { dbInsert, dbQuery, dbUpdate } from "../db/adapter";
import { persistContentMedia } from "./r2-storage";
import type {
  ContentItem,
  ContentSEO,
  ContentStatus,
  GenerateContentRequest,
  GenerateContentResult,
  PaginationParams,
  SocialVariant,
} from "../types";

// ── DeepSeek API ──────────────────────────────────────────────────────

const AI_URL = process.env.OPENAI_API_URL ?? "https://api.deepseek.com/v1";
const AI_KEY = process.env.OPENAI_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? "";
const AI_MODEL = process.env.DEFAULT_MODEL ?? "deepseek-chat";

async function callDeepSeek(system: string, prompt: string): Promise<string> {
  if (!AI_KEY) {
    // No API key — generate useful template content instead of raw prompt
    return generateTemplateContent(prompt);
  }
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
          { role: "user", content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 2000,
      }),
    });
    if (!res.ok) return generateTemplateContent(prompt);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const result = data.choices?.[0]?.message?.content;
    return result && result.length > 50 ? result : generateTemplateContent(prompt);
  } catch {
    return generateTemplateContent(prompt);
  }
}

/** Generate useful template content when AI is unavailable (no API key or error). */
function generateTemplateContent(prompt: string): string {
  // Extract topic and type from the prompt
  const topicMatch = prompt.match(/Topic:\s*(.+)/);
  const topic = topicMatch?.[1]?.trim() ?? "your business";
  const typeMatch = prompt.match(/Create\s+(\w+)\s+content/);
  const contentType = typeMatch?.[1]?.toLowerCase() ?? "post";
  const platformMatch = prompt.match(/for\s+(\w+)/);
  const platform = platformMatch?.[1]?.toLowerCase() ?? "social media";
  const categoryMatch = prompt.match(/Category:\s*(.+)/);
  const category = categoryMatch?.[1]?.split(" ")[0]?.toLowerCase() ?? "educational";

  if (contentType === "blog") {
    return [
      `TITLE: The Ultimate Guide to ${topic} in 2026`,
      "",
      `HOOK: Did you know that most businesses get ${topic} completely wrong? Here's what actually works.`,
      "",
      `BODY:`,
      `## Why ${topic} Matters Now More Than Ever`,
      `The landscape of ${topic} has shifted dramatically. What worked last year won't cut it anymore. Smart businesses are adapting — and the ones who adapt first win the biggest.`,
      "",
      `## The 3 Biggest ${topic} Mistakes (And How To Avoid Them)`,
      `1. **Relying on outdated strategies** — The old playbook is dead. Here's the new one: focus on authenticity over perfection, consistency over virality, and value over promotion.`,
      `2. **Ignoring platform-specific formats** — What works on ${platform} doesn't work elsewhere. Each platform has its own language. Learn it.`,
      `3. **Posting without a strategy** — Random posting is worse than not posting at all. Every piece of content should ladder up to a goal.`,
      "",
      `## Your 30-Day ${topic} Action Plan`,
      `- Week 1: Audit your current presence and identify gaps`,
      `- Week 2: Batch-create 2 weeks of content using proven templates`,
      `- Week 3: Engage daily and analyze what resonates`,
      `- Week 4: Double down on winners, cut the rest`,
      "",
      `## FAQ`,
      `**Q: How often should I post about ${topic}?**`,
      `A: Start with 3-5x per week per platform. Consistency beats frequency.`,
      `**Q: What's the best format for ${topic} on ${platform}?**`,
      `A: Carousels and short-form video consistently outperform static posts.`,
      "",
      `EXCERPT: The complete playbook for ${topic} — from strategy to execution. Stop guessing and start growing with this step-by-step guide.`,
    ].join("\n");
  }

  if (contentType === "carousel") {
    return [
      `TITLE: ${topic}: What Nobody Tells You`,
      "",
      `HOOK: I wish I knew this before getting into ${topic}.`,
      "",
      `SLIDE 1: The Problem Everyone Ignores`,
      `Most advice about ${topic} is recycled from people who've never actually done it. Here's the unfiltered truth.`,
      "",
      `SLIDE 2: The Real Numbers`,
      `The top 1% of ${topic} content gets 90% of the engagement. The secret? They all follow the same 3 patterns.`,
      "",
      `SLIDE 3: Pattern #1 - The Hook`,
      `Your first 1.5 seconds determine everything. Open with curiosity, controversy, or relatability — never with introduction.`,
      "",
      `SLIDE 4: Pattern #2 - The Structure`,
      `Problem → Agitation → Solution → Proof → CTA. This 5-step framework converts viewers into followers and followers into customers.`,
      "",
      `SLIDE 5: Pattern #3 - The Visual`,
      `Clean composition, one focal point, text that's readable on mobile. No clutter. No corporate stock photos.`,
      "",
      `SLIDE 6: Your ${topic} Action Plan`,
      `1. Batch 10 carousels using this exact structure`,
      `2. Post 3x/week on ${platform}`,
      `3. Track saves (not likes) — saves = people bookmarking your value`,
      `4. Double down on what gets saved`,
      "",
      `HASHTAGS: #${topic.replace(/\s+/g, "").toLowerCase()} #${platform}Tips #ContentStrategy #SocialMediaGrowth #SmallBusinessTips`,
    ].join("\n");
  }

  // Default: reel / short-form
  return [
    `HOOK: Stop scrolling — this ${topic} tip changes everything.`,
    "",
    `BODY:`,
    `Here's the thing about ${topic} that nobody talks about: it's not about being perfect. It's about being consistent.`,
    "",
    `The businesses winning on ${platform} right now aren't the ones with the biggest budgets. They're the ones showing up every single day with value.`,
    "",
    `Whether you're just starting or you've been at this for years, the formula is the same:`,
    `1. Hook them in 1.5 seconds`,
    `2. Deliver value immediately`,
    `3. End with a reason to come back`,
    "",
    `That's it. No secret sauce. Just execution.`,
    "",
    `CTA: Save this for your next ${topic} post. Follow for more no-BS ${category} content.`,
    "",
    `HASHTAGS: #${topic.replace(/\s+/g, "").toLowerCase()} #${platform}Growth #ContentCreator #MarketingTips #BusinessGrowth`,
  ].join("\n");
}

// ── Service ────────────────────────────────────────────────────────────

export class ContentService {
  private content: Map<string, ContentItem> = new Map();
  private loaded = false;

  /** Load existing content from Supabase. Called after env is available. */
  async loadFromDB(): Promise<void> {
    if (this.loaded && this.content.size > 0) return;
    try {
      const rows = await dbQuery<{
        id: string;
        tenant_id: string;
        type: string;
        title: string;
        body: string;
        excerpt: string;
        platform: string;
        category: string;
        status: string;
        featured_product_ids_json: string;
        image_urls_json: string;
        seo_json: string | null;
        scheduled_at: string | null;
        published_at: string | null;
        created_at: string;
        generated_by: string;
      }>("content_items", undefined, "-created_at");

      for (const r of rows) {
        let featuredProductIds: string[] = [];
        let imageUrls: string[] = [];
        let seo = null;
        try {
          featuredProductIds = JSON.parse(r.featured_product_ids_json ?? "[]");
        } catch {
          /* ignore */
        }
        try {
          imageUrls = JSON.parse(r.image_urls_json ?? "[]");
        } catch {
          /* ignore */
        }
        try {
          if (r.seo_json) seo = JSON.parse(r.seo_json);
        } catch {
          /* ignore */
        }

        const item: ContentItem = {
          id: r.id,
          tenantId: r.tenant_id,
          type: r.type as ContentItem["type"],
          title: r.title,
          body: r.body,
          excerpt: r.excerpt,
          platform: r.platform,
          category: r.category as ContentItem["category"],
          status: r.status as ContentStatus,
          featuredProductIds,
          imageUrls,
          seo,
          scheduledAt: r.scheduled_at,
          publishedAt: r.published_at,
          createdAt: r.created_at,
          generatedBy: r.generated_by,
        };
        this.content.set(r.id, item);
      }
      console.log(
        `[saas-core] Loaded ${rows.length} content items from Supabase`,
      );
    } catch (e: any) {
      console.log(
        "[saas-core] Could not load content from Supabase:",
        e?.message ?? e,
      );
    }
    this.loaded = true;
  }

  /** Generate content using DeepSeek AI (falls back to templates if API key missing). */
  async generateContent(
    request: GenerateContentRequest,
  ): Promise<GenerateContentResult> {
    const now = new Date().toISOString();
    const contentId = `content_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Real AI generation
    const systemPrompt = `You are a professional social media content strategist. Write engaging, scroll-stopping content that sounds human — never corporate or AI-like. Use short sentences. No emoji overload. Match the requested format exactly.`;

    const userPrompt = this.buildAIPrompt(request);
    const aiResponse = await callDeepSeek(systemPrompt, userPrompt);

    // Parse AI response into components
    const { title, body, hook, hashtags } = this.parseAIResponse(
      aiResponse,
      request,
    );

    const seo = this.buildSEO(request);
    const excerpt = `${body.slice(0, 200).replace(/\n/g, " ").trim()}...`;

    // Generate images if Fal.ai is configured (fire-and-forget, won't block)
    const imageUrls: string[] = [];
    if (request.includeImages !== false && process.env.FAL_KEY) {
      try {
        const imgResult = await generateImages(request, hook);
        // Persist to R2 for permanent URLs (Fal.ai URLs expire)
        const permanentUrls = await persistContentMedia(
          imgResult,
          request.tenantId,
          contentId,
          "image",
        );
        imageUrls.push(...permanentUrls);
      } catch {
        /* image gen failed — continue without images */
      }
    }

    const content: ContentItem = {
      id: contentId,
      tenantId: request.tenantId,
      type: request.type,
      title,
      body,
      excerpt,
      platform: request.platform,
      category: request.category,
      status: "ai_generated",
      featuredProductIds: request.featuredProductIds ?? [],
      imageUrls,
      seo,
      scheduledAt: null,
      publishedAt: null,
      createdAt: now,
      generatedBy: AI_KEY ? "deepseek-v4" : "template",
    };

    // Persist to memory + Supabase
    this.content.set(contentId, content);
    this.persistToDB(content);

    const socialVariants = this.generateSocialVariants(content, request);

    return { content, images: [], seo, socialVariants };
  }

  getContent(id: string): ContentItem | undefined {
    return this.content.get(id);
  }

  /**
   * Direct seed from Supabase JS client data.
   * Used by initUserStore() to populate the in-memory cache without going
   * through the REST adapter (which may fail on Vercel cold starts).
   */
  seedContent(raw: Record<string, unknown>): ContentItem {
    const id = raw.id as string;
    if (this.content.has(id)) return this.content.get(id)!;

    let featuredProductIds: string[] = [];
    let imageUrls: string[] = [];
    let seo = null;
    try { featuredProductIds = JSON.parse((raw.featured_product_ids_json as string) ?? "[]"); } catch { /* ignore */ }
    try { imageUrls = JSON.parse((raw.image_urls_json as string) ?? "[]"); } catch { /* ignore */ }
    try { if (raw.seo_json) seo = JSON.parse(raw.seo_json as string); } catch { /* ignore */ }

    const item: ContentItem = {
      id,
      tenantId: (raw.tenant_id as string) ?? "",
      type: (raw.type as ContentItem["type"]) ?? "feed_post",
      title: (raw.title as string) ?? "Untitled",
      body: (raw.body as string) ?? "",
      excerpt: (raw.excerpt as string) ?? "",
      platform: (raw.platform as string) ?? "instagram",
      category: (raw.category as ContentItem["category"]) ?? "educational",
      status: (raw.status as ContentStatus) ?? "draft",
      featuredProductIds,
      imageUrls,
      seo,
      scheduledAt: (raw.scheduled_at as string) ?? null,
      publishedAt: (raw.published_at as string) ?? null,
      createdAt: (raw.created_at as string) ?? new Date().toISOString(),
      generatedBy: (raw.generated_by as string) ?? "template",
    };
    this.content.set(id, item);
    return item;
  }

  async listContent(
    tenantId: string,
    filter?: {
      status?: ContentStatus | undefined;
      type?: string | undefined;
      platform?: string | undefined;
    },
    pagination?: PaginationParams,
  ): Promise<ContentItem[]> {
    // Auto-load from DB if memory is empty (handles server restarts)
    if (this.content.size === 0) {
      await this.loadFromDB();
    }

    let results = [...this.content.values()].filter(
      (c) => c.tenantId === tenantId,
    );
    if (filter?.status)
      results = results.filter((c) => c.status === filter.status);
    if (filter?.type) results = results.filter((c) => c.type === filter.type);
    if (filter?.platform)
      results = results.filter((c) => c.platform === filter.platform);
    results.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;
    const start = (page - 1) * limit;
    return results.slice(start, start + limit);
  }

  updateStatus(id: string, status: ContentStatus): ContentItem | null {
    const item = this.content.get(id);
    if (!item) return null;
    item.status = status;
    if (status === "published") item.publishedAt = new Date().toISOString();
    if (status === "scheduled" && !item.scheduledAt)
      item.scheduledAt = new Date(Date.now() + 3600000).toISOString();
    // Persist status change
    dbUpdate("content_items", id, {
      status,
      ...(item.publishedAt ? { published_at: item.publishedAt } : {}),
      ...(item.scheduledAt ? { scheduled_at: item.scheduledAt } : {}),
    }).catch(() => {});
    return { ...item };
  }

  scheduleContent(id: string, scheduledAt: string): ContentItem | null {
    const item = this.content.get(id);
    if (!item) return null;
    item.scheduledAt = scheduledAt;
    item.status = "scheduled";
    dbUpdate("content_items", id, {
      scheduled_at: scheduledAt,
      status: "scheduled",
    }).catch(() => {});
    return { ...item };
  }

  getContentCount(tenantId: string): number {
    return [...this.content.values()].filter((c) => c.tenantId === tenantId)
      .length;
  }

  deleteContent(id: string): boolean {
    this.content.delete(id);
    return true;
  }

  // ── Private ──────────────────────────────────────────────────────────

  private buildAIPrompt(request: GenerateContentRequest): string {
    const lines: string[] = [];
    lines.push(`Create ${request.type} content for ${request.platform}.`);
    lines.push(`Topic: ${request.topic}`);
    lines.push(
      `Category: ${request.category} (inspirational = emotional/story, educational = tips/facts, promotional = offer/CTA)`,
    );
    lines.push(`Length: ${request.length ?? "medium"}`);
    if (request.tone) lines.push(`Tone: ${request.tone}`);
    lines.push("");

    if (request.type === "blog") {
      lines.push("Format:");
      lines.push("TITLE: [SEO-optimized title under 60 chars]");
      lines.push(
        "BODY: [Full blog post with H2 subheadings, numbered steps, FAQ section]",
      );
      lines.push("EXCERPT: [2-sentence summary for previews]");
      lines.push("HOOK: [Scroll-stopping first line for social sharing]");
    } else if (request.type === "reel" || request.type === "tiktok") {
      lines.push("Format:");
      lines.push("HOOK: [First 1.5 seconds — curiosity gap or POV]");
      lines.push("BODY: [3-5 key points, one per line, fast-paced]");
      lines.push("CTA: [Follow/Comment/Save call-to-action]");
      lines.push("HASHTAGS: [5-7 relevant hashtags]");
    } else if (request.type === "carousel") {
      lines.push("Format:");
      lines.push("TITLE: [Carousel title for slide 1]");
      lines.push("SLIDE 1: [Hook — state the problem]");
      lines.push("SLIDES 2-5: [One insight each with specific data]");
      lines.push("SLIDE 6: [Summary + CTA to save]");
      lines.push("HASHTAGS: [5-7 relevant hashtags]");
    } else {
      lines.push("Format: TITLE + BODY + HASHTAGS");
    }

    return lines.join("\n");
  }

  private parseAIResponse(
    aiText: string,
    request: GenerateContentRequest,
  ): {
    title: string;
    body: string;
    hook: string;
    hashtags: string[];
  } {
    let title = request.topic;
    let body = aiText;
    let hook = "";
    const hashtags: string[] = [];

    // Try to extract structured parts from AI response
    const titleMatch = aiText.match(/(?:TITLE|Title):\s*(.+)/);
    if (titleMatch) title = titleMatch[1]?.trim();

    const hookMatch = aiText.match(/(?:HOOK|Hook):\s*(.+)/);
    if (hookMatch) hook = hookMatch[1]?.trim();

    const hashtagMatch = aiText.match(/(?:HASHTAGS|Hashtags):\s*(.+)/);
    if (hashtagMatch) {
      const raw = hashtagMatch[1]!;
      const found = raw.match(/#[\w-]+/g);
      if (found) hashtags.push(...found);
    }

    // Clean body: remove parsed labels
    body = body
      .replace(/^(?:TITLE|HOOK|BODY|CTA|HASHTAGS|SLIDE \d|EXCERPT):\s*.+/gm, "")
      .trim();
    if (!body || body.length < 20) body = aiText; // fallback to full response

    return { title, body, hook: hook || title, hashtags };
  }

  private buildSEO(request: GenerateContentRequest): ContentSEO {
    const slug = request.topic
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60);
    return {
      metaTitle: request.topic.slice(0, 60),
      metaDescription: `Complete guide to ${request.topic}. Expert tips and everything you need to know. Updated for 2026.`,
      slug,
      keywords: request.seoKeywords ?? request.topic.split(" ").slice(0, 8),
    };
  }

  private generateSocialVariants(
    content: ContentItem,
    request: GenerateContentRequest,
  ): SocialVariant[] {
    return [
      {
        platform: "instagram",
        format: "carousel",
        caption: `${content.excerpt}\n\nSave this for later! 📌\n\n${this.getHashtags(request).join(" ")}`,
        hashtags: this.getHashtags(request),
        imagePrompt: `Photorealistic shot of ${request.topic}, golden hour, high engagement visual`,
      },
      {
        platform: "tiktok",
        format: "reel",
        caption: `${content.title} 🤯\n\n#fyp #viral`,
        hashtags: ["#fyp", "#viral", ...this.getHashtags(request).slice(0, 5)],
        imagePrompt: "",
      },
      {
        platform: "pinterest",
        format: "pin",
        caption: `${content.title} — Complete Guide. Save this for your planning board. 📌`,
        hashtags: this.getHashtags(request).slice(0, 5),
        imagePrompt: `Vertical pin: ${request.topic}, clean infographic style`,
      },
    ];
  }

  private getHashtags(request: GenerateContentRequest): string[] {
    const hashtags = ((request as any).hashtags as string[]) ?? [];
    if (hashtags.length > 0) return hashtags;
    const topic = request.topic.toLowerCase().replace(/\s+/g, "");
    return [`#${topic}`, "#tips", "#guide", "#trending"];
  }

  private async persistToDB(item: ContentItem): Promise<void> {
    try {
      const result = await dbInsert("content_items", {
        id: item.id,
        tenant_id: item.tenantId,
        type: item.type,
        title: item.title,
        body: item.body,
        excerpt: item.excerpt,
        platform: item.platform,
        category: item.category,
        status: item.status,
        featured_product_ids_json: JSON.stringify(item.featuredProductIds),
        image_urls_json: JSON.stringify(item.imageUrls),
        seo_json: item.seo ? JSON.stringify(item.seo) : null,
        scheduled_at: item.scheduledAt,
        published_at: item.publishedAt,
        created_at: item.createdAt,
        generated_by: item.generatedBy,
      });
      if (!result)
        console.log(
          "[saas-core] Content DB insert returned false for",
          item.id,
        );
    } catch (e: any) {
      console.log("[saas-core] Content DB insert failed:", e?.message ?? e);
    }
  }
}

// ── Image Generation (Fal.ai FLUX) ──────────────────────────────────

async function generateImages(
  request: GenerateContentRequest,
  hook: string,
): Promise<string[]> {
  const FAL_KEY = process.env.FAL_KEY;
  if (!FAL_KEY) return [];

  const prompt = `High quality photorealistic image for social media: ${request.topic}. ${hook}. Style: professional, warm lighting, scroll-stopping composition. Platform: ${request.platform}. No text overlay.`;
  const count = request.type === "carousel" ? 3 : 1;

  const urls: string[] = [];
  for (let i = 0; i < count; i++) {
    try {
      const res = await fetch("https://fal.run/fal-ai/flux-pro/v2", {
        method: "POST",
        headers: {
          Authorization: `Key ${FAL_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: `${prompt} (variation ${i + 1})`,
          image_size:
            request.platform === "pinterest" ? "square_hd" : "landscape_16_9",
          num_inference_steps: 28,
        }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { images?: Array<{ url?: string }> };
      const url = data.images?.[0]?.url;
      if (url) urls.push(url);
    } catch {
      /* skip failed image */
    }
  }
  return urls;
}

// Singleton
export const contentService = new ContentService();
export async function initContentStore(): Promise<void> {
  await contentService.loadFromDB();
}
