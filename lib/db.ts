import postgres from 'postgres';

type Sql = ReturnType<typeof postgres>;

let _sql: Sql | null = null;
let _init: Promise<void> | null = null;

function getSql(): Sql {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'DATABASE_URL is not set. Copy .env.example → .env.local and add your Supabase connection string.'
      );
    }
    const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
    _sql = postgres(url, {
      ssl: isLocal ? false : 'require',
      max: 1,           // serverless: one connection per lambda
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return _sql;
}

export async function getDb(): Promise<Sql> {
  const sql = getSql();
  if (!_init) _init = initSchema(sql);
  await _init;
  return sql;
}

async function initSchema(sql: Sql) {
  // ── Stores ──────────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS stores (
      id         SERIAL PRIMARY KEY,
      osm_id     BIGINT UNIQUE,
      name       TEXT NOT NULL,
      lat        DOUBLE PRECISION NOT NULL,
      lng        DOUBLE PRECISION NOT NULL,
      category   TEXT,
      brand      TEXT,
      city       TEXT,
      state      TEXT,
      zip        TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_stores_lat_lng ON stores (lat, lng)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_stores_osm_id  ON stores (osm_id) WHERE osm_id IS NOT NULL`;

  // ── Prices (raw reports) ─────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS prices (
      id         SERIAL PRIMARY KEY,
      lat        DOUBLE PRECISION NOT NULL,
      lng        DOUBLE PRECISION NOT NULL,
      zip        TEXT,
      state      TEXT,
      city       TEXT,
      store_name TEXT,
      price      NUMERIC(6,2) NOT NULL,
      strength   SMALLINT,
      flavor     TEXT,
      store_id   INTEGER REFERENCES stores(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // Add store_id to pre-existing databases that don't have it yet
  await sql`ALTER TABLE prices ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_lat_lng         ON prices (lat, lng)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_created_at      ON prices (created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_prices_store_id ON prices (store_id) WHERE store_id IS NOT NULL`;

  // ── Store prices (aggregated truth) ──────────────────────────────────────
  await sql`
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
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_sp_store_id ON store_prices (store_id)`;

  const [{ n }] = await sql<[{ n: string }]>`SELECT COUNT(*) AS n FROM prices`;
  if (Number(n) === 0) await seedData(sql);
}

type SeedRow = {
  lat: number; lng: number; zip: string; state: string; city: string;
  store_name: string; price: number; strength: number; flavor: string;
  category: string;
};

const SEED: SeedRow[] = [
  // New York — high sin taxes
  { lat: 40.7128,  lng: -74.006,   zip: '10001', state: 'NY', city: 'New York',      store_name: 'Duane Reade',  price: 7.49, strength: 6, flavor: 'Cool Mint',   category: 'pharmacy' },
  { lat: 40.7282,  lng: -73.7949,  zip: '11435', state: 'NY', city: 'Jamaica',       store_name: 'BP Station',   price: 7.99, strength: 3, flavor: 'Spearmint',   category: 'fuel' },
  // California
  { lat: 34.0522,  lng: -118.2437, zip: '90012', state: 'CA', city: 'Los Angeles',   store_name: '7-Eleven',     price: 6.49, strength: 6, flavor: 'Citrus',       category: 'convenience' },
  { lat: 37.7749,  lng: -122.4194, zip: '94102', state: 'CA', city: 'San Francisco', store_name: 'Walgreens',    price: 6.75, strength: 3, flavor: 'Wintergreen',  category: 'pharmacy' },
  // Minnesota — 95% wholesale nicotine tax
  { lat: 44.9778,  lng: -93.265,   zip: '55401', state: 'MN', city: 'Minneapolis',   store_name: 'Holiday Gas',  price: 6.99, strength: 6, flavor: 'Cool Mint',   category: 'fuel' },
  { lat: 44.9537,  lng: -93.09,    zip: '55101', state: 'MN', city: 'St. Paul',      store_name: "Casey's",      price: 7.25, strength: 3, flavor: 'Peppermint',  category: 'convenience' },
  // Illinois
  { lat: 41.8781,  lng: -87.6298,  zip: '60601', state: 'IL', city: 'Chicago',       store_name: 'Speedway',     price: 5.79, strength: 6, flavor: 'Smooth',       category: 'fuel' },
  // Texas — low taxes
  { lat: 29.7604,  lng: -95.3698,  zip: '77002', state: 'TX', city: 'Houston',       store_name: 'Circle K',     price: 4.49, strength: 6, flavor: 'Cool Mint',   category: 'convenience' },
  { lat: 32.7767,  lng: -96.797,   zip: '75201', state: 'TX', city: 'Dallas',        store_name: 'Chevron',      price: 4.25, strength: 3, flavor: 'Wintergreen',  category: 'fuel' },
  { lat: 30.2672,  lng: -97.7431,  zip: '78701', state: 'TX', city: 'Austin',        store_name: 'Shell',        price: 4.75, strength: 6, flavor: 'Spearmint',   category: 'fuel' },
  // Florida
  { lat: 25.7617,  lng: -80.1918,  zip: '33101', state: 'FL', city: 'Miami',         store_name: 'Wawa',         price: 5.19, strength: 6, flavor: 'Cool Mint',   category: 'convenience' },
  { lat: 28.5383,  lng: -81.3792,  zip: '32801', state: 'FL', city: 'Orlando',       store_name: 'Publix',       price: 4.99, strength: 3, flavor: 'Peppermint',  category: 'convenience' },
  // Georgia
  { lat: 33.749,   lng: -84.388,   zip: '30301', state: 'GA', city: 'Atlanta',       store_name: 'QT',           price: 4.79, strength: 6, flavor: 'Cool Mint',   category: 'convenience' },
  // Colorado
  { lat: 39.7392,  lng: -104.9903, zip: '80201', state: 'CO', city: 'Denver',        store_name: 'King Soopers', price: 5.39, strength: 3, flavor: 'Citrus',       category: 'convenience' },
  // Washington — high taxes
  { lat: 47.6062,  lng: -122.3321, zip: '98101', state: 'WA', city: 'Seattle',       store_name: 'Fred Meyer',   price: 6.29, strength: 6, flavor: 'Wintergreen',  category: 'convenience' },
  // Arizona
  { lat: 33.4484,  lng: -112.074,  zip: '85001', state: 'AZ', city: 'Phoenix',       store_name: 'QuikTrip',     price: 4.29, strength: 6, flavor: 'Smooth',       category: 'convenience' },
  // Massachusetts
  { lat: 42.3601,  lng: -71.0589,  zip: '02101', state: 'MA', city: 'Boston',        store_name: 'CVS',          price: 6.49, strength: 3, flavor: 'Cool Mint',   category: 'pharmacy' },
  // Nevada
  { lat: 36.1699,  lng: -115.1398, zip: '89101', state: 'NV', city: 'Las Vegas',     store_name: "Terrible's",   price: 4.99, strength: 6, flavor: 'Spearmint',   category: 'convenience' },
  // Pennsylvania
  { lat: 39.9526,  lng: -75.1652,  zip: '19102', state: 'PA', city: 'Philadelphia',  store_name: 'Rite Aid',     price: 5.59, strength: 3, flavor: 'Cool Mint',   category: 'pharmacy' },
  // North Carolina
  { lat: 35.2271,  lng: -80.8431,  zip: '28201', state: 'NC', city: 'Charlotte',     store_name: 'Murphy USA',   price: 4.39, strength: 6, flavor: 'Wintergreen',  category: 'fuel' },
  // Ohio
  { lat: 39.9612,  lng: -82.9988,  zip: '43201', state: 'OH', city: 'Columbus',      store_name: 'Sunoco',       price: 5.09, strength: 3, flavor: 'Peppermint',  category: 'fuel' },
  // Michigan
  { lat: 42.3314,  lng: -83.0458,  zip: '48201', state: 'MI', city: 'Detroit',       store_name: 'Meijer',       price: 5.29, strength: 6, flavor: 'Cool Mint',   category: 'convenience' },
];

async function seedData(sql: Sql) {
  for (const r of SEED) {
    const [store] = await sql<[{ id: number }]>`
      INSERT INTO stores (name, lat, lng, category, brand, city, state, zip)
      VALUES (${r.store_name}, ${r.lat}, ${r.lng}, ${r.category}, ${r.store_name}, ${r.city}, ${r.state}, ${r.zip})
      RETURNING id
    `;
    await sql`
      INSERT INTO prices (lat, lng, zip, state, city, store_name, price, strength, flavor, store_id)
      VALUES (${r.lat}, ${r.lng}, ${r.zip}, ${r.state}, ${r.city}, ${r.store_name}, ${r.price}, ${r.strength}, ${r.flavor}, ${store.id})
    `;
    await sql`
      INSERT INTO store_prices (store_id, current_price, strength, flavor, report_count, last_reported_at, confidence, is_stale)
      VALUES (${store.id}, ${r.price}, ${r.strength}, ${r.flavor}, 1, NOW(), 0.8, FALSE)
      ON CONFLICT (store_id) DO NOTHING
    `;
  }
}
