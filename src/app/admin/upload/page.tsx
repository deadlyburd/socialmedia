"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Upload, X, FileVideo, ImageIcon, Camera, Loader2, Check, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const CONTENT_TYPES = [
  { value: "video", label: "Video", icon: FileVideo },
  { value: "image", label: "Image", icon: ImageIcon },
  { value: "carousel", label: "Carousel", icon: ImageIcon },
  { value: "reel", label: "Reel", icon: FileVideo },
  { value: "story", label: "Story", icon: Camera },
  { value: "feed_post", label: "Feed Post", icon: ImageIcon },
];

const PLATFORMS = [
  { value: "all", label: "All Platforms" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "facebook", label: "Facebook" },
  { value: "youtube", label: "YouTube" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "pinterest", label: "Pinterest" },
];

interface ClientOption {
  tenantId: string;
  name: string;
}

interface UploadingFile {
  file: File;
  preview: string;
  progress: number;
  id: string;
}

function UploadPageContent() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedClientId = searchParams.get("clientId");

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contentType, setContentType] = useState("video");
  const [platform, setPlatform] = useState("all");
  const [scheduledDate, setScheduledDate] = useState<Date>(new Date());
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) { router.replace("/login"); return; }
    if (!user) return;

    fetch("/api/admin/clients", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          const list = (d.data ?? []).map((c: any) => ({
            tenantId: c.tenantId,
            name: c.businessName ?? c.name,
          }));
          setClients(list);
          if (preselectedClientId) setSelectedClientId(preselectedClientId);
        }
      })
      .catch(() => {});
  }, [isLoading, isAuthenticated, user, preselectedClientId]);

  const handleFiles = useCallback((incoming: FileList | File[]) => {
    const newFiles: UploadingFile[] = [];
    for (const file of Array.from(incoming)) {
      if (file.size > 500 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 500MB)`);
        continue;
      }
      newFiles.push({
        file,
        preview: URL.createObjectURL(file),
        progress: 0,
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      });
    }
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const removeFile = (id: string) => {
    setFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file) URL.revokeObjectURL(file.preview);
      return prev.filter(f => f.id !== id);
    });
  };

  const handleUpload = async () => {
    if (!selectedClientId) { toast.error("Select a client first"); return; }
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (files.length === 0) { toast.error("Add at least one file"); return; }

    setUploading(true);
    let success = 0;
    let failed = 0;

    for (const f of files) {
      const formData = new FormData();
      formData.append("file", f.file);
      formData.append("tenantId", selectedClientId);
      formData.append("title", title);
      formData.append("description", description);
      formData.append("contentType", contentType);
      formData.append("platform", platform);
      formData.append("scheduledDate", scheduledDate.toISOString().split("T")[0]!);

      try {
        const res = await fetch("/api/admin/upload", {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        if (res.ok) {
          success++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    setUploading(false);
    if (success > 0) {
      toast.success(`${success} file${success !== 1 ? "s" : ""} uploaded successfully`);
      setFiles([]);
      setTitle("");
      setDescription("");
    }
    if (failed > 0) {
      toast.error(`${failed} upload${failed !== 1 ? "s" : ""} failed`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const ContentTypeIcon = CONTENT_TYPES.find(t => t.value === contentType)?.icon ?? FileVideo;

  return (
    <div className="flex flex-col gap-8 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Upload</p>
        <h1 className="text-[32px] md:text-[42px] font-semibold tracking-tight leading-tight">
          Upload Content
        </h1>
        <p className="text-muted-foreground mt-1.5 text-[15px]">
          Upload content for a client — it will appear on their calendar
        </p>
      </div>

      {/* Client selector */}
      <div>
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">
          Select Client
        </Label>
        <Select value={selectedClientId} onValueChange={setSelectedClientId}>
          <SelectTrigger className="rounded-2xl border-black/10 h-12">
            <SelectValue placeholder="Choose a client business..." />
          </SelectTrigger>
          <SelectContent className="rounded-2xl">
            {clients.map(c => (
              <SelectItem key={c.tenantId} value={c.tenantId} className="rounded-xl">
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Drag-and-drop zone */}
      <div
        className={cn(
          "relative border-2 border-dashed rounded-[24px] p-12 text-center transition-all duration-200",
          dragOver
            ? "border-foreground bg-foreground/5 scale-[1.01]"
            : "border-muted-foreground/20 hover:border-muted-foreground/40",
        )}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
      >
        <input
          type="file"
          multiple
          accept="video/*,image/*"
          className="absolute inset-0 opacity-0 cursor-pointer"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <Upload className="h-10 w-10 text-muted-foreground/40 mx-auto mb-4" />
        <p className="text-sm font-medium mb-1">
          Drag & drop files here, or <span className="underline">browse</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Videos and images up to 500MB
        </p>
      </div>

      {/* File previews */}
      {files.length > 0 && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
          {files.map(f => (
            <div key={f.id} className="relative group rounded-2xl overflow-hidden bg-muted/30 aspect-square">
              {f.file.type.startsWith("video/") ? (
                <video src={f.preview} className="w-full h-full object-cover" controls={false} />
              ) : (
                <img src={f.preview} alt={f.file.name} className="w-full h-full object-cover" />
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
              <button
                onClick={() => removeFile(f.id)}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-4 w-4" />
              </button>
              <p className="absolute bottom-0 left-0 right-0 px-2 py-1.5 text-[10px] text-white bg-black/50 truncate">
                {f.file.name}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Content details */}
      <div className="space-y-4">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Title
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Summer promo video"
              className="rounded-xl border-black/10"
            />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Content Type
            </Label>
            <Select value={contentType} onValueChange={setContentType}>
              <SelectTrigger className="rounded-2xl border-black/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                {CONTENT_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value} className="rounded-xl">
                    <span className="flex items-center gap-2">
                      <t.icon className="h-3.5 w-3.5" /> {t.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
            Description
          </Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of this content..."
            className="rounded-xl border-black/10"
          />
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Platform
            </Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="rounded-2xl border-black/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                {PLATFORMS.map(p => (
                  <SelectItem key={p.value} value={p.value} className="rounded-xl">{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Scheduled Date
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full rounded-2xl border-black/10 justify-start text-left font-normal",
                    !scheduledDate && "text-muted-foreground",
                  )}
                >
                  <CalendarDays className="h-4 w-4 mr-2 text-muted-foreground" />
                  {scheduledDate ? format(scheduledDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 rounded-2xl" align="start">
                <Calendar
                  mode="single"
                  selected={scheduledDate}
                  onSelect={(d) => d && setScheduledDate(d)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Submit */}
      <Button
        onClick={handleUpload}
        disabled={uploading || !selectedClientId || files.length === 0 || !title.trim()}
        className="w-full rounded-full bg-foreground hover:bg-foreground/90 text-background h-12 text-sm font-medium"
      >
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Uploading {files.length} file{files.length !== 1 ? "s" : ""}...
          </>
        ) : (
          <>
            <Upload className="h-4 w-4 mr-2" />
            Upload {files.length} file{files.length !== 1 ? "s" : ""} for{" "}
            {clients.find(c => c.tenantId === selectedClientId)?.name ?? "Client"}
          </>
        )}
      </Button>
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" /></div>}>
      <UploadPageContent />
    </Suspense>
  );
}
