import { getD1 } from '@/db';
import {
  listCommunityDashboard,
  saveCommunityWatchRule,
} from '@/lib/repositories/community';
import { authenticationRequired, getRequestUser } from '@/lib/server/user';

export async function POST(request: Request) {
  const user = getRequestUser(request);
  if (!user) return authenticationRequired();
  const body = (await request.json()) as {
    eventId?: string;
    minimumMomentum?: number;
    minimumDiscordMentions?: number;
    minimumRedditMentions?: number;
    minimumDivergence?: number;
    maximumHypeRisk?: number;
    minimumRestockMentions?: number;
    minimumIndependentConfirmations?: number;
    officialCatalystRequired?: boolean;
  };
  const eventId = body.eventId?.trim().slice(0, 200);
  if (!eventId)
    return Response.json({ error: 'Event ID is required.' }, { status: 400 });
  const product = (
    await listCommunityDashboard(getD1(), {
      redditCredentialsAvailable: false,
      discordCredentialsAvailable: false,
    })
  ).products.find(
    (item) => item.id === eventId && item.dataMode === 'production',
  );
  if (!product)
    return Response.json(
      { error: 'Community event was not found.' },
      { status: 404 },
    );
  const bounded = (value: unknown, fallback: number, maximum: number) => {
    const numeric = Number(value);
    return Number.isFinite(numeric)
      ? Math.round(Math.max(0, Math.min(maximum, numeric)))
      : fallback;
  };
  const result = await saveCommunityWatchRule(getD1(), user, product, {
    minimumMomentum: bounded(body.minimumMomentum, 80, 100),
    minimumDiscordMentions: bounded(body.minimumDiscordMentions, 0, 10_000),
    minimumRedditMentions: bounded(body.minimumRedditMentions, 0, 10_000),
    minimumDivergence: bounded(body.minimumDivergence, 70, 100),
    maximumHypeRisk: bounded(body.maximumHypeRisk, 50, 100),
    minimumRestockMentions: bounded(body.minimumRestockMentions, 0, 10_000),
    minimumIndependentConfirmations: bounded(
      body.minimumIndependentConfirmations,
      2,
      1_000,
    ),
    officialCatalystRequired: Boolean(body.officialCatalystRequired),
  });
  return Response.json(result, { status: 201 });
}
