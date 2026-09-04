import { ScoutPage } from '@/app/scout-page';

export const dynamic = 'force-dynamic';

export default async function DealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ScoutPage section="deals" dealId={id} />;
}
