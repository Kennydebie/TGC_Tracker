import { getD1 } from '@/db';
import { env } from 'cloudflare:workers';
import { getConnector, hasEbayCredentials } from '@/lib/connectors/registry';
import { persistScanSummary } from '@/lib/repositories/scans';
import { rejectCrossSiteMutation } from '@/lib/security';
import {
  configuredWatchQueries,
  runConfiguredScan,
} from '@/lib/services/scanning';

export async function POST(request: Request) {
  const blocked = rejectCrossSiteMutation(request);
  if (blocked) return blocked;
  let queries = configuredWatchQueries();
  try {
    const body = (await request.json()) as {
      query?: string;
      queries?: string[];
      source?: string;
    };
    if (body.query) queries = [body.query.slice(0, 120)];
    if (body.queries?.length)
      queries = body.queries.map((query) => query.slice(0, 120)).slice(0, 20);
    if (body.source) {
      if (body.source !== 'all' && body.source !== 'ebay')
        return Response.json(
          { error: 'Only production eBay scans are supported.' },
          { status: 400 },
        );
    }
  } catch {
    /* configured watch queries */
  }
  if (!hasEbayCredentials())
    return Response.json(
      {
        error: 'Credentials Required',
        status: 'credentials_required',
        requirement: 'EBAY_CLIENT_ID and EBAY_CLIENT_SECRET',
      },
      { status: 424 },
    );
  const selectedConnector = getConnector('ebay');
  if (!selectedConnector)
    return Response.json({ error: 'Source is unavailable' }, { status: 424 });
  const summary = await runConfiguredScan(queries, [selectedConnector]);
  await persistScanSummary(getD1(), summary, {
    ebaySuppressionHmacSecret:
      env.EBAY_MARKETPLACE_DELETION_HMAC_SECRET?.trim(),
  });
  return Response.json(
    {
      data: {
        ...summary,
        connectors: summary.connectors.map(
          ({ records: _records, ...item }) => item,
        ),
      },
    },
    { status: 202 },
  );
}
