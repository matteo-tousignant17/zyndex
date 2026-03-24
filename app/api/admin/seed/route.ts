import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Allow up to 5 minutes — this is a one-time admin operation
export const maxDuration = 300;

// Per-can Zyn price estimates based on state nicotine excise tax rates.
// High-tax states (MN 95% wholesale, NY, MA, WA, CA) cluster $6.50–$7.50.
// Low-tax states (TX, AZ, NC — no pouch-specific excise) cluster $4.25–$4.75.
const STATE_PRICES: Record<string, number> = {
  MN: 7.49, NY: 7.49, HI: 7.49,
  MA: 6.99, DC: 6.99,
  WA: 6.49, CA: 6.49, NJ: 6.49, CT: 6.49,
  OR: 5.99, AK: 5.99,
  IL: 5.79,
  CO: 5.39,
  PA: 5.59, MD: 5.49, WI: 5.49,
  MI: 5.29,
  OH: 5.09, IA: 5.09,
  FL: 4.99, NV: 4.99, VA: 4.99, KY: 4.99, IN: 4.99, UT: 4.99, TN: 4.99,
  GA: 4.79, MT: 4.79, MO: 4.79, KS: 4.79, AL: 4.79,
  NE: 4.89,
  SC: 4.69,
  TX: 4.49, AZ: 4.29, MS: 4.49, AR: 4.59, OK: 4.59, NM: 4.49,
  NC: 4.39, WY: 4.49, SD: 4.49,
};
const DEFAULT_PRICE = 5.49;

interface Metro { name: string; state: string; s: number; w: number; n: number; e: number; }

// Top 20 US metros by population, sized to cover the urban core.
const METROS: Metro[] = [
  { name: 'New York City',   state: 'NY', s: 40.48, w: -74.26, n: 40.92, e: -73.70 },
  { name: 'Los Angeles',     state: 'CA', s: 33.70, w: -118.67, n: 34.34, e: -117.65 },
  { name: 'Chicago',         state: 'IL', s: 41.64, w: -87.94,  n: 42.08, e: -87.52 },
  { name: 'Houston',         state: 'TX', s: 29.52, w: -95.67,  n: 30.08, e: -95.01 },
  { name: 'Phoenix',         state: 'AZ', s: 33.29, w: -112.32, n: 33.69, e: -111.92 },
  { name: 'Philadelphia',    state: 'PA', s: 39.87, w: -75.28,  n: 40.14, e: -74.96 },
  { name: 'Dallas',          state: 'TX', s: 32.62, w: -97.03,  n: 32.99, e: -96.60 },
  { name: 'Austin',          state: 'TX', s: 30.10, w: -97.93,  n: 30.51, e: -97.61 },
  { name: 'Charlotte',       state: 'NC', s: 35.09, w: -80.94,  n: 35.38, e: -80.68 },
  { name: 'Denver',          state: 'CO', s: 39.61, w: -104.99, n: 39.91, e: -104.73 },
  { name: 'Seattle',         state: 'WA', s: 47.49, w: -122.45, n: 47.74, e: -122.23 },
  { name: 'Boston',          state: 'MA', s: 42.25, w: -71.19,  n: 42.44, e: -70.99 },
  { name: 'Minneapolis',     state: 'MN', s: 44.89, w: -93.33,  n: 45.05, e: -93.19 },
  { name: 'Miami',           state: 'FL', s: 25.71, w: -80.33,  n: 25.87, e: -80.19 },
  { name: 'Las Vegas',       state: 'NV', s: 36.05, w: -115.27, n: 36.28, e: -115.07 },
  { name: 'Atlanta',         state: 'GA', s: 33.65, w: -84.56,  n: 33.89, e: -84.29 },
  { name: 'Detroit',         state: 'MI', s: 42.26, w: -83.27,  n: 42.45, e: -83.00 },
  { name: 'Columbus',        state: 'OH', s: 39.90, w: -83.07,  n: 40.10, e: -82.85 },
  { name: 'Nashville',       state: 'TN', s: 36.05, w: -87.04,  n: 36.31, e: -86.65 },
  { name: 'Portland',        state: 'OR', s: 45.43, w: -122.84, n: 45.65, e: -122.45 },
];

function osmCategory(tags: Record<string, string>): string {
  if (tags.amenity === 'fuel') return 'fuel';
  if (tags.shop === 'convenience') return 'convenience';
  if (tags.shop === 'tobacco') return 'tobacco';
  if (tags.shop === 'vape') return 'vape';
  if (tags.amenity === 'pharmacy' || tags.shop === 'chemist') return 'pharmacy';
  if (tags.shop === 'supermarket' || tags.shop === 'grocery') return 'grocery';
  if (tags.shop === 'liquor') return 'liquor';
  return 'other';
}

const OVERPASS_QUERY = (s: number, w: number, n: number, e: number) => `
[out:json][timeout:25];
(
  node["amenity"="fuel"](${s},${w},${n},${e});
  node["shop"="convenience"](${s},${w},${n},${e});
  node["shop"="tobacco"](${s},${w},${n},${e});
  node["shop"="vape"](${s},${w},${n},${e});
  node["amenity"="pharmacy"](${s},${w},${n},${e});
  node["shop"="chemist"](${s},${w},${n},${e});
  node["shop"="supermarket"](${s},${w},${n},${e});
  node["shop"="grocery"](${s},${w},${n},${e});
  node["shop"="liquor"](${s},${w},${n},${e});
  way["amenity"="fuel"](${s},${w},${n},${e});
  way["shop"="convenience"](${s},${w},${n},${e});
  way["shop"="tobacco"](${s},${w},${n},${e});
  way["shop"="vape"](${s},${w},${n},${e});
  way["amenity"="pharmacy"](${s},${w},${n},${e});
  way["shop"="chemist"](${s},${w},${n},${e});
  way["shop"="supermarket"](${s},${w},${n},${e});
  way["shop"="grocery"](${s},${w},${n},${e});
  way["shop"="liquor"](${s},${w},${n},${e});
);
out center;
`;

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret');
  const expectedSecret = process.env.SEED_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Optional: filter to a single metro by name substring for partial re-runs
  const onlyMetro = request.nextUrl.searchParams.get('metro')?.toLowerCase();
  const targets = onlyMetro
    ? METROS.filter(m => m.name.toLowerCase().includes(onlyMetro))
    : METROS;

  const db = await getDb();
  const results: Array<{ metro: string; stores_inserted: number; error?: string }> = [];
  let totalStores = 0;

  for (const metro of targets) {
    // Polite delay between Overpass requests (skip before first)
    if (results.length > 0) await new Promise(r => setTimeout(r, 1500));

    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(OVERPASS_QUERY(metro.s, metro.w, metro.n, metro.e))}`,
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);

      const json = await res.json();
      const elements: Record<string, unknown>[] = json.elements ?? [];

      type StoreRow = {
        osm_id: number; name: string; lat: number; lng: number;
        category: string; brand: string | null; state: string;
      };

      const rows: StoreRow[] = [];
      for (const el of elements) {
        const lat = (el.lat as number) ?? (el.center as Record<string, number>)?.lat;
        const lon = (el.lon as number) ?? (el.center as Record<string, number>)?.lon;
        if (lat == null || lon == null) continue;
        const tags = (el.tags ?? {}) as Record<string, string>;
        rows.push({
          osm_id: el.id as number,
          name: tags.name ?? tags.brand ?? tags['name:en'] ?? 'Store',
          lat,
          lng: lon,
          category: osmCategory(tags),
          brand: tags.brand ?? null,
          state: metro.state,
        });
      }

      if (rows.length === 0) {
        results.push({ metro: metro.name, stores_inserted: 0 });
        continue;
      }

      // Bulk insert stores — skip any that already exist by osm_id
      const inserted = await db<{ id: number }[]>`
        INSERT INTO stores (osm_id, name, lat, lng, category, brand, state)
        ${db(rows, 'osm_id', 'name', 'lat', 'lng', 'category', 'brand', 'state')}
        ON CONFLICT (osm_id) DO NOTHING
        RETURNING id
      `;

      // Seed estimated prices only for the newly inserted stores.
      // report_count=0 signals "estimate" — no real user has confirmed this yet.
      if (inserted.length > 0) {
        const estimatedPrice = STATE_PRICES[metro.state] ?? DEFAULT_PRICE;
        const priceRows = inserted.map(r => ({
          store_id:         r.id,
          current_price:    estimatedPrice,
          strength:         6,
          flavor:           'Cool Mint',
          report_count:     0,
          last_reported_at: new Date(),
          confidence:       0.25,
          is_stale:         false,
        }));
        await db`
          INSERT INTO store_prices
            (store_id, current_price, strength, flavor, report_count, last_reported_at, confidence, is_stale)
          ${db(priceRows, 'store_id', 'current_price', 'strength', 'flavor', 'report_count', 'last_reported_at', 'confidence', 'is_stale')}
          ON CONFLICT (store_id) DO NOTHING
        `;
      }

      totalStores += inserted.length;
      results.push({ metro: metro.name, stores_inserted: inserted.length });
    } catch (err) {
      results.push({ metro: metro.name, stores_inserted: 0, error: String(err) });
    }
  }

  return NextResponse.json({ ok: true, total_stores_inserted: totalStores, results });
}
