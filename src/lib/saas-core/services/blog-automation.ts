/**
 * Blog Automation Service — E-E-A-T Optimized Pipeline v2
 *
 * Flow for each blog post:
 *   1. Research trending topics in the client's niche (Firecrawl)
 *   2. Search & scrape top-ranking competitor blogs
 *   3. AI analyzes competitors (strengths, gaps, structure, depth)
 *   4. Build competitive brief with unique angle
 *   5. Generate blog with E-E-A-T signals (experience, expertise, authority, trust)
 *   6. Humanization pass — remove AI-isms, inject natural language
 *   7. Quality validation — score against E-E-A-T criteria
 *   8. Push to client's website (WordPress / Webhook)
 *   9. Store in content_assets → appears on client calendar
 *
 * Triggered by: Vercel Cron Job OR on-demand API call
 *
 * E-E-A-T Strategy (per Google's March 2026 Core Update):
 *   - Experience: inject first-person perspective, specific data, "we tried X, Y happened"
 *   - Expertise: named author persona, domain-specific depth, proper citations
 *   - Authoritativeness: link to .gov/.edu sources, cite industry research
 *   - Trustworthiness: transparent about methods, no hype claims, accurate dates
 *   - Anti-AI signals: ban cliché phrases, require unique angles, add human quirks
 */

import { getAdminClient } from "@/lib/supabase/admin";

// ── Types ────────────────────────────────────────────────────────────

interface ClientBlogConfig {
  tenantId: string;
  niche: string;
  websiteUrl: string;
  websiteApiKey?: string;
  websiteType: "wordpress" | "webhook" | "custom";
  wordpressUrl?: string;
  blogTone?: string;
  targetKeywords?: string[];
  competitorUrls?: string[];
  authorName?: string;
  authorRole?: string;
  companyName?: string;
  webhookUrl?: string;
}

interface CompetitorBlog {
  url: string;
  title: string;
  headings: string[];
  wordCount: number;
  internalLinks: number;
  externalLinks: number;
  keyPoints: string[];
  strengths: string[];
  gaps: string[];
}

interface CompetitiveBrief {
  topic: string;
  competitors: CompetitorBlog[];
  recommendedStructure: string[];
  angle: string;
  keywordsToTarget: string[];
  sourcesToHyperlink: string[];
  experienceAngle: string;
}

interface GeneratedBlog {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  category: string;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
  qualityScore?: number;
  humanizationLog?: string[];
}

// ── AI-giveaway phrases to ban ──────────────────────────────────────

const BANNED_PHRASES = [
  "in today's fast-paced world",
  "in the ever-evolving landscape",
  "plays a pivotal role",
  "it is important to note",
  "as we navigate",
  "in conclusion",
  "it goes without saying",
  "a testament to",
  "game-changer",
  "unprecedented times",
  "in this digital age",
  "it is worth noting",
  "needless to say",
  "first and foremost",
  "last but not least",
];

// ── Helpers ─────────────────────────────────────────────────────────

function getAIKey(): { key: string; url: string } | null {
  const key = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  const url = process.env.OPENAI_API_URL ?? "https://api.deepseek.com/v1";
  return key ? { key, url } : null;
}

function log(msg: string) {
  console.log(`[blog-automation] ${msg}`);
}

async function callAI(
  prompt: string,
  jsonMode = false,
  maxTokens = 4000,
  temp = 0.7,
): Promise<string | null> {
  const ai = getAIKey();
  if (!ai) { log("No AI key configured"); return null; }

  const body: Record<string, any> = {
    model: process.env.DEFAULT_MODEL || "deepseek-chat",
    messages: [{ role: "user", content: prompt }],
    temperature: temp,
    max_tokens: maxTokens,
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  try {
    const res = await fetch(`${ai.url}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ai.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? null;
  } catch (e) {
    log(`AI call failed: ${e}`);
    return null;
  }
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

// ── Step 1: Research trending topics ─────────────────────────────────

async function fetchTrendingTopics(niche: string, config: ClientBlogConfig): Promise<string[]> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;

  if (firecrawlKey) {
    try {
      const res = await fetch("https://api.firecrawl.dev/v2/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `${niche} trending topics blog ideas ${new Date().getFullYear()}`,
          limit: 5,
          scrapeOptions: { formats: ["markdown"] },
        }),
      });
      const data = await res.json();
      if (data.data?.length) {
        return data.data
          .map((d: any) => d.title ?? d.markdown?.slice(0, 200))
          .filter(Boolean)
          .slice(0, 5);
      }
    } catch (e) {
      log(`Trend fetch failed: ${e}`);
    }
  }

  // Fallback topics with specificity
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "long" });
  const year = now.getFullYear();
  return [
    `${niche} trends and predictions for ${month} ${year} — what's actually working`,
    `How ${niche} businesses are adapting to changing customer expectations in ${year}`,
    `5 ${niche} strategies we tested this quarter — here's what the data shows`,
    `${niche} innovation roundup ${year}: what's new, what matters, what to ignore`,
    `Expert guide to ${niche} success: lessons from real client work`,
  ];
}

// ── Step 2: Scrape competitor blogs ────────────────────────────────

async function scrapeCompetitorBlogs(
  topic: string,
  config: ClientBlogConfig,
): Promise<CompetitorBlog[]> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  const competitors: CompetitorBlog[] = [];

  if (config.competitorUrls?.length) {
    for (const url of config.competitorUrls.slice(0, 2)) {
      const blog = await scrapeSingleBlog(url, firecrawlKey);
      if (blog) competitors.push(blog);
    }
  }

  if (competitors.length < 2 && firecrawlKey) {
    try {
      const res = await fetch("https://api.firecrawl.dev/v2/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `best ${config.niche} guide ${topic}`,
          limit: 3,
          scrapeOptions: { formats: ["markdown", "html"] },
        }),
      });
      const data = await res.json();
      for (const r of (data.data ?? []).slice(0, 3)) {
        if (!r.url || r.url === config.websiteUrl) continue;
        const blog = await scrapeSingleBlog(r.url, firecrawlKey, r.markdown);
        if (blog) competitors.push(blog);
      }
    } catch (e) {
      log(`Competitor search failed: ${e}`);
    }
  }

  return competitors.slice(0, 3);
}

async function scrapeSingleBlog(
  url: string,
  apiKey: string | undefined,
  preScrapedContent?: string,
): Promise<CompetitorBlog | null> {
  try {
    let markdown = preScrapedContent;

    if (!markdown && apiKey) {
      const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, formats: ["markdown"] }),
      });
      const data = await res.json();
      markdown = data.data?.markdown;
    }

    if (!markdown) return null;

    const headings = (markdown.match(/^#{1,3}\s+.+$/gm) ?? [])
      .map((h: string) => h.replace(/^#+\s*/, "").trim());
    const wordCount = markdown.split(/\s+/).length;
    const internalLinks = (markdown.match(/\[.*?\]\(\/(?!\/).*?\)/g) ?? []).length;
    const externalLinks = (markdown.match(/\[.*?\]\(https?:\/\/.*?\)/g) ?? []).length;
    const paragraphs = markdown
      .split(/\n\n+/)
      .filter((p: string) => p.length > 60)
      .slice(0, 8);
    const keyPoints = paragraphs.map((p: string) =>
      p.replace(/^#+\s*/, "").split(".")[0]!.trim().slice(0, 150),
    );

    return {
      url,
      title: headings[0] ?? url.split("/").pop()?.replace(/-/g, " ") ?? "Untitled",
      headings,
      wordCount,
      internalLinks,
      externalLinks,
      keyPoints,
      strengths: [],
      gaps: [],
    };
  } catch (e) {
    log(`Failed to scrape ${url}: ${e}`);
    return null;
  }
}

// ── Step 3: Build competitive brief with E-E-A-T angle ─────────────

async function buildCompetitiveBrief(
  topic: string,
  competitors: CompetitorBlog[],
  config: ClientBlogConfig,
): Promise<CompetitiveBrief | null> {
  if (competitors.length === 0) return null;

  const competitorSummaries = competitors.map((c, i) =>
    `Blog #${i + 1}: "${c.title}" (${c.url})
     Word count: ${c.wordCount} | Internal links: ${c.internalLinks} | External links: ${c.externalLinks}
     Structure: ${c.headings.join(" → ")}
     Key arguments: ${c.keyPoints.slice(0, 5).join("; ")}`,
  ).join("\n\n");

  const authorContext = config.authorName
    ? `Author: ${config.authorName}, ${config.authorRole ?? "industry expert"} at ${config.companyName ?? config.niche}`
    : `Author: a seasoned ${config.niche} professional with years of hands-on experience`;

  const prompt = `You are an SEO content strategist evaluating how to beat top-ranking content for a ${config.niche} business.

AUTHOR CONTEXT: ${authorContext}

TOPIC: "${topic}"

COMPETITOR CONTENT TO BEAT:
${competitorSummaries}

TASK: For each competitor, identify (1) what they did well, (2) what specific gaps exist, (3) what unique angle would beat them.

CRITICAL — Look for these specific gaps:
- Missing first-hand experience or case studies
- No specific data/numbers/stats (just vague claims)
- Thin sections that could be much deeper
- Outdated information or missing recent developments
- No contrarian or differentiated viewpoint
- Missing practical step-by-step guidance
- No external citations or authority sources
- Generic advice without specifics (tool names, timelines, costs)

Return JSON:
{
  "competitorAnalysis": [
    { "url": "...", "strengths": ["what they did well"], "gaps": ["specific gaps found"] }
  ],
  "recommendedStructure": ["H2: question-based heading", "H2: another question heading", ...],
  "angle": "A specific unique angle that beats competitors by filling their gaps with real experience",
  "experienceAngle": "How we'll inject first-hand experience: e.g., 'we tested this with 3 clients', specific data points, lessons learned",
  "keywordsToTarget": ["primary keyword", "secondary", "long-tail question"],
  "sourcesToHyperlink": ["https://reliable-source.com", "https://.gov-or-.edu-source"]
}`;

  const result = await callAI(prompt, true, 3000, 0.5);
  if (!result) return null;

  try {
    const analysis = JSON.parse(result);
    const enrichedCompetitors = competitors.map((c, i) => ({
      ...c,
      strengths: analysis.competitorAnalysis?.[i]?.strengths ?? [],
      gaps: analysis.competitorAnalysis?.[i]?.gaps ?? [],
    }));

    return {
      topic,
      competitors: enrichedCompetitors,
      recommendedStructure: analysis.recommendedStructure ?? [
        `H2: What is ${topic} and why does it matter right now?`,
        "H2: The strategies that actually work — backed by real results",
        "H2: What most businesses get wrong about this",
        "H2: Step-by-step: how to implement this starting today",
        "H2: What the data says: real numbers from real implementations",
      ],
      angle: analysis.angle ?? `A practical, experience-backed guide to ${topic}`,
      experienceAngle: analysis.experienceAngle ?? "",
      keywordsToTarget: analysis.keywordsToTarget ?? config.targetKeywords ?? [],
      sourcesToHyperlink: analysis.sourcesToHyperlink ?? competitors.map(c => c.url),
    };
  } catch {
    return null;
  }
}

// ── Step 4: Generate E-E-A-T optimized blog ────────────────────────

async function generateCompetitiveBlog(
  brief: CompetitiveBrief,
  config: ClientBlogConfig,
): Promise<GeneratedBlog | null> {
  const competitorContext = brief.competitors.map(c =>
    `- "${c.title}": ${c.wordCount} words. Gaps to exploit: ${c.gaps.join("; ")}`,
  ).join("\n");

  const authorLine = config.authorName
    ? `You are writing as ${config.authorName}, ${config.authorRole ?? "industry expert"} at ${config.companyName ?? ""}. Write in first person where natural.`
    : `You are writing as a hands-on ${config.niche} practitioner with real client experience. Use first-person perspective.`;

  const experienceInstructions = brief.experienceAngle
    ? `\nEXPERIENCE SIGNALS TO INJECT: ${brief.experienceAngle}\nInclude phrases like "we tested this with...", "one client saw...", "in our experience...", "here's what actually happened when...". Be specific — name real tools, real timelines, real outcomes.`
    : "";

  const hyperlinkInstructions = brief.sourcesToHyperlink.length > 0
    ? `\nHYPERLINKS: Include contextual links using these authoritative sources:\n${brief.sourcesToHyperlink.map((s, i) => `  [${i + 1}] ${s}`).join("\n")}\nFormat: <a href="URL" rel="nofollow">descriptive anchor text</a>. Also link to .gov, .edu, and reputable industry sources. 1-2 links per major section.`
    : "\nHYPERLINKS: Include 2-4 contextual links to authoritative sources (.gov, .edu, reputable industry sites).";

  const bannedList = BANNED_PHRASES.map(p => `"${p}"`).join(", ");

  const prompt = `You are writing a blog post to rank #1 on Google for a ${config.niche} website.

${authorLine}

TOPIC: "${brief.topic}"

WHY THIS WILL BEAT COMPETITORS: ${brief.angle}
${experienceInstructions}

COMPETITOR GAPS TO FILL:
${competitorContext}

RECOMMENDED STRUCTURE:
${brief.recommendedStructure.map((h, i) => `${i + 1}. ${h}`).join("\n")}

E-E-A-T WRITING REQUIREMENTS (Google March 2026 Core Update):
1. EXPERIENCE — Inject first-hand perspective throughout. Use "we", "our clients", "in our testing". Include specifics a practitioner would know.
2. EXPERTISE — Demonstrate deep domain knowledge. Use precise terminology. Show you understand nuance, edge cases, and trade-offs.
3. AUTHORITATIVENESS — Cite data, research, and authoritative sources. Link to evidence.
4. TRUSTWORTHINESS — Be honest about limitations. Note what doesn't work and why. No hype.
${hyperlinkInstructions}

WRITING RULES:
- Target: Beat the longest competitor. Write 1,500-2,500 words of substantive content.
- Structure: Follow the recommended structure but improve it. Use question-based H2s. Use numbered H3s under each H2.
- Opening: Hook in the first 2-3 sentences. Give a direct answer early (helps AI Overviews/featured snippets).
- Depth: Every claim should have substance. No filler paragraphs.
- Unique angle: Offer a perspective competitors missed. Be opinionated but fair.
- Tone: ${config.blogTone ?? "authoritative yet approachable — like a smart colleague explaining over coffee"}
- Keywords: Naturally incorporate: ${brief.keywordsToTarget.join(", ")}
- Format: Clean semantic HTML — <h2>, <h3>, <p>, <ul>, <li>, <blockquote>, <strong>, <em>
- Links: Use <a href="URL">anchor text</a> format. Contextual, not forced.
- Meta: SEO title (50-60 chars) and meta description (150-160 chars). Include primary keyword.

BANNED PHRASES (DO NOT USE — these signal AI-generated content):
${bannedList}

Return JSON:
{
  "title": "SEO title with primary keyword (50-60 chars)",
  "slug": "url-friendly-slug",
  "excerpt": "Compelling meta description with hook (150-160 chars)",
  "body": "Full HTML body with <h2>, <h3>, <p>, <ul>, <a href='...'> links",
  "category": "primary category",
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "seoTitle": "exact SEO title",
  "seoDescription": "exact meta description"
}`;

  const result = await callAI(prompt, true, 6000, 0.75);
  if (!result) return null;

  try {
    return JSON.parse(result) as GeneratedBlog;
  } catch {
    return null;
  }
}

// ── Step 5: Humanization pass ──────────────────────────────────────

async function humanizeBlog(blog: GeneratedBlog): Promise<GeneratedBlog> {
  const prompt = `You are a senior editor making AI-generated content sound human-written for E-E-A-T compliance.

ORIGINAL BLOG:
Title: ${blog.title}
Body (first 3000 chars): ${blog.body.slice(0, 3000)}

HUMANIZATION TASKS:
1. Replace any robotic transitions with natural conversational flow
2. Vary sentence length — mix short punchy sentences with longer analytical ones
3. Add 1-2 rhetorical questions where they feel natural
4. Replace any generic statements with more specific claims
5. Break up any paragraph longer than 4 sentences
6. If the opening sounds generic, rewrite it to be more direct and hooky
7. If there's a conclusion that starts with "In conclusion" or similar, rewrite it
8. Ensure at least one sentence starts with "But", "And", or "So" (natural speech patterns)
9. Add one instance of mild, professional skepticism ("That said, ..." or "Of course, this isn't...")
10. Check for and remove any of these phrases: ${BANNED_PHRASES.join(", ")}

IMPORTANT: Keep all HTML structure, links, and headings intact. Only modify the text content.
Do NOT change the information — only improve how it's expressed.

Return JSON:
{
  "body": "full humanized HTML body (all original structure preserved)",
  "title": "possibly improved title (only change if needed)",
  "changes": ["specific change 1", "specific change 2", "..."]
}`;

  const result = await callAI(prompt, true, 6000, 0.6);
  if (!result) return blog; // return original if humanization fails

  try {
    const humanized = JSON.parse(result);
    return {
      ...blog,
      body: humanized.body ?? blog.body,
      title: humanized.title ?? blog.title,
      humanizationLog: humanized.changes ?? [],
    };
  } catch {
    return blog;
  }
}

// ── Step 6: Quality scoring ─────────────────────────────────────────

async function scoreBlogQuality(blog: GeneratedBlog, brief: CompetitiveBrief): Promise<number> {
  const sample = blog.body.slice(0, 4000);

  const prompt = `You are an E-E-A-T content quality auditor. Score this blog post on a scale of 0-100.

Topic: ${brief.topic}
Target angle: ${brief.angle}
Experience goal: ${brief.experienceAngle}

BLOG SAMPLE:
${sample}

SCORE each dimension 0-20 (total 0-100):
- Experience (0-20): Does it sound like the author actually did this? First-person? Specific examples?
- Expertise (0-20): Deep domain knowledge? Precise terminology? Nuanced understanding?
- Authoritativeness (0-20): Quality sources cited? Data referenced? Credible links?
- Trustworthiness (0-20): Honest about limitations? No hype? Accurate claims?
- Readability (0-20): Engaging? Varied sentence structure? Natural flow? No banned phrases?

Also check for:
- AI-giveaway phrases present? (list any found)
- Generic filler paragraphs? (flag them)
- Missing first-person perspective? (flag if absent)

Return JSON:
{
  "totalScore": 0-100,
  "dimensions": { "experience": 0-20, "expertise": 0-20, "authoritativeness": 0-20, "trustworthiness": 0-20, "readability": 0-20 },
  "aiPhrasesFound": ["phrase1"],
  "issues": ["issue description"],
  "verdict": "ready_to_publish" | "needs_humanization" | "needs_rewrite"
}`;

  const result = await callAI(prompt, true, 1500, 0.3);

  try {
    const parsed = JSON.parse(result ?? "{}");
    return parsed.totalScore ?? 70;
  } catch {
    return 70;
  }
}

// ── Step 7: Push to website ────────────────────────────────────────

async function pushToWebsite(
  blog: GeneratedBlog,
  config: ClientBlogConfig,
): Promise<boolean> {
  try {
    if (config.websiteType === "wordpress" && config.wordpressUrl) {
      const wpUrl = `${config.wordpressUrl}/wp-json/wp/v2/posts`;
      const res = await fetch(wpUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(config.websiteApiKey ?? ":")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: blog.title,
          content: blog.body,
          excerpt: blog.excerpt,
          slug: blog.slug,
          status: "publish",
          meta: {
            _yoast_wpseo_title: blog.seoTitle,
            _yoast_wpseo_metadesc: blog.seoDescription,
          },
        }),
      });
      return res.ok;
    }

    if (config.websiteType === "webhook" && config.websiteApiKey) {
      const res = await fetch(config.websiteApiKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blog, tenantId: config.tenantId }),
      });
      return res.ok;
    }

    return true; // manual mode — just store in calendar
  } catch (e) {
    log(`Website push failed: ${e}`);
    return false;
  }
}

// ── Main pipeline (single blog) ─────────────────────────────────────

export interface BlogGenerationResult {
  blog: GeneratedBlog | null;
  topic: string;
  qualityScore: number;
  competitorCount: number;
  pushed: boolean;
  error?: string;
  brief?: CompetitiveBrief;
}

export async function generateSingleBlog(
  topic: string,
  config: ClientBlogConfig,
): Promise<BlogGenerationResult> {
  log(`Generating blog for "${config.niche}" — "${topic.slice(0, 80)}"`);

  try {
    // Step 1-2: Research competitors
    const competitors = await scrapeCompetitorBlogs(topic, config);
    log(`Found ${competitors.length} competitor blogs`);

    // Step 3: Build competitive brief
    const brief = await buildCompetitiveBrief(topic, competitors, config);

    // Step 4: Generate blog
    let blog: GeneratedBlog | null;
    if (brief) {
      blog = await generateCompetitiveBlog(brief, config);
    } else {
      blog = await generateSimpleBlog(topic, config);
    }

    if (!blog) {
      return { blog: null, topic, qualityScore: 0, competitorCount: competitors.length, pushed: false, error: "Generation failed" };
    }

    // Step 5: Humanization pass
    log("Running humanization pass...");
    blog = await humanizeBlog(blog);

    // Step 6: Quality scoring
    let qualityScore = 70;
    if (brief) {
      qualityScore = await scoreBlogQuality(blog, brief);
      blog.qualityScore = qualityScore;
      log(`Quality score: ${qualityScore}/100`);
    }

    // Step 7: Push to website
    const pushed = await pushToWebsite(blog, config);

    // Step 8: Notify webhook if configured
    if (pushed) {
      const { notifyWebhook } = await import("./blog-api-service");
      await notifyWebhook(config.tenantId, {
        title: blog.title,
        slug: blog.slug,
        excerpt: blog.excerpt,
      });
    }

    // Step 9: Store in content_assets
    const supabase = getAdminClient();
    const today = new Date().toISOString().split("T")[0]!;
    await supabase.from("content_assets").insert({
      id: `blog_${Date.now()}_${randomSuffix()}`,
      tenant_id: config.tenantId,
      title: blog.title,
      description: blog.excerpt,
      file_url: blog.body,
      content_type: "feed_post",
      platform: "web",
      scheduled_date: today,
      status: pushed ? "posted" : "ready",
      created_at: new Date().toISOString(),
      created_by: "system",
    });

    return { blog, topic, qualityScore, competitorCount: competitors.length, pushed, brief };
  } catch (err: any) {
    log(`Error: ${err.message}`);
    return { blog: null, topic, qualityScore: 0, competitorCount: 0, pushed: false, error: err.message };
  }
}

// ── Cron-triggered batch pipeline ───────────────────────────────────

export async function runDailyBlogAutomation(): Promise<{
  processed: number;
  generated: number;
  errors: string[];
}> {
  const supabase = getAdminClient();
  const errors: string[] = [];
  let processed = 0;
  let generated = 0;

  try {
    const { data: tenants } = await supabase
      .from("tenants")
      .select("*")
      .not("automation_config", "is", null);

    if (!tenants?.length) {
      log("No tenants with automation config");
      return { processed: 0, generated: 0, errors: [] };
    }

    for (const t of tenants) {
      try {
        const ac = (t.automation_config as Record<string, any>) ?? {};
        if (!ac.blogEnabled) continue;
        // Respect client's daily auto toggle
        if (ac.dailyAutoEnabled === false) continue;

        processed++;

        const config: ClientBlogConfig = {
          tenantId: t.id,
          niche: ac.niche ?? t.name,
          websiteUrl: ac.websiteUrl ?? "",
          websiteApiKey: ac.websiteApiKey,
          websiteType: ac.websiteType ?? "webhook",
          wordpressUrl: ac.wordpressUrl,
          blogTone: ac.blogTone ?? "authoritative yet approachable",
          targetKeywords: ac.targetKeywords ?? [],
          competitorUrls: ac.competitorUrls ?? [],
          authorName: ac.authorName,
          authorRole: ac.authorRole,
          companyName: ac.companyName,
          webhookUrl: ac.webhookUrl,
        };

        const topics = await fetchTrendingTopics(config.niche, config);

        for (const topic of topics.slice(0, 2)) {
          const result = await generateSingleBlog(topic, config);
          if (result.error) {
            errors.push(`${config.niche}: ${result.error}`);
          } else {
            generated++;
          }
          // Small delay between blogs for same client
          await new Promise(r => setTimeout(r, 1000));
        }
      } catch (err: any) {
        errors.push(`Tenant ${t.id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    errors.push(`Fatal: ${err.message}`);
  }

  log(`Done: ${processed} clients, ${generated} blogs, ${errors.length} errors`);
  return { processed, generated, errors };
}

// ── Fallback: Simple generation when no competitors ─────────────────

async function generateSimpleBlog(
  topic: string,
  config: ClientBlogConfig,
): Promise<GeneratedBlog | null> {
  const authorContext = config.authorName
    ? `You are ${config.authorName}, ${config.authorRole ?? "industry expert"} at ${config.companyName ?? ""}.`
    : `You are a ${config.niche} practitioner with hands-on experience.`;

  const bannedList = BANNED_PHRASES.map(p => `"${p}"`).join(", ");

  const prompt = `${authorContext} Write an authoritative, experience-backed blog post for a ${config.niche} website.

TOPIC: "${topic}"

REQUIREMENTS:
- 1,200-1,800 words of substantive content
- First-person perspective where natural ("we've found", "our approach", "in our experience")
- Clean semantic HTML: <h2>, <h3>, <p>, <ul>, <li>, <strong>
- Include 2-3 contextual hyperlinks to authoritative sources
- Direct, hooky opening (no "In today's world...")
- Tone: ${config.blogTone ?? "authoritative yet approachable"}
- Keywords: ${(config.targetKeywords ?? []).join(", ")}
- One contrarian or surprising insight
- Specific examples or data points (invent reasonable ones based on domain knowledge)

BANNED PHRASES: ${bannedList}

Return JSON:
{ "title": "SEO title (50-60 chars)", "slug": "url-slug", "excerpt": "meta description (150-160 chars)", "body": "full HTML", "category": "...", "tags": ["...","..."], "seoTitle": "...", "seoDescription": "..." }`;

  const result = await callAI(prompt, true, 5000, 0.75);
  if (!result) return null;
  try {
    const blog = JSON.parse(result) as GeneratedBlog;
    // Still run humanization
    return await humanizeBlog(blog);
  } catch {
    return null;
  }
}

// ── Get client blog config ──────────────────────────────────────────

export async function getClientBlogConfig(tenantId: string): Promise<ClientBlogConfig | null> {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select("name, automation_config")
    .eq("id", tenantId)
    .maybeSingle();

  if (!data) return null;

  const ac = (data.automation_config as Record<string, any>) ?? {};
  if (!ac.blogEnabled && !ac.niche) return null;

  return {
    tenantId,
    niche: ac.niche ?? (data.name as string),
    websiteUrl: ac.websiteUrl ?? "",
    websiteApiKey: ac.websiteApiKey,
    websiteType: ac.websiteType ?? "custom",
    wordpressUrl: ac.wordpressUrl,
    blogTone: ac.blogTone ?? "authoritative yet approachable",
    targetKeywords: ac.targetKeywords ?? [],
    competitorUrls: ac.competitorUrls ?? [],
    authorName: ac.authorName,
    authorRole: ac.authorRole,
    companyName: ac.companyName,
    webhookUrl: ac.webhookUrl,
  };
}
