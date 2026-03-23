-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query)

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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lat_lng    ON prices (lat, lng);
CREATE INDEX IF NOT EXISTS idx_created_at ON prices (created_at DESC);
