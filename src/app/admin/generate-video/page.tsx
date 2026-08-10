"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Video, Sparkles, User, Clock, DollarSign, Play, Download, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import type { SeedanceModel, VideoQuality, AspectRatio } from "@/lib/services/seedance-service";
import { estimateCost } from "@/lib/services/seedance-service";

interface ClientOption {
  tenantId: string;
  name: string;
  email: string;
}

export default function GenerateVideoPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<SeedanceModel>("seedance-2.0-text-to-video");
  const [duration, setDuration] = useState(5);
  const [quality, setQuality] = useState<VideoQuality>("720p");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [audio, setAudio] = useState(true);

  const [generating, setGenerating] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [pushed, setPushed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) { router.replace("/login"); return; }
  }, [isLoading, isAuthenticated]);

  // Load clients
  useEffect(() => {
    fetch("/api/admin/clients", { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (d.success) setClients(d.data ?? []); })
      .catch(() => {});
  }, []);

  const isFast = model.includes("fast");
  const cost = estimateCost(duration, quality, isFast);

  async function handleGenerate() {
    if (!prompt.trim()) { toast.error("Enter a prompt first."); return; }
    if (!selectedClient) { toast.error("Select a client first."); return; }

    setGenerating(true);
    setError(null);
    setTaskId(null);
    setProgress(0);
    setVideoUrl(null);
    setPushed(false);

    try {
      const res = await fetch("/api/admin/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          prompt: prompt.trim(),
          model,
          duration,
          quality,
          aspectRatio,
          generateAudio: audio,
          tenantId: selectedClient,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error ?? "Generation failed");
        toast.error(data.error ?? "Generation failed");
        return;
      }

      setTaskId(data.data.taskId);
      toast.success("Video generation started! Polling for completion...");

      // Poll until done
      pollUntilDone(data.data.taskId);
    } catch {
      setError("Network error");
      toast.error("Network error");
      setGenerating(false);
    }
  }

  async function pollUntilDone(tid: string) {
    const maxPolls = 60; // 5 minutes at 5s intervals
    let polls = 0;

    const interval = setInterval(async () => {
      polls++;
      try {
        const res = await fetch(`/api/admin/generate-video?taskId=${tid}`, { credentials: "include" });
        const data = await res.json();

        if (!data.success) {
          clearInterval(interval);
          setError(data.error ?? "Polling failed");
          setGenerating(false);
          return;
        }

        const task = data.data;
        setProgress(task.progress ?? Math.min(polls * 2, 95));

        if (task.status === "completed") {
          clearInterval(interval);
          setProgress(100);
          setVideoUrl(task.videoUrl);
          setGenerating(false);
          toast.success("Video generated successfully!");
        } else if (task.status === "failed") {
          clearInterval(interval);
          setError(task.error ?? "Generation failed");
          setGenerating(false);
          toast.error(task.error ?? "Generation failed");
        }
      } catch {
        clearInterval(interval);
        setError("Lost connection while polling");
        setGenerating(false);
      }

      if (polls >= maxPolls) {
        clearInterval(interval);
        setError("Timed out waiting for video generation");
        setGenerating(false);
      }
    }, 5000);
  }

  async function handlePushToClient() {
    if (!videoUrl || !selectedClient) return;

    try {
      const res = await fetch("/api/admin/generate-video/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          videoUrl,
          tenantId: selectedClient,
          title: prompt.slice(0, 60),
          prompt,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setPushed(true);
        toast.success(`Video pushed to ${data.data.clientName}'s calendar!`);
      } else {
        toast.error(data.error ?? "Push failed");
      }
    } catch {
      toast.error("Network error");
    }
  }

  const selectedClientName = clients.find(c => c.tenantId === selectedClient)?.name;

  return (
    <div className="flex flex-col gap-8 max-w-3xl mx-auto">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">AI Studio</p>
        <h1 className="text-[32px] md:text-[42px] font-semibold tracking-tight leading-tight">
          Generate Video
        </h1>
        <p className="text-muted-foreground mt-1.5 text-[15px]">
          Seedance 2.0 AI — text-to-video, pushed directly to your client's calendar
        </p>
      </div>

      {/* Config */}
      <div className="bg-white/50 rounded-[24px] p-6 space-y-4">
        {/* Client selector */}
        <div>
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
            <User className="h-3.5 w-3.5 inline mr-1" /> Client
          </Label>
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="rounded-2xl border-black/10">
              <SelectValue placeholder="Choose a client..." />
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
              {clients.map(c => (
                <SelectItem key={c.tenantId} value={c.tenantId} className="rounded-xl">
                  {c.name} ({c.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Prompt */}
        <div>
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
            Prompt
          </Label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., Aerial drone shot of a modern office building at golden hour, smooth camera movement, cinematic lighting..."
            rows={3}
            className="rounded-xl border-black/10 resize-none"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            {prompt.length}/1000 characters (English)
          </p>
        </div>

        {/* Settings grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Model</Label>
            <Select value={model} onValueChange={(v) => setModel(v as SeedanceModel)}>
              <SelectTrigger className="rounded-xl border-black/10 text-xs h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="seedance-2.0-text-to-video" className="rounded-lg text-xs">Standard (quality)</SelectItem>
                <SelectItem value="seedance-2.0-fast-text-to-video" className="rounded-lg text-xs">Fast (cheaper)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
              <Clock className="h-3 w-3 inline mr-0.5" /> Duration
            </Label>
            <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
              <SelectTrigger className="rounded-xl border-black/10 text-xs h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {[4, 5, 6, 8, 10, 12, 15].map(d => (
                  <SelectItem key={d} value={String(d)} className="rounded-lg text-xs">{d}s</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Quality</Label>
            <Select value={quality} onValueChange={(v) => setQuality(v as VideoQuality)}>
              <SelectTrigger className="rounded-xl border-black/10 text-xs h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="480p" className="rounded-lg text-xs">480p</SelectItem>
                <SelectItem value="720p" className="rounded-lg text-xs">720p</SelectItem>
                <SelectItem value="1080p" className="rounded-lg text-xs">1080p</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Ratio</Label>
            <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as AspectRatio)}>
              <SelectTrigger className="rounded-xl border-black/10 text-xs h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="16:9" className="rounded-lg text-xs">16:9 (landscape)</SelectItem>
                <SelectItem value="9:16" className="rounded-lg text-xs">9:16 (reel)</SelectItem>
                <SelectItem value="1:1" className="rounded-lg text-xs">1:1 (square)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Audio toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAudio(!audio)}
            className={`relative w-10 h-6 rounded-full transition-colors ${audio ? "bg-foreground" : "bg-muted-foreground/30"}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${audio ? "translate-x-4" : ""}`} />
          </button>
          <span className="text-xs text-muted-foreground">Generate audio soundtrack</span>
        </div>

        {/* Cost estimate */}
        <div className="bg-lavender/50 rounded-2xl p-3 flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Estimated cost: <strong>${cost.toFixed(2)}</strong> ({duration}s × {quality} × {isFast ? "fast" : "standard"})
          </span>
        </div>

        {/* Generate button */}
        <Button
          onClick={handleGenerate}
          disabled={generating || !prompt.trim() || !selectedClient}
          className="w-full rounded-full bg-foreground hover:bg-foreground/90 text-background h-11 text-sm"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          {generating
            ? progress < 100 ? `Generating... ${progress}%` : "Processing..."
            : `Generate for ${selectedClientName ?? "..."}`}
        </Button>
      </div>

      {/* Progress */}
      {generating && (
        <div className="bg-yellow/30 rounded-[24px] p-8 text-center space-y-3 animate-in fade-in">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-foreground/40" />
          <div>
            <p className="text-sm font-medium">AI is generating your video...</p>
            <p className="text-xs text-muted-foreground mt-1">
              {progress < 30 ? "Submitting to Seedance 2.0..." :
               progress < 70 ? "Model is rendering frames..." :
               progress < 100 ? "Finalizing video..." : "Almost done..."}
            </p>
          </div>
          <div className="w-full max-w-xs mx-auto bg-foreground/10 rounded-full h-1.5 overflow-hidden">
            <div className="h-full bg-foreground rounded-full transition-all duration-1000" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Result */}
      {videoUrl && (
        <div className="bg-mint/30 rounded-[24px] p-6 space-y-4 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <h3 className="font-semibold">Video Ready</h3>
          </div>

          <video
            src={videoUrl}
            controls
            className="w-full max-h-80 rounded-2xl bg-black/5"
          />

          <div className="flex gap-3">
            <a
              href={videoUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-full bg-foreground hover:bg-foreground/90 text-background h-10 px-5 text-sm"
            >
              <Download className="h-4 w-4 mr-1.5" />
              Download
            </a>
            {!pushed ? (
              <Button
                onClick={handlePushToClient}
                className="rounded-full bg-foreground hover:bg-foreground/90 text-background h-10 px-5 text-sm"
              >
                <Play className="h-4 w-4 mr-1.5" />
                Push to {selectedClientName ?? "Client"}
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm text-green-700 h-10 px-5">
                <CheckCircle2 className="h-4 w-4" />
                Pushed to {selectedClientName}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-700">Generation failed</p>
            <p className="text-xs text-red-600 mt-0.5">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
