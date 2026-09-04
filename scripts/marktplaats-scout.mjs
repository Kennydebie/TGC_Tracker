import { MarktplaatsPublicConnector } from '../lib/connectors/marktplaats-public.ts';
import {
  configuredMarktplaatsQueries,
  deduplicateMarktplaatsListings,
} from '../lib/marktplaats.ts';

const requestedQuery = process.argv.find((value) =>
  value.startsWith('--query='),
);
const queries = requestedQuery
  ? [requestedQuery.slice('--query='.length)]
  : configuredMarktplaatsQueries(process.env.MARKTPLAATS_SEARCH_QUERIES);
const connector = new MarktplaatsPublicConnector();
const listings = [];
let pagesFetched = 0;
for (const query of queries) {
  const records = await connector.scan({ query, limit: 50 });
  pagesFetched += 1;
  listings.push(...records.map((record) => record.payload));
}
const deduplicated = deduplicateMarktplaatsListings(listings);
process.stdout.write(
  `${JSON.stringify({
    source: 'marktplaats-public',
    accessMode: 'public_monitor',
    pagesFetched,
    parsedBeforeDedupe: listings.length,
    listingsParsed: deduplicated.length,
    duplicates: listings.length - deduplicated.length,
    blocked: false,
  })}\n`,
);
