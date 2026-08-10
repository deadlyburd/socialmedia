"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CalendarView, { type CalendarEvent } from "@/components/ui/calendar-view/calendar-view";
import { BlogAutomationSettings } from "@/components/blog-automation-settings";
import { ArrowLeft, Download, Video, ImageIcon, Camera, Loader2, CalendarDays, Zap } from "lucide-react";

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

export default function AdminClientCalendarPage() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const clientId = params.clientId as string;

  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientName, setClientName] = useState("");
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) { router.replace("/login"); return; }
    if (!user || !clientId) return;

    // Load client name
    fetch("/api/admin/clients", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          const client = (d.data ?? []).find((c: any) => c.tenantId === clientId);
          if (client) setClientName(client.businessName ?? client.name);
        }
      })
      .catch(() => {});

    // Load content
    fetch(`/api/admin/calendar/${clientId}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data) {
          // Normalize snake_case from Supabase to camelCase
          const normalized = d.data.map((item: any) => ({
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
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isLoading, isAuthenticated, user, clientId]);

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

  const stats = useMemo(() => ({
    total: items.length,
    ready: items.filter(i => i.status === "ready").length,
    downloaded: items.filter(i => i.status === "downloaded").length,
    posted: items.filter(i => i.status === "posted").length,
  }), [items]);

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => router.push("/admin/clients")}
            className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="h-3 w-3" /> Back to Clients
          </button>
          <h1 className="text-[32px] md:text-[42px] font-semibold tracking-tight leading-tight">
            {clientName || "Client"} Calendar
          </h1>
          <p className="text-muted-foreground mt-1.5 text-[15px]">
            {stats.total} content piece{stats.total !== 1 ? "s" : ""} scheduled
          </p>
        </div>
        <Button
          onClick={() => router.push(`/admin/upload?clientId=${clientId}`)}
          className="rounded-full bg-foreground hover:bg-foreground/90 text-background h-10 px-5 text-sm"
        >
          Upload for {clientName?.split(" ")[0] ?? "Client"}
        </Button>
      </div>

      {/* Tab: Calendar | Automation */}
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
            value="automation"
            className="rounded-xl text-sm font-medium data-[state=active]:bg-background data-[state=active]:text-foreground text-muted-foreground px-5 py-2 transition-all"
          >
            <Zap className="h-4 w-4 mr-1.5" />
            Blog Automation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="space-y-8">
          {/* Stat pills */}
          <div className="grid gap-4 grid-cols-4">
            {[
              { label: "Total", value: stats.total, bg: "bg-lavender" },
              { label: "Ready", value: stats.ready, bg: "bg-yellow" },
              { label: "Downloaded", value: stats.downloaded, bg: "bg-blue" },
              { label: "Posted", value: stats.posted, bg: "bg-mint" },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-[20px] p-4`}>
                <div className="text-2xl font-semibold">{s.value}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mt-0.5">{s.label}</div>
              </div>
            ))}
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
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">Platform</span>
                  <span className="font-medium capitalize">{selectedItem.platform}</span>
                </div>
                <div className="p-4 rounded-2xl bg-white/60">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">Date</span>
                  <span className="font-medium">{new Date(selectedItem.scheduledDate).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="flex gap-3 pt-6 border-t border-black/5">
                <a
                  href={selectedItem.fileUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-full bg-foreground hover:bg-foreground/90 text-background h-10 px-5 text-sm font-medium"
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  Download
                </a>
              </div>
            </div>
          )}

          {items.length === 0 && !loading && (
            <div className="bg-muted/30 rounded-[24px] py-20 text-center">
              <CalendarDays className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">No content scheduled yet for this client.</p>
              <Button
                onClick={() => router.push(`/admin/upload?clientId=${clientId}`)}
                className="rounded-full bg-foreground text-background h-10 px-5 text-sm"
              >
                Upload first content
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="automation">
          <BlogAutomationSettings clientId={clientId} clientName={clientName || "this client"} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
