-- Optimus Agency Platform — Database Migration
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- ── Users (email + password auth) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'client' CHECK (role IN ('admin','client')),
  auth_provider TEXT DEFAULT 'email' CHECK (auth_provider IN ('email','google')),
  onboarding_complete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Backfill: set existing users as admin ─────────────────────────────
UPDATE users SET role = 'admin' WHERE role IS NULL;

-- ── Tenants ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  agency_id TEXT REFERENCES users(id),
  api_key TEXT,
  automation_config JSONB DEFAULT '{}'::jsonb,
  tier TEXT DEFAULT 'free' CHECK (tier IN ('free','starter','growth','empire','custom')),
  status TEXT DEFAULT 'trial' CHECK (status IN ('active','trial','suspended','cancelled')),
  trial_ends_at TIMESTAMPTZ,
  features_json JSONB DEFAULT '{}'::jsonb,
  metadata_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Client Configs ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_configs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pack_slug TEXT NOT NULL,
  character_json JSONB DEFAULT '{}'::jsonb,
  products_json JSONB DEFAULT '[]'::jsonb,
  prompt_overrides_json JSONB DEFAULT '{}'::jsonb,
  hashtags_json JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Content Items ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('blog','reel','carousel','story','feed_post','pin','email','tiktok','short','long_form','ugc')),
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  excerpt TEXT DEFAULT '',
  platform TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('inspirational','educational','promotional')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','ai_generated','pending_approval','approved','scheduled','published','rejected','failed')),
  featured_product_ids_json JSONB DEFAULT '[]'::jsonb,
  image_urls_json JSONB DEFAULT '[]'::jsonb,
  seo_json JSONB,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by TEXT DEFAULT 'manual'
);

-- ── Approval Events ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_events (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor TEXT NOT NULL CHECK (actor IN ('ai','client','admin','system')),
  action TEXT NOT NULL CHECK (action IN ('generated','submitted','approved','rejected','revision_requested')),
  comment TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Platform Connections ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_connections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  connected BOOLEAN DEFAULT false,
  handle TEXT,
  connected_at TIMESTAMPTZ,
  token_ref TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  platform_user_id TEXT
);

-- ── Content Assets (agency-uploaded content) ──────────────────────────
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

-- ── Analytics Snapshots ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  data_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── API Usage ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_usage (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_content_tenant ON content_items(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_content_scheduled ON content_items(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_approval_content ON approval_events(content_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_tenant ON api_usage(tenant_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_platform_tenant ON platform_connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_analytics_tenant ON analytics_snapshots(tenant_id, period_start);
CREATE INDEX IF NOT EXISTS idx_content_assets_tenant ON content_assets(tenant_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_tenants_agency ON tenants(agency_id);

-- ── Stripe Billing Columns ───────────────────────────────────────────
-- Add these if they don't exist (safe to run repeatedly)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive';

-- ── Demo Seed Data ──────────────────────────────────────────────────
INSERT INTO tenants (id, name, slug, email, tier, status, features_json) VALUES
  ('demo-tenant', 'Pointours', 'pointours', 'demo@pointours.it', 'growth', 'active',
   '{"maxPostsPerMonth":60,"maxPlatforms":4,"maxBlogsPerMonth":8,"imageGeneration":true,"videoGeneration":true,"trendDetection":true,"bookingFunnel":true,"approvalGate":true,"whiteLabel":false}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO platform_connections (id, tenant_id, platform, connected, handle) VALUES
  ('pc-ig', 'demo-tenant', 'instagram', true, '@pointours'),
  ('pc-tt', 'demo-tenant', 'tiktok', true, '@pointours'),
  ('pc-pin', 'demo-tenant', 'pinterest', false, null),
  ('pc-yt', 'demo-tenant', 'youtube', false, null),
  ('pc-li', 'demo-tenant', 'linkedin', false, null)
ON CONFLICT (id) DO NOTHING;

-- Seed some demo content
INSERT INTO content_items (id, tenant_id, type, title, body, excerpt, platform, category, status, scheduled_at) VALUES
  ('c1', 'demo-tenant', 'carousel', 'Why morning tours are overrated',
   'Most people book 8am tours. Here''s why that''s a mistake — and what to do instead.',
   'Most people book 8am tours. Here''s why that''s a mistake...', 'instagram', 'educational', 'approved', now() + interval '1 day'),
  ('c2', 'demo-tenant', 'reel', 'POV: Walking through Trastevere at golden hour',
   'You walk in. The smell hits you first. Fresh basil, garlic, and something you can''t quite name.',
   'You walk in. The smell hits you first...', 'tiktok', 'inspirational', 'scheduled', now() + interval '2 days'),
  ('c3', 'demo-tenant', 'reel', '5 packing mistakes first-timers make',
   '1. Overpacking shoes. 2. No power adapter. 3. Wrong season clothes. 4. No comfortable walking shoes. 5. Forgetting a reusable water bottle.',
   '1. Overpacking shoes. 2. No power adapter...', 'instagram', 'educational', 'draft', now() + interval '3 days'),
  ('c4', 'demo-tenant', 'carousel', 'This vs That: Rome vs Paris for a weekend trip',
   'Two iconic cities. One weekend. Which do you pick? Let''s compare side by side.',
   'Two iconic cities. One weekend. Which do you pick?', 'instagram', 'inspirational', 'published', now() - interval '1 day'),
  ('c5', 'demo-tenant', 'pin', 'Rome 3-Day Itinerary — Complete Guide',
   'Day 1: Ancient Rome. Day 2: Vatican & Trastevere. Day 3: Hidden gems & food tour.',
   'Day 1: Ancient Rome. Day 2: Vatican...', 'pinterest', 'educational', 'draft', now() + interval '4 days'),
  ('c6', 'demo-tenant', 'feed_post', 'Client testimonial: ''Best trip of our lives''',
   'Sarah and James from London booked our 7-day Italy tour. Here''s what they said.',
   'Sarah and James from London...', 'instagram', 'promotional', 'approved', now() + interval '5 days'),
  ('c7', 'demo-tenant', 'reel', 'New listing walkthrough — 3 bed, 2 bath villa',
   'Walk through this stunning Tuscan villa. 3 bedrooms, pool, olive grove.',
   'Walk through this stunning Tuscan villa...', 'youtube', 'inspirational', 'scheduled', now() + interval '6 days'),
  ('c8', 'demo-tenant', 'reel', 'How to make authentic carbonara in 60 seconds',
   'Guanciale. Pecorino. Egg yolks. Pepper. That''s it. No cream. No garlic. No nonsense.',
   'Guanciale. Pecorino. Egg yolks. Pepper...', 'tiktok', 'educational', 'draft', now() + interval '7 days')
ON CONFLICT (id) DO NOTHING;
