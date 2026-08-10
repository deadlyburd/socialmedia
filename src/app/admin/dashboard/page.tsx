"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Users, Upload, CalendarDays, ImageIcon, ArrowRight, Plus, Video, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdminStats {
  totalClients: number;
  contentThisMonth: number;
  activeClients: number;
  totalContent: number;
  recentUploads: Array<{
    id: string;
    title: string;
    contentType: string;
    clientName: string;
    scheduledDate: string;
    status: string;
  }>;
  clients: Array<{
    tenantId: string;
    name: string;
    contentCount: number;
    lastUpload: string | null;
  }>;
}

const STAT_CARDS = [
  { key: "totalClients", label: "Total Clients", icon: Users, bg: "bg-lavender", color: "text-lavender-foreground" },
  { key: "contentThisMonth", label: "Content This Month", icon: Upload, bg: "bg-mint", color: "text-mint-foreground" },
  { key: "totalContent", label: "Total Content", icon: ImageIcon, bg: "bg-pink", color: "text-pink-foreground" },
  { key: "activeClients", label: "Active Clients", icon: CalendarDays, bg: "bg-yellow", color: "text-yellow-foreground" },
] as const;

export default function AdminDashboardPage() {
  const { user, isAuthenticated, isLoading, isAdmin } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (!isLoading && isAdmin === false) {
      router.replace("/client/calendar");
      return;
    }
  }, [isLoading, isAuthenticated, isAdmin, router]);

  useEffect(() => {
    if (!user) return;
    loadStats();
  }, [user]);

  async function loadStats() {
    try {
      const [clientsRes, contentRes] = await Promise.all([
        fetch("/api/admin/clients", { credentials: "include" }),
        fetch("/api/admin/content", { credentials: "include" }),
      ]);
      const clientsData = await clientsRes.json();
      const contentData = await contentRes.json();

      const clients = clientsData.data ?? [];
      const allContent = contentData.data ?? [];

      const now = new Date();
      const thisMonth = allContent.filter((c: any) => {
        const created = new Date(c.createdAt);
        return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
      });

      // Recent uploads
      const recent = allContent
        .slice(0, 5)
        .map((c: any) => ({
          id: c.id,
          title: c.title,
          contentType: c.contentType ?? "video",
          clientName: clients.find((cl: any) => cl.tenantId === c.tenantId)?.businessName ?? "Unknown",
          scheduledDate: c.scheduledDate,
          status: c.status,
        }));

      setStats({
        totalClients: clients.length,
        contentThisMonth: thisMonth.length,
        activeClients: clients.filter((c: any) => c.contentCount > 0).length,
        totalContent: allContent.length,
        recentUploads: recent,
        clients: clients.map((c: any) => ({
          tenantId: c.tenantId,
          name: c.businessName ?? c.name,
          contentCount: c.contentCount ?? 0,
          lastUpload: c.lastUpload ?? null,
        })),
      });
    } catch (err) {
      console.error("Failed to load admin dashboard:", err);
    } finally {
      setLoading(false);
    }
  }

  if (isLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full border-2 border-muted border-t-foreground animate-spin" />
          <p className="text-sm text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const s = stats;
  const statValues: Record<string, { value: number; loading: boolean }> = {
    totalClients: { value: s?.totalClients ?? 0, loading },
    contentThisMonth: { value: s?.contentThisMonth ?? 0, loading },
    totalContent: { value: s?.totalContent ?? 0, loading },
    activeClients: { value: s?.activeClients ?? 0, loading },
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Admin</p>
          <h1 className="text-[32px] md:text-[42px] font-semibold tracking-tight leading-tight">
            Welcome back, {user?.name?.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground mt-1.5 text-[15px]">
            Manage your clients and their content from one place
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => router.push("/admin/clients")}
            className="rounded-full bg-foreground hover:bg-foreground/90 text-background h-10 px-5 text-sm"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add Client
          </Button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 stagger-children">
        {STAT_CARDS.map((card) => (
          <div
            key={card.key}
            className={`${card.bg} rounded-[24px] p-6 hover-lift transition-all duration-300`}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{card.label}</span>
              <card.icon className="h-4 w-4 opacity-50" />
            </div>
            <div className="text-[36px] font-semibold tracking-tight leading-none">
              {statValues[card.key]?.loading ? "—" : statValues[card.key]?.value}
            </div>
          </div>
        ))}
      </div>

      {/* Two-column layout */}
      <div className="grid gap-5 grid-cols-1 lg:grid-cols-2">
        {/* Client list */}
        <div className="bg-blue rounded-[24px] p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-2xl font-semibold tracking-tight">Clients</h3>
              <p className="text-sm text-muted-foreground mt-0.5">All businesses you manage</p>
            </div>
            <Button
              onClick={() => router.push("/admin/clients")}
              variant="outline"
              size="sm"
              className="rounded-full border-black/10"
            >
              View all
            </Button>
          </div>

          {!s || s.clients.length === 0 ? (
            <div className="text-center py-10">
              <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">No clients yet.</p>
              <Button
                onClick={() => router.push("/admin/clients")}
                className="rounded-full bg-foreground text-background h-10 px-5 text-sm"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Add your first client
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {s!.clients.slice(0, 5).map((client, i) => (
                <button
                  key={client.tenantId}
                  onClick={() => router.push(`/admin/calendar/${client.tenantId}`)}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/60 hover:bg-white/80 transition-all text-left"
                >
                  <span className="w-9 h-9 rounded-xl bg-white/80 flex items-center justify-center text-sm font-semibold shrink-0">
                    {client.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{client.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {client.contentCount} content piece{client.contentCount !== 1 ? "s" : ""}
                      {client.lastUpload ? ` · Last: ${new Date(client.lastUpload).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recent uploads */}
        <div className="bg-pink rounded-[24px] p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-2xl font-semibold tracking-tight">Recent Uploads</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Latest content across all clients</p>
            </div>
            <Button
              onClick={() => router.push("/admin/upload")}
              size="sm"
              className="rounded-full bg-foreground hover:bg-foreground/90 text-background h-9 px-4 text-sm"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Upload
            </Button>
          </div>

          {!s || s.recentUploads.length === 0 ? (
            <div className="text-center py-10">
              <Video className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">No content uploaded yet.</p>
              <Button
                onClick={() => router.push("/admin/upload")}
                className="rounded-full bg-foreground text-background h-10 px-5 text-sm"
              >
                <Upload className="h-4 w-4 mr-1.5" />
                Upload content
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {s!.recentUploads.map((upload, i) => (
                <div
                  key={upload.id}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-white/60"
                >
                  <span className="w-10 h-10 rounded-xl bg-white/80 flex items-center justify-center shrink-0">
                    {upload.contentType === "video" ? (
                      <Video className="h-4 w-4 text-foreground/60" />
                    ) : upload.contentType === "carousel" ? (
                      <ImageIcon className="h-4 w-4 text-foreground/60" />
                    ) : (
                      <Camera className="h-4 w-4 text-foreground/60" />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{upload.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {upload.clientName} · {new Date(upload.scheduledDate).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`text-[10px] font-medium uppercase px-2 py-1 rounded-lg ${
                    upload.status === "posted" ? "bg-mint text-mint-foreground" :
                    upload.status === "downloaded" ? "bg-blue text-blue-foreground" :
                    "bg-yellow text-yellow-foreground"
                  }`}>
                    {upload.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
