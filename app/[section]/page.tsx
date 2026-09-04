import { ScoutPage } from '@/app/scout-page';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const sections = new Set([
    'deals',
    'lot-lab',
    'market',
    'releases',
    'scanner',
    'watchlist',
    'shadow',
    'portfolio',
    'alerts',
    'sources',
    'review',
    'settings',
  ]);
  if (!sections.has(section)) notFound();
  return <ScoutPage section={section} />;
}
