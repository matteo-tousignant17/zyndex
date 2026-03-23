'use client';

import { useState } from 'react';

const FLAVORS = [
  'Cool Mint', 'Peppermint', 'Spearmint', 'Wintergreen',
  'Citrus', 'Smooth', 'Coffee', 'Cinnamon', 'Other',
];

export interface SnappedStore {
  id?: number;       // DB store_id — set when tapping a price pin
  osm_id?: number;   // Overpass OSM ID — set when tapping a gray store marker
  name: string;
  lat: number;
  lng: number;
  category?: string | null;
}

export interface PriceSubmitData {
  store_name: string;
  price: number;
  strength: number | null;
  flavor: string;
  lat: number;
  lng: number;
  store_id?: number;
  osm_id?: number;
  osm_name?: string;
  osm_category?: string;
}

interface Props {
  lat: number;
  lng: number;
  snappedStore?: SnappedStore | null;
  onSubmit: (data: PriceSubmitData) => Promise<void>;
  onClose: () => void;
}

export default function PriceForm({ lat, lng, snappedStore, onSubmit, onClose }: Props) {
  const [storeName, setStoreName] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [flavor, setFlavor] = useState('Cool Mint');
  const [strengthStr, setStrengthStr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const price = parseFloat(priceStr);
    if (isNaN(price) || price < 1 || price > 30) {
      setError('Enter a price between $1.00 and $30.00');
      return;
    }

    const strength = strengthStr ? parseInt(strengthStr) : null;

    const data: PriceSubmitData = {
      store_name: snappedStore ? snappedStore.name : storeName.trim(),
      price,
      strength,
      flavor,
      lat: snappedStore ? snappedStore.lat : lat,
      lng: snappedStore ? snappedStore.lng : lng,
    };

    if (snappedStore?.id) {
      data.store_id = snappedStore.id;
    } else if (snappedStore?.osm_id) {
      data.osm_id = snappedStore.osm_id;
      data.osm_name = snappedStore.name;
      data.osm_category = snappedStore.category ?? undefined;
    }

    setSubmitting(true);
    try {
      await onSubmit(data);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">Report a Price</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Price — most prominent */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Price per can <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">$</span>
              <input
                type="number"
                step="0.01"
                min="1"
                max="30"
                value={priceStr}
                onChange={e => setPriceStr(e.target.value)}
                placeholder="5.49"
                required
                autoFocus
                className="w-full pl-7 pr-3 py-3 text-xl font-bold border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Flavor + strength on one row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Flavor</label>
              <select
                value={flavor}
                onChange={e => setFlavor(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {FLAVORS.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div className="w-24">
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Strength <span className="text-gray-400 font-normal text-xs">(opt)</span>
              </label>
              <select
                value={strengthStr}
                onChange={e => setStrengthStr(e.target.value)}
                className="w-full px-2 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">—</option>
                <option value="3">3 mg</option>
                <option value="6">6 mg</option>
              </select>
            </div>
          </div>

          {/* Store name — editable for freeform, read-only when snapped */}
          {snappedStore ? (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
              <span className="text-blue-600 text-sm">📍</span>
              <span className="text-sm font-medium text-blue-800">{snappedStore.name}</span>
              <span className="text-xs text-blue-500 ml-auto">snapped</span>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Store name <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={storeName}
                onChange={e => setStoreName(e.target.value)}
                placeholder="e.g. 7-Eleven, Wawa, CVS…"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="text-xs text-gray-400 mt-1">
                📍 {lat.toFixed(4)}, {lng.toFixed(4)} — drag the pin on the map to adjust.
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {submitting ? 'Submitting…' : 'Submit Price'}
          </button>
        </form>
      </div>
    </div>
  );
}
