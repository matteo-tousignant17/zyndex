import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const VALID_FLAVORS = new Set([
  'Cool Mint', 'Peppermint', 'Spearmint', 'Wintergreen',
  'Citrus', 'Smooth', 'Coffee', 'Cinnamon', 'Other',
]);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const swLat = parseFloat(searchParams.get('swLat') ?? '');
  const swLng = parseFloat(searchParams.get('swLng') ?? '');
  const neLat = parseFloat(searchParams.get('neLat') ?? '');
  const neLng = parseFloat(searchParams.get('neLng') ?? '');

  if ([swLat, swLng, neLat, neLng].some(v => !isFinite(v))) {
    return NextResponse.json({ error: 'swLat, swLng, neLat, neLng required' }, { status: 400 });
  }
  if (swLat > neLat || swLng > neLng) {
    return NextResponse.json({ error: 'Invalid bounding box' }, { status: 400 });
  }
  if (swLat < -90 || neLat > 90 || swLng < -180 || neLng > 180) {
    return NextResponse.json({ error: 'Coordinates out of range' }, { status: 400 });
  }

  const sql = await getDb();

  // Aggregated store prices (one pin per store — the canonical "current truth")
  const storeRows = await sql`
    SELECT
      sp.store_id          AS id,
      s.osm_id,
      s.name               AS store_name,
      s.lat, s.lng,
      s.city, s.state, s.zip,
      sp.current_price::float AS price,
      sp.strength, sp.flavor,
      sp.report_count,
      sp.last_reported_at  AS created_at,
      sp.last_confirmed_at,
      sp.confidence::float,
      sp.is_stale
    FROM store_prices sp
    JOIN stores s ON s.id = sp.store_id
    WHERE s.lat BETWEEN ${swLat} AND ${neLat}
      AND s.lng BETWEEN ${swLng} AND ${neLng}
    ORDER BY sp.last_reported_at DESC
    LIMIT 500
  `;

  // Legacy prices without a store entity (backward compat with old data)
  const legacyRows = await sql`
    SELECT
      -p.id                AS id,
      NULL::bigint         AS osm_id,
      p.store_name,
      p.lat, p.lng,
      p.city, p.state, p.zip,
      p.price::float       AS price,
      p.strength, p.flavor,
      1                    AS report_count,
      p.created_at,
      NULL::timestamptz    AS last_confirmed_at,
      0.5::float           AS confidence,
      (p.created_at < NOW() - INTERVAL '30 days') AS is_stale
    FROM prices p
    WHERE p.store_id IS NULL
      AND p.lat BETWEEN ${swLat} AND ${neLat}
      AND p.lng BETWEEN ${swLng} AND ${neLng}
    ORDER BY p.created_at DESC
    LIMIT 100
  `;

  return NextResponse.json([...storeRows, ...legacyRows]);
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { lat, lng, store_name, price, strength, flavor, store_id, osm_id, osm_name, osm_category } = body;

  // lat/lng always required for the price record
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json({ error: 'lat and lng must be numbers' }, { status: 400 });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
  }
  if (typeof price !== 'number' || !isFinite(price) || price < 1 || price > 30) {
    return NextResponse.json({ error: 'Price must be between $1 and $30' }, { status: 400 });
  }
  if (strength !== null && strength !== undefined && strength !== 3 && strength !== 6) {
    return NextResponse.json({ error: 'Strength must be 3, 6, or null' }, { status: 400 });
  }
  if (flavor !== undefined && flavor !== null && !VALID_FLAVORS.has(flavor as string)) {
    return NextResponse.json({ error: 'Invalid flavor' }, { status: 400 });
  }

  const sql = await getDb();

  // ── Resolve store_id ─────────────────────────────────────────────────────
  let resolvedStoreId: number;

  if (typeof store_id === 'number') {
    // Already have a DB store_id (user tapped a colored price pin and clicked "report new")
    resolvedStoreId = store_id;
  } else if (typeof osm_id === 'number') {
    // User tapped an Overpass gray marker — find or create the store
    const existing = await sql<[{ id: number }?]>`
      SELECT id FROM stores WHERE osm_id = ${osm_id} LIMIT 1
    `;
    if (existing.length > 0) {
      resolvedStoreId = existing[0]!.id;
    } else {
      // Reverse geocode for city/state/zip (best effort)
      const geo = await reverseGeocode(lat as number, lng as number);
      const [created] = await sql<[{ id: number }]>`
        INSERT INTO stores (osm_id, name, lat, lng, category, brand, city, state, zip)
        VALUES (
          ${osm_id},
          ${typeof osm_name === 'string' ? osm_name.trim().slice(0, 200) : 'Store'},
          ${lat}, ${lng},
          ${typeof osm_category === 'string' ? osm_category.trim().slice(0, 100) : null},
          ${typeof osm_name === 'string' ? osm_name.trim().slice(0, 200) : null},
          ${geo.city}, ${geo.state}, ${geo.zip}
        )
        ON CONFLICT (osm_id) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `;
      resolvedStoreId = created.id;
    }
  } else {
    // Freeform: create a new store without an OSM ID
    const geo = await reverseGeocode(lat as number, lng as number);
    const name = typeof store_name === 'string' ? (store_name.trim().slice(0, 200) || 'Unknown') : 'Unknown';
    const [created] = await sql<[{ id: number }]>`
      INSERT INTO stores (name, lat, lng, city, state, zip)
      VALUES (${name}, ${lat}, ${lng}, ${geo.city}, ${geo.state}, ${geo.zip})
      RETURNING id
    `;
    resolvedStoreId = created.id;
  }

  // Geocode for the price record (may already be on store, but record it too)
  const geo = await reverseGeocode(lat as number, lng as number);
  const resolvedStoreName = typeof store_name === 'string' ? store_name.trim() || null : null;

  // ── Insert price report ──────────────────────────────────────────────────
  await sql`
    INSERT INTO prices (lat, lng, zip, state, city, store_name, price, strength, flavor, store_id)
    VALUES (
      ${lat}, ${lng}, ${geo.zip}, ${geo.state}, ${geo.city},
      ${resolvedStoreName},
      ${price},
      ${typeof strength === 'number' ? strength : null},
      ${typeof flavor === 'string' ? flavor : null},
      ${resolvedStoreId}
    )
  `;

  // ── Upsert store_prices aggregate ────────────────────────────────────────
  // Compute median of recent reports (last 14 days) and update confidence score
  await sql`
    WITH recent AS (
      SELECT price
      FROM   prices
      WHERE  store_id = ${resolvedStoreId}
        AND  created_at > NOW() - INTERVAL '14 days'
      ORDER  BY created_at DESC
      LIMIT  10
    ),
    agg AS (
      SELECT
        COUNT(*)::int                                                   AS cnt,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price)             AS median_price
      FROM recent
    ),
    fallback AS (
      SELECT price FROM prices
      WHERE store_id = ${resolvedStoreId}
      ORDER BY created_at DESC LIMIT 1
    ),
    total AS (
      SELECT COUNT(*)::int AS cnt FROM prices WHERE store_id = ${resolvedStoreId}
    )
    INSERT INTO store_prices
      (store_id, current_price, strength, flavor, report_count, last_reported_at, confidence, is_stale)
    SELECT
      ${resolvedStoreId},
      COALESCE(
        CASE WHEN agg.cnt > 0 THEN agg.median_price END,
        (SELECT price FROM fallback)
      ),
      ${typeof strength === 'number' ? strength : null},
      ${typeof flavor === 'string' ? flavor : null},
      (SELECT cnt FROM total),
      NOW(),
      LEAST(
        1.0 * 0.7
        + LEAST((SELECT cnt FROM total), 5)::numeric / 5.0 * 0.3,
        1.0
      ),
      FALSE
    FROM agg
    ON CONFLICT (store_id) DO UPDATE SET
      current_price    = EXCLUDED.current_price,
      strength         = EXCLUDED.strength,
      flavor           = EXCLUDED.flavor,
      report_count     = EXCLUDED.report_count,
      last_reported_at = EXCLUDED.last_reported_at,
      confidence       = EXCLUDED.confidence,
      is_stale         = FALSE,
      updated_at       = NOW()
  `;

  return NextResponse.json({ ok: true }, { status: 201 });
}

async function reverseGeocode(lat: number, lng: number) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      {
        headers: { 'User-Agent': 'Zyndex/1.0 (nicotine-price-index)' },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (res.ok) {
      const j = await res.json();
      return {
        city:  j.address?.city ?? j.address?.town ?? j.address?.village ?? null,
        state: j.address?.state ?? null,
        zip:   j.address?.postcode ?? null,
      };
    }
  } catch { /* best effort */ }
  return { city: null, state: null, zip: null };
}
