'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import PriceForm from './PriceForm';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PriceEntry {
  id: number;
  lat: number;
  lng: number;
  zip: string | null;
  state: string | null;
  city: string | null;
  store_name: string | null;
  price: number;
  strength: number;
  flavor: string | null;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function priceClass(price: number) {
  if (price < 4.75) return 'pin-green';
  if (price < 5.75) return 'pin-yellow';
  return 'pin-red';
}

function makePriceIcon(price: number) {
  return L.divIcon({
    className: '',
    html: `<div class="price-pin ${priceClass(price)}"><span>$${price.toFixed(2)}</span></div>`,
    iconSize: [52, 52],
    iconAnchor: [4, 52],
    popupAnchor: [22, -56],
  });
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr + 'Z').getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function BoundsWatcher({ onChange }: { onChange: (b: L.LatLngBounds) => void }) {
  const map = useMapEvents({
    moveend() { onChange(map.getBounds()); },
    zoomend() { onChange(map.getBounds()); },
  });
  return null;
}

function FlyTo({ target }: { target: [number, number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target[0], target[1]], target[2], { duration: 1.2 });
  }, [map, target]);
  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MapPage() {
  const [prices, setPrices] = useState<PriceEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formLatLng, setFormLatLng] = useState<[number, number] | null>(null);
  const [flyTarget, setFlyTarget] = useState<[number, number, number] | null>(null);
  const [zipInput, setZipInput] = useState('');
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Try geolocation on first load
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setFlyTarget([pos.coords.latitude, pos.coords.longitude, 12]);
        },
        () => { /* denied — stay on default view */ },
        { timeout: 5000 }
      );
    }
  }, []);

  async function handleZipSearch(e: React.FormEvent) {
    e.preventDefault();
    setLocError('');
    if (!/^\d{5}$/.test(zipInput)) {
      setLocError('Enter a 5-digit zip code');
      return;
    }
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
      (pos) => {
        setFlyTarget([pos.coords.latitude, pos.coords.longitude, 13]);
        setLocating(false);
      },
      () => { setLocError('Location access denied'); setLocating(false); }
    );
  }

  function openForm(lat: number, lng: number) {
    setFormLatLng([lat, lng]);
    setShowForm(true);
  }

  async function handleSubmit(data: {
    store_name: string;
    price: number;
    strength: number;
    flavor: string;
    lat: number;
    lng: number;
  }) {
    // Reverse-geocode to get city/state/zip
    let geo: { city?: string; state?: string; zip?: string } = {};
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${data.lat}&lon=${data.lng}&format=json`
      );
      const j = await r.json();
      geo = {
        city: j.address?.city || j.address?.town || j.address?.village,
        state: j.address?.state,
        zip: j.address?.postcode,
      };
    } catch { /* best effort */ }

    const res = await fetch('/api/prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, ...geo }),
    });

    if (res.ok) {
      setShowForm(false);
      setSuccessMsg('Price reported! Thanks for contributing.');
      setTimeout(() => setSuccessMsg(''), 4000);
      // Refresh prices for current map view — trigger via a small state change
      // The BoundsWatcher re-fires on next move; for now force a re-fetch
      const el = document.querySelector('.leaflet-container') as HTMLElement;
      if (el) el.dispatchEvent(new Event('zyndex-refresh'));
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="z-50 flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shadow-sm">
        {/* Logo */}
        <div className="flex items-center gap-2 mr-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <span className="text-white font-black text-sm">Z</span>
          </div>
          <span className="font-black text-gray-900 text-lg tracking-tight">Zyndex</span>
        </div>

        {/* Zip search */}
        <form onSubmit={handleZipSearch} className="flex items-center gap-2 flex-1 max-w-xs">
          <div className="relative flex-1">
            <input
              type="text"
              value={zipInput}
              onChange={e => setZipInput(e.target.value)}
              placeholder="Enter zip code"
              maxLength={5}
              className="w-full pl-3 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={locating}
            className="px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Go
          </button>
          <button
            type="button"
            onClick={handleLocateMe}
            disabled={locating}
            title="Use my location"
            className="px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {locating ? '…' : '📍'}
          </button>
        </form>

        {locError && (
          <span className="text-xs text-red-500">{locError}</span>
        )}

        <div className="ml-auto">
          <button
            onClick={() => {
              setFormLatLng(flyTarget ? [flyTarget[0], flyTarget[1]] : [39.5, -98.35]);
              setShowForm(true);
            }}
            className="px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            + Report Price
          </button>
        </div>
      </header>

      {/* ── Legend ── */}
      <div className="absolute top-20 right-4 z-40 bg-white rounded-xl shadow-md px-3 py-2 flex flex-col gap-1.5 text-xs font-medium border border-gray-100">
        <div className="text-gray-500 font-semibold text-[11px] uppercase tracking-wide mb-0.5">Per Can</div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-600 inline-block"></span>Under $4.75
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-amber-600 inline-block"></span>$4.75 – $5.75
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-600 inline-block"></span>Over $5.75
        </div>
      </div>

      {/* ── Success toast ── */}
      {successMsg && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {successMsg}
        </div>
      )}

      {/* ── Map ── */}
      <div className="flex-1 relative">
        <MapContainer
          center={[39.5, -98.35]}
          zoom={5}
          className="w-full h-full"
          zoomControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />

          <BoundsWatcher onChange={fetchPrices} />
          <FlyTo target={flyTarget} />

          {/* Tap-to-report */}
          <MapClickHandler onMapClick={openForm} />

          {prices.map(p => (
            <Marker key={p.id} position={[p.lat, p.lng]} icon={makePriceIcon(p.price)}>
              <Popup>
                <div className="p-3 min-w-[180px]">
                  <div className="text-2xl font-black text-gray-900">${p.price.toFixed(2)}</div>
                  <div className="text-sm text-gray-500 mt-0.5">
                    {p.strength}mg{p.flavor ? ` · ${p.flavor}` : ''}
                  </div>
                  {p.store_name && (
                    <div className="text-sm font-medium text-gray-700 mt-2">{p.store_name}</div>
                  )}
                  {(p.city || p.state) && (
                    <div className="text-xs text-gray-400">
                      {[p.city, p.state].filter(Boolean).join(', ')}
                      {p.zip ? ` ${p.zip}` : ''}
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mt-2">{timeAgo(p.created_at)}</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* ── Price submission modal ── */}
      {showForm && formLatLng && (
        <PriceForm
          lat={formLatLng[0]}
          lng={formLatLng[1]}
          onSubmit={handleSubmit}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

// Separate component so it can use useMapEvents
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    contextmenu(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}
