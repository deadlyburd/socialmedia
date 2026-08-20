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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserPlus, Loader2, MoreHorizontal, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: "owner" | "manager" | "creator" | "editor";
}

const ROLES: TeamMember["role"][] = ["manager", "creator", "editor"];

const ROLE_LABELS: Record<TeamMember["role"], string> = {
  owner: "Owner",
  manager: "Manager",
  creator: "Creator",
  editor: "Editor",
};

const ROLE_BADGE: Record<TeamMember["role"], string> = {
  owner: "bg-foreground text-background",
  manager: "bg-lavender",
  creator: "bg-blue",
  editor: "bg-mint",
};

export default function TeamPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviting, setInviting] = useState(false);

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<TeamMember["role"]>("creator");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) { router.replace("/login"); return; }
    loadTeam();
  }, [isLoading, isAuthenticated]);

  async function loadTeam() {
    try {
      const res = await fetch("/api/admin/team", { credentials: "include" });
      const data = await res.json();
      if (data.success) setMembers(data.data ?? []);
    } catch {
      toast.error("Failed to load team");
    } finally {
      setLoading(false);
    }
  }

  async function invite() {
    if (!newName || !newEmail) {
      toast.error("Name and email are required");
      return;
    }
    setInviting(true);
    try {
      const res = await fetch("/api/admin/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newName, email: newEmail, role: newRole }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${newName} added to the team`);
        setDialogOpen(false);
        setNewName("");
        setNewEmail("");
        setNewRole("creator");
        loadTeam();
      } else {
        toast.error(data.error ?? "Failed to invite");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(member: TeamMember, role: TeamMember["role"]) {
    try {
      const res = await fetch(`/api/admin/team/${member.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        setMembers(prev => prev.map(m => m.userId === member.userId ? { ...m, role } : m));
        toast.success("Role updated");
      } else {
        const data = await res.json();
        toast.error(data.error ?? "Update failed");
      }
    } catch {
      toast.error("Network error");
    }
  }

  async function remove(member: TeamMember) {
    if (!confirm(`Remove ${member.name} from the team?`)) return;
    try {
      const res = await fetch(`/api/admin/team/${member.userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setMembers(prev => prev.filter(m => m.userId !== member.userId));
        toast.success("Team member removed");
      } else {
        const data = await res.json();
        toast.error(data.error ?? "Remove failed");
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
    <div className="flex flex-col gap-8 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Team</p>
          <h1 className="text-[32px] md:text-[42px] font-semibold tracking-tight leading-tight">
            Team Management
          </h1>
          <p className="text-muted-foreground mt-1.5 text-[15px]">
            Invite teammates and assign content production work
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full bg-foreground hover:bg-foreground/90 text-background h-10 px-5 text-sm">
              <UserPlus className="h-4 w-4 mr-1.5" />
              Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-[24px] max-w-md p-6">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">Invite Team Member</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                They'll log in as an admin scoped to your agency.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Name</label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Alex Johnson" className="rounded-xl border-black/10" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Email</label>
                <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="alex@agency.com" className="rounded-xl border-black/10" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as TeamMember["role"])}
                  className="w-full h-10 rounded-xl border border-black/10 px-3 text-sm bg-white"
                >
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
              <Button onClick={invite} disabled={inviting} className="w-full rounded-full bg-foreground hover:bg-foreground/90 text-background h-10">
                {inviting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                Invite Member
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {members.length === 0 ? (
        <div className="bg-muted/30 rounded-[24px] py-20 text-center">
          <ShieldCheck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No team members yet.</p>
          <Button onClick={() => setDialogOpen(true)} className="mt-4 rounded-full bg-foreground hover:bg-foreground/90 text-background h-10 px-5 text-sm">
            <UserPlus className="h-4 w-4 mr-1.5" />
            Invite Member
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {members.map((member) => (
            <div key={member.userId} className="bg-white/50 rounded-[24px] p-5 flex items-center gap-4">
              <span className="w-10 h-10 rounded-xl bg-lavender flex items-center justify-center text-sm font-semibold shrink-0">
                {member.name.charAt(0).toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{member.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{member.email}</p>
              </div>
              <span className={`text-[10px] font-medium uppercase px-2.5 py-1 rounded-lg ${ROLE_BADGE[member.role]}`}>
                {ROLE_LABELS[member.role]}
              </span>
              {member.role !== "owner" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44 rounded-2xl p-2">
                    {ROLES.filter(r => r !== member.role).map((role) => (
                      <DropdownMenuItem
                        key={role}
                        onClick={() => changeRole(member, role)}
                        className="rounded-xl px-3 py-2 cursor-pointer text-sm"
                      >
                        Make {ROLE_LABELS[role]}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuItem
                      onClick={() => remove(member)}
                      className="rounded-xl px-3 py-2 cursor-pointer text-sm text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
