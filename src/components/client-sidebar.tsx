"use client";

import {
  CalendarDays,
  Link2,
  LogOut,
  Menu,
  Settings,
  Download,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSidebar } from "./sidebar-provider";

export function ClientSidebar() {
  const pathname = usePathname();
  const { isOpen, toggle } = useSidebar();
  const { logout, user } = useAuth();

  const handleLogout = () => {
    logout();
    window.location.href = "/";
  };

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm lg:hidden transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={toggle}
      />

      {/* Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-sidebar",
          "transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0",
        )}
      >
        {/* Logo */}
        <div className="flex items-center h-14 px-5 border-b border-sidebar-border">
          <Link href="/client/calendar" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
              <Sparkles className="h-4 w-4 text-white" />
            </span>
            <span className="text-base font-semibold text-white tracking-tight">Optimus</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto lg:hidden text-sidebar-muted-foreground hover:text-white hover:bg-sidebar-accent rounded-xl h-8 w-8"
            onClick={toggle}
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-auto py-3 px-3">
          <div className="space-y-0.5">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-sidebar-accent text-white"
                      : "text-sidebar-muted-foreground hover:text-white hover:bg-sidebar-accent/60",
                  )}
                >
                  <item.icon className="h-[18px] w-[18px] shrink-0" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Bottom */}
        <div className="border-t border-sidebar-border px-3 py-3 space-y-0.5">
          <Link
            href="/client/settings"
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
              pathname === "/client/settings"
                ? "bg-sidebar-accent text-white"
                : "text-sidebar-muted-foreground hover:text-white hover:bg-sidebar-accent/60",
            )}
          >
            <Settings className="h-[18px] w-[18px] shrink-0" />
            <span>Settings</span>
          </Link>

          <div className="border-t border-sidebar-border my-1" />

          <div className="flex items-center gap-3 px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-muted-foreground shrink-0">
              <span className="text-xs font-medium">
                {user?.name?.charAt(0).toUpperCase() ?? "C"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate leading-tight">
                {user?.name ?? "Client"}
              </p>
              <p className="text-[11px] text-sidebar-muted-foreground/60 truncate leading-tight">
                {user?.email ?? ""}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-sidebar-muted-foreground hover:text-white hover:bg-sidebar-accent/60 transition-all duration-200"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

const navItems = [
  { name: "Calendar",   href: "/client/calendar",   icon: CalendarDays },
  { name: "My Content", href: "/client/calendar",    icon: Download },
  { name: "Accounts",   href: "/client/accounts",   icon: Link2 },
];
