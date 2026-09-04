import { getD1 } from '@/db';
import { saveAmazonWatchRule } from '@/lib/repositories/amazon';
import { rejectCrossSiteMutation } from '@/lib/security';
import { authenticationRequired, getRequestUser } from '@/lib/server/user';

export async function POST(request: Request) {
  const blocked = rejectCrossSiteMutation(request);
  if (blocked) return blocked;
  const user = getRequestUser(request);
  if (!user) return authenticationRequired();
  const body = (await request.json().catch(() => null)) as {
    url?: string;
    ruleType?: string;
    threshold?: number | null;
  } | null;
  if (!body?.url || body.url.length > 2_000)
    return Response.json(
      { error: 'A valid Amazon product URL is required.' },
      { status: 400 },
    );
  try {
    const data = await saveAmazonWatchRule(getD1(), user, {
      url: body.url,
      ruleType: body.ruleType?.slice(0, 40),
      threshold: Number.isFinite(body.threshold)
        ? Number(body.threshold)
        : null,
    });
    return Response.json(
      {
        data,
        message:
          'ASIN saved. TCG Scout did not fetch Amazon HTML; Keepa monitoring starts when supported credentials are connected.',
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Watch rule could not be saved.',
      },
      { status: 400 },
    );
  }
}
