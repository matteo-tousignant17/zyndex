/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Next.js requires unsafe-inline for its runtime scripts
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              // Leaflet injects inline styles
              "style-src 'self' 'unsafe-inline'",
              // Map tiles + marker icons
              "img-src 'self' data: https://*.tile.openstreetmap.org",
              // Our own API + Overpass (stores) + Nominatim (reverse geocode)
              "connect-src 'self' https://overpass-api.de https://nominatim.openstreetmap.org",
              "font-src 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
