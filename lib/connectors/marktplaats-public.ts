import {
  buildMarktplaatsSearchUrl,
  detectMarktplaatsBlock,
  MARKTPLAATS_ACCESS_MODE,
  MARKTPLAATS_MAX_RESULTS_PER_QUERY,
  MARKTPLAATS_SOURCE_ID,
  MarktplaatsAccessError,
  parseMarktplaatsSearchHtml,
  type MarktplaatsParsedListing,
} from '../marktplaats.ts';
import type {
  HealthResult,
  NormalisedOffer,
  RawSourceRecord,
  ScanInput,
  SourceCapability,
  SourceConnector,
  SourcePolicy,
  ValidationResult,
} from './types.ts';

type FetchLike = typeof fetch;

type CacheEntry = {
  etag: string | null;
  lastModified: string | null;
  html: string;
  finalUrl: string;
};

export type MarktplaatsPublicConnectorOptions = {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  minimumPrice?: number;
  maximumPrice?: number;
  postcode?: string;
  distanceKm?: number;
};

export class MarktplaatsPublicConnector implements SourceConnector {
  readonly id = MARKTPLAATS_SOURCE_ID;
  readonly name = 'Marktplaats Public Monitor';
  readonly capabilities: SourceCapability[] = [
    'listing_search',
    'price_history',
  ];
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly filters: Omit<
    MarktplaatsPublicConnectorOptions,
    'fetchImpl' | 'timeoutMs'
  >;

  constructor(options: MarktplaatsPublicConnectorOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = Math.max(3_000, options.timeoutMs ?? 15_000);
    this.filters = {
      minimumPrice: options.minimumPrice,
      maximumPrice: options.maximumPrice,
      postcode: options.postcode,
      distanceKm: options.distanceKm,
    };
  }

  async validateConfig(): Promise<ValidationResult> {
    return { valid: true, errors: [] };
  }

  async healthCheck(): Promise<HealthResult> {
    return {
      ok: true,
      status: MARKTPLAATS_ACCESS_MODE,
      checkedAt: new Date().toISOString(),
      detail:
        'Credentials are not required. The next scheduled public search is the operational health check.',
    };
  }

  async scan(input: ScanInput): Promise<RawSourceRecord[]> {
    const url = buildMarktplaatsSearchUrl({
      query: input.query,
      ...this.filters,
    });
    const cached = this.cache.get(url.href);
    const headers = new Headers({
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'nl-NL,nl;q=0.9,en;q=0.7',
      'user-agent': 'TCG-Scout-Personal-Public-Monitor/1.0',
    });
    if (cached?.etag) headers.set('if-none-match', cached.etag);
    if (cached?.lastModified)
      headers.set('if-modified-since', cached.lastModified);

    let response: Response | null = null;
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await this.fetchImpl(url, {
          method: 'GET',
          headers,
          redirect: 'follow',
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (response.status === 403 || response.status === 429) break;
        if (response.status < 500) break;
        lastError = new Error(`Marktplaats returned HTTP ${response.status}.`);
      } catch (error) {
        lastError = error;
      }
      if (attempt < 2)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(2_000, 500 * 2 ** attempt)),
        );
    }
    if (!response)
      throw lastError instanceof Error
        ? lastError
        : new Error('Marktplaats public search request failed.');

    if (response.status === 304 && cached)
      return this.recordsFromListings(
        parseMarktplaatsSearchHtml(
          cached.html,
          input.query,
          Math.min(input.limit, MARKTPLAATS_MAX_RESULTS_PER_QUERY),
        ),
      );

    const html = await response.text();
    const blocked = detectMarktplaatsBlock(
      response.status,
      html,
      response.url || url.href,
    );
    if (blocked) throw blocked;
    if (!response.ok)
      throw new Error(`Marktplaats returned HTTP ${response.status}.`);
    const listings = parseMarktplaatsSearchHtml(
      html,
      input.query,
      Math.min(input.limit, MARKTPLAATS_MAX_RESULTS_PER_QUERY),
    );
    if (
      listings.length === 0 &&
      /hz-Listing|ListingTitle_|resultaten\s+voor/i.test(html)
    )
      throw new MarktplaatsAccessError(
        'empty_anomaly',
        'The public page contained result markers but the parser extracted no listings.',
        response.status,
      );
    this.cache.set(url.href, {
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
      html,
      finalUrl: response.url || url.href,
    });
    return this.recordsFromListings(listings);
  }

  private recordsFromListings(listings: MarktplaatsParsedListing[]) {
    const capturedAt = new Date().toISOString();
    return listings.map(
      (listing): RawSourceRecord => ({
        sourceId: this.id,
        externalId: listing.sourceListingId,
        capturedAt,
        payload: listing,
      }),
    );
  }

  async normalise(record: RawSourceRecord): Promise<NormalisedOffer[]> {
    const listing = record.payload as MarktplaatsParsedListing;
    return [
      {
        sourceId: this.id,
        externalId: listing.sourceListingId,
        sourceListingId: listing.sourceListingId,
        sourceMarketplace: 'marktplaats',
        title: listing.title,
        url: listing.sourceListingUrl,
        sourceListingUrl: listing.sourceListingUrl,
        detectedAt: record.capturedAt,
        lastVerifiedAt: record.capturedAt,
        availabilityStatus: 'available',
        itemPrice: listing.price ?? 0,
        shipping: null,
        currency: 'EUR',
        quantity: null,
        condition: null,
        language: null,
        seller: listing.seller,
        available: true,
        location: listing.location,
        snippet: listing.snippet,
        thumbnailUrl: listing.thumbnailUrl,
        listingTimestampText: listing.listingTimestampText,
        delivery: listing.delivery,
        foundByQueries: listing.foundByQueries,
      },
    ];
  }

  getPolicy(): SourcePolicy {
    return {
      access: 'public_page',
      respectsRobots: true,
      permitsAutomatedFetch: true,
      checkoutAllowed: false,
      notes:
        'Sequential public search-page requests only. Stops on CAPTCHA, challenge, HTTP 403 or HTTP 429 and never attempts bypasses.',
    };
  }
}
