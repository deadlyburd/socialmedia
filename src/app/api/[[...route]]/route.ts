/**
 * Vercel serverless API route handler.
 * Proxies all /api/* requests to the saas-core Hono router.
 */

import { Hono } from "hono";

// ── Lazy init — resilient to import failures ──────────────────────────

let saasRouter: any = null;
let initError: string | null = null;
let initialized = false;

async function ensureInit(): Promise<void> {
  if (initialized) return;

  // Load the saas-core router
  if (!saasRouter) {
    try {
      const mod = await import("@/lib/saas-core/api/router");
      saasRouter = mod.saasRouter;
      // Initialize the user store
      if (mod.initUserStore) {
        await mod.initUserStore();
      }
    } catch (err: any) {
      initError = err.message ?? "Unknown import error";
      console.error("[api] Failed to load saas-core router:", initError);
    }
  }

  initialized = true;
}

// ── Fallback app for when saas-core fails to load ──────────────────────

const fallbackApp = new Hono();
fallbackApp.all("*", (c) => {
  return c.json(
    {
      success: false,
      error: initError
        ? `Server initializing — backend module failed to load: ${initError}`
        : "Server is starting up. Please try again in a moment.",
    },
    503,
  );
});

// ── Main app ──────────────────────────────────────────────────────────

const mainApp = new Hono();

// Ensure all responses from the main app are JSON, never HTML
mainApp.onError((err, c) => {
  console.error("[api] Hono error:", err.message);
  return c.json({ success: false, error: err.message ?? "Internal server error." }, 500);
});
mainApp.notFound((c) => {
  return c.json({ success: false, error: `Route not found: ${c.req.method} ${c.req.path}` }, 404);
});

mainApp.get("/api/health", (c) => {
  return c.json({
    success: true,
    data: {
      status: saasRouter ? "healthy" : "degraded",
      version: "1.0.0-beta.0",
      runtime: "vercel-serverless",
      initError: initError ?? null,
    },
  });
});

// ── Request handler ───────────────────────────────────────────────────

async function handleRequest(req: Request): Promise<Response> {
  await ensureInit();

  try {
    // Use the real saasRouter if it loaded, otherwise fallback
    const app = saasRouter ?? fallbackApp;
    const res = await app.fetch(req);

    // If saasRouter returned 404 and we have a fallback error, surface it
    if (res.status === 404 && initError && app !== fallbackApp) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Route not found. Backend init error: ${initError}`,
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

    return res;
  } catch (err: any) {
    console.error("[api] Unhandled error:", err.message ?? err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error. Please try again.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

export const GET = (req: Request) => handleRequest(req);
export const POST = (req: Request) => handleRequest(req);
export const PATCH = (req: Request) => handleRequest(req);
export const DELETE = (req: Request) => handleRequest(req);
export const PUT = (req: Request) => handleRequest(req);
export const OPTIONS = (req: Request) => handleRequest(req);
