'use client';

interface Props {
  onClose: () => void;
}

export default function AboutModal({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <span className="text-white font-black text-lg">Z</span>
            </div>
            <div>
              <h2 className="text-white font-black text-xl tracking-tight">Zyndex</h2>
              <p className="text-blue-200 text-xs">Crowdsourced Zyn Price Index</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 text-sm text-gray-700">
          <p>
            Zyn prices vary wildly — sometimes by <span className="font-semibold">$2–3 per can</span> between stores
            a few miles apart. Zyndex is a community-built map that makes those gaps visible.
          </p>

          <div className="space-y-3">
            <div className="flex gap-3">
              <span className="text-lg shrink-0">📍</span>
              <div>
                <p className="font-semibold text-gray-900">Spot a price? Report it.</p>
                <p className="text-gray-500">Tap any store marker or the + button to log what you paid. Takes 5 seconds.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-lg shrink-0">🔄</span>
              <div>
                <p className="font-semibold text-gray-900">Prices are crowdsourced and decay over time.</p>
                <p className="text-gray-500">Reports age out after 30 days. Confirming a price keeps it fresh for everyone.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-lg shrink-0">🗺️</span>
              <div>
                <p className="font-semibold text-gray-900">Store locations come from OpenStreetMap.</p>
                <p className="text-gray-500">Missing a store? Use the freeform pin — it'll appear as "Unverified" until confirmed by the community.</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-500 border border-gray-100">
            No accounts, no tracking, no ads. Just prices.
          </div>
        </div>

        <div className="px-6 pb-5">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 text-sm"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
