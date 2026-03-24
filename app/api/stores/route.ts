import { NextRequest, NextResponse } from 'next/server';

// Max bounding box size in degrees (~33km). Overpass gets slow on large areas.
const MAX_SPAN = 0.3;

// OSM tags that indicate stores likely to carry nicotine pouches
const OVERPASS_QUERY = (s: number, w: number, n: number, e: number) => `
[out:json][timeout:15];
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const swLat = parseFloat(searchParams.get('swLat') ?? '');
  const swLng = parseFloat(searchParams.get('swLng') ?? '');
  const neLat = parseFloat(searchParams.get('neLat') ?? '');
  const neLng = parseFloat(searchParams.get('neLng') ?? '');

  if ([swLat, swLng, neLat, neLng].some(isNaN)) {
    return NextResponse.json({ error: 'swLat, swLng, neLat, neLng required' }, { status: 400 });
  }

  // Refuse to query huge areas — caller should only call at zoom ≥ 13
  if ((neLat - swLat) > MAX_SPAN || (neLng - swLng) > MAX_SPAN) {
    return NextResponse.json({ error: 'Area too large' }, { status: 400 });
  }

  const query = OVERPASS_QUERY(swLat, swLng, neLat, neLng);

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      // Cache on Vercel's Data Cache for 1 hour — stores don't move often
      next: { revalidate: 3600 },
    } as RequestInit);

    if (!res.ok) return NextResponse.json({ error: 'Overpass error' }, { status: 502 });

    const json = await res.json();

    const stores = (json.elements ?? [])
      .filter((el: Record<string, unknown>) => {
        // Nodes have lat/lon directly; ways have a center
        const lat = (el.lat as number) ?? (el.center as Record<string, number>)?.lat;
        const lon = (el.lon as number) ?? (el.center as Record<string, number>)?.lon;
        return lat !== undefined && lon !== undefined;
      })
      .map((el: Record<string, unknown>) => {
        const tags = (el.tags ?? {}) as Record<string, string>;
        const lat  = (el.lat as number) ?? (el.center as Record<string, number>).lat;
        const lon  = (el.lon as number) ?? (el.center as Record<string, number>).lon;
        return {
          osm_id:   el.id as number,
          name:     tags.name ?? tags.brand ?? tags['name:en'] ?? 'Store',
          lat,
          lng:      lon,
          brand:    tags.brand ?? null,
          category: osmCategory(tags),
        };
      })
      // Skip unnamed placeholder nodes (fallback name means OSM has no name tag)
      .filter((s: { name: string }) => s.name !== 'Store');

    return NextResponse.json(stores);
  } catch {
    return NextResponse.json({ error: 'Fetch failed' }, { status: 502 });
  }
}
