-- ═══════════════════════════════════════════════════════════════════════
-- Agency Platform — Migration 003: Monetization columns + approval comments
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql
-- Roll-forward only. Safe to re-run (idempotent). Never edit migration.sql / 002.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Tenants: subscription plan + trial + feature flags ────────────────
-- These were declared in migration.sql but never present on the live table.
-- Without them, tier/features always resolve to "free" and trial never gates.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'free'
  CHECK (tier IN ('free','starter','growth','empire','custom'));
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS features_json JSONB DEFAULT '{}'::jsonb;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS metadata_json JSONB DEFAULT '{}'::jsonb;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill: existing paid subscriptions get a sane tier rather than "free".
-- Adjust if a specific client is on a different plan.
UPDATE tenants SET tier = 'growth'
  WHERE tier = 'free'
    AND stripe_subscription_id IS NOT NULL
    AND subscription_status = 'active';

-- Existing trial tenants with no end date get a 14-day window.
UPDATE tenants SET trial_ends_at = now() + interval '14 days'
  WHERE status = 'trial' AND trial_ends_at IS NULL;

-- ── Content assets: make blog content distinguishable ──────────────────
-- Blogs were stored as content_type='feed_post' with the body in file_url.
ALTER TABLE content_assets DROP CONSTRAINT IF EXISTS content_assets_content_type_check;
ALTER TABLE content_assets ADD CONSTRAINT content_assets_content_type_check
  CHECK (content_type IN ('video','image','carousel','reel','story','feed_post','blog'));

-- ── Approval comments: threaded review/approval conversation ──────────
CREATE TABLE IF NOT EXISTS asset_comments (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES content_assets(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  author_id TEXT,
  author_role TEXT CHECK (author_role IN ('admin','client')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_asset_comments_asset ON asset_comments(asset_id, created_at);
