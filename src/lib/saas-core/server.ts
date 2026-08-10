/**
 * SaaS Core API Server — entry point.
 * Start with: bun run --cwd packages/saas-core start
 * Or from root: bun run packages/saas-core/src/server.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Bun auto-loads .env from CWD. If we're running from packages/saas-core,
// the .env is two directories up at the repo root. Load it manually.
const cwd = process.cwd();
const rootEnv = resolve(cwd, "../../.env");
const localEnv = resolve(cwd, ".env");

for (const envPath of [rootEnv, localEnv]) {
  if (existsSync(envPath)) {
    try {
      const content = readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
      console.log(`[saas-core] Loaded env from ${envPath}`);
    } catch (_e) {
      console.log(`[saas-core] Could not load env from ${envPath}`);
    }
  }
}

import { initUserStore, saasRouter } from "./api/router";
import { initContentStore } from "./services/content-service";
import { getTelegramBot } from "./services/telegram-bot";
import { initTenantStore } from "./services/tenant-service";

// Load existing data from Supabase before starting the server
await initUserStore();
await initTenantStore();
await initContentStore();

const preferredPort = Number(process.env.PORT ?? 3001);

console.log("[saas-core] Starting API server...");
console.log(
  "[saas-core] Firecrawl: " +
    (process.env.FIRECRAWL_API_KEY ? "configured" : "not configured"),
);
console.log(
  "[saas-core] Supabase: " +
    (process.env.SUPABASE_URL ? "configured" : "not configured"),
);
console.log(
  "[saas-core] DeepSeek: " +
    (process.env.OPENAI_API_KEY ? "configured" : "not configured"),
);
console.log(
  "[saas-core] Fal.ai: " +
    (process.env.FAL_KEY ? "configured" : "not configured"),
);
console.log(
  "[saas-core] Telegram: " +
    (process.env.TELEGRAM_BOT_TOKEN ? "configured" : "not configured"),
);

const bot = getTelegramBot();
bot.start(); // Start polling for Telegram updates
bot.onAction(async (action) => {
  console.log(
    "[saas-core] Telegram approval: " +
      action.action +
      " for " +
      action.contentId,
  );
});

// Auto-link Telegram chat from .env on startup
const telegramChatId = process.env.TELEGRAM_CHAT_ID;
if (telegramChatId) {
  (bot as any).config.tenantChats.set("demo-tenant", telegramChatId);
  console.log(
    "[saas-core] Telegram auto-linked: chat " +
      telegramChatId +
      " -> demo-tenant",
  );
}

// Try ports starting from the preferred one
function startServer(port: number, maxRetries: number = 5) {
  if (maxRetries <= 0) {
    console.error(
      "[saas-core] FATAL: Could not find an available port after retries",
    );
    process.exit(1);
  }

  try {
    Bun.serve({
      port,
      fetch: saasRouter.fetch,
    });
    console.log(`[saas-core] API server running at http://localhost:${port}`);
    console.log(
      `[saas-core] Health check: http://localhost:${port}/api/health`,
    );
  } catch (err: any) {
    if (err?.code === "EADDRINUSE") {
      console.log(`[saas-core] Port ${port} is in use, trying ${port + 1}...`);
      startServer(port + 1, maxRetries - 1);
    } else {
      console.error("[saas-core] Server error:", err?.message ?? err);
      process.exit(1);
    }
  }
}

startServer(preferredPort);
