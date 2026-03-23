import dynamic from 'next/dynamic';

const MapPage = dynamic(() => import('@/components/MapPage'), { ssr: false });

export default function Home() {
  return <MapPage />;
}
