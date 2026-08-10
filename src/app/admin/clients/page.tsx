"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Search, MoreHorizontal, CalendarDays, Upload, Edit, Trash2, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface Client {
  tenantId: string;
  userId: string;
  name: string;
  email: string;
  businessName: string;
  status: string;
  createdAt: string;
  contentCount: number;
}

export default function ClientsPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // New client form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newBusinessName, setNewBusinessName] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) { router.replace("/login"); return; }
    loadClients();
  }, [isLoading, isAuthenticated]);

  async function loadClients() {
    try {
      const res = await fetch("/api/admin/clients", { credentials: "include" });
      const data = await res.json();
      if (data.success) setClients(data.data ?? []);
    } catch {
      toast.error("Failed to load clients");
    } finally {
      setLoading(false);
    }
  }

  async function createClient() {
    if (!newName || !newEmail || !newBusinessName || !newPassword) {
      toast.error("All fields are required");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: newName,
          email: newEmail,
          businessName: newBusinessName,
          password: newPassword,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Client created successfully");
        setDialogOpen(false);
        setNewName("");
        setNewEmail("");
        setNewBusinessName("");
        setNewPassword("");
        loadClients();
      } else {
        toast.error(data.error ?? "Failed to create client");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setCreating(false);
    }
  }

  async function deleteClient(tenantId: string) {
    if (!confirm("Are you sure? This will delete all content for this client.")) return;
    try {
      const res = await fetch(`/api/admin/clients/${tenantId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Client deleted");
        loadClients();
      } else {
        toast.error("Failed to delete client");
      }
    } catch {
      toast.error("Network error");
    }
  }

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.businessName.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    );
  });

  if (isLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Clients</p>
          <h1 className="text-[32px] md:text-[42px] font-semibold tracking-tight leading-tight">
            Client Management
          </h1>
          <p className="text-muted-foreground mt-1.5 text-[15px]">
            {clients.length} client{clients.length !== 1 ? "s" : ""} managed by your agency
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full bg-foreground hover:bg-foreground/90 text-background h-10 px-5 text-sm">
              <Plus className="h-4 w-4 mr-1.5" />
              Add Client
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-[24px] max-w-md p-6">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">Add New Client</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Create an account for a new client business. They'll log in to see their content calendar.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Contact Name
                </label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Jane Smith"
                  className="rounded-xl border-black/10"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Email
                </label>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="jane@business.com"
                  className="rounded-xl border-black/10"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Business Name
                </label>
                <Input
                  value={newBusinessName}
                  onChange={(e) => setNewBusinessName(e.target.value)}
                  placeholder="Beachside Cafe"
                  className="rounded-xl border-black/10"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Password
                </label>
                <Input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Auto-generated or custom"
                  className="rounded-xl border-black/10"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Share this with the client. They can change it after logging in.
                </p>
              </div>
              <Button
                onClick={createClient}
                disabled={creating}
                className="w-full rounded-full bg-foreground hover:bg-foreground/90 text-background h-10"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                Create Client Account
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients..."
          className="pl-11 rounded-2xl border-black/10 h-12"
        />
      </div>

      {/* Client list */}
      {filtered.length === 0 ? (
        <div className="bg-muted/30 rounded-[24px] py-20 text-center">
          {search ? (
            <>
              <p className="text-muted-foreground text-sm">No clients match "{search}"</p>
              <Button variant="outline" className="mt-4 rounded-full border-black/10" onClick={() => setSearch("")}>
                Clear search
              </Button>
            </>
          ) : (
            <>
              <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No clients yet. Add your first one!</p>
              <Button onClick={() => setDialogOpen(true)} className="mt-4 rounded-full bg-foreground hover:bg-foreground/90 text-background h-10 px-5 text-sm">
                <Plus className="h-4 w-4 mr-1.5" />
                Add Client
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((client) => (
            <div
              key={client.tenantId}
              className="bg-white/50 rounded-[24px] p-5 flex items-center gap-4 hover:scale-[1.005] transition-all"
            >
              <span className="w-10 h-10 rounded-xl bg-lavender flex items-center justify-center text-sm font-semibold shrink-0">
                {client.businessName.charAt(0).toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{client.businessName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {client.name} · {client.email} · {client.contentCount} content pieces
                </p>
              </div>
              <span className={`text-[10px] font-medium uppercase px-2.5 py-1 rounded-lg ${
                client.status === "active" ? "bg-mint text-mint-foreground" :
                client.status === "trial" ? "bg-yellow text-yellow-foreground" :
                "bg-muted text-muted-foreground"
              }`}>
                {client.status}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 rounded-2xl p-2">
                  <DropdownMenuItem
                    onClick={() => router.push(`/admin/calendar/${client.tenantId}`)}
                    className="rounded-xl px-3 py-2 cursor-pointer text-sm"
                  >
                    <CalendarDays className="h-4 w-4 mr-2" /> View Calendar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => router.push(`/admin/upload?clientId=${client.tenantId}`)}
                    className="rounded-xl px-3 py-2 cursor-pointer text-sm"
                  >
                    <Upload className="h-4 w-4 mr-2" /> Upload Content
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => router.push(`/admin/clients/${client.tenantId}`)}
                    className="rounded-xl px-3 py-2 cursor-pointer text-sm"
                  >
                    <Edit className="h-4 w-4 mr-2" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => deleteClient(client.tenantId)}
                    className="rounded-xl px-3 py-2 cursor-pointer text-sm text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Users({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}
