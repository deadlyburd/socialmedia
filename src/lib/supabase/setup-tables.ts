/**
 * Supabase table setup — creates all required tables for auth, content, tenants.
 * Run: bun run lib/supabase/setup-tables.ts
 */
import { getAdminClient } from "./admin";

const admin = getAdminClient();

const SCHEMA_SQL = `
-- Users table (auth + onboarding)
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT,
  onboarding_complete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tenants
CREATE TABLE IF NOT EXISTS public.tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Content posts
CREATE TABLE IF NOT EXISTS public.content (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES public.tenants(id),
  user_id TEXT REFERENCES public.users(id),
  type TEXT NOT NULL DEFAULT 'post',
  platform TEXT NOT NULL DEFAULT 'instagram',
  status TEXT NOT NULL DEFAULT 'draft',
  title TEXT,
  body TEXT,
  media_urls JSONB DEFAULT '[]'::jsonb,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Onboarding state
CREATE TABLE IF NOT EXISTS public.onboarding (
  user_id TEXT PRIMARY KEY REFERENCES public.users(id),
  step TEXT NOT NULL DEFAULT 'niche',
  selected_niche TEXT,
  pack_slug TEXT,
  business_description TEXT,
  website_url TEXT,
  website_analysis JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding ENABLE ROW LEVEL SECURITY;

-- RLS policies (allow all for service_role; anon uses policies)
CREATE POLICY IF NOT EXISTS "Users read own" ON public.users
  FOR SELECT USING (auth.uid()::text = id OR (current_setting('role') = 'service_role'));

CREATE POLICY IF NOT EXISTS "Users insert own" ON public.users
  FOR INSERT WITH CHECK (auth.uid()::text = id OR (current_setting('role') = 'service_role'));

-- Grant anon access for signup queries (via REST API with service key)
GRANT ALL ON public.users TO service_role;
GRANT ALL ON public.tenants TO service_role;
GRANT ALL ON public.content TO service_role;
GRANT ALL ON public.onboarding TO service_role;
`;

async function main() {
  console.log("[setup-tables] Creating database tables...");
  try {
    const { error } = await admin.rpc("__execute_sql", { sql: SCHEMA_SQL });
    // RPC may not exist — fall back to REST verification
    if (error) {
      console.log("[setup-tables] RPC failed, testing REST access instead...");
    }

    // Verify tables exist by querying each
    const tables = ["users", "tenants", "content", "onboarding"];
    for (const table of tables) {
      const { data, error: queryErr } = await admin
        .from(table)
        .select("count", { count: "exact", head: true });

      if (queryErr) {
        console.log(`  [${table}] ERROR: ${queryErr.message} (${queryErr.code})`);
      } else {
        console.log(`  [${table}] OK`);
      }
    }
  } catch (err: any) {
    console.error("[setup-tables] Error:", err.message);
    console.log(
      "[setup-tables] Tables may need manual creation. Open the Supabase SQL Editor at:",
    );
    console.log(
      "  https://supabase.com/dashboard/project/xnaxcslsisarikoygtqo/sql/new",
    );
    console.log("[setup-tables] Then paste the SQL below:");
    console.log(SCHEMA_SQL);
  }
}

main();
