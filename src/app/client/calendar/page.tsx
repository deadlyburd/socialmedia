"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CalendarView, { type CalendarEvent } from "@/components/ui/calendar-view/calendar-view";
import { ClientBlogGenerator } from "@/components/client-blog-generator";
import { Download, Video, ImageIcon, Camera, Loader2, Send, ExternalLink, CalendarDays, Zap } from "lucide-react";
import { toast } from "sonner";

interface ContentItem {
  id: string;
  title: string;
  description: string;
  fileUrl: string;
  thumbnailUrl: string | null;
  contentType: string;
  scheduledDate: string;
  platform: string;
  status: string;
  mimeType: string | null;
}

interface PlatformAccount {
  platform: string;
  connected: boolean;
  handle: string | null;
}

export default function ClientCalendarPage() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) { router.replace("/login"); return; }
    if (!user) return;

    Promise.all([
      fetch("/api/client/calendar", { credentials: "include" }),
      fetch("/api/client/accounts", { credentials: "include" }),
    ])
      .then(async ([calRes, accRes]) => {
        const calData = await calRes.json();
        const accData = await accRes.json();
        if (calData.success) {
          // Normalize snake_case from Supabase to camelCase
          const normalized = calData.data.map((item: any) => ({
            id: item.id,
            title: item.title,
            description: item.description ?? "",
            fileUrl: item.file_url ?? item.fileUrl ?? "",
            thumbnailUrl: item.thumbnail_url ?? item.thumbnailUrl ?? null,
            contentType: item.content_type ?? item.contentType ?? "feed_post",
            scheduledDate: item.scheduled_date ?? item.scheduledDate ?? "",
            platform: item.platform ?? "all",
            status: item.status ?? "ready",
            mimeType: item.mime_type ?? item.mimeType ?? null,
          }));
          setItems(normalized);
        }
        if (accData.success) setAccounts(accData.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isLoading, isAuthenticated, user]);

  const handleDownload = useCallback(async (item: ContentItem) => {
    try {
      const url = item.fileUrl;
      if (!url) { toast.error("No file available"); return; }

      // Fetch the file and force download via blob
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = item.title.replace(/[^a-zA-Z0-9]/g, "_") + "." + (blob.type.split("/")[1] ?? "jpg");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);

      // Mark as downloaded
      await fetch(`/api/client/content/${item.id}/download`, {
        method: "POST",
        credentials: "include",
      });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: "downloaded" } : i));
      toast.success("Downloaded!");
    } catch {
      toast.error("Download failed");
    }
  }, []);

  const handlePost = async (item: ContentItem) => {
    const hasConnected = accounts.some(a => a.connected);
    if (!hasConnected) {
      toast.error("Connect a social account first");
      router.push("/client/accounts");
      return;
    }

    setPosting(true);
    try {
      const res = await fetch(`/api/client/content/${item.id}/post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ platform: item.platform }),
      });
      const data = await res.json();
      if (data.success) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: "posted" } : i));
        setSelectedItem(prev => prev?.id === item.id ? { ...prev, status: "posted" } : prev);
        toast.success("Content posted successfully!");
      } else {
        toast.error(data.error ?? "Failed to post");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setPosting(false);
    }
  };

  const events: CalendarEvent[] = useMemo(() =>
    items.map(item => ({
      id: item.id,
      date: item.scheduled_date ?? item.scheduledDate,
      title: item.title,
      platform: item.platform,
      status: (item.status === "posted" ? "published" : item.status === "ready" ? "scheduled" : "pending") as CalendarEvent["status"],
      type: item.contentType === "video" || item.contentType === "reel" ? "reel" : item.contentType === "carousel" ? "carousel" : "feed_post",
    })),
  [items]);

  const scheduledCount = items.filter(i => i.status === "ready").length;
  const postedCount = items.filter(i => i.status === "posted").length;

  if (isLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const ContentIcon = selectedItem?.contentType === "video" || selectedItem?.contentType === "reel"
    ? Video : selectedItem?.contentType === "carousel"
    ? ImageIcon : Camera;

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Your Dashboard</p>
        <h1 className="text-[32px] md:text-[42px] font-semibold tracking-tight leading-tight">
          Content & Blogs
        </h1>
        <p className="text-muted-foreground mt-1.5 text-[15px]">
          {scheduledCount > 0
            ? `${scheduledCount} new content ready for you`
            : "Your agency will upload content here"}
        </p>
      </div>

      <Tabs defaultValue="calendar" className="space-y-6">
        <TabsList className="bg-muted/40 p-1 rounded-2xl gap-0 inline-flex">
          <TabsTrigger
            value="calendar"
            className="rounded-xl text-sm font-medium data-[state=active]:bg-background data-[state=active]:text-foreground text-muted-foreground px-5 py-2 transition-all"
          >
            <CalendarDays className="h-4 w-4 mr-1.5" />
            Calendar
          </TabsTrigger>
          <TabsTrigger
            value="blog"
            className="rounded-xl text-sm font-medium data-[state=active]:bg-background data-[state=active]:text-foreground text-muted-foreground px-5 py-2 transition-all"
          >
            <Zap className="h-4 w-4 mr-1.5" />
            Blog Generator
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="space-y-8">

      {/* Stat pills */}
      <div className="grid gap-4 grid-cols-3">
        <div className="bg-lavender rounded-[24px] p-6">
          <div className="text-[36px] font-semibold tracking-tight">{items.length}</div>
          <p className="text-xs text-muted-foreground mt-1.5">Total Content</p>
        </div>
        <div className="bg-yellow rounded-[24px] p-6">
          <div className="text-[36px] font-semibold tracking-tight">{scheduledCount}</div>
          <p className="text-xs text-muted-foreground mt-1.5">Ready to Post</p>
        </div>
        <div className="bg-mint rounded-[24px] p-6">
          <div className="text-[36px] font-semibold tracking-tight">{postedCount}</div>
          <p className="text-xs text-muted-foreground mt-1.5">Posted</p>
        </div>
      </div>

      {/* Calendar */}
      <div className="bg-white/50 rounded-[24px] p-1">
        <CalendarView events={events} onEventClick={(ev) => {
          const item = items.find(i => i.id === ev.id);
          if (item) setSelectedItem(item);
        }} />
      </div>

      {/* Selected content detail */}
      {selectedItem && (
        <div className="bg-pink rounded-[24px] p-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h3 className="text-2xl font-semibold tracking-tight">{selectedItem.title}</h3>
              {selectedItem.description && (
                <p className="text-sm text-muted-foreground mt-2">{selectedItem.description}</p>
              )}
            </div>
            <span className={`px-3 py-1 text-xs font-medium rounded-full capitalize ${
              selectedItem.status === "posted" ? "bg-mint" :
              selectedItem.status === "downloaded" ? "bg-blue" :
              "bg-white/60"
            }`}>
              {selectedItem.status}
            </span>
          </div>

          {/* Media preview */}
          {selectedItem.contentType === "video" || selectedItem.contentType === "reel" ? (
            <video
              src={selectedItem.fileUrl}
              controls
              className="w-full max-h-96 rounded-2xl bg-black/5 mb-6"
              poster={selectedItem.thumbnailUrl ?? undefined}
            />
          ) : (
            <img
              src={selectedItem.fileUrl}
              alt={selectedItem.title}
              className="w-full max-h-96 object-cover rounded-2xl bg-black/5 mb-6"
            />
          )}

          <div className="grid grid-cols-3 gap-4 text-sm mb-6">
            <div className="p-4 rounded-2xl bg-white/60">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">Type</span>
              <span className="font-medium capitalize flex items-center gap-1.5">
                <ContentIcon className="h-3.5 w-3.5" /> {selectedItem.contentType}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-white/60">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">For</span>
              <span className="font-medium capitalize">{selectedItem.platform}</span>
            </div>
            <div className="p-4 rounded-2xl bg-white/60">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">Date</span>
              <span className="font-medium">{new Date(selectedItem.scheduled_date ?? selectedItem.scheduledDate).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-6 border-t border-black/5">
            <button
              onClick={() => handleDownload(selectedItem)}
              className="inline-flex items-center rounded-full bg-foreground hover:bg-foreground/90 text-background h-10 px-5 text-sm font-medium"
            >
              <Download className="h-4 w-4 mr-1.5" />
              Download
            </button>
            <Button
              onClick={() => handlePost(selectedItem)}
              disabled={posting || selectedItem.status === "posted"}
              className="rounded-full bg-foreground hover:bg-foreground/90 text-background h-10 px-5 text-sm"
            >
              {posting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : selectedItem.status === "posted" ? (
                <Send className="h-4 w-4 mr-1.5" />
              ) : (
                <Send className="h-4 w-4 mr-1.5" />
              )}
              {selectedItem.status === "posted" ? "Posted" : "Post Now"}
            </Button>
            <a
              href={selectedItem.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-full border border-black/10 hover:bg-black/5 h-10 px-5 text-sm font-medium transition-colors"
            >
              <ExternalLink className="h-4 w-4 mr-1.5" />
              Open Original
            </a>
          </div>

          {selectedItem.status === "ready" && accounts.filter(a => a.connected).length === 0 && (
            <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-black/5">
              <button
                onClick={() => router.push("/client/accounts")}
                className="underline hover:text-foreground transition-colors"
              >
                Connect a social account
              </button>{" "}
              to post directly from here.
            </p>
          )}
        </div>
      )}

      {items.length === 0 && !loading && (
        <div className="bg-muted/30 rounded-[24px] py-20 text-center">
          <CalendarDays className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No content yet. Your agency will upload content for you soon!
          </p>
        </div>
      )}

        </TabsContent>

        <TabsContent value="blog">
          <ClientBlogGenerator />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CalendarDays({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  );
}
