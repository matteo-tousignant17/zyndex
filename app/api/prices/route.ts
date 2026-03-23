import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const swLat = parseFloat(searchParams.get('swLat') ?? '');
  const swLng = parseFloat(searchParams.get('swLng') ?? '');
  const neLat = parseFloat(searchParams.get('neLat') ?? '');
  const neLng = parseFloat(searchParams.get('neLng') ?? '');

  if ([swLat, swLng, neLat, neLng].some(isNaN)) {
    return NextResponse.json({ error: 'swLat, swLng, neLat, neLng required' }, { status: 400 });
  }

  const db = getDb();

  const prices = db.prepare(`
    SELECT id, lat, lng, zip, state, city, store_name, price, strength, flavor, created_at
    FROM prices
    WHERE lat BETWEEN ? AND ?
      AND lng BETWEEN ? AND ?
    ORDER BY created_at DESC
    LIMIT 500
  `).all(swLat, neLat, swLng, neLng);

  return NextResponse.json(prices);
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { lat, lng, zip, state, city, store_name, price, strength, flavor } = body as Record<string, unknown>;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json({ error: 'lat and lng must be numbers' }, { status: 400 });
  }
  if (typeof price !== 'number' || price < 1 || price > 30) {
    return NextResponse.json({ error: 'Price must be between $1 and $30' }, { status: 400 });
  }
  if (strength !== 3 && strength !== 6) {
    return NextResponse.json({ error: 'Strength must be 3 or 6' }, { status: 400 });
  }

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO prices (lat, lng, zip, state, city, store_name, price, strength, flavor)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    lat, lng,
    typeof zip === 'string' ? zip : null,
    typeof state === 'string' ? state : null,
    typeof city === 'string' ? city : null,
    typeof store_name === 'string' ? store_name : null,
    price,
    strength,
    typeof flavor === 'string' ? flavor : null,
  );

  return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 });
}
