"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Globe, Zap, ExternalLink, Settings2, Check, Eye } from "lucide-react";
import { toast } from "sonner";

interface BlogAutomationConfig {
  blogEnabled: boolean;
  niche: string;
  websiteUrl: string;
  websiteType: "wordpress" | "webhook" | "custom";
  wordpressUrl: string;
  websiteApiKey: string;
  blogTone: string;
  targetKeywords: string[];
  competitorUrls: string[];
  authorName?: string;
  authorRole?: string;
  companyName?: string;
  webhookUrl?: string;
}

interface Props {
  clientId: string;
  clientName: string;
}

export function BlogAutomationSettings({ clientId, clientName }: Props) {
  const [config, setConfig] = useState<BlogAutomationConfig>({
    blogEnabled: false,
    niche: "",
    websiteUrl: "",
    websiteType: "wordpress",
    wordpressUrl: "",
    websiteApiKey: "",
    blogTone: "authoritative yet approachable",
    targetKeywords: [],
    competitorUrls: [],
    authorName: "",
    authorRole: "",
    companyName: "",
    webhookUrl: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keywordsInput, setKeywordsInput] = useState("");
  const [competitorsInput, setCompetitorsInput] = useState("");
  const [blogTopic, setBlogTopic] = useState("");
  const [generating, setGenerating] = useState(false);

  // Load existing config
  useEffect(() => {
    fetch(`/api/admin/clients/${clientId}/blog-automation`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data) {
          const c = d.data;
          setConfig({
            blogEnabled: c.blogEnabled ?? false,
            niche: c.niche ?? "",
            websiteUrl: c.websiteUrl ?? "",
            websiteType: c.websiteType ?? "wordpress",
            wordpressUrl: c.wordpressUrl ?? "",
            websiteApiKey: c.websiteApiKey ?? "",
            blogTone: c.blogTone ?? "authoritative yet approachable",
            targetKeywords: c.targetKeywords ?? [],
            competitorUrls: c.competitorUrls ?? [],
            authorName: c.authorName ?? "",
            authorRole: c.authorRole ?? "",
            companyName: c.companyName ?? "",
            webhookUrl: c.webhookUrl ?? "",
          });
          setKeywordsInput((c.targetKeywords ?? []).join(", "));
          setCompetitorsInput((c.competitorUrls ?? []).join("\n"));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId]);

  async function save() {
    setSaving(true);
    const payload = {
      ...config,
      targetKeywords: keywordsInput.split(",").map((k) => k.trim()).filter(Boolean),
      competitorUrls: competitorsInput.split("\n").map((u) => u.trim()).filter(Boolean),
    };

    try {
      const res = await fetch(`/api/admin/clients/${clientId}/blog-automation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Blog automation settings saved");
      } else {
        toast.error("Failed to save");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="bg-white/50 rounded-[24px] p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-lavender flex items-center justify-center">
            <Zap className="h-5 w-5 text-foreground/60" />
          </span>
          <div>
            <h3 className="font-semibold text-lg">Blog Automation</h3>
            <p className="text-sm text-muted-foreground">
              2 AI-written blogs per day, posted to {clientName}'s website
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-medium uppercase ${config.blogEnabled ? "text-mint-foreground" : "text-muted-foreground"}`}>
            {config.blogEnabled ? "Active" : "Disabled"}
          </span>
          <Switch
            checked={config.blogEnabled}
            onCheckedChange={(v) => setConfig((c) => ({ ...c, blogEnabled: v }))}
          />
        </div>
      </div>

      {/* Pipeline visualization */}
      <div className="hidden sm:flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/30 rounded-2xl p-3">
        <span className="bg-background rounded-xl px-3 py-1.5 font-medium text-foreground flex items-center gap-1">
          <Zap className="h-3 w-3" /> Scrape Trends
        </span>
        <span>→</span>
        <span className="bg-background rounded-xl px-3 py-1.5 font-medium text-foreground flex items-center gap-1">
          <Eye className="h-3 w-3" /> Analyze Competitors
        </span>
        <span>→</span>
        <span className="bg-background rounded-xl px-3 py-1.5 font-medium text-foreground flex items-center gap-1">
          <Settings2 className="h-3 w-3" /> Write Better Blog
        </span>
        <span>→</span>
        <span className="bg-background rounded-xl px-3 py-1.5 font-medium text-foreground flex items-center gap-1">
          <ExternalLink className="h-3 w-3" /> Publish
        </span>
      </div>

      {!config.blogEnabled && (
        <div className="bg-yellow rounded-2xl p-4 text-sm text-muted-foreground">
          Enable blog automation to have 2 AI-written blog posts generated daily for {clientName}.
          Blogs are scraped against competitors, optimized for SEO, and published to their website automatically.
        </div>
      )}

      {/* Settings form */}
      <div className="space-y-4">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Industry / Niche
            </Label>
            <Input
              value={config.niche}
              onChange={(e) => setConfig((c) => ({ ...c, niche: e.target.value }))}
              placeholder="e.g. real estate, dental, fitness"
              className="rounded-xl border-black/10"
            />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Writing Tone
            </Label>
            <Select
              value={config.blogTone}
              onValueChange={(v) => setConfig((c) => ({ ...c, blogTone: v }))}
            >
              <SelectTrigger className="rounded-2xl border-black/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="authoritative yet approachable" className="rounded-xl">Authoritative & Approachable</SelectItem>
                <SelectItem value="professional and data-driven" className="rounded-xl">Professional & Data-Driven</SelectItem>
                <SelectItem value="casual and relatable" className="rounded-xl">Casual & Relatable</SelectItem>
                <SelectItem value="luxury and aspirational" className="rounded-xl">Luxury & Aspirational</SelectItem>
                <SelectItem value="technical and detailed" className="rounded-xl">Technical & Detailed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Website Integration
            </Label>
            <Select
              value={config.websiteType}
              onValueChange={(v) => setConfig((c) => ({ ...c, websiteType: v as any }))}
            >
              <SelectTrigger className="rounded-2xl border-black/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="wordpress" className="rounded-xl">WordPress</SelectItem>
                <SelectItem value="webhook" className="rounded-xl">Webhook / API</SelectItem>
                <SelectItem value="custom" className="rounded-xl">Manual (calendar only)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            {config.websiteType === "wordpress" ? (
              <>
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  WordPress Site URL
                </Label>
                <Input
                  value={config.wordpressUrl}
                  onChange={(e) => setConfig((c) => ({ ...c, wordpressUrl: e.target.value }))}
                  placeholder="https://client-site.com"
                  className="rounded-xl border-black/10"
                />
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 mt-3 block">
                  WordPress App Password <span className="text-[10px]">(username:application-password)</span>
                </Label>
                <Input
                  type="password"
                  value={config.websiteApiKey}
                  onChange={(e) => setConfig((c) => ({ ...c, websiteApiKey: e.target.value }))}
                  placeholder="admin:XXXX XXXX XXXX XXXX XXXX"
                  className="rounded-xl border-black/10 font-mono text-xs"
                />
              </>
            ) : config.websiteType === "webhook" ? (
              <>
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Webhook URL
                </Label>
                <Input
                  value={config.websiteApiKey}
                  onChange={(e) => setConfig((c) => ({ ...c, websiteApiKey: e.target.value }))}
                  placeholder="https://hooks.zapier.com/..."
                  className="rounded-xl border-black/10 font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Blog data is POSTed as JSON: {`{ blog, tenantId }`}
                </p>
              </>
            ) : (
              <div className="bg-muted/30 rounded-2xl p-4 text-sm text-muted-foreground flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Blogs are saved to the content calendar — {clientName} publishes manually.
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Author Name <span className="text-[10px]">(E-E-A-T)</span>
            </Label>
            <Input
              value={config.authorName ?? ""}
              onChange={(e) => setConfig((c: any) => ({ ...c, authorName: e.target.value }))}
              placeholder="e.g. Sarah Chen"
              className="rounded-xl border-black/10"
            />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Author Role
            </Label>
            <Input
              value={config.authorRole ?? ""}
              onChange={(e) => setConfig((c: any) => ({ ...c, authorRole: e.target.value }))}
              placeholder="e.g. Lead Strategist"
              className="rounded-xl border-black/10"
            />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Company Name
            </Label>
            <Input
              value={config.companyName ?? ""}
              onChange={(e) => setConfig((c: any) => ({ ...c, companyName: e.target.value }))}
              placeholder="e.g. Acme Real Estate"
              className="rounded-xl border-black/10"
            />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground bg-blue/20 rounded-xl p-2.5">
          <strong>E-E-A-T Tip:</strong> Adding a real author name, role, and company signals expertise to Google.
          The AI writes in first-person and injects experience signals like "we tested this with clients..."
        </p>

        <div>
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
            Target Keywords <span className="text-[10px]">(comma-separated)</span>
          </Label>
          <Input
            value={keywordsInput}
            onChange={(e) => setKeywordsInput(e.target.value)}
            placeholder="home buying tips, mortgage rates, property investment"
            className="rounded-xl border-black/10"
          />
        </div>

        <div>
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
            Webhook URL <span className="text-[10px]">(notified when blogs are published)</span>
          </Label>
          <Input
            value={config.webhookUrl ?? ""}
            onChange={(e) => setConfig((c: any) => ({ ...c, webhookUrl: e.target.value }))}
            placeholder="https://your-app.com/api/blog-webhook"
            className="rounded-xl border-black/10 font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Receives POST with blog data when auto-published. Leave blank to skip.
          </p>
        </div>

        <div>
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
            Competitor URLs <span className="text-[10px]">(one per line — saves Firecrawl credits)</span>
          </Label>
          <textarea
            value={competitorsInput}
            onChange={(e) => setCompetitorsInput(e.target.value)}
            placeholder={"https://competitor1.com/blog\nhttps://competitor2.com/blog"}
            rows={3}
            className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-foreground/10"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Adding competitor URLs reduces Firecrawl API calls — blogs are compared against these sites.
          </p>
        </div>
      </div>

      {/* Save */}
      <Button
        onClick={save}
        disabled={saving}
        className="w-full rounded-full bg-foreground hover:bg-foreground/90 text-background h-10 text-sm"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}
        Save Automation Settings
      </Button>

      {/* Generate Now */}
      <div className="border-t border-black/5 pt-4 space-y-3">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Generate Blog Now
        </Label>
        <div className="flex gap-2">
          <Input
            value={blogTopic}
            onChange={(e) => setBlogTopic(e.target.value)}
            placeholder="Blog topic (or leave blank for auto-topic)"
            className="rounded-xl border-black/10 flex-1 text-sm"
          />
          <Button
            onClick={async () => {
              setGenerating(true);
              try {
                const res = await fetch(`/api/admin/clients/${clientId}/generate-blog`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ topic: blogTopic.trim() || undefined }),
                });
                const d = await res.json();
                if (d.success) {
                  toast.success(`Blog generated! Score: ${d.data.qualityScore}/100`);
                  setBlogTopic("");
                } else {
                  toast.error(d.error ?? "Generation failed");
                }
              } catch { toast.error("Network error"); }
              finally { setGenerating(false); }
            }}
            disabled={generating || !config.blogEnabled}
            className="rounded-full bg-foreground hover:bg-foreground/90 text-background h-10 px-5 text-sm shrink-0"
            title={!config.blogEnabled ? "Enable and save blog automation first" : ""}
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Zap className="h-4 w-4 mr-1" />}
            {generating ? "Generating..." : "Generate"}
          </Button>
        </div>
        {!config.blogEnabled && (
          <p className="text-[11px] text-muted-foreground">
            Enable blog automation and save settings above before generating.
          </p>
        )}
      </div>

      {/* API Key section — what the client gives their developer */}
      <ApiKeySection clientId={clientId} />
    </div>
  );
}

// ── API Key sub-component ──────────────────────────────────────────────

function ApiKeySection({ clientId }: { clientId: string }) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showSnippets, setShowSnippets] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/clients/${clientId}/api-key`, { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (d.success) setApiKey(d.data?.apiKey ?? null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId]);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/api-key`, {
        method: "POST",
        credentials: "include",
      });
      const d = await res.json();
      if (d.success) setApiKey(d.data.apiKey);
    } catch {} finally { setGenerating(false); }
  };

  const apiUrl = apiKey
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/v1/blogs/${clientId}?apiKey=${apiKey}`.replace(/^http:\/\/localhost/, "https://your-app.vercel.app")
    : "";

  if (loading) return null;

  return (
    <div className="border-t border-black/5 pt-6 mt-2">
      <div className="flex items-center gap-2 mb-4">
        <ExternalLink className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-semibold">Developer API</h4>
        <span className="text-[10px] text-muted-foreground">
          Give this to your client's developer
        </span>
      </div>

      {!apiKey ? (
        <Button
          onClick={generate}
          disabled={generating}
          variant="outline"
          className="w-full rounded-full border-black/10 text-sm"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Zap className="h-4 w-4 mr-1.5" />}
          Generate API Key
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="bg-muted/30 rounded-2xl p-4 space-y-2">
            <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              API Endpoint
            </Label>
            <code className="block text-xs font-mono break-all select-all">
              {apiUrl}
            </code>
            <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mt-3 block">
              API Key
            </Label>
            <code className="block text-xs font-mono select-all">{apiKey}</code>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={generate}
              disabled={generating}
              className="rounded-full border-black/10 text-xs"
            >
              {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Regenerate"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(apiUrl);
                toast.success("Copied to clipboard");
              }}
              className="rounded-full border-black/10 text-xs"
            >
              Copy URL
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSnippets(!showSnippets)}
              className="rounded-full text-xs"
            >
              {showSnippets ? "Hide" : "Show"} integration code
            </Button>
          </div>

          {showSnippets && (
            <div className="space-y-3 mt-2">
              <p className="text-xs text-muted-foreground">
                Share this with the developer — they paste it into the website. Works with React, Vue, PHP, plain HTML — any stack.
              </p>
              <IntegrationSnippet label="JavaScript / HTML" code={`<div id="blog-feed"></div>
<script>
fetch("${apiUrl}")
  .then(r => r.json())
  .then(data => {
    const html = (data.posts ?? []).map(post => \`
      <article>
        <h2><a href="/blog/\${post.slug}">\${post.title}</a></h2>
        <p>\${post.excerpt}</p>
        <time>\${new Date(post.publishedAt).toLocaleDateString()}</time>
      </article>
    \`).join("");
    document.getElementById("blog-feed").innerHTML = html;
  });
</script>`} />
              <IntegrationSnippet label="React / Next.js" code={`import { useEffect, useState } from "react";

export function BlogFeed() {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    fetch("${apiUrl}")
      .then(r => r.json())
      .then(data => setPosts(data.posts ?? []));
  }, []);

  return (
    <div>
      {posts.map(post => (
        <article key={post.id}>
          <h2><a href={\`/blog/\${post.slug}\`}>{post.title}</a></h2>
          <p>{post.excerpt}</p>
        </article>
      ))}
    </div>
  );
}`} />
              <IntegrationSnippet label="PHP / WordPress" code={`<?php
function get_latest_blogs() {
  $response = wp_remote_get("${apiUrl}");
  if (is_wp_error($response)) return [];
  $data = json_decode(wp_remote_retrieve_body($response), true);
  return $data["posts"] ?? [];
}

$blogs = get_latest_blogs();
foreach ($blogs as $blog) {
  echo '<article>';
  echo '<h2>' . esc_html($blog["title"]) . '</h2>';
  echo '<p>' . esc_html($blog["excerpt"]) . '</p>';
  echo '</article>';
}
?>`} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IntegrationSnippet({ label, code }: { label: string; code: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <pre className="bg-muted/30 rounded-xl p-3 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
        {code}
      </pre>
    </div>
  );
}
