"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Plus, Trash2, FileText, Layers } from "lucide-react";
import { toast } from "sonner";

interface Brief {
  id?: string;
  brand_voice?: string | null;
  target_audience?: string | null;
  goals?: string | null;
  content_pillars?: Array<{ name: string; share?: number }>;
  platforms?: Array<{ platform: string; handle?: string; cadence?: string }>;
  style_guidelines?: Record<string, unknown>;
  notes?: string | null;
  status?: string;
}

interface Strategy {
  id: string;
  name: string;
  pillars_json?: Array<{ name: string; share?: number }>;
  status?: string;
  created_at?: string;
}

function parsePillars(text: string): Array<{ name: string; share?: number }> {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, shareStr] = line.split("|").map((s) => s.trim());
      const share = shareStr ? Number(shareStr) : undefined;
      return share && !Number.isNaN(share) ? { name, share } : { name };
    });
}

function parsePlatforms(text: string): Array<{ platform: string; handle?: string; cadence?: string }> {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [platform, second] = line.split(/[:|]/).map((s) => s.trim());
      if (!second) return { platform };
      return second.includes("/") || second.includes("x") || second.includes("week")
        ? { platform, cadence: second }
        : { platform, handle: second };
    });
}

function pillarsToText(pillars: Array<{ name: string; share?: number }> | undefined): string {
  if (!pillars?.length) return "";
  return pillars.map((p) => (p.share ? `${p.name}|${p.share}` : p.name)).join("\n");
}

function platformsToText(platforms: Array<{ platform: string; handle?: string; cadence?: string }> | undefined): string {
  if (!platforms?.length) return "";
  return platforms
    .map((p) => (p.cadence ? `${p.platform}|${p.cadence}` : p.handle ? `${p.platform}:${p.handle}` : p.platform))
    .join("\n");
}

export function ClientBriefStrategy({ clientId }: { clientId: string }) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Brief form state
  const [brandVoice, setBrandVoice] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [goals, setGoals] = useState("");
  const [pillars, setPillars] = useState("");
  const [platforms, setPlatforms] = useState("");
  const [notes, setNotes] = useState("");

  // Strategy form state
  const [strategyName, setStrategyName] = useState("");
  const [strategyPillars, setStrategyPillars] = useState("");
  const [creatingStrategy, setCreatingStrategy] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function load() {
    setLoading(true);
    try {
      const [briefRes, stratRes] = await Promise.all([
        fetch(`/api/admin/clients/${clientId}/brief`, { credentials: "include" }),
        fetch(`/api/admin/clients/${clientId}/strategies`, { credentials: "include" }),
      ]);
      const briefData = await briefRes.json();
      const stratData = await stratRes.json();

      if (briefData.success) {
        setBrief(briefData.data);
        setBrandVoice(briefData.data?.brand_voice ?? "");
        setTargetAudience(briefData.data?.target_audience ?? "");
        setGoals(briefData.data?.goals ?? "");
        setPillars(pillarsToText(briefData.data?.content_pillars));
        setPlatforms(platformsToText(briefData.data?.platforms));
        setNotes(briefData.data?.notes ?? "");
      }
      if (stratData.success) setStrategies(stratData.data ?? []);
    } catch {
      toast.error("Failed to load brief & strategy");
    } finally {
      setLoading(false);
    }
  }

  async function saveBrief() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/brief`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          brandVoice,
          targetAudience,
          goals,
          contentPillars: parsePillars(pillars),
          platforms: parsePlatforms(platforms),
          styleGuidelines: brief?.style_guidelines ?? {},
          notes,
          status: brief?.status ?? "active",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setBrief(data.data);
        toast.success("Brief saved");
      } else {
        toast.error(data.error ?? "Failed to save brief");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function createStrategy() {
    if (!strategyName.trim()) {
      toast.error("Strategy name is required");
      return;
    }
    setCreatingStrategy(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/strategies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: strategyName.trim(), pillars: parsePillars(strategyPillars) }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Strategy created");
        setStrategyName("");
        setStrategyPillars("");
        load();
      } else {
        toast.error(data.error ?? "Failed to create strategy");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setCreatingStrategy(false);
    }
  }

  async function deleteStrategy(id: string) {
    if (!confirm("Delete this strategy?")) return;
    try {
      const res = await fetch(`/api/admin/strategies/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        setStrategies(prev => prev.filter(s => s.id !== id));
        toast.success("Strategy deleted");
      } else {
        toast.error("Delete failed");
      }
    } catch {
      toast.error("Network error");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[30vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Brief */}
      <div className="bg-white/50 rounded-[24px] p-6">
        <div className="flex items-center gap-2 mb-5">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold tracking-tight">Requirements / Brief</h3>
        </div>
        <div className="space-y-4">
          <Field label="Brand voice">
            <textarea value={brandVoice} onChange={(e) => setBrandVoice(e.target.value)} placeholder="Friendly, authoritative, playful…" className="w-full min-h-[64px] rounded-2xl bg-white/60 border border-black/10 px-4 py-3 text-sm outline-none focus:border-black/30 resize-y" />
          </Field>
          <Field label="Target audience">
            <textarea value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="Who is this content for?" className="w-full min-h-[64px] rounded-2xl bg-white/60 border border-black/10 px-4 py-3 text-sm outline-none focus:border-black/30 resize-y" />
          </Field>
          <Field label="Goals">
            <textarea value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="Bookings, awareness, leads…" className="w-full min-h-[64px] rounded-2xl bg-white/60 border border-black/10 px-4 py-3 text-sm outline-none focus:border-black/30 resize-y" />
          </Field>
          <Field label="Content pillars (one per line, optional |share%)">
            <textarea value={pillars} onChange={(e) => setPillars(e.target.value)} placeholder={"Behind the scenes|30\nTips & education|40\nPromotions|30"} className="w-full min-h-[72px] rounded-2xl bg-white/60 border border-black/10 px-4 py-3 text-sm outline-none focus:border-black/30 resize-y font-mono text-xs" />
          </Field>
          <Field label="Platforms (one per line: platform:handle or platform|cadence)">
            <textarea value={platforms} onChange={(e) => setPlatforms(e.target.value)} placeholder={"instagram:@handle\nlinkedin:Company\nblog|1x/week"} className="w-full min-h-[64px] rounded-2xl bg-white/60 border border-black/10 px-4 py-3 text-sm outline-none focus:border-black/30 resize-y font-mono text-xs" />
          </Field>
          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything else the team should know…" className="w-full min-h-[64px] rounded-2xl bg-white/60 border border-black/10 px-4 py-3 text-sm outline-none focus:border-black/30 resize-y" />
          </Field>
          <Button onClick={saveBrief} disabled={saving} className="rounded-full bg-foreground hover:bg-foreground/90 text-background h-10 px-5 text-sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save Brief
          </Button>
        </div>
      </div>

      {/* Strategy */}
      <div className="bg-white/50 rounded-[24px] p-6">
        <div className="flex items-center gap-2 mb-5">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold tracking-tight">Content Strategy</h3>
        </div>

        <div className="space-y-3 mb-6">
          <Input value={strategyName} onChange={(e) => setStrategyName(e.target.value)} placeholder="Strategy name (e.g. Q3 Launch)" className="rounded-xl border-black/10" />
          <textarea value={strategyPillars} onChange={(e) => setStrategyPillars(e.target.value)} placeholder="Pillars (one per line, optional |share%)" className="w-full min-h-[56px] rounded-2xl bg-white/60 border border-black/10 px-4 py-3 text-sm outline-none focus:border-black/30 resize-y font-mono text-xs" />
          <Button onClick={createStrategy} disabled={creatingStrategy} className="rounded-full bg-foreground hover:bg-foreground/90 text-background h-9 px-4 text-sm">
            {creatingStrategy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Add Strategy
          </Button>
        </div>

        {strategies.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No strategies yet.</p>
        ) : (
          <div className="space-y-2">
            {strategies.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-3 rounded-2xl bg-white/60 border border-black/5">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {(s.pillars_json ?? []).map((p) => p.name).join(" · ") || "No pillars"}
                  </p>
                </div>
                <span className="text-[10px] font-medium uppercase px-2 py-0.5 rounded bg-muted text-muted-foreground">{s.status ?? "active"}</span>
                <button onClick={() => deleteStrategy(s.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}
