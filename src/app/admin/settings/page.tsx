"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AdminSettingsPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) { router.replace("/login"); return; }
    if (user) setName(user.name);
  }, [isLoading, isAuthenticated, user]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        toast.success("Settings saved");
      } else {
        toast.error("Failed to save");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-xl mx-auto">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Settings</p>
        <h1 className="text-[32px] md:text-[42px] font-semibold tracking-tight leading-tight">
          Agency Settings
        </h1>
        <p className="text-muted-foreground mt-1.5 text-[15px]">
          Manage your agency profile
        </p>
      </div>

      <div className="space-y-6 bg-white/50 rounded-[24px] p-8">
        <div>
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" /> Name
          </Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-xl border-black/10"
          />
        </div>

        <div>
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" /> Email
          </Label>
          <Input
            value={user?.email ?? ""}
            disabled
            className="rounded-xl border-black/10 bg-muted/30"
          />
          <p className="text-[11px] text-muted-foreground mt-1">Contact support to change your email.</p>
        </div>

        <div>
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" /> Role
          </Label>
          <Input
            value="Admin (Agency)"
            disabled
            className="rounded-xl border-black/10 bg-muted/30 capitalize"
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="rounded-full bg-foreground hover:bg-foreground/90 text-background h-10 px-6"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
