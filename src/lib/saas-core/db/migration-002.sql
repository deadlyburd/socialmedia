-- ═══════════════════════════════════════════════════════════════════════
-- Agency Platform — Migration 002: Team + Requirements + Strategy + Content Lifecycle
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql
-- Roll-forward only. Safe to re-run (idempotent). Never edit migration.sql.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Users: team membership ────────────────────────────────────────────
-- Team members are still role='admin', scoped to an agency (the owner's user id).
-- agency_role is null for client users.
ALTER TABLE users ADD COLUMN IF NOT EXISTS agency_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS agency_role TEXT;

-- Backfill existing admins as agency owners (single-admin → owner).
UPDATE users SET agency_role = 'owner' WHERE role = 'admin' AND agency_role IS NULL;

-- ── Tenants: persist the client↔business login link ───────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS client_user_id TEXT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_tenants_client_user ON tenants(client_user_id);

-- ── Requirements / brief (1:1 with tenant) ────────────────────────────
CREATE TABLE IF NOT EXISTS client_briefs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  brand_voice TEXT,
  target_audience TEXT,
  goals TEXT,
  content_pillars JSONB DEFAULT '[]'::jsonb,
  platforms JSONB DEFAULT '[]'::jsonb,
  style_guidelines JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Content strategy / plan (1:many per tenant) ───────────────────────
CREATE TABLE IF NOT EXISTS content_strategies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pillars_json JSONB DEFAULT '[]'::jsonb,
  format_mix_json JSONB DEFAULT '{}'::jsonb,
  cadence_json JSONB DEFAULT '{}'::jsonb,
  timeline_start DATE,
  timeline_end DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_strategies_tenant ON content_strategies(tenant_id);

-- ── Content assets: turn a bare file into content ─────────────────────
ALTER TABLE content_assets
  ADD COLUMN IF NOT EXISTS assignee_id TEXT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS caption TEXT,
  ADD COLUMN IF NOT EXISTS hashtags_json JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS carousel_items_json JSONB,
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS downloaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS posted_url TEXT;
CREATE INDEX IF NOT EXISTS idx_content_assets_assignee ON content_assets(assignee_id);

-- ── Status: widen to full production + delivery lifecycle ─────────────
-- Drop the old auto-named check constraint first so we can remap values.
ALTER TABLE content_assets DROP CONSTRAINT IF EXISTS content_assets_status_check;

-- Backfill remap (guarded, idempotent):
--   processing → draft,  ready → delivered,  downloaded/posted unchanged.
UPDATE content_assets SET status = 'draft'     WHERE status = 'processing';
UPDATE content_assets SET status = 'delivered' WHERE status = 'ready';

-- New enum. New uploads default to 'delivered' (identical behavior to the old 'ready');
-- the review/approval slice will later flip this default to 'draft'.
ALTER TABLE content_assets ALTER COLUMN status SET DEFAULT 'delivered';
ALTER TABLE content_assets ADD CONSTRAINT content_assets_status_check
  CHECK (status IN (
    'planned','draft','in_review','revision_requested',
    'approved','delivered','downloaded','posted','rejected'
  ));
