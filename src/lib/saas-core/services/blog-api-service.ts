/**
 * Public Blog API Service — Enhanced
 *
 * Each client gets a unique API key. Their developer calls a single endpoint
 * to fetch the latest automated blog posts. Works with any website stack.
 *
 * Endpoint:
 *   GET /api/v1/blogs/:tenantId?apiKey=xxx&limit=5
 *
 * Features:
 *   - API key management (generate, validate, rotate)
 *   - Rate limiting (per-key, sliding window)
 *   - Webhook notifications (POST when new blog published)
 *   - Integration code snippets (React, PHP, plain JS, curl)
 *   - API usage tracking (stored in api_usage table)
 */

import { getAdminClient } from "@/lib/supabase/admin";
import { createHash, randomBytes } from "crypto";

// ── Types ────────────────────────────────────────────────────────────

export interface PublicBlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  category: string;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
  publishedAt: string;
  url: string | null;
}

export interface BlogApiResponse {
  success: boolean;
  tenant: string;
  posts: PublicBlogPost[];
  meta: {
    total: number;
    limit: number;
    apiDocs: string;
  };
}

// ── Rate Limiting (in-memory, per API key) ────────────────────────

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
const RATE_LIMIT_MAX = 60;   // requests per window
const RATE_LIMIT_WINDOW = 60_000; // 1 minute

export function checkRateLimit(apiKey: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const entry = rateLimitStore.get(apiKey);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(apiKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt: now + RATE_LIMIT_WINDOW };
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count, resetAt: entry.resetAt };
}

// ── API Key Management ───────────────────────────────────────────

export async function generateApiKey(tenantId: string): Promise<string> {
  const raw = `${tenantId}_${randomBytes(16).toString("hex")}_${Date.now()}`;
  const key = `sa_${createHash("sha256").update(raw).digest("hex").slice(0, 32)}`;

  const supabase = getAdminClient();
  await supabase
    .from("tenants")
    .update({ api_key: key })
    .eq("id", tenantId);

  return key;
}

export async function getApiKey(tenantId: string): Promise<string | null> {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select("api_key")
    .eq("id", tenantId)
    .maybeSingle();
  return (data?.api_key as string) ?? null;
}

export async function validateApiKey(tenantId: string, apiKey: string): Promise<boolean> {
  const stored = await getApiKey(tenantId);
  if (!stored) return false;

  // Track API usage
  trackApiUsage(tenantId, "blog_api").catch(() => {});

  return stored === apiKey;
}

// ── Webhook Notifications ─────────────────────────────────────────

export async function notifyWebhook(
  tenantId: string,
  blog: { title: string; slug: string; excerpt: string; url?: string },
): Promise<void> {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select("automation_config")
    .eq("id", tenantId)
    .maybeSingle();

  const cfg = (data?.automation_config as Record<string, any>) ?? {};
  const webhookUrl = cfg.webhookUrl as string | undefined;

  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "blog.published",
        tenantId,
        blog: {
          title: blog.title,
          slug: blog.slug,
          excerpt: blog.excerpt,
          url: blog.url,
        },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error(`[blog-api] Webhook notification failed for ${tenantId}:`, e);
  }
}

// ── API Usage Tracking ───────────────────────────────────────────

async function trackApiUsage(tenantId: string, service: string): Promise<void> {
  try {
    const supabase = getAdminClient();
    await supabase.from("api_usage").insert({
      id: `usage_${Date.now()}_${randomBytes(4).toString("hex")}`,
      tenant_id: tenantId,
      service,
      input_tokens: 0,
      output_tokens: 0,
      cost: 0,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Silent fail — usage tracking shouldn't break the API
  }
}

// ── Fetch public blog posts ───────────────────────────────────────

export async function getPublicBlogPosts(
  tenantId: string,
  limit = 10,
): Promise<PublicBlogPost[]> {
  const supabase = getAdminClient();

  const { data: assets } = await supabase
    .from("content_assets")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("content_type", "feed_post")
    .eq("platform", "web")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!assets?.length) return [];

  return assets.map((a: any) => {
    const body = (a.file_url as string) ?? "";
    return {
      id: a.id,
      title: (a.title as string) ?? "Untitled",
      slug: ((a.title as string) ?? "post")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
      excerpt: (a.description as string) ?? "",
      body,
      category: "general",
      tags: [],
      seoTitle: (a.title as string) ?? "",
      seoDescription: (a.description as string) ?? "",
      publishedAt: (a.created_at as string) ?? new Date().toISOString(),
      url: null,
    };
  });
}

// ── API docs page data ────────────────────────────────────────────

export function getApiDocs(tenantId: string, apiKey: string, baseUrl: string) {
  const endpoint = `${baseUrl}/api/v1/blogs/${tenantId}?apiKey=${apiKey}`;

  return {
    title: "Blog API Documentation",
    version: "v1",
    baseUrl,
    authentication: {
      type: "apiKey",
      location: "query",
      param: "apiKey",
      description: "Include your API key as a query parameter or in the x-api-key header.",
    },
    endpoints: [
      {
        method: "GET",
        path: `/api/v1/blogs/${tenantId}`,
        description: "Fetch the latest blog posts for this tenant.",
        parameters: [
          { name: "apiKey", type: "string", required: true, description: "Your API key" },
          { name: "limit", type: "number", required: false, default: 10, max: 50, description: "Number of posts to return" },
        ],
        example: endpoint,
        curl: `curl "${endpoint}&limit=5"`,
        response: {
          success: true,
          tenant: "Business Name",
          posts: [{
            id: "blog_...",
            title: "Blog post title",
            slug: "blog-post-title",
            excerpt: "Short excerpt...",
            body: "<h2>...</h2><p>...</p>",
            category: "general",
            tags: ["tag1", "tag2"],
            seoTitle: "SEO Title",
            seoDescription: "Meta description",
            publishedAt: "2026-08-08T00:00:00.000Z",
            url: null,
          }],
          meta: { total: 1, limit: 10, apiDocs: `${baseUrl}/api/v1/docs` },
        },
      },
    ],
    rateLimit: {
      max: RATE_LIMIT_MAX,
      window: "1 minute",
      header: "X-RateLimit-Remaining",
    },
  };
}

// ── Integration code snippets ─────────────────────────────────────

export function getIntegrationSnippets(tenantId: string, apiKey: string): Record<string, string> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://your-domain.vercel.app";
  const endpoint = `${baseUrl}/api/v1/blogs/${tenantId}?apiKey=${apiKey}`;

  return {
    javascript: `// Add blogs to any website — just drop this in
<script>
(async function() {
  const res = await fetch("${endpoint}");
  const data = await res.json();
  const html = (data.posts ?? []).map(post => \`
    <article style="margin-bottom:2rem">
      <h2><a href="/blog/\${post.slug}">\${post.title}</a></h2>
      <p>\${post.excerpt}</p>
      <time>\${new Date(post.publishedAt).toLocaleDateString()}</time>
    </article>
  \`).join("");
  document.getElementById("blog-feed").innerHTML = html;
})();
</script>
<div id="blog-feed">Loading blogs...</div>`,

    react: `// React / Next.js component
import { useEffect, useState } from "react";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  publishedAt: string;
}

export function BlogFeed() {
  const [posts, setPosts] = useState<BlogPost[]>([]);

  useEffect(() => {
    fetch("${endpoint}")
      .then(r => r.json())
      .then(data => setPosts(data.posts ?? []));
  }, []);

  if (!posts.length) return <p>No posts yet.</p>;

  return (
    <div className="blog-feed">
      {posts.map(post => (
        <article key={post.id}>
          <h2><a href={\`/blog/\${post.slug}\`}>{post.title}</a></h2>
          <p>{post.excerpt}</p>
          <time>{new Date(post.publishedAt).toLocaleDateString()}</time>
        </article>
      ))}
    </div>
  );
}`,

    wordpress: `<?php
// Add to your theme's functions.php or create a plugin
function get_latest_blogs(\$limit = 5) {
    \$response = wp_remote_get("${endpoint}&limit=" . \$limit);
    if (is_wp_error(\$response)) return [];
    \$data = json_decode(wp_remote_retrieve_body(\$response), true);
    return \$data["posts"] ?? [];
}

// In your template (single.php, page.php, or a custom template):
\$blogs = get_latest_blogs(5);
foreach (\$blogs as \$blog) {
    echo '<article class="blog-post">';
    echo '<h2><a href="/blog/' . esc_attr(\$blog["slug"]) . '">' . esc_html(\$blog["title"]) . '</a></h2>';
    echo '<p>' . esc_html(\$blog["excerpt"]) . '</p>';
    echo '<time>' . esc_html(date('F j, Y', strtotime(\$blog["publishedAt"]))) . '</time>';
    echo '</article>';
}
?>`,

    curl: `# Test from terminal
curl "${endpoint}&limit=5" | python3 -m json.tool`,
  };
}
