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

  if ([swLat, swLng, neLat, neLng].some(isNaN)) {
    return NextResponse.json({ error: 'swLat, swLng, neLat, neLng required' }, { status: 400 });
  }

  const sql = await getDb();
  const rows = await sql`
    SELECT id, lat, lng, zip, state, city, store_name,
           price::float AS price, strength, flavor, created_at
    FROM   prices
    WHERE  lat BETWEEN ${swLat} AND ${neLat}
      AND  lng BETWEEN ${swLng} AND ${neLng}
    ORDER  BY created_at DESC
    LIMIT  500
  `;

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { lat, lng, store_name, price, strength, flavor } = body;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json({ error: 'lat and lng must be numbers' }, { status: 400 });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
  }
  if (typeof price !== 'number' || price < 1 || price > 30) {
    return NextResponse.json({ error: 'Price must be between $1 and $30' }, { status: 400 });
  }
  if (strength !== null && strength !== undefined && strength !== 3 && strength !== 6) {
    return NextResponse.json({ error: 'Strength must be 3, 6, or null' }, { status: 400 });
  }
  if (flavor !== undefined && flavor !== null && !VALID_FLAVORS.has(flavor as string)) {
    return NextResponse.json({ error: 'Invalid flavor' }, { status: 400 });
  }

  // Reverse geocode server-side (best effort)
  let city: string | null = null;
  let state: string | null = null;
  let zip: string | null = null;
  try {
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'User-Agent': 'Zyndex/1.0 (nicotine-price-index)' } }
    );
    if (geoRes.ok) {
      const j = await geoRes.json();
      city  = j.address?.city ?? j.address?.town ?? j.address?.village ?? null;
      state = j.address?.state ?? null;
      zip   = j.address?.postcode ?? null;
    }
  } catch { /* best effort */ }

  const sql = await getDb();
  await sql`
    INSERT INTO prices (lat, lng, zip, state, city, store_name, price, strength, flavor)
    VALUES (
      ${lat}, ${lng}, ${zip}, ${state}, ${city},
      ${typeof store_name === 'string' ? store_name.trim() || null : null},
      ${price},
      ${typeof strength === 'number' ? strength : null},
      ${typeof flavor === 'string' ? flavor : null}
    )
  `;

  return NextResponse.json({ ok: true }, { status: 201 });
}
