# Handoff Document — Agency Content Management Platform

**Last updated:** 2026-08-02
**Project:** `/Users/abythemaniac/Desktop/socialmedia`
**Vercel project:** `admin-dashboard-extracted` (team: `abthelight-6156s-projects`)

---

## Changelog (2026-08-02)

### 🔴 Fixed: Route group architecture was broken
Route groups `(admin)/` and `(client)/` were renamed to `admin/` and `client/` (actual path segments). Next.js route groups don't affect URL paths, so `(admin)/dashboard` and `(dashboard)/dashboard` both resolved to `/dashboard` — causing build failures. The middleware and auth redirects pointed to `/admin/dashboard` and `/client/calendar`, which didn't exist under the old structure.

### 🔴 Fixed: Auth system
- **OAuth callback** redirected to old `/dashboard` — now uses role-based redirect (admin → `/admin/dashboard`, client → `/client/calendar`)
- **Login race condition** — added 200ms delay between Supabase sign-in and role fetch to ensure session cookie propagates
- **Middleware role enforcement** — now checks user role server-side using Supabase REST API. Clients can't access `/admin/*` and admins can't access `/client/*`
- **Signup redirect** — changed from old `/onboarding` to `/admin/dashboard`

### 🟡 Fixed: Branding
- "Optimus AI" → "Social Automations" across: metadata, login page, navigation, hero, footer, CTA
- "Login with Gmail" → "Continue with Google"
- "Powered by DeepSeek Reasoner" → "Agency Content Platform"
- Old AI landing sections (Features, How It Works) removed from `page.tsx`

### 🟡 Fixed: Build issues
- `eslint.ignoreDuringBuilds: true` added to `next.config.mjs` (eslint not installed)
- `/admin/upload` page wrapped in `<Suspense>` boundary (Next.js `useSearchParams` requirement)
- Conflicting `(dashboard)/dashboard`, `(dashboard)/calendar`, `(dashboard)/settings` pages removed

### 🟡 Fixed: Env vars
- Removed 8 stale old-AI vars from Vercel Production: `FAL_KEY`, `APIFY_API_KEY`, `ZERNIO_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SUPABASE_MCP`, `SUPABASE_SERVICE_API_KEY`, `AUTH_URL`
- Added `FIRECRAWL_API_KEY` to Preview
- Added `CRON_SECRET` to Development
- Added Supabase placeholders to `.env.local`
- Updated `.env.example` for agency platform

### ⚠️ Still pending
- Landing page feature sections (capabilities, process, pricing) are the old AI product — need rewrite for agency platform
- Old `(dashboard)` route group pages (`/analytics`, `/generate`, `/queue`, `/trends`, `/users`, `/onboarding`) still exist as dead code
- OAuth is still stubbed (Connect button marks as connected without real API integration)
- Base64 file storage in DB doesn't scale (should use Vercel Blob)

---

## What We Built

Transformed an AI-powered social media automation SaaS into a **two-sided agency platform**:

- **Admin (Agency):** Manages multiple client businesses. Uploads any content type (video, image, carousel, reel, story). Configures blog automation per client.
- **Client (Business):** Logs into their own dashboard. Sees content on a calendar with previews. Downloads and posts directly, or links social accounts.

---

## Architecture

```
src/
├── app/
│   ├── admin/                # Admin dashboard (actual path segment)
│   │   ├── layout.tsx
│   │   ├── dashboard/        # Stats, recent uploads, client list
│   │   ├── clients/          # CRUD client businesses
│   │   ├── upload/           # Drag-drop content upload per client
│   │   ├── calendar/[clientId]/  # Client calendar + blog automation tab
│   │   └── settings/
│   ├── client/               # Client dashboard (actual path segment)
│   │   ├── layout.tsx
│   │   ├── calendar/         # Calendar view with preview/download/post
│   │   ├── accounts/         # Link social media accounts
│   │   └── settings/
│   ├── (dashboard)/          # OLD AI platform routes (deprecated, remove)
│   ├── onboarding/           # OLD onboarding (deprecated)
│   └── api/
│       └── [[...route]]/     # Catch-all Hono router
├── components/
│   ├── admin-sidebar.tsx
│   ├── admin-header.tsx        # Client selector dropdown
│   ├── client-sidebar.tsx
│   ├── client-header.tsx
│   └── blog-automation-settings.tsx  # Admin UI for blog automation
├── lib/
│   ├── auth-context.tsx        # Extended with role (admin/client)
│   ├── auth/
│   │   ├── user-store.ts       # Added role, getClientsByAdmin()
│   │   └── hono-adapter.ts     # Added requireAdmin, requireClient, requireAgencyAccess
│   └── saas-core/
│       ├── api/router.ts       # All API endpoints (admin, client, cron, public blog API)
│       ├── services/
│       │   ├── blog-automation.ts     # Competitive blog generation pipeline
│       │   └── blog-api-service.ts    # Public API key management + integration snippets
│       ├── db/
│       │   ├── migration.sql    # Updated schema
│       │   └── schema.ts        # Updated TypeScript types
│       └── types.ts             # New types: ContentAsset, UserRole, ClientInfo
├── middleware.ts                # Role-based route protection
└── vercel.json                  # Cron jobs for blog automation
```

---

## Database Changes Required

Run these in **Supabase SQL Editor**:

```sql
-- 1. User roles
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'client' CHECK (role IN ('admin','client'));
UPDATE users SET role = 'admin' WHERE role IS NULL;

-- 2. Tenant-agency link
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS agency_id TEXT REFERENCES users(id);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS api_key TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS automation_config JSONB DEFAULT '{}'::jsonb;

-- 3. Platform connections OAuth tokens
ALTER TABLE platform_connections ADD COLUMN IF NOT EXISTS access_token TEXT;
ALTER TABLE platform_connections ADD COLUMN IF NOT EXISTS refresh_token TEXT;
ALTER TABLE platform_connections ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
ALTER TABLE platform_connections ADD COLUMN IF NOT EXISTS platform_user_id TEXT;

-- 4. Content assets table (agency-uploaded content)
CREATE TABLE IF NOT EXISTS content_assets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  file_url TEXT NOT NULL,
  thumbnail_url TEXT,
  content_type TEXT NOT NULL CHECK (content_type IN ('video','image','carousel','reel','story','feed_post')),
  file_size BIGINT DEFAULT 0,
  mime_type TEXT,
  duration_seconds INTEGER,
  platform TEXT DEFAULT 'all',
  scheduled_date DATE NOT NULL,
  status TEXT DEFAULT 'ready' CHECK (status IN ('processing','ready','downloaded','posted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL REFERENCES users(id)
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_content_assets_tenant ON content_assets(tenant_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_tenants_agency ON tenants(agency_id);
```

---

## API Endpoints

### Admin (require auth + admin role)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/clients` | List all clients for admin |
| POST | `/api/admin/clients` | Create client (user + tenant + link) |
| DELETE | `/api/admin/clients/:id` | Delete client + content |
| GET | `/api/admin/content` | All content across admin's clients |
| POST | `/api/admin/upload` | Upload content (multipart form) |
| GET | `/api/admin/calendar/:clientId` | Calendar for specific client |
| POST/GET | `/api/admin/clients/:id/blog-automation` | Blog automation config |
| POST/GET | `/api/admin/clients/:id/api-key` | Public API key management |

### Client
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/client/calendar` | Client's own calendar |
| POST | `/api/client/content/:id/download` | Mark as downloaded |
| POST | `/api/client/content/:id/post` | Post to linked platform |
| GET | `/api/client/accounts` | Linked social accounts |
| POST | `/api/client/accounts/connect` | Connect platform |
| DELETE | `/api/client/accounts/:platform` | Disconnect platform |

### Public (for client developers)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/blogs/:tenantId?apiKey=KEY` | Get latest blog posts (JSON) |

### Cron
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/cron/daily-blogs?secret=CRON_SECRET` | Trigger blog automation (9am + 5pm) |

---

## Blog Automation Pipeline

**Flow per blog post:**
1. Fetch trending topics via Firecrawl (`FIRECRAWL_API_KEY`)
2. Search & scrape top-ranking competitor blogs
3. AI analyzes competitors (strengths, gaps, structure)
4. Generate blog that beats competitors (1500-2500 words, hyperlinks, better structure)
5. Push to client website (WordPress REST API or webhook)
6. Store in `content_assets` → appears on client calendar

**Files:**
- `src/lib/saas-core/services/blog-automation.ts` — pipeline engine
- `src/lib/saas-core/services/blog-api-service.ts` — public API + integration snippets
- `src/components/blog-automation-settings.tsx` — admin configuration UI

**Configure per client:** Admin → Clients → click client → "Blog Automation" tab

**Public API for client developers:** One endpoint. Works with React, Vue, PHP, plain HTML.
```
GET /api/v1/blogs/:tenantId?apiKey=xxx
```

---

## Environment Variables

### Required on Vercel
```
FIRECRAWL_API_KEY=fc-62aba94b1cf647e1a94538e390c9c467
CRON_SECRET=optimus-cron-2026-secret-key
DEEPSEEK_API_KEY=           # For blog generation (or OPENAI_API_KEY)
```

### Already set (in .env.local + Supabase)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_KEY
```

---

## What's Not Done / To Finish

### Critical before production
1. **Run the SQL migration** on Supabase (see Database Changes section above)
2. **Add `FIRECRAWL_API_KEY` and `CRON_SECRET` to Vercel** environment variables
   - Go to: `https://vercel.com/abthelight-6156s-projects/admin-dashboard-extracted/settings/environment-variables`
3. **Set `DEEPSEEK_API_KEY` or `OPENAI_API_KEY`** on Vercel for blog generation
4. **Deploy to Vercel:** `vercel deploy --prod`

### Nice to have (not started)
- Real OAuth flows for Instagram/Facebook/TikTok (currently stubbed — clicking "Connect" marks as connected without real OAuth)
- Vercel Blob for file storage (currently base64 in DB — works but limited)
- Email notifications when admin uploads content for a client
- Client self-registration (currently only admin can create clients)
- Landing page sections beyond hero/nav update (Features, How It Works, CTA, Footer are still AI-themed)

### Files that can be safely removed (old AI platform)
- `src/app/(dashboard)/` — old dashboard (generate, queue, trends, analytics)
- `src/app/onboarding/` — old onboarding flow
- `src/lib/saas-core/services/workflow-engine.ts`
- `src/lib/saas-core/services/content-reverse-engineer.ts`
- `src/lib/saas-core/services/trend-detector.ts`
- `src/lib/saas-core/services/carousel-workflow.ts`
- `src/lib/saas-core/services/video-workflow.ts`
- `src/lib/saas-core/ui/` — old dark-themed components
- `src/lib/saas-core/packs/` — industry packs

---

## Running Locally

```bash
cd /Users/abythemaniac/Desktop/socialmedia/src
bun install
bun run dev
# → http://localhost:3000
```

The app uses `bun` as the package manager (per Vercel project settings).
Node version: 24.x

**To deploy:** Always deploy from `src/` directory (where `package.json` lives):
```bash
cd /Users/abythemaniac/Desktop/socialmedia/src
vercel --prod
```

---

## Key Design Decisions

1. **No AI content generation** — agency manually uploads content. Blog automation is the only AI feature (optional per client).
2. **Single Supabase project** — auth + database in one place. `admin.ts` uses service_role for backend operations.
3. **In-memory services** — `TenantService`, `ContentService`, `AuthService` use in-memory Maps restored from Supabase on cold starts (Vercel serverless).
4. **Hono router** — all API under `app/api/[[...route]]/route.ts`. Catch-all pattern proxies to Hono.
5. **Pastel design system** — CSS vars in `globals.css`. Colors: pink, lavender, mint, yellow, blue. Cards: `rounded-[24px]`. Buttons: `rounded-full`.
