import { reviewItems } from '@/lib/fixtures';
import { rejectCrossSiteMutation } from '@/lib/security';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = rejectCrossSiteMutation(request);
  if (blocked) return blocked;
  const { id } = await params;
  if (!reviewItems.some((item) => item.id === id))
    return Response.json({ error: 'Review item not found' }, { status: 404 });
  let body: { resolution?: string } = {};
  try {
    body = (await request.json()) as { resolution?: string };
  } catch {
    return Response.json({ error: 'JSON body required' }, { status: 400 });
  }
  if (!body.resolution || body.resolution.trim().length < 3)
    return Response.json({ error: 'Resolution is required' }, { status: 400 });
  return Response.json({
    mode: 'demo',
    id,
    status: 'resolved',
    resolution: body.resolution.trim().slice(0, 500),
    auditId: crypto.randomUUID(),
    resolvedAt: new Date().toISOString(),
  });
}
