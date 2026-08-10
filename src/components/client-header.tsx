"use client";

import { useAuth } from "@/lib/auth-context";
import { useSidebar } from "./sidebar-provider";
import { Button } from "@/components/ui/button";
import { Menu, Bell } from "lucide-react";

export function ClientHeader() {
  const { user } = useAuth();
  const { toggle } = useSidebar();

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between h-14 px-4 border-b border-black/5 bg-background/80 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden rounded-xl h-9 w-9"
          onClick={toggle}
        >
          <Menu className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium text-muted-foreground">
          {user?.name}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9">
          <Bell className="h-4 w-4 text-muted-foreground" />
        </Button>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-mint text-[11px] font-semibold">
          {user?.name?.charAt(0).toUpperCase() ?? "C"}
        </div>
      </div>
    </header>
  );
}
