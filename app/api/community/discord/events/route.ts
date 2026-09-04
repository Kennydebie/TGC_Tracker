import { env } from 'cloudflare:workers';

import { getD1 } from '@/db';
import { processDiscordCommunityMessage } from '@/lib/services/community-radar';

async function sameSecret(received: string, expected: string) {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(received)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < leftBytes.length; index += 1)
    difference |= leftBytes[index] ^ (rightBytes[index] ?? 0);
  return difference === 0;
}

export async function POST(request: Request) {
  const expected = env.COMMUNITY_INGEST_SECRET?.trim();
  if (!expected)
    return Response.json(
      { error: 'Discord ingestion is not configured.' },
      { status: 503 },
    );
  const authorization = request.headers.get('authorization') ?? '';
  const received = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : '';
  if (!received || !(await sameSecret(received, expected)))
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  if (Number(request.headers.get('content-length') ?? 0) > 32_768)
    return Response.json({ error: 'Payload too large.' }, { status: 413 });
  const message = (await request.json()) as Record<string, unknown>;
  const result = await processDiscordCommunityMessage({
    db: getD1(),
    env,
    message,
  });
  return Response.json(result, { status: result.accepted ? 202 : 200 });
}
