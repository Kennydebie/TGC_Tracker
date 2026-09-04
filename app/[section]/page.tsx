import { ScoutPage } from '@/app/scout-page';

export const dynamic = 'force-dynamic';

export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  return <ScoutPage section={section} />;
}
