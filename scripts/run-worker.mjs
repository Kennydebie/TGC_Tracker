import { runConfiguredScan } from '../lib/services/scanning.ts';

const runOnce = process.argv.includes('--once');

function log(event, fields = {}) {
  process.stdout.write(
    `${JSON.stringify({ timestamp: new Date().toISOString(), service: 'tcg-scout-worker', event, ...fields })}\n`,
  );
}

async function scan() {
  log('scan.started');
  try {
    const summary = await runConfiguredScan();
    for (const connector of summary.connectors) {
      log('scan.source_finished', {
        jobId: summary.jobId,
        source: connector.source,
        fetched: connector.fetched,
        normalised: connector.normalised,
        matched: connector.matched,
        rejected: connector.rejected,
        alerted: connector.alerted,
        errors: connector.errors,
      });
    }
    log('scan.finished', {
      jobId: summary.jobId,
      durationMs: summary.durationMs,
      outcome: summary.connectors.some((item) => item.errors.length)
        ? 'partial'
        : 'success',
      ...summary.totals,
      ebayCredentials: summary.credentials.ebay,
      queries: summary.queries,
    });
  } catch (error) {
    log('scan.failed', {
      outcome: 'failed',
      error: error instanceof Error ? error.message : 'Unknown scan failure',
    });
    if (runOnce) process.exitCode = 1;
  }
}

await scan();
if (!runOnce) setInterval(() => void scan(), 60_000);
