import { MarktplaatsPublicConnector } from '../connectors/marktplaats-public.ts';
import {
  configuredMarktplaatsQueries,
  deduplicateMarktplaatsListings,
  MARKTPLAATS_BLOCK_PAUSE_HOURS,
  MARKTPLAATS_MAX_RESULTS_PER_QUERY,
  MarktplaatsAccessError,
  type MarktplaatsParsedListing,
  type MarktplaatsSourceState,
} from '../marktplaats.ts';
import {
  acquireMarktplaatsLock,
  persistMarktplaatsRun,
  readMarktplaatsPause,
  readMarktplaatsRegionalSettings,
  releaseMarktplaatsLock,
} from '../repositories/marktplaats.ts';

export type MarktplaatsScoutOptions = {
  db: D1Database;
  connector?: MarktplaatsPublicConnector;
  queries?: string[];
  now?: () => number;
};

export async function runMarktplaatsScout(options: MarktplaatsScoutOptions) {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const jobId = `marktplaats:${crypto.randomUUID()}`;
  const acquired = await acquireMarktplaatsLock(options.db, jobId, startedAt);
  if (!acquired)
    return {
      jobId,
      status: 'skipped_locked' as const,
      reason: 'Another Marktplaats scan is already active.',
    };
  try {
    const pause = await readMarktplaatsPause(options.db, startedAt);
    if (pause)
      return {
        jobId,
        status: 'skipped_paused' as const,
        reason: pause.reason,
        automaticRetryAt: pause.automatic_retry_at,
      };
    const queries = (
      options.queries ??
      configuredMarktplaatsQueries(process.env.MARKTPLAATS_SEARCH_QUERIES)
    ).slice(0, 20);
    const regionalSettings = await readMarktplaatsRegionalSettings(options.db);
    const connector =
      options.connector ?? new MarktplaatsPublicConnector(regionalSettings);
    const parsed: MarktplaatsParsedListing[] = [];
    const errors: string[] = [];
    let pagesFetched = 0;
    let status: MarktplaatsSourceState = 'healthy';
    let reason: string | null = null;
    let blockedCode: string | null = null;
    let automaticRetryAt: number | null = null;
    for (const query of queries) {
      try {
        const records = await connector.scan({
          query,
          limit: MARKTPLAATS_MAX_RESULTS_PER_QUERY,
        });
        pagesFetched += 1;
        for (const record of records)
          parsed.push(record.payload as MarktplaatsParsedListing);
      } catch (error) {
        errors.push(
          error instanceof Error ? error.message : 'Unknown scan error',
        );
        if (error instanceof MarktplaatsAccessError) {
          status =
            error.code === 'empty_anomaly'
              ? 'parser_review_required'
              : 'blocked';
          reason = error.message;
          blockedCode = error.code;
          automaticRetryAt =
            startedAt + MARKTPLAATS_BLOCK_PAUSE_HOURS * 60 * 60_000;
          break;
        }
      }
    }
    const listings = deduplicateMarktplaatsListings(parsed);
    const parserConfidence = pagesFetched
      ? Math.min(1, listings.length / Math.max(1, pagesFetched * 5))
      : null;
    if (status === 'healthy' && pagesFetched >= 3 && listings.length === 0) {
      status = 'parser_review_required';
      reason =
        'Normally active public searches returned no parseable listings. Alerts are paused pending parser review.';
      blockedCode = 'empty_anomaly';
      automaticRetryAt =
        startedAt + MARKTPLAATS_BLOCK_PAUSE_HOURS * 60 * 60_000;
    }
    const finishedAt = now();
    const metrics = await persistMarktplaatsRun(options.db, {
      jobId,
      startedAt,
      finishedAt,
      status,
      reason,
      blockedCode,
      automaticRetryAt,
      queries: queries.slice(0, pagesFetched + (blockedCode ? 1 : 0)),
      pagesFetched,
      parsedBeforeDedupe: parsed.length,
      listings,
      parserConfidence,
      errors,
      ...regionalSettings,
    });
    return {
      jobId,
      status,
      reason,
      pagesFetched,
      listingsParsed: listings.length,
      parserConfidence,
      ...metrics,
      errors,
    };
  } finally {
    await releaseMarktplaatsLock(options.db, jobId);
  }
}
