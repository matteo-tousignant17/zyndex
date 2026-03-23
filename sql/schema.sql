-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- For existing databases, ALTER TABLE lines add new columns without data loss.

-- ── Stores: canonical POI entities (from OSM or freeform) ──────────────────
CREATE TABLE IF NOT EXISTS stores (
  id         SERIAL PRIMARY KEY,
  osm_id     BIGINT UNIQUE,        -- NULL for freeform/user-created stores
  name       TEXT NOT NULL,
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  category   TEXT,                 -- 'fuel' | 'convenience' | 'pharmacy' | 'tobacco'
  brand      TEXT,
  city       TEXT,
  state      TEXT,
  zip        TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stores_lat_lng ON stores (lat, lng);
CREATE INDEX IF NOT EXISTS idx_stores_osm_id  ON stores (osm_id) WHERE osm_id IS NOT NULL;

-- ── Prices: raw crowdsourced reports ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS prices (
  id         SERIAL PRIMARY KEY,
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  zip        TEXT,
  state      TEXT,
  city       TEXT,
  store_name TEXT,
  price      NUMERIC(6,2) NOT NULL,
  strength   SMALLINT CHECK (strength IN (3, 6)),
  flavor     TEXT,
  store_id   INTEGER REFERENCES stores(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- For existing databases that already have the prices table without store_id:
ALTER TABLE prices ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lat_lng         ON prices (lat, lng);
CREATE INDEX IF NOT EXISTS idx_created_at      ON prices (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prices_store_id ON prices (store_id) WHERE store_id IS NOT NULL;

-- ── Store prices: aggregated "current truth" (one row per store) ───────────
CREATE TABLE IF NOT EXISTS store_prices (
  id                SERIAL PRIMARY KEY,
  store_id          INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  current_price     NUMERIC(6,2) NOT NULL,
  strength          SMALLINT,
  flavor            TEXT,
  report_count      INTEGER NOT NULL DEFAULT 1,
  last_reported_at  TIMESTAMPTZ NOT NULL,
  last_confirmed_at TIMESTAMPTZ,
  confidence        NUMERIC(4,3) NOT NULL DEFAULT 1.0,
  is_stale          BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (store_id)
);

CREATE INDEX IF NOT EXISTS idx_sp_store_id ON store_prices (store_id);
