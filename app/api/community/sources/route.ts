import { getD1 } from '@/db';
import {
  listCommunityDashboard,
  saveCommunitySource,
} from '@/lib/repositories/community';
import { authenticationRequired, getRequestUser } from '@/lib/server/user';

const GAME_ALLOWLIST = new Set(['Pokémon', 'Riftbound']);
const CATEGORY_ALLOWLIST = new Set([
  'Deals',
  'Restocks',
  'Prices',
  'Reprints',
  'Releases',
  'Competitive',
  'Scams',
  'General',
]);

export async function GET() {
  const dashboard = await listCommunityDashboard(getD1(), {
    redditCredentialsAvailable: false,
    discordCredentialsAvailable: false,
  });
  return Response.json({ data: dashboard.sources });
}

export async function POST(request: Request) {
  const user = getRequestUser(request);
  if (!user) return authenticationRequired();
  if (Number(request.headers.get('content-length') ?? 0) > 16_384)
    return Response.json({ error: 'Request too large.' }, { status: 413 });
  const body = (await request.json()) as {
    platform?: string;
    name?: string;
    externalCommunityId?: string;
    externalChannelId?: string | null;
    enabled?: boolean;
    games?: string[];
    categories?: string[];
  };
  if (!['reddit', 'discord'].includes(body.platform ?? ''))
    return Response.json(
      { error: 'Platform must be Reddit or Discord.' },
      { status: 400 },
    );
  const name = body.name?.trim();
  const communityId = body.externalCommunityId?.trim();
  if (!name || name.length > 200 || !communityId || communityId.length > 200)
    return Response.json(
      { error: 'A valid source name and community ID are required.' },
      { status: 400 },
    );
  if (body.platform === 'discord' && !/^\d{5,30}$/.test(communityId))
    return Response.json(
      { error: 'Discord guild ID is invalid.' },
      { status: 400 },
    );
  if (
    body.platform === 'discord' &&
    (!body.externalChannelId || !/^\d{5,30}$/.test(body.externalChannelId))
  )
    return Response.json(
      { error: 'An allowlisted Discord channel ID is required.' },
      { status: 400 },
    );
  if (
    body.platform === 'reddit' &&
    !/^[A-Za-z0-9_]{2,50}$/.test(communityId.replace(/^r\//i, ''))
  )
    return Response.json(
      { error: 'Reddit community name is invalid.' },
      { status: 400 },
    );
  const games = (body.games ?? []).filter((game) => GAME_ALLOWLIST.has(game));
  const categories = (body.categories ?? []).filter((category) =>
    CATEGORY_ALLOWLIST.has(category),
  );
  const result = await saveCommunitySource(getD1(), user, {
    platform: body.platform as 'reddit' | 'discord',
    name,
    externalCommunityId:
      body.platform === 'reddit'
        ? communityId.replace(/^r\//i, '')
        : communityId,
    externalChannelId: body.externalChannelId?.trim() ?? null,
    enabled: Boolean(body.enabled),
    games,
    categories,
  });
  return Response.json(result, { status: 201 });
}
