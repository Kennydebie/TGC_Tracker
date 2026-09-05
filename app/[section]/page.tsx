import { ScoutPage } from '@/app/scout-page';
import { notFound, redirect } from 'next/navigation';

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
  const legacyMarketplaceSources: Record<string, string> = {
    amazon: 'amazon',
    marktplaats: 'marktplaats',
    sources: 'connections',
  };
  const legacySource = legacyMarketplaceSources[section];
  if (legacySource) {
    const targetSearchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(rawSearchParams)) {
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item !== undefined) targetSearchParams.append(key, item);
      }
    }
    targetSearchParams.set('source', legacySource);
    redirect(`/marketplaces?${targetSearchParams.toString()}`);
  }
  const sections = new Set([
    'deals',
    'marketplaces',
    'community',
    'lot-lab',
    'market',
    'releases',
    'scanner',
    'watchlist',
    'shadow',
    'portfolio',
    'alerts',
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
