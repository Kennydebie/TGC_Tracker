import { ScoutPage } from '@/app/scout-page';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function SectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ section }, rawSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const sections = new Set([
    'deals',
    'marktplaats',
    'amazon',
    'community',
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
  const initialSearchParams = Object.fromEntries(
    Object.entries(rawSearchParams).flatMap(([key, value]) => {
      const first = Array.isArray(value) ? value[0] : value;
      return first ? [[key, first]] : [];
    }),
  );
  return (
    <ScoutPage section={section} initialSearchParams={initialSearchParams} />
  );
}
