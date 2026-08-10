/**
 * Supabase REST adapter — no client library needed.
 * Uses fetch() directly against the Supabase REST API.
 * Automatically degrades to no-op if SUPABASE_URL is not configured.
 */

// Read env vars lazily — ES module imports are hoisted, so .env may not be loaded yet at module init time
function getBase(): string | undefined {
  return process.env.SUPABASE_URL;
}
function getKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_API_KEY;
}

async function rest(
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown | null> {
  const BASE = getBase();
  const KEY = getKey();
  if (!BASE || !KEY) return null;
  try {
    const url = `${BASE}/rest/v1/${path}`;
    const headers: Record<string, string> = {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    };
    // Prefer header needed only for POST/PATCH to get the created/updated row back
    if (method === "POST" || method === "PATCH") {
      headers.Prefer = "return=representation";
    }
    const init: {
      method: string;
      headers: Record<string, string>;
      body?: string;
    } = { method, headers };
    if (body) init.body = JSON.stringify(body);
    const res = await fetch(url, init);
    if (!res.ok) return null;
    if (res.status === 204) return true; // DELETE success
    // Only parse JSON if the response is actually JSON
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("json")) {
      try {
        return await res.json();
      } catch {
        return null;
      }
    }
    // Non-JSON response — return the text
    try {
      return await res.text();
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

/** Build Supabase query string from filters */
function qs(
  filters?: Record<string, unknown>,
  order?: string,
  limit?: number,
): string {
  const parts: string[] = [];
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      parts.push(`${k}=eq.${encodeURIComponent(String(v))}`);
    }
  }
  if (order) {
    const desc = order.startsWith("-");
    parts.push(
      `order=${desc ? order.slice(1) : order}.${desc ? "desc" : "asc"}`,
    );
  }
  if (limit) parts.push(`limit=${limit}`);
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

export async function dbInsert(
  table: string,
  row: Record<string, unknown>,
): Promise<boolean> {
  const res = await rest("POST", table, row);
  return res !== null;
}

export async function dbGet<T = Record<string, unknown>>(
  table: string,
  id: string,
): Promise<T | null> {
  const res = await rest("GET", `${table}?id=eq.${encodeURIComponent(id)}`);
  if (Array.isArray(res) && res.length > 0) return res[0] as T;
  return null;
}

export async function dbQuery<T = Record<string, unknown>>(
  table: string,
  filters?: Record<string, unknown>,
  orderBy?: string,
  limit?: number,
): Promise<T[]> {
  const q = qs(filters, orderBy, limit);
  const res = await rest("GET", `${table}${q}`);
  return Array.isArray(res) ? (res as T[]) : [];
}

export async function dbUpdate(
  table: string,
  id: string,
  updates: Record<string, unknown>,
): Promise<boolean> {
  const res = await rest(
    "PATCH",
    `${table}?id=eq.${encodeURIComponent(id)}`,
    updates,
  );
  return res !== null;
}

export async function dbDelete(table: string, id: string): Promise<boolean> {
  const res = await rest("DELETE", `${table}?id=eq.${encodeURIComponent(id)}`);
  return res !== null;
}

export async function dbCount(
  table: string,
  filters?: Record<string, unknown>,
): Promise<number> {
  const q = qs(filters);
  const res = await rest(
    "GET",
    `${table}${q}${qs(filters) ? "&" : "?"}select=id`,
  );
  return Array.isArray(res) ? res.length : 0;
}
