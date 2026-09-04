import { getEnabledConnectors } from '../connectors/registry.ts';

export type ScanSummary = {
  jobId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  connectors: {
    source: string;
    fetched: number;
    normalised: number;
    errors: string[];
  }[];
};

export async function runFixtureScan(query = 'pokemon'): Promise<ScanSummary> {
  const started = Date.now();
  const connectors = await Promise.all(
    getEnabledConnectors().map(async (connector) => {
      const errors: string[] = [];
      const raw = await connector.scan({ query, limit: 50 });
      const offers = [];
      for (const record of raw) {
        try {
          offers.push(...(await connector.normalise(record)));
        } catch (error) {
          errors.push(
            error instanceof Error
              ? error.message
              : 'Unknown normalisation error',
          );
        }
      }
      return {
        source: connector.id,
        fetched: raw.length,
        normalised: offers.length,
        errors,
      };
    }),
  );
  const finished = Date.now();
  return {
    jobId: crypto.randomUUID(),
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date(finished).toISOString(),
    durationMs: finished - started,
    connectors,
  };
}
