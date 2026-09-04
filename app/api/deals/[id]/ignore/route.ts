import { deals } from '@/lib/fixtures';
import { rejectCrossSiteMutation } from '@/lib/security';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = rejectCrossSiteMutation(request);
  if (blocked) return blocked;
  const { id } = await params;
  if (!deals.some((item) => item.id === id))
    return Response.json({ error: 'Deal not found' }, { status: 404 });
  return Response.json({
    mode: 'demo',
    dealId: id,
    ignored: true,
    auditId: crypto.randomUUID(),
  });
}
