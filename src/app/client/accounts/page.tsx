"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Link2, Unlink, Instagram } from "lucide-react";
import { toast } from "sonner";

const PLATFORM_CONFIG = [
  { platform: "instagram", label: "Instagram", icon: Instagram, color: "#E1306C" },
  { platform: "facebook", label: "Facebook", icon: Instagram, color: "#1877F2" },
  { platform: "tiktok", label: "TikTok", icon: Instagram, color: "#000000" },
  { platform: "youtube", label: "YouTube", icon: Instagram, color: "#FF0000" },
  { platform: "linkedin", label: "LinkedIn", icon: Instagram, color: "#0A66C2" },
];

interface Account {
  platform: string;
  connected: boolean;
  handle: string | null;
}

export default function AccountsPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) { router.replace("/login"); return; }
    loadAccounts();
  }, [isLoading, isAuthenticated]);

  async function loadAccounts() {
    try {
      const res = await fetch("/api/client/accounts", { credentials: "include" });
      const data = await res.json();
      if (data.success) setAccounts(data.data ?? []);
    } catch {
      toast.error("Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }

  async function connectPlatform(platform: string) {
    setConnecting(platform);
    try {
      const res = await fetch("/api/client/accounts/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ platform }),
      });
      const data = await res.json();
      if (data.success && data.data?.authUrl) {
        window.location.href = data.data.authUrl;
      } else if (data.success) {
        toast.success(`Connected to ${platform}`);
        loadAccounts();
      } else {
        toast.error(data.error ?? "Connection failed");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setConnecting(null);
    }
  }

  async function disconnectPlatform(platform: string) {
    if (!confirm(`Disconnect ${platform}?`)) return;
    try {
      const res = await fetch(`/api/client/accounts/${platform}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success(`Disconnected ${platform}`);
        loadAccounts();
      } else {
        toast.error("Failed to disconnect");
      }
    } catch {
      toast.error("Network error");
    }
  }

  if (isLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-xl mx-auto">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Accounts</p>
        <h1 className="text-[32px] md:text-[42px] font-semibold tracking-tight leading-tight">
          Linked Accounts
        </h1>
        <p className="text-muted-foreground mt-1.5 text-[15px]">
          Connect your social media accounts to post content directly from your calendar
        </p>
      </div>

      <div className="space-y-3">
        {PLATFORM_CONFIG.map((cfg) => {
          const account = accounts.find(a => a.platform === cfg.platform);
          const isConnected = account?.connected ?? false;

          return (
            <div
              key={cfg.platform}
              className="bg-white/50 rounded-[24px] p-5 flex items-center gap-4"
            >
              <span
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: cfg.color }}
              >
                <cfg.icon className="h-5 w-5" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{cfg.label}</p>
                {isConnected ? (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Connected as {account?.handle ?? "—"}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">Not connected</p>
                )}
              </div>
              {isConnected ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => disconnectPlatform(cfg.platform)}
                  className="rounded-full border-black/10 h-8 px-4 text-xs"
                >
                  <Unlink className="h-3 w-3 mr-1" /> Disconnect
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => connectPlatform(cfg.platform)}
                  disabled={connecting === cfg.platform}
                  className="rounded-full bg-foreground hover:bg-foreground/90 text-background h-8 px-4 text-xs"
                >
                  {connecting === cfg.platform ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Link2 className="h-3 w-3 mr-1" />
                  )}
                  Connect
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Your agency will upload content — you decide when and where to post it.
      </p>
    </div>
  );
}
