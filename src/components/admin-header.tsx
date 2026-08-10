"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useSidebar } from "./sidebar-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, ChevronDown, Menu, Plus, Search, User } from "lucide-react";

interface ClientOption {
  tenantId: string;
  name: string;
  slug: string;
}

export function AdminHeader() {
  const { user, isAuthenticated } = useAuth();
  const { toggle } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);

  // Load clients for the dropdown
  useEffect(() => {
    if (!isAuthenticated) return;
    fetch("/api/admin/clients", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data) {
          setClients(d.data.map((c: any) => ({
            tenantId: c.tenantId,
            name: c.businessName ?? c.name,
            slug: c.slug ?? c.businessName?.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          })));
        }
      })
      .catch(() => {});
  }, [isAuthenticated]);

  // Restore selected client from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem("admin_selected_client");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSelectedClient(parsed);
      } catch {}
    }
  }, [clients]);

  const handleClientSelect = (client: ClientOption) => {
    setSelectedClient(client);
    sessionStorage.setItem("admin_selected_client", JSON.stringify(client));
  };

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between h-14 px-4 border-b border-black/5 bg-background/80 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        {/* Mobile hamburger */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden rounded-xl h-9 w-9"
          onClick={toggle}
        >
          <Menu className="h-4 w-4" />
        </Button>

        {/* Client selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="rounded-xl border-black/10 h-9 px-3 text-sm font-medium gap-2"
            >
              {selectedClient ? (
                <>
                  <span className="w-6 h-6 rounded-lg bg-lavender flex items-center justify-center text-[10px] font-bold">
                    {selectedClient.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="max-w-[160px] truncate">{selectedClient.name}</span>
                </>
              ) : (
                <>
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Select client...</span>
                </>
              )}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 rounded-2xl p-2">
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-1.5">
              Your Clients ({clients.length})
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {clients.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <p className="text-sm text-muted-foreground">No clients yet.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 rounded-xl border-black/10"
                  onClick={() => router.push("/admin/clients")}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add your first client
                </Button>
              </div>
            ) : (
              clients.map((client) => (
                <DropdownMenuItem
                  key={client.tenantId}
                  onClick={() => handleClientSelect(client)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 cursor-pointer"
                >
                  <span className="w-7 h-7 rounded-lg bg-lavender flex items-center justify-center text-[11px] font-bold shrink-0">
                    {client.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-sm">{client.name}</span>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => router.push("/admin/clients")}
              className="rounded-xl px-3 py-2 cursor-pointer text-sm text-muted-foreground"
            >
              <Plus className="h-3.5 w-3.5 mr-2" />
              Manage clients
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-2">
        {/* Quick action: Upload for selected client */}
        {selectedClient && (
          <Button
            size="sm"
            onClick={() => {
              router.push(`/admin/upload?clientId=${selectedClient.tenantId}`);
            }}
            className="rounded-full bg-foreground hover:bg-foreground/90 text-background h-8 px-4 text-xs font-medium"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Upload for {selectedClient.name.split(" ")[0]}
          </Button>
        )}

        {/* Notification bell */}
        <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9">
          <Bell className="h-4 w-4 text-muted-foreground" />
        </Button>

        {/* User avatar */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-pink text-[11px] font-semibold">
                {user?.name?.charAt(0).toUpperCase() ?? "A"}
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-2xl p-2">
            <div className="px-3 py-2">
              <p className="text-sm font-medium">{user?.name ?? "Admin"}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => router.push("/admin/settings")}
              className="rounded-xl px-3 py-2 cursor-pointer text-sm"
            >
              <User className="h-4 w-4 mr-2" />
              Profile
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
