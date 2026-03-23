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

  const { lat, lng, zip, state, city, store_name, price, strength, flavor } = body;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json({ error: 'lat and lng must be numbers' }, { status: 400 });
  }
  if (typeof price !== 'number' || price < 1 || price > 30) {
    return NextResponse.json({ error: 'Price must be between $1 and $30' }, { status: 400 });
  }
  if (strength !== null && strength !== undefined && strength !== 3 && strength !== 6) {
    return NextResponse.json({ error: 'Strength must be 3, 6, or null' }, { status: 400 });
  }

  const sql = await getDb();
  await sql`
    INSERT INTO prices (lat, lng, zip, state, city, store_name, price, strength, flavor)
    VALUES (
      ${lat}, ${lng},
      ${typeof zip === 'string' ? zip : null},
      ${typeof state === 'string' ? state : null},
      ${typeof city === 'string' ? city : null},
      ${typeof store_name === 'string' ? store_name : null},
      ${price},
      ${typeof strength === 'number' ? strength : null},
      ${typeof flavor === 'string' ? flavor : null}
    )
  `;

  return NextResponse.json({ ok: true }, { status: 201 });
}
