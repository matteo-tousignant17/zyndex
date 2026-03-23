import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { store_id } = body;
  if (typeof store_id !== 'number' || !Number.isInteger(store_id) || store_id <= 0) {
    return NextResponse.json({ error: 'store_id must be a positive integer' }, { status: 400 });
  }

  const sql = await getDb();

  // Update last_confirmed_at and recalculate confidence with a small confirmation bonus
  const result = await sql`
    UPDATE store_prices
    SET
      last_confirmed_at = NOW(),
      confidence = LEAST(
        EXP(-EXTRACT(EPOCH FROM (NOW() - last_reported_at)) / 604800.0) * 0.7
        + LEAST(report_count, 5)::numeric / 5.0 * 0.3
        + 0.1,
        1.0
      ),
      is_stale = FALSE,
      updated_at = NOW()
    WHERE store_id = ${store_id}
    RETURNING store_id
  `;

  if (result.length === 0) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
