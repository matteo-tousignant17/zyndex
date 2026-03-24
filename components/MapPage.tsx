'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import PriceForm, { SnappedStore, PriceSubmitData } from './PriceForm';
import AboutModal from './AboutModal';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PriceEntry {
  id: number;               // store_id (or negative price.id for legacy rows)
  osm_id: number | null;
  lat: number;
  lng: number;
  zip: string | null;
  state: string | null;
  city: string | null;
  store_name: string | null;
  price: number;
  strength: number | null;
  flavor: string | null;
  created_at: string;
  report_count: number;
  confidence: number;
  is_stale: boolean;
}

interface StoreEntry {
  osm_id: number;
  name: string;
  lat: number;
  lng: number;
  brand: string | null;
  category: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const GREEN_THRESH = 4.75;
const RED_THRESH   = 5.75;

function priceClass(displayPrice: number, logMode: boolean) {
  const scale = logMode ? 5 : 1;
  if (displayPrice < GREEN_THRESH * scale) return 'pin-green';
  if (displayPrice < RED_THRESH   * scale) return 'pin-yellow';
  return 'pin-red';
}

function makePriceIcon(displayPrice: number, logMode: boolean, isStale: boolean, isFreeform: boolean) {
  return L.divIcon({
    className: '',
    html: `<div class="price-pin ${priceClass(displayPrice, logMode)}${isStale ? ' pin-stale' : ''}${isFreeform ? ' pin-freeform' : ''}"><span>$${displayPrice.toFixed(2)}</span></div>`,
    iconSize: [52, 52],
    iconAnchor: [4, 52],
    popupAnchor: [22, -56],
  });
}

const storeIcon = L.divIcon({
  className: '',
  html: `<div class="store-marker"><span>+</span></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -30],
});

const dropPinIcon = L.divIcon({
  className: '',
  html: `<div class="drop-pin"></div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 36],
});

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function confidenceBadge(confidence: number, isStale: boolean) {
  if (isStale) return <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">Stale</span>;
  if (confidence >= 0.7) return null;
  if (confidence >= 0.4) return <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Aging</span>;
  return <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">Old</span>;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function BoundsWatcher({ onChange }: { onChange: (b: L.LatLngBounds, zoom: number) => void }) {
  const map = useMapEvents({
    moveend() { onChange(map.getBounds(), map.getZoom()); },
    zoomend() { onChange(map.getBounds(), map.getZoom()); },
  });
  useEffect(() => { onChange(map.getBounds(), map.getZoom()); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function FlyTo({ target }: { target: [number, number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target[0], target[1]], target[2], { duration: 1.2 });
  }, [map, target]);
  return null;
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    contextmenu(e) { onMapClick(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MapPage() {
  const [prices, setPrices]           = useState<PriceEntry[]>([]);
  const [stores, setStores]           = useState<StoreEntry[]>([]);
  const [zoom, setZoom]               = useState(5);
  const [logMode, setLogMode]         = useState(false);
  const [showForm, setShowForm]       = useState(false);
  const [formLatLng, setFormLatLng]   = useState<[number, number]>([39.5, -98.35]);
  const [formStore, setFormStore]     = useState<SnappedStore | null>(null);
  const [flyTarget, setFlyTarget]     = useState<[number, number, number] | null>(null);
  const [zipInput, setZipInput]       = useState('');
  const [locating, setLocating]       = useState(false);
  const [locError, setLocError]       = useState('');
  const [successMsg, setSuccessMsg]   = useState('');
  const [showAbout, setShowAbout]     = useState(false);
  const mapRef       = useRef<L.Map | null>(null);
  const boundsRef    = useRef<L.LatLngBounds | null>(null);
  const fetchTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storeTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPrices = useCallback((bounds: L.LatLngBounds) => {
    if (fetchTimer.current) clearTimeout(fetchTimer.current);
    fetchTimer.current = setTimeout(async () => {
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const res = await fetch(
        `/api/prices?swLat=${sw.lat}&swLng=${sw.lng}&neLat=${ne.lat}&neLng=${ne.lng}`
      );
      if (res.ok) setPrices(await res.json());
    }, 300);
  }, []);

  const fetchStores = useCallback((bounds: L.LatLngBounds) => {
    if (storeTimer.current) clearTimeout(storeTimer.current);
    storeTimer.current = setTimeout(async () => {
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const res = await fetch(
        `/api/stores?swLat=${sw.lat}&swLng=${sw.lng}&neLat=${ne.lat}&neLng=${ne.lng}`
      );
      if (res.ok) setStores(await res.json());
    }, 500);
  }, []);

  const handleBoundsChange = useCallback((bounds: L.LatLngBounds, newZoom: number) => {
    boundsRef.current = bounds;
    setZoom(newZoom);
    fetchPrices(bounds);
    if (newZoom >= 13) fetchStores(bounds);
    else setStores([]);
  }, [fetchPrices, fetchStores]);

  // Try geolocation on first load
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setFlyTarget([pos.coords.latitude, pos.coords.longitude, 12]),
        () => { /* denied — stay on default US view */ },
        { timeout: 5000 }
      );
    }
  }, []);

  async function handleZipSearch(e: React.FormEvent) {
    e.preventDefault();
    setLocError('');
    if (!/^\d{5}$/.test(zipInput)) { setLocError('Enter a 5-digit zip code'); return; }
    setLocating(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?postalcode=${zipInput}&country=US&format=json&limit=1`
      );
      const data = await res.json();
      if (!data.length) { setLocError('Zip code not found'); return; }
      setFlyTarget([parseFloat(data[0].lat), parseFloat(data[0].lon), 12]);
    } catch {
      setLocError('Could not geocode zip');
    } finally {
      setLocating(false);
    }
  }

  function handleLocateMe() {
    setLocError('');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setFlyTarget([pos.coords.latitude, pos.coords.longitude, 13]); setLocating(false); },
      () => { setLocError('Location access denied'); setLocating(false); }
    );
  }

  function openFreeformForm() {
    const map = mapRef.current;
    const center = map ? map.getCenter() : { lat: 39.5, lng: -98.35 };
    setFormLatLng([center.lat, center.lng]);
    setFormStore(null);
    setShowForm(true);
  }

  function openStoreForm(store: StoreEntry) {
    setFormLatLng([store.lat, store.lng]);
    setFormStore({
      osm_id: store.osm_id,
      name: store.name,
      lat: store.lat,
      lng: store.lng,
      category: store.category,
    });
    setShowForm(true);
    mapRef.current?.closePopup();
  }

  function openReportFromPin(pin: PriceEntry) {
    setFormLatLng([pin.lat, pin.lng]);
    setFormStore({
      id: pin.id > 0 ? pin.id : undefined,
      name: pin.store_name ?? 'Unknown Store',
      lat: pin.lat,
      lng: pin.lng,
    });
    setShowForm(true);
    mapRef.current?.closePopup();
  }

  async function handleConfirm(storeId: number) {
    await fetch('/api/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: storeId }),
    });
    if (boundsRef.current) fetchPrices(boundsRef.current);
  }

  async function handleSubmit(data: PriceSubmitData) {
    const res = await fetch('/api/prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      setShowForm(false);
      setFormStore(null);
      setSuccessMsg('Price reported! Thanks for contributing.');
      setTimeout(() => setSuccessMsg(''), 4000);
      if (boundsRef.current) {
        fetchPrices(boundsRef.current);
        if (zoom >= 13) fetchStores(boundsRef.current);
      }
    } else {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? 'Submit failed');
    }
  }

  const scale = logMode ? 5 : 1;

  // OSM IDs of stores that already have price data (to avoid duplicate markers)
  const pricedOsmIds = new Set(prices.map(p => p.osm_id).filter(Boolean));
  // Filter out Overpass stores that already have a price pin on the map —
  // either by osm_id match or by proximity (~50 m) for freeform pins with no osm_id
  const unpricedStores = stores.filter(s => {
    if (pricedOsmIds.has(s.osm_id)) return false;
    const nearby = prices.some(
      p => Math.abs(p.lat - s.lat) < 0.0005 && Math.abs(p.lng - s.lng) < 0.0005
    );
    return !nearby;
  });

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="z-50 flex items-center gap-2 px-3 py-2.5 bg-white border-b border-gray-200 shadow-sm">
        <button
          onClick={() => setShowAbout(true)}
          className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity"
          aria-label="About Zyndex"
        >
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <span className="text-white font-black text-sm">Z</span>
          </div>
          <span className="font-black text-gray-900 text-lg tracking-tight hidden sm:inline">Zyndex</span>
        </button>

        <form onSubmit={handleZipSearch} className="flex items-center gap-1.5 flex-1">
          <input
            type="text"
            inputMode="numeric"
            value={zipInput}
            onChange={e => setZipInput(e.target.value)}
            placeholder="Zip code"
            maxLength={5}
            className="flex-1 min-w-0 pl-3 pr-2 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={locating}
            className="px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0"
          >
            Go
          </button>
          <button
            type="button"
            onClick={handleLocateMe}
            disabled={locating}
            title="Use my location"
            className="px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 shrink-0"
          >
            {locating ? '…' : '📍'}
          </button>
        </form>

        {locError && <span className="text-xs text-red-500 shrink-0">{locError}</span>}

        <button
          onClick={openFreeformForm}
          className="hidden sm:block ml-auto shrink-0 px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          + Report Price
        </button>
      </header>

      {/* ── Legend + log toggle ── */}
      <div className="absolute top-20 right-4 z-[1000] bg-white rounded-xl shadow-md px-3 py-2.5 flex flex-col gap-1.5 text-xs font-medium border border-gray-100 min-w-[140px]">
        <div className="flex rounded-lg overflow-hidden border border-gray-200 mb-1">
          <button
            onClick={() => setLogMode(false)}
            className={`flex-1 py-1 text-[11px] font-semibold transition-colors ${
              !logMode ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            Per Can
          </button>
          <button
            onClick={() => setLogMode(true)}
            className={`flex-1 py-1 text-[11px] font-semibold transition-colors ${
              logMode ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            Per Log
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-600 inline-block shrink-0"></span>
          Under ${(GREEN_THRESH * scale).toFixed(2)}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-amber-600 inline-block shrink-0"></span>
          ${(GREEN_THRESH * scale).toFixed(2)}–${(RED_THRESH * scale).toFixed(2)}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-600 inline-block shrink-0"></span>
          Over ${(RED_THRESH * scale).toFixed(2)}
        </div>
        {zoom >= 13 && (
          <div className="flex items-center gap-2 pt-1 mt-0.5 border-t border-gray-100">
            <span className="w-3 h-3 rounded-full bg-gray-400 inline-block shrink-0"></span>
            No data yet
          </div>
        )}
        <div className="flex items-center gap-2 pt-1 mt-0.5 border-t border-gray-100">
          <span className="w-3 h-3 rounded-full border-2 border-dashed border-gray-400 inline-block shrink-0"></span>
          Unverified
        </div>
      </div>

      {/* ── Success toast ── */}
      {successMsg && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1000] bg-green-600 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {successMsg}
        </div>
      )}

      {/* ── Mobile FAB ── */}
      <button
        onClick={openFreeformForm}
        className="sm:hidden fixed bottom-6 right-4 z-[1000] w-14 h-14 bg-green-600 text-white text-2xl font-bold rounded-full shadow-lg flex items-center justify-center hover:bg-green-700 active:scale-95 transition-transform"
        aria-label="Report a price"
      >
        +
      </button>

      {/* ── Map ── */}
      <div className="flex-1 relative">
        <MapContainer
          center={[39.5, -98.35]}
          zoom={5}
          className="w-full h-full"
          zoomControl={false}
          ref={mapRef}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />

          <BoundsWatcher onChange={handleBoundsChange} />
          <FlyTo target={flyTarget} />
          <MapClickHandler onMapClick={(lat, lng) => {
            setFormLatLng([lat, lng]);
            setFormStore(null);
            setShowForm(true);
          }} />

          {/* Draggable pin shown while freeform form is open */}
          {showForm && !formStore && (
            <Marker
              position={formLatLng}
              draggable
              icon={dropPinIcon}
              eventHandlers={{
                dragend(e) {
                  const pos = (e.target as L.Marker).getLatLng();
                  setFormLatLng([pos.lat, pos.lng]);
                },
              }}
            />
          )}

          {/* Gray store markers — stores with no price data yet (zoom ≥ 13 only) */}
          {unpricedStores.map(s => (
            <Marker
              key={`store-${s.osm_id}`}
              position={[s.lat, s.lng]}
              icon={storeIcon}
              eventHandlers={{
                click() { openStoreForm(s); },
              }}
            />
          ))}

          {/* Colored price pins — one per store */}
          {prices.map(p => {
            const displayPrice = logMode ? p.price * 5 : p.price;
            const isFreeform = p.osm_id === null;
            return (
              <Marker
                key={`${p.id}-${logMode}`}
                position={[p.lat, p.lng]}
                icon={makePriceIcon(displayPrice, logMode, p.is_stale, isFreeform)}
              >
                <Popup>
                  <div className="p-3 min-w-[200px]">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-2xl font-black text-gray-900">${displayPrice.toFixed(2)}</div>
                        <div className="text-xs text-gray-400 -mt-0.5">
                          {logMode
                            ? `per log (5 cans) · $${p.price.toFixed(2)} per can`
                            : `per can · $${(p.price * 5).toFixed(2)} per log`}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {confidenceBadge(p.confidence, p.is_stale)}
                        {isFreeform && (
                          <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Unverified</span>
                        )}
                      </div>
                    </div>

                    {(p.strength || p.flavor) && (
                      <div className="text-sm text-gray-500 mt-1.5">
                        {[p.strength ? `${p.strength}mg` : null, p.flavor].filter(Boolean).join(' · ')}
                      </div>
                    )}
                    {p.store_name && (
                      <div className="text-sm font-medium text-gray-700 mt-2">{p.store_name}</div>
                    )}
                    {(p.city || p.state) && (
                      <div className="text-xs text-gray-400">
                        {[p.city, p.state].filter(Boolean).join(', ')}
                        {p.zip ? ` ${p.zip}` : ''}
                      </div>
                    )}

                    <div className="text-xs text-gray-400 mt-1.5">
                      {p.report_count > 1
                        ? `${p.report_count} reports · last updated ${timeAgo(p.created_at)}`
                        : `Reported ${timeAgo(p.created_at)}`}
                    </div>

                    <div className="flex gap-2 mt-3">
                      {p.id > 0 && (
                        <button
                          onClick={() => handleConfirm(p.id)}
                          className="flex-1 py-1.5 text-xs font-semibold bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100"
                        >
                          Still accurate
                        </button>
                      )}
                      <button
                        onClick={() => openReportFromPin(p)}
                        className="flex-1 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100"
                      >
                        Update price
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* ── About modal ── */}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}

      {/* ── Price submission modal ── */}
      {showForm && (
        <PriceForm
          lat={formLatLng[0]}
          lng={formLatLng[1]}
          snappedStore={formStore}
          onSubmit={handleSubmit}
          onClose={() => { setShowForm(false); setFormStore(null); }}
        />
      )}
    </div>
  );
}
