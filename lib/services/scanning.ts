import {
  getEnabledConnectors,
  hasEbayCredentials,
} from '../connectors/registry.ts';
import type {
  NormalisedOffer,
  RawSourceRecord,
  SourceConnector,
} from '../connectors/types.ts';
import { calculateEconomics } from '../domain.ts';
import { detectMisleadingTitle } from '../normalisation.ts';
import {
  PRODUCT_IDENTITIES,
  type ProductIdentity,
} from '../product-identities.ts';

export type MatchedOffer = {
  raw: RawSourceRecord;
  offer: NormalisedOffer;
  productIdentityId: string | null;
  matchConfidence: number;
  rejectedReason: string | null;
  alerted: boolean;
};

export type ConnectorScanSummary = {
  source: string;
  fetched: number;
  normalised: number;
  matched: number;
  rejected: number;
  alerted: number;
  errors: string[];
  records: MatchedOffer[];
};

export type ScanSummary = {
  jobId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  credentials: { ebay: 'configured' | 'required' };
  queries: string[];
  totals: {
    fetched: number;
    normalised: number;
    matched: number;
    rejected: number;
    alerted: number;
  };
  connectors: ConnectorScanSummary[];
};

const TOKENS_TO_IGNORE = new Set([
  'the',
  'and',
  'sealed',
  'new',
  'box',
  'display',
  'pokemon',
  'pokémon',
]);

function tokens(value: string) {
  return new Set(
    value
      .toLowerCase()
      .normalize('NFKD')
      .replaceAll(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((token) => token.length > 2 && !TOKENS_TO_IGNORE.has(token)),
  );
}

export function matchNormalisedOffer(offer: NormalisedOffer) {
  const offerTokens = tokens(offer.title);
  let best: { productIdentityId: string; confidence: number } | null = null;
  for (const identity of PRODUCT_IDENTITIES) {
    if (!identity.requiredTokens.every((token) => offerTokens.has(token)))
      continue;
    const confidence = productIdentityLabels(identity).reduce(
      (highest, label) => {
        const identityTokens = tokens(label);
        const matches = [...identityTokens].filter((token) =>
          offerTokens.has(token),
        ).length;
        if (matches < 2) return highest;
        const denominator = Math.max(
          1,
          Math.min(offerTokens.size, identityTokens.size),
        );
        return Math.max(highest, Math.round((matches / denominator) * 100));
      },
      0,
    );
    if (!best || confidence > best.confidence)
      best = { productIdentityId: identity.id, confidence };
  }
  return best && best.confidence >= 35 ? best : null;
}

function productIdentityLabels(identity: ProductIdentity) {
  return [
    `${identity.canonicalName} ${identity.setName} ${identity.productType}`,
    ...identity.aliases,
  ];
}

export function conservativeEconomicsForOffer(offer: NormalisedOffer) {
  return calculateEconomics({
    itemPrice: offer.itemPrice,
    inboundShipping: offer.shipping ?? 0,
    buyerFees: 0,
    paymentFees: 0,
    importCosts: 0,
    travelCost: 0,
    acquisitionLabor: 0,
    expectedSalePrice: 0,
    sellerFees: 0,
    exitPaymentFees: 0,
    outboundShipping: 0,
    packaging: 0,
    expectedReturnLoss: 0,
    sellingLabor: 0,
    liquidityHaircut: 0,
    estimatedHours: 1,
    expectedHoldingDays: 90,
    requiredProfit: 25,
  });
}

export function configuredWatchQueries() {
  return (
    process.env.TCG_WATCH_QUERIES ??
    'pokemon,prismatic evolutions,riftbound origins'
  )
    .split(',')
    .map((query) => query.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export async function runConfiguredScan(
  queries = configuredWatchQueries(),
  connectors: SourceConnector[] = getEnabledConnectors(),
): Promise<ScanSummary> {
  const started = Date.now();
  const connectorSummaries = await Promise.all(
    connectors.map(async (connector): Promise<ConnectorScanSummary> => {
      const errors: string[] = [];
      const rawById = new Map<string, RawSourceRecord>();
      for (const query of queries) {
        try {
          const records = await connector.scan({ query, limit: 50 });
          for (const record of records)
            rawById.set(`${record.sourceId}:${record.externalId}`, record);
        } catch (error) {
          errors.push(
            error instanceof Error ? error.message : 'Unknown scan error',
          );
        }
      }
      const matchedRecords: MatchedOffer[] = [];
      let normalised = 0;
      for (const raw of rawById.values()) {
        try {
          const offers = await connector.normalise(raw);
          normalised += offers.length;
          for (const offer of offers) {
            const match = matchNormalisedOffer(offer);
            const misleading = detectMisleadingTitle(offer.title);
            const rejectedReason = !match
              ? 'no_canonical_match'
              : misleading.includes('empty_packaging') &&
                  !offer.condition?.toLowerCase().includes('empty')
                ? 'packaging_ambiguity'
                : null;
            matchedRecords.push({
              raw,
              offer,
              productIdentityId: match?.productIdentityId ?? null,
              matchConfidence: match?.confidence ?? 0,
              rejectedReason,
              alerted: false,
            });
          }
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
        fetched: rawById.size,
        normalised,
        matched: matchedRecords.filter(
          (record) => record.productIdentityId && !record.rejectedReason,
        ).length,
        rejected: matchedRecords.filter((record) => record.rejectedReason)
          .length,
        alerted: matchedRecords.filter((record) => record.alerted).length,
        errors,
        records: matchedRecords,
      };
    }),
  );
  const finished = Date.now();
  const totals = connectorSummaries.reduce(
    (sum, connector) => ({
      fetched: sum.fetched + connector.fetched,
      normalised: sum.normalised + connector.normalised,
      matched: sum.matched + connector.matched,
      rejected: sum.rejected + connector.rejected,
      alerted: sum.alerted + connector.alerted,
    }),
    { fetched: 0, normalised: 0, matched: 0, rejected: 0, alerted: 0 },
  );
  return {
    jobId: crypto.randomUUID(),
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date(finished).toISOString(),
    durationMs: finished - started,
    credentials: { ebay: hasEbayCredentials() ? 'configured' : 'required' },
    queries,
    totals,
    connectors: connectorSummaries,
  };
}
