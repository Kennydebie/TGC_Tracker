import type { SourceStatus } from './domain.ts';

/**
 * Production connector catalogue. Counts and timestamps are populated by live
 * APIs elsewhere; these rows only describe supported connection types.
 */
export const sources: SourceStatus[] = [
  {
    id: 'ebay',
    name: 'eBay Browse',
    mode: 'Live',
    health: 'Credentials required',
    lastScan: 'Not reported',
    nextScan: 'After setup',
    records: 0,
    access: 'Official API',
    note: 'Active asks only; completed-sale evidence remains separate.',
  },
  {
    id: 'marktplaats',
    name: 'Marktplaats Public Monitor',
    mode: 'Live',
    health: 'Delayed',
    lastScan: 'Not reported',
    nextScan: 'Every 15 minutes when enabled',
    records: 0,
    access: 'Public search pages',
    note: 'Stops on CAPTCHA, HTTP 403 or HTTP 429; no anti-bot bypass.',
  },
  {
    id: 'cardmarket',
    name: 'Cardmarket Public Data',
    mode: 'Disabled',
    health: 'Credentials required',
    lastScan: 'Never',
    nextScan: 'After setup',
    records: 0,
    access: 'Public catalogue and price guide',
    note: 'Daily reference data, not live restock data.',
  },
  {
    id: 'retailers',
    name: 'Retailer Watch',
    mode: 'Disabled',
    health: 'Credentials required',
    lastScan: 'Never',
    nextScan: 'After an authorized adapter is configured',
    records: 0,
    access: 'Allowlisted adapters only',
    note: 'No scraping fallback is enabled.',
  },
];
