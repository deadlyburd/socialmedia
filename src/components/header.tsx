"use client";

import { Bell, LogOut, Menu, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-context";
import { useSidebar } from "./sidebar-provider";

const NOTIF_STORAGE_KEY = "optimus_notifications";

interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
}

function loadNotifications(): Notification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveNotifications(notifs: Notification[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(notifs));
}

export function addNotification(title: string, message: string) {
  const notifs = loadNotifications();
  notifs.unshift({
    id: `n_${Date.now()}`,
    title,
    message,
    time: new Date().toLocaleString(),
    read: false,
  });
  if (notifs.length > 20) notifs.length = 20;
  saveNotifications(notifs);
}

export function Header() {
  const { toggle } = useSidebar();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    setNotifications(loadNotifications());
    const onStorage = () => setNotifications(loadNotifications());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const onFocus = () => setNotifications(loadNotifications());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    const updated = notifications.map(n => ({ ...n, read: true }));
    saveNotifications(updated);
    setNotifications(updated);
  };

  const clearAll = () => {
    saveNotifications([]);
    setNotifications([]);
  };

  const handleLogout = () => {
    logout();
    window.location.href = "/";
  };

  return (
    <header className="sticky top-0 z-40 border-b border-transparent bg-background/80 backdrop-blur-sm">
      <div className="flex h-14 items-center px-5 gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden rounded-xl h-9 w-9"
          onClick={toggle}
        >
          <Menu className="h-4 w-4" />
          <span className="sr-only">Toggle sidebar</span>
        </Button>

        <div className="flex-1" />

        {/* Notifications */}
        <DropdownMenu open={notifOpen} onOpenChange={setNotifOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl relative">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-foreground text-background text-[10px] font-semibold">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
              <span className="sr-only">Notifications</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 rounded-2xl border-border/20 p-0 shadow-none">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border/20">
              <DropdownMenuLabel className="p-0 text-sm font-semibold">Notifications</DropdownMenuLabel>
              <div className="flex gap-2">
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg bg-muted/50">
                    Mark all read
                  </button>
                )}
                {notifications.length > 0 && (
                  <button onClick={clearAll} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg bg-muted/50">
                    Clear
                  </button>
                )}
              </div>
            </div>
            <DropdownMenuSeparator className="hidden" />
            {notifications.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <Bell className="h-6 w-6 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
                <p className="text-xs text-muted-foreground/40 mt-1">Content review alerts appear here</p>
              </div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto">
                {notifications.map((n) => (
                  <DropdownMenuItem
                    key={n.id}
                    onClick={() => {
                      const updated = notifications.map(x => x.id === n.id ? { ...x, read: true } : x);
                      saveNotifications(updated);
                      setNotifications(updated);
                      router.push("/generate");
                    }}
                    className={`flex flex-col items-start gap-1 px-5 py-3 cursor-pointer border-b border-border/10 last:border-0 rounded-none ${
                      !n.read ? "bg-muted/30" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2.5 w-full">
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-foreground shrink-0" />}
                      <span className="text-xs font-medium flex-1">{n.title}</span>
                      <span className="text-[10px] text-muted-foreground/40 shrink-0">{n.time}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground ml-4">{n.message}</p>
                  </DropdownMenuItem>
                ))}
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full bg-muted/50"
            >
              <User className="h-4 w-4" />
              <span className="sr-only">User menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-2xl border-border/20 min-w-[200px] shadow-none">
            <DropdownMenuLabel className="font-normal px-4 pt-3">
              <span className="font-semibold text-sm">{user?.name ?? "My Account"}</span>
              {user?.email && (
                <p className="text-xs text-muted-foreground font-normal truncate max-w-[200px] mt-0.5">
                  {user.email}
                </p>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border/20" />
            <DropdownMenuItem onClick={() => router.push("/settings/profile")} className="rounded-xl text-sm mx-1">
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/settings")} className="rounded-xl text-sm mx-1">
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border/20" />
            <DropdownMenuItem onClick={handleLogout} className="rounded-xl text-sm mx-1 mb-1">
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
