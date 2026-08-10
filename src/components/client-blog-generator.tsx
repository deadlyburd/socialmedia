"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, Zap, FileText, ExternalLink, Sparkles, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface BlogResult {
  title: string;
  excerpt: string;
  body: string | null;
  qualityScore: number;
  competitorCount: number;
  pushed: boolean;
  topic: string;
}

export function ClientBlogGenerator() {
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<BlogResult | null>(null);
  const [blogs, setBlogs] = useState<BlogResult[]>([]);
  const [loadingBlogs, setLoadingBlogs] = useState(true);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [togglingAuto, setTogglingAuto] = useState(false);

  // Load existing blog posts
  useEffect(() => {
    fetch("/api/client/calendar", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          const blogPosts = (d.data ?? [])
            .filter((item: any) =>
              (item.content_type === "feed_post" || item.content_type === "blog") &&
              item.platform === "web"
            )
            .map((item: any) => ({
              title: item.title,
              excerpt: item.description ?? "",
              body: item.file_url ?? item.fileUrl ?? null,
              qualityScore: 0,
              competitorCount: 0,
              pushed: item.status === "posted",
              topic: "",
            }));
          setBlogs(blogPosts);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingBlogs(false));
  }, []);

  // Check if daily auto-generation is enabled
  useEffect(() => {
    fetch("/api/client/calendar", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        // Check automation config for dailyAutoEnabled
        if (d.success) {
          // We need a separate endpoint — check alongside
        }
      })
      .catch(() => {});

    // Check auto status from the tenant automation config
    fetch("/api/client/blog-auto-status", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (d.success) setAutoEnabled(d.data?.dailyAutoEnabled ?? false);
      })
      .catch(() => {});
  }, []);

  async function toggleAutoGeneration() {
    setTogglingAuto(true);
    const newValue = !autoEnabled;
    try {
      const res = await fetch("/api/client/blog-auto-toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled: newValue }),
      });
      const d = await res.json();
      if (d.success) {
        setAutoEnabled(newValue);
        toast.success(newValue
          ? "Daily auto-generation enabled! 2 blogs/day."
          : "Daily auto-generation disabled."
        );
      } else {
        toast.error(d.error ?? "Failed to update.");
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setTogglingAuto(false);
    }
  }

  async function handleGenerate() {
    if (!topic.trim()) {
      toast.error("Enter a blog topic first.");
      return;
    }

    setGenerating(true);
    setResult(null);

    try {
      const res = await fetch("/api/client/generate-blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ topic: topic.trim() }),
      });
      const data = await res.json();

      if (data.success) {
        setResult(data.data);
        setBlogs(prev => [data.data as BlogResult, ...prev]);
        toast.success(`Blog generated! Quality score: ${data.data.qualityScore}/100`);
      } else {
        toast.error(data.error ?? "Generation failed. Is blog automation configured?");
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setGenerating(false);
    }
  }

  function getScoreColor(score: number) {
    if (score >= 85) return "text-green-600";
    if (score >= 70) return "text-amber-600";
    return "text-red-500";
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Auto-generation Toggle */}
      <div className="bg-white/50 rounded-[24px] p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-yellow flex items-center justify-center">
              <RefreshCw className={`h-5 w-5 text-foreground/60 ${autoEnabled ? "animate-spin-slow" : ""}`} />
            </span>
            <div>
              <h3 className="font-semibold text-lg">Daily Auto-Generation</h3>
              <p className="text-sm text-muted-foreground">
                {autoEnabled
                  ? "2 AI-optimized blogs automatically generated and published to your website every day"
                  : "Enable to automatically generate 2 E-E-A-T optimized blogs daily"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-medium uppercase ${autoEnabled ? "text-green-600" : "text-muted-foreground"}`}>
              {autoEnabled ? "Active" : "Off"}
            </span>
            <Switch
              checked={autoEnabled}
              onCheckedChange={toggleAutoGeneration}
              disabled={togglingAuto}
            />
          </div>
        </div>
        {autoEnabled && (
          <div className="mt-4 bg-green-50/50 rounded-2xl p-3 text-xs text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
            Blogs are generated at 9am and 5pm daily. Each blog is researched against competitors, humanized for quality, and optimized for Google's E-E-A-T standards.
          </div>
        )}
      </div>

      {/* Generate New Blog Card */}
      <div className="bg-white/50 rounded-[24px] p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-lavender flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-foreground/60" />
          </span>
          <div>
            <h3 className="font-semibold text-lg">Generate Blog Post</h3>
            <p className="text-sm text-muted-foreground">
              AI-powered blog that beats competitors — optimized for Google E-E-A-T
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., best practices for home staging in 2026"
            className="rounded-xl border-black/10 flex-1"
            onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
          />
          <Button
            onClick={handleGenerate}
            disabled={generating || !topic.trim()}
            className="rounded-full bg-foreground hover:bg-foreground/90 text-background h-10 px-6 text-sm shrink-0"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Zap className="h-4 w-4 mr-1.5" />}
            {generating ? "Generating..." : "Generate"}
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          The AI researches competitors, analyzes their gaps, writes a better blog, humanizes it, and scores quality.
          Takes 30-60 seconds.
        </p>
      </div>

      {/* Generation Result */}
      {generating && (
        <div className="bg-lavender rounded-[24px] p-8 text-center space-y-3 animate-in fade-in">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-foreground/40" />
          <div>
            <p className="text-sm font-medium">Researching competitors & writing...</p>
            <p className="text-xs text-muted-foreground mt-1">
              Scraping top-ranking blogs → Analyzing gaps → Writing better content → Humanizing
            </p>
          </div>
        </div>
      )}

      {result && (
        <div className="bg-mint rounded-[24px] p-6 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-xs font-medium text-green-700">Generated Successfully</span>
              </div>
              <h3 className="text-xl font-semibold tracking-tight">{result.title}</h3>
              <p className="text-sm text-muted-foreground mt-2">{result.excerpt}</p>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-2xl font-semibold ${getScoreColor(result.qualityScore)}`}>
                {result.qualityScore}/100
              </div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">E-E-A-T Score</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {result.competitorCount} competitors analyzed
            </span>
            <span className="flex items-center gap-1">
              {result.pushed ? <ExternalLink className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              {result.pushed ? "Published to website" : "Saved to calendar"}
            </span>
          </div>

          {/* Blog preview */}
          {result.body && (
            <details className="group">
              <summary className="text-sm font-medium cursor-pointer hover:text-foreground transition-colors text-muted-foreground">
                Preview blog content
              </summary>
              <div
                className="mt-4 p-6 bg-white/80 rounded-2xl prose prose-sm max-w-none max-h-96 overflow-y-auto text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: result.body.slice(0, 5000) }}
              />
            </details>
          )}
        </div>
      )}

      {/* Existing Blog Posts */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
          Your Blog Posts ({blogs.length})
        </p>
        {loadingBlogs ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : blogs.length === 0 ? (
          <div className="bg-muted/30 rounded-[24px] py-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No blog posts generated yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {blogs.map((blog, i) => (
              <div key={i} className="bg-white/50 rounded-2xl p-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h4 className="text-sm font-medium truncate">{blog.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{blog.excerpt}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {blog.pushed ? "Published" : "Draft"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
