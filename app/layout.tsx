import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Zyndex — Find Zyn Prices Near You',
  description: 'Crowdsourced Zyn nicotine pouch prices across the US. Find the best price near you.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
