import { getD1 } from '@/db';
import { authenticateScoutIntegration } from '@/lib/repositories/scout-integration';
import { getScoutIngestionState } from '@/lib/repositories/scout-ingestion';
import {
  scoutIntegrationAuthResponse,
  scoutIntegrationJsonResponse,
  ScoutIntegrationAuthenticationError,
} from '@/lib/scout-integration';

export const dynamic = 'force-dynamic';

function boundedInteger(
  url: URL,
  name: string,
  maximum: number,
): number | undefined {
  const values = url.searchParams.getAll(name);
  if (values.length > 1) throw new RangeError(name);
  const value = values[0];
  if (value === undefined) return undefined;
  if (!/^[1-9][0-9]*$/.test(value)) throw new RangeError(name);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum)
    throw new RangeError(name);
  return parsed;
}

export async function GET(request: Request) {
  try {
    const db = getD1();
    const { user } = await authenticateScoutIntegration(
      db,
      request,
      'scout:read',
    );
    const url = new URL(request.url);
    const data = await getScoutIngestionState(db, user, {
      recentRunLimit: boundedInteger(url, 'recentRunLimit', 20),
      recentFindingLimit: boundedInteger(url, 'recentFindingLimit', 100),
    });
    return scoutIntegrationJsonResponse({ data });
  } catch (error) {
    if (error instanceof ScoutIntegrationAuthenticationError)
      return scoutIntegrationAuthResponse(error);
    if (error instanceof RangeError)
      return scoutIntegrationJsonResponse(
        { error: `Invalid ${error.message}.` },
        { status: 400 },
      );
    return scoutIntegrationJsonResponse(
      { error: 'TCG Scout could not read ingestion state.' },
      { status: 500 },
    );
  }
}
