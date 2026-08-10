/**
 * Supabase admin client — service_role, bypasses RLS.
 * Only use in server-side code (Route Handlers, init scripts).
 * Never expose to the browser.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;

export function getAdminClient() {
  if (!adminClient) {
    console.log("[supabase/admin] Initializing client. URL set:", !!supabaseUrl, "Key set:", !!supabaseServiceKey);
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        "[supabase/admin] SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.",
      );
    }
    adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return adminClient;
}
