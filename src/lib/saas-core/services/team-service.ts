/**
 * TeamService — agency team membership (owner + managers/creators/editors).
 *
 * Team members are `role='admin'` users whose `agency_id` points at the owner.
 * The owner themselves have `agency_id` null and `agency_role='owner'`.
 *
 * IMPORTANT: `users.id` must equal the Supabase Auth user id (a UUID) so that
 * `requireAuth` → `getUserRole(user.id)` resolves the role. We therefore create
 * the `users` row with the Auth UUID returned by `auth.admin.createUser`, and
 * upsert (not insert) to tolerate a pre-existing trigger-created row.
 */

import { getAdminClient } from "@/lib/supabase/admin";
import { hashPassword } from "@/lib/auth/password";
import type { AgencyRole } from "../types";

export interface TeamMemberRecord {
  userId: string;
  agencyId: string;
  name: string;
  email: string;
  role: AgencyRole;
}

function mapRole(r: unknown): AgencyRole {
  return r === "manager" || r === "creator" || r === "editor" || r === "owner"
    ? r
    : "creator";
}

/** The owner + all team members scoped to that owner. */
export async function listTeam(ownerId: string): Promise<TeamMemberRecord[]> {
  const supabase = getAdminClient() as any;
  const { data: owner } = await supabase
    .from("users")
    .select("id,email,name,agency_role")
    .eq("id", ownerId)
    .maybeSingle();
  const { data: members } = await supabase
    .from("users")
    .select("id,email,name,agency_role")
    .eq("agency_id", ownerId);

  const result: TeamMemberRecord[] = [];
  if (owner) {
    result.push({
      userId: owner.id,
      agencyId: ownerId,
      name: owner.name ?? "",
      email: owner.email,
      role: "owner",
    });
  }
  for (const m of members ?? []) {
    result.push({
      userId: m.id,
      agencyId: ownerId,
      name: m.name ?? "",
      email: m.email,
      role: mapRole(m.agency_role),
    });
  }
  return result;
}

export async function createMember(params: {
  ownerId: string;
  name: string;
  email: string;
  role: AgencyRole;
  password?: string;
}): Promise<{ userId: string; name: string; email: string; role: AgencyRole; temporaryPassword?: string }> {
  const supabase = getAdminClient() as any;
  const email = params.email.toLowerCase().trim();
  const password = params.password ?? `Team-${Math.random().toString(36).slice(2, 8)}!1`;
  const now = new Date().toISOString();

  // Create the Supabase Auth user (this is what the member logs in with).
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: params.name },
  });
  if (authError || !authUser?.user) {
    throw new Error(authError?.message ?? "Failed to create team member auth account");
  }

  const userId = authUser.user.id;

  // Upsert the users row keyed by the Auth UUID, scoped to the agency.
  const { error } = await supabase.from("users").upsert(
    {
      id: userId,
      email,
      name: params.name,
      password_hash: hashPassword(password),
      role: "admin",
      agency_id: params.ownerId,
      agency_role: params.role,
      onboarding_complete: true,
      created_at: now,
    },
    { onConflict: "id" },
  );
  if (error) {
    throw new Error(`Failed to create team member record: ${error.message}`);
  }

  return { userId, name: params.name, email, role: params.role, temporaryPassword: password };
}

export async function updateMemberRole(userId: string, role: AgencyRole): Promise<boolean> {
  const supabase = getAdminClient() as any;
  const { error } = await supabase.from("users").update({ agency_role: role }).eq("id", userId);
  return !error;
}

export async function removeMember(userId: string): Promise<boolean> {
  const supabase = getAdminClient() as any;
  // Clear agency scoping — keep the auth account intact (safer than deleting).
  const { error } = await supabase
    .from("users")
    .update({ agency_id: null, agency_role: null })
    .eq("id", userId);
  return !error;
}
