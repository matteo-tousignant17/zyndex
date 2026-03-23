'use client';

import { useState } from 'react';

const FLAVORS = [
  'Cool Mint', 'Peppermint', 'Spearmint', 'Wintergreen',
  'Citrus', 'Smooth', 'Coffee', 'Cinnamon', 'Other',
];

interface Props {
  lat: number;
  lng: number;
  onSubmit: (data: {
    store_name: string;
    price: number;
    strength: number;
    flavor: string;
    lat: number;
    lng: number;
  }) => Promise<void>;
  onClose: () => void;
}

export default function PriceForm({ lat, lng, onSubmit, onClose }: Props) {
  const [storeName, setStoreName] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [strength, setStrength] = useState<3 | 6>(6);
  const [flavor, setFlavor] = useState('Cool Mint');
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

    setSubmitting(true);
    try {
      await onSubmit({ store_name: storeName.trim(), price, strength, flavor, lat, lng });
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
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
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
                className="w-full pl-7 pr-3 py-3 text-xl font-bold border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Strength */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Nicotine strength</label>
            <div className="flex gap-2">
              {([3, 6] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStrength(s)}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition-colors ${
                    strength === s
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {s} mg
                </button>
              ))}
            </div>
          </div>

          {/* Flavor */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Flavor</label>
            <select
              value={flavor}
              onChange={e => setFlavor(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {FLAVORS.map(f => <option key={f}>{f}</option>)}
            </select>
          </div>

          {/* Store name */}
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
          </div>

          {/* Location hint */}
          <div className="text-xs text-gray-400 -mt-1">
            📍 Pinned at {lat.toFixed(4)}, {lng.toFixed(4)} — move the map before opening to change location.
          </div>

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
