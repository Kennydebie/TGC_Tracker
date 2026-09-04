import { connectorRegistry } from '@/lib/connectors/registry';
import { rejectCrossSiteMutation } from '@/lib/security';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = rejectCrossSiteMutation(request);
  if (blocked) return blocked;
  const { id } = await params;
  const state = connectorRegistry.find((item) => item.id === id);
  if (!state)
    return Response.json({ error: 'Source not found' }, { status: 404 });
  if (!state.connector)
    return Response.json(
      {
        source: id,
        ok: false,
        status: state.status,
        requirement: state.requirement,
        checkedAt: new Date().toISOString(),
      },
      { status: 424 },
    );
  return Response.json({
    source: id,
    ...(await state.connector.healthCheck()),
  });
}
