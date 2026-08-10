/**
 * User store — Supabase-backed persistence.
 */

import { hashPassword, verifyPassword } from "./password";
import { getAdminClient } from "../supabase/admin";

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: "admin" | "client";
  onboardingComplete: boolean;
  createdAt: string;
}

export async function createUser(params: {
  email: string;
  password: string;
  name: string;
  role?: "admin" | "client";
}): Promise<StoredUser> {
  const id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  const role = params.role ?? "client";
  const user: StoredUser = {
    id,
    email: params.email.toLowerCase().trim(),
    name: params.name.trim(),
    passwordHash: hashPassword(params.password),
    role,
    onboardingComplete: false,
    createdAt: now,
  };

  const supabase = getAdminClient();
  const { error } = await supabase.from("users").insert({
    id: user.id,
    email: user.email,
    name: user.name,
    password_hash: user.passwordHash,
    role: user.role,
    onboarding_complete: false,
    created_at: now,
  });

  if (error) {
    // Duplicate email
    if (error.code === "23505") {
      throw new Error("A user with this email already exists.");
    }
    throw new Error(`Failed to create user: ${error.message}`);
  }

  return user;
}

export async function getUserByEmail(email: string): Promise<StoredUser | null> {
  console.log("[user-store] getUserByEmail query for:", email.toLowerCase().trim());

  // Diagnostic: test raw fetch to Supabase
  try {
    const testUrl = `${process.env.SUPABASE_URL}/rest/v1/users?select=id&limit=1`;
    console.log("[user-store] Testing raw fetch to:", testUrl);
    const testRes = await fetch(testUrl, {
      headers: {
        "apikey": process.env.SUPABASE_SERVICE_KEY!,
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_KEY!}`,
      },
    });
    console.log("[user-store] Raw fetch status:", testRes.status);
    const testData = await testRes.text();
    console.log("[user-store] Raw fetch response:", testData.substring(0, 200));
  } catch (fetchErr: any) {
    console.error("[user-store] Raw fetch FAILED:", fetchErr.message, fetchErr.cause?.message || "");
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email.toLowerCase().trim())
    .maybeSingle();

  if (error) {
    console.error("[user-store] getUserByEmail Supabase error:", error.message, error.code, error.details || "");
    return null;
  }
  if (!data) {
    console.error("[user-store] getUserByEmail: no user found for email");
    return null;
  }
  console.log("[user-store] getUserByEmail: user found, onboarding_complete:", data.onboarding_complete);
  return mapRow(data);
}

export async function getUserById(id: string): Promise<StoredUser | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return mapRow(data);
}

export async function verifyUserCredentials(
  email: string,
  password: string,
): Promise<StoredUser | null> {
  const user = await getUserByEmail(email);
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return user;
}

export async function updateUser(
  email: string,
  updates: Partial<Pick<StoredUser, "name" | "onboardingComplete" | "passwordHash">>,
): Promise<StoredUser | null> {
  const supabase = getAdminClient();
  const record: Record<string, unknown> = {};
  if (updates.name !== undefined) record.name = updates.name;
  if (updates.onboardingComplete !== undefined) record.onboarding_complete = updates.onboardingComplete;
  if (updates.passwordHash !== undefined) record.password_hash = updates.passwordHash;

  const { data, error } = await supabase
    .from("users")
    .update(record)
    .eq("email", email.toLowerCase().trim())
    .select()
    .maybeSingle();

  if (error || !data) return null;
  return mapRow(data);
}

export async function markOnboardingComplete(userId: string): Promise<boolean> {
  const supabase = getAdminClient();
  const { error } = await supabase
    .from("users")
    .update({ onboarding_complete: true })
    .eq("id", userId);

  return !error;
}

export async function isOnboardingComplete(userIdOrEmail: string): Promise<boolean> {
  const supabase = getAdminClient();
  const col = userIdOrEmail.includes("@") ? "email" : "id";
  const { data, error } = await supabase
    .from("users")
    .select("onboarding_complete")
    .eq(col, userIdOrEmail.toLowerCase().trim())
    .maybeSingle();

  if (error || !data) return false;
  return data.onboarding_complete === true;
}

// ── Helpers ────────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): StoredUser {
  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string,
    passwordHash: (row.password_hash as string) ?? "",
    role: ((row.role as string) ?? "client") as "admin" | "client",
    onboardingComplete: (row.onboarding_complete as boolean) ?? false,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
  };
}

export async function getUserRole(userId: string): Promise<"admin" | "client" | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return (data.role as "admin" | "client") ?? null;
}

export async function getClientsByAdmin(adminId: string): Promise<StoredUser[]> {
  const supabase = getAdminClient();
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id")
    .eq("agency_id", adminId);
  if (!tenants?.length) return [];

  // Get users linked to those tenants via the tenant_service
  const { data: users } = await supabase
    .from("users")
    .select("*")
    .eq("role", "client");

  if (!users?.length) return [];
  return users.map(mapRow);
}
