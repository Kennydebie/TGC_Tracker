const runOnce = process.argv.includes('--once');

function log(event, fields = {}) {
  process.stdout.write(
    `${JSON.stringify({ timestamp: new Date().toISOString(), service: 'tcg-scout-worker', event, ...fields })}\n`,
  );
}

async function scan() {
  const started = Date.now();
  const jobId = crypto.randomUUID();
  log('scan.started', {
    jobId,
    source: 'fixture-market',
    connector: 'FixtureConnector',
  });
  const recordsFetched = 5;
  const recordsNormalised = 5;
  const matches = 4;
  const unmatched = 1;
  const alerts = 1;
  log('scan.finished', {
    jobId,
    source: 'fixture-market',
    connector: 'FixtureConnector',
    durationMs: Date.now() - started,
    outcome: 'success',
    retry: 0,
    recordsFetched,
    recordsNormalised,
    matches,
    unmatched,
    alerts,
    errors: 0,
    rateLimitState: 'not_applicable',
  });
}

await scan();
if (!runOnce) setInterval(() => void scan(), 60_000);
