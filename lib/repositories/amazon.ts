import type {
  AmazonDashboard,
  AmazonMarketplaceCode,
  AmazonOpportunity,
} from '../amazon.ts';
import {
  AMAZON_DISCOVERY_INTERVAL_MINUTES,
  AMAZON_SOURCE_ID,
  AMAZON_WATCHED_INTERVAL_MINUTES,
  DEFAULT_AMAZON_MARKETS,
  KEEPA_ENABLED_EU_MARKETS,
  extractAmazonAsin,
} from '../amazon.ts';
import { amazonFixtureDashboard } from '../fixtures-amazon.ts';
import type { KeepaUsageSnapshot } from '../connectors/keepa.ts';
import type { RequestUser } from '../server/user.ts';
import { calculateEconomics } from '../domain.ts';
import { ensureUser } from './user-state.ts';

type AmazonRunRecord = {
  id: string;
  mode: 'watched' | 'discovery';
  status: string;
  startedAt: number;
  finishedAt: number;
  marketplaces: AmazonMarketplaceCode[];
  productsChecked: number;
  priceChanges: number;
  newProducts: number;
  qualified: number;
  errors: number;
  errorCode: string | null;
  reason: string | null;
  usage: KeepaUsageSnapshot;
};

const parseJson = <T>(value: unknown, fallback: T): T => {
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
};

export async function listAmazonDashboard(
  db: D1Database,
  keyAvailable: boolean,
): Promise<AmazonDashboard> {
  const [latest, latestWatched, latestDiscovery, usage, products, snapshots] =
    await Promise.all([
      db
        .prepare(
          `SELECT * FROM amazon_scan_runs ORDER BY finished_at DESC LIMIT 1`,
        )
        .first<Record<string, string | number | null>>(),
      db
        .prepare(
          `SELECT * FROM amazon_scan_runs WHERE mode = 'watched'
           ORDER BY finished_at DESC LIMIT 1`,
        )
        .first<Record<string, string | number | null>>(),
      db
        .prepare(
          `SELECT * FROM amazon_scan_runs WHERE mode = 'discovery'
           ORDER BY finished_at DESC LIMIT 1`,
        )
        .first<Record<string, string | number | null>>(),
      db
        .prepare(`SELECT * FROM keepa_usage ORDER BY captured_at DESC LIMIT 1`)
        .first<Record<string, string | number | null>>(),
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM amazon_marketplace_products
           WHERE demo_record = 0`,
        )
        .first<{ count: number }>(),
      db
        .prepare(
          `SELECT raw_json FROM amazon_snapshots
           WHERE demo_record = 0
           ORDER BY fetched_at DESC LIMIT 100`,
        )
        .all<{ raw_json: string }>(),
    ]);
  const unique = new Map<string, AmazonOpportunity>();
  for (const row of snapshots.results) {
    const value = parseJson<AmazonOpportunity | null>(row.raw_json, null);
    if (value && value.dataMode === 'production' && !unique.has(value.id))
      unique.set(value.id, value);
  }
  const fixture = amazonFixtureDashboard();
  const productionOpportunities = [...unique.values()];
  const authenticatedSuccess = latest?.status === 'connected';
  const sourceState: AmazonDashboard['sourceState'] = !keyAvailable
    ? 'key_required'
    : authenticatedSuccess
      ? 'connected'
      : latest?.status === 'invalid_key'
        ? 'invalid_key'
        : latest?.status === 'token_exhausted'
          ? 'token_limited'
          : latest?.status === 'rate_limited'
            ? 'rate_limited'
            : 'error';
  const displayed = productionOpportunities.length
    ? productionOpportunities
    : fixture.opportunities;
  const lastFinishedAt = latest ? Number(latest.finished_at) : null;
  return {
    ...fixture,
    sourceState,
    apiConnected: authenticatedSuccess,
    dataMode: productionOpportunities.length ? 'production' : 'fixture',
    keyAvailable,
    reason: !keyAvailable
      ? fixture.reason
      : authenticatedSuccess
        ? productionOpportunities.length
          ? null
          : 'Authenticated Keepa scan completed; no monitored products have a usable current offer yet. Recorded fixtures remain isolated below.'
        : latest?.reason
          ? String(latest.reason)
          : 'Keepa key is configured, but no authenticated request has succeeded yet.',
    lastScanAt: lastFinishedAt ? new Date(lastFinishedAt).toISOString() : null,
    nextWatchedScanAt: latestWatched
      ? new Date(
          Number(latestWatched.finished_at) +
            AMAZON_WATCHED_INTERVAL_MINUTES * 60_000,
        ).toISOString()
      : null,
    nextDiscoveryScanAt: latestDiscovery
      ? new Date(
          Number(latestDiscovery.finished_at) +
            AMAZON_DISCOVERY_INTERVAL_MINUTES * 60_000,
        ).toISOString()
      : null,
    tokens: {
      available:
        usage?.tokens_available === null ||
        usage?.tokens_available === undefined
          ? null
          : Number(usage.tokens_available),
      usedThisScan: Number(usage?.tokens_used ?? 0),
      refillRatePerMinute:
        usage?.refill_rate === null || usage?.refill_rate === undefined
          ? null
          : Number(usage.refill_rate),
      nextSafeScanAt: usage?.next_safe_scan_at
        ? new Date(Number(usage.next_safe_scan_at)).toISOString()
        : null,
      skipped: Number(usage?.skipped_requests ?? 0),
    },
    metrics: {
      productsMonitored: Number(products?.count ?? 0),
      productsChecked: Number(latest?.products_checked ?? 0),
      priceChanges: Number(latest?.price_changes ?? 0),
      priceDrops: productionOpportunities.filter(
        (item) => item.priceDropPercentage !== null,
      ).length,
      newProducts: Number(latest?.new_products ?? 0),
      qualified: productionOpportunities.filter((item) => item.qualified)
        .length,
      errors: Number(latest?.errors ?? 0),
    },
    opportunities: displayed,
  };
}

export async function saveAmazonWatchRule(
  db: D1Database,
  user: RequestUser,
  input: { url: string; ruleType?: string; threshold?: number | null },
) {
  const extracted = extractAmazonAsin(input.url);
  if (!extracted)
    throw new Error(
      'Use an HTTPS product URL from an allowed Amazon marketplace with a valid ASIN.',
    );
  await ensureUser(db, user);
  const now = Date.now();
  const id = `amazon-watch:${user.id}:${extracted.marketplace}:${extracted.asin}`;
  await db
    .prepare(
      `INSERT INTO amazon_watch_rules
        (id, user_id, asin, marketplace, rule_type, threshold_json,
         source_url, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         rule_type = excluded.rule_type,
         threshold_json = excluded.threshold_json,
         source_url = excluded.source_url,
         active = 1,
         updated_at = excluded.updated_at`,
    )
    .bind(
      id,
      user.id,
      extracted.asin,
      extracted.marketplace,
      input.ruleType ?? 'monitor',
      JSON.stringify({ threshold: input.threshold ?? null }),
      input.url,
      now,
      now,
    )
    .run();
  return { id, ...extracted, sourceUrl: input.url, active: true };
}

export async function listAmazonWatchRules(db: D1Database, userId: string) {
  const rows = await db
    .prepare(
      `SELECT id, asin, marketplace, rule_type, threshold_json, source_url,
              active, created_at, updated_at
       FROM amazon_watch_rules WHERE user_id = ? AND active = 1
       ORDER BY updated_at DESC`,
    )
    .bind(userId)
    .all<Record<string, string | number | null>>();
  return rows.results.map((row) => ({
    id: String(row.id),
    asin: row.asin ? String(row.asin) : null,
    marketplace: row.marketplace ? String(row.marketplace) : null,
    ruleType: String(row.rule_type),
    threshold: parseJson(row.threshold_json, {}),
    sourceUrl: row.source_url ? String(row.source_url) : null,
    active: Boolean(row.active),
    createdAt: new Date(Number(row.created_at)).toISOString(),
    updatedAt: new Date(Number(row.updated_at)).toISOString(),
  }));
}

export async function listAmazonWatchTargets(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT DISTINCT asin, marketplace FROM amazon_watch_rules
       WHERE active = 1 AND asin IS NOT NULL AND marketplace IS NOT NULL`,
    )
    .all<{ asin: string; marketplace: AmazonMarketplaceCode }>();
  return rows.results;
}

export async function persistAmazonRun(db: D1Database, run: AmazonRunRecord) {
  await db.batch([
    db
      .prepare(
        `INSERT INTO sources
          (id, name, access_type, mode, enabled, policy_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET mode = excluded.mode,
           enabled = excluded.enabled, policy_json = excluded.policy_json,
           updated_at = excluded.updated_at`,
      )
      .bind(
        AMAZON_SOURCE_ID,
        'Keepa / Amazon Scout',
        'official_api',
        run.status === 'connected' ? 'Live' : 'Disabled',
        JSON.stringify({
          checkoutAllowed: false,
          htmlScrapingFallback: false,
          supportedKeepaMarkets: KEEPA_ENABLED_EU_MARKETS,
          configuredMarkets: DEFAULT_AMAZON_MARKETS,
        }),
        run.startedAt,
        run.finishedAt,
      ),
    db
      .prepare(
        `INSERT INTO amazon_scan_runs
          (id, mode, status, started_at, finished_at, marketplaces_json,
           products_checked, price_changes, new_products, qualified, errors,
           error_code, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        run.id,
        run.mode,
        run.status,
        run.startedAt,
        run.finishedAt,
        JSON.stringify(run.marketplaces),
        run.productsChecked,
        run.priceChanges,
        run.newProducts,
        run.qualified,
        run.errors,
        run.errorCode,
        run.reason,
      ),
    db
      .prepare(
        `INSERT INTO keepa_usage
          (id, scan_run_id, tokens_available, tokens_used, refill_rate,
           refill_in_ms, skipped_requests, next_safe_scan_at, captured_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        `keepa-usage:${run.id}`,
        run.id,
        run.usage.tokensAvailable,
        run.usage.tokensUsed,
        run.usage.refillRatePerMinute,
        run.usage.refillInMs,
        run.usage.skippedRequests,
        run.usage.nextSafeScanAt
          ? new Date(run.usage.nextSafeScanAt).valueOf()
          : null,
        run.finishedAt,
      ),
  ]);
}

export async function previousAmazonSnapshot(
  db: D1Database,
  productId: string,
) {
  return db
    .prepare(
      `SELECT current_price_cents, seller_count, availability, raw_json
       FROM amazon_snapshots WHERE amazon_product_id = ? AND demo_record = 0
       ORDER BY fetched_at DESC LIMIT 1`,
    )
    .bind(productId)
    .first<{
      current_price_cents: number | null;
      seller_count: number | null;
      availability: string;
      raw_json: string;
    }>();
}

export async function persistAmazonOpportunity(
  db: D1Database,
  opportunity: AmazonOpportunity,
  metadata: {
    provider: string;
    title: string;
    brand: string | null;
    manufacturer: string | null;
    productGroup: string | null;
    packageQuantity: number | null;
    ean: string | null;
    gtin: string | null;
  },
) {
  const now = new Date(opportunity.fetchedAt).valueOf();
  const productId = `amazon:${opportunity.marketplace}:${opportunity.asin}`;
  const previous = await previousAmazonSnapshot(db, productId);
  const content = JSON.stringify({
    price: opportunity.currentPrice,
    shipping: opportunity.shipping,
    sellerCount: opportunity.sellerCount,
    availability: opportunity.availability,
    sourceUpdatedAt: opportunity.sourceUpdatedAt,
  });
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(content),
  );
  const contentHash = [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  await db.batch([
    db
      .prepare(
        `INSERT INTO amazon_marketplace_products
          (id, asin, marketplace, provider, canonical_product_id, ean, gtin,
           title, brand, manufacturer, product_group, package_quantity,
           product_language, match_confidence_bps, match_method, mapping_json,
           first_seen_at, last_seen_at, demo_record, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
         ON CONFLICT(marketplace, asin) DO UPDATE SET
           title = excluded.title, brand = excluded.brand,
           manufacturer = excluded.manufacturer,
           product_group = excluded.product_group,
           package_quantity = excluded.package_quantity,
           product_language = excluded.product_language,
           match_confidence_bps = excluded.match_confidence_bps,
           match_method = excluded.match_method,
           last_seen_at = excluded.last_seen_at, updated_at = excluded.updated_at`,
      )
      .bind(
        productId,
        opportunity.asin,
        opportunity.marketplace,
        metadata.provider,
        opportunity.canonicalProductId,
        metadata.ean,
        metadata.gtin,
        metadata.title,
        metadata.brand,
        metadata.manufacturer,
        metadata.productGroup,
        metadata.packageQuantity,
        opportunity.productLanguage,
        Math.round(opportunity.matchConfidence * 100),
        opportunity.matchMethod,
        JSON.stringify({
          quantity: opportunity.quantity,
          riskFlags: opportunity.riskFlags,
        }),
        now,
        now,
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO amazon_snapshots
          (id, amazon_product_id, source_updated_at, fetched_at,
           current_price_cents, shipping_cents, shipping_status,
           delivered_price_cents, buy_box_price_cents, amazon_price_cents,
           lowest_new_cents, seller_type, seller_name, seller_count,
           offer_count, availability, offer_freshness, content_hash, raw_json,
           demo_record)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(amazon_product_id, content_hash) DO UPDATE SET
           fetched_at = excluded.fetched_at, raw_json = excluded.raw_json`,
      )
      .bind(
        `amazon-snapshot:${productId}:${contentHash}`,
        productId,
        opportunity.sourceUpdatedAt
          ? new Date(opportunity.sourceUpdatedAt).valueOf()
          : null,
        now,
        opportunity.currentPrice === null
          ? null
          : Math.round(opportunity.currentPrice * 100),
        opportunity.shipping === null
          ? null
          : Math.round(opportunity.shipping * 100),
        opportunity.shippingStatus,
        opportunity.deliveredPrice === null
          ? null
          : Math.round(opportunity.deliveredPrice * 100),
        opportunity.buyBoxPrice === null
          ? null
          : Math.round(opportunity.buyBoxPrice * 100),
        opportunity.amazonPrice === null
          ? null
          : Math.round(opportunity.amazonPrice * 100),
        opportunity.lowestNew === null
          ? null
          : Math.round(opportunity.lowestNew * 100),
        opportunity.sellerType,
        opportunity.sellerName,
        opportunity.sellerCount,
        opportunity.offerCount,
        opportunity.availability,
        opportunity.freshness,
        contentHash,
        JSON.stringify(opportunity),
      ),
    db
      .prepare(
        `INSERT INTO amazon_seller_count_history
          (id, amazon_product_id, seller_count, offer_count, observed_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        `amazon-sellers:${productId}:${now}`,
        productId,
        opportunity.sellerCount,
        opportunity.offerCount,
        now,
      ),
  ]);
  const events: Array<[string, string | null, string | null]> = [];
  const previousPrice =
    previous?.current_price_cents === null ||
    previous?.current_price_cents === undefined
      ? null
      : previous.current_price_cents / 100;
  if (
    previousPrice !== null &&
    opportunity.currentPrice !== null &&
    opportunity.currentPrice < previousPrice
  )
    events.push([
      'AMAZON_PRICE_DROP',
      String(previousPrice),
      String(opportunity.currentPrice),
    ]);
  if (
    previous?.availability === 'unavailable' &&
    opportunity.availability === 'available'
  )
    events.push(['AMAZON_RESTOCK', 'unavailable', 'available']);
  if (
    previous?.seller_count !== null &&
    previous?.seller_count !== undefined &&
    opportunity.sellerCount !== null &&
    previous.seller_count !== opportunity.sellerCount
  )
    events.push([
      'AMAZON_SELLER_COUNT_CHANGE',
      String(previous.seller_count),
      String(opportunity.sellerCount),
    ]);
  if (!previous) events.push(['AMAZON_NEW_PRODUCT', null, opportunity.asin]);
  for (const [kind, before, after] of events) {
    await db
      .prepare(
        `INSERT INTO amazon_price_events
          (id, amazon_product_id, kind, previous_value, current_value,
           payload_json, occurred_at, demo_record)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      )
      .bind(
        `amazon-event:${productId}:${kind}:${now}`,
        productId,
        kind,
        before,
        after,
        JSON.stringify({ sourceUpdatedAt: opportunity.sourceUpdatedAt }),
        now,
      )
      .run();
  }
  return { isNew: !previous, eventCount: events.length };
}

export async function createAmazonShadowTrade(
  db: D1Database,
  user: RequestUser,
  opportunity: AmazonOpportunity,
) {
  await ensureUser(db, user);
  const now = Date.now();
  const dataMode =
    opportunity.dataMode === 'production' ? 'production' : 'demo';
  const productId = `amazon-shadow-product:${opportunity.id}`;
  const listingId = `amazon-shadow-listing:${opportunity.id}`;
  const itemPrice = opportunity.currentPrice ?? 0;
  const inboundShipping = opportunity.shipping ?? 0;
  const expectedExit = opportunity.economics.conservativeExit ?? 0;
  const economics = calculateEconomics({
    itemPrice,
    inboundShipping,
    buyerFees: opportunity.mandatoryFees,
    paymentFees: 0,
    importCosts: 0,
    travelCost: 0,
    acquisitionLabor: 0,
    expectedSalePrice: expectedExit,
    sellerFees: 0,
    exitPaymentFees: 0,
    outboundShipping: 0,
    packaging: 0,
    expectedReturnLoss: 0,
    sellingLabor: 0,
    liquidityHaircut: 0,
    estimatedHours: 1,
    expectedHoldingDays: opportunity.economics.expectedHoldingDays ?? 90,
    requiredProfit: 25,
  });
  const tradeId = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `INSERT INTO sources
          (id, name, access_type, mode, enabled, policy_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET mode = excluded.mode,
           updated_at = excluded.updated_at`,
      )
      .bind(
        AMAZON_SOURCE_ID,
        'Keepa / Amazon Scout',
        dataMode === 'production' ? 'official_api' : 'fixture',
        dataMode === 'production' ? 'Live' : 'Fixture',
        JSON.stringify({
          checkoutAllowed: false,
          demoOnly: dataMode === 'demo',
        }),
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO products
          (id, game, set_name, name, slug, product_type, language,
           manually_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
      )
      .bind(
        productId,
        opportunity.game,
        'Amazon Scout',
        opportunity.product,
        `amazon-${opportunity.marketplace.toLowerCase()}-${opportunity.asin.toLowerCase()}`,
        opportunity.quantity.canonicalUnit,
        opportunity.productLanguage,
        opportunity.matchConfidence >= 90 ? 1 : 0,
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO listings
          (id, source_id, external_id, source_listing_id, source_marketplace,
           product_id, seller_name, title, url, source_listing_url,
           item_price_cents, shipping_cents, currency, quantity, condition,
           language, match_confidence_bps, status, availability_status,
           detected_at, last_verified_at, first_seen_at, last_seen_at, demo_record)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EUR', ?, 'new', ?, ?,
           'active', ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at,
           last_verified_at = excluded.last_verified_at`,
      )
      .bind(
        listingId,
        AMAZON_SOURCE_ID,
        opportunity.id,
        opportunity.asin,
        opportunity.marketplace,
        productId,
        opportunity.sellerName,
        opportunity.product,
        opportunity.sourceListingUrl,
        opportunity.sourceListingUrl,
        Math.round(itemPrice * 100),
        opportunity.shipping === null
          ? null
          : Math.round(opportunity.shipping * 100),
        opportunity.quantity.units,
        opportunity.productLanguage,
        Math.round(opportunity.matchConfidence * 100),
        opportunity.availability,
        now,
        now,
        now,
        now,
        dataMode === 'demo' ? 1 : 0,
      ),
    db
      .prepare(
        `INSERT INTO shadow_trades
          (id, user_id, listing_id, detected_price_cents,
           executable_price_cents, predicted_profit_cents, economics_json,
           model_version, later_supported_profit_cents, status, data_mode,
           next_follow_up_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
      )
      .bind(
        tradeId,
        user.id,
        listingId,
        Math.round(itemPrice * 100),
        opportunity.deliveredPrice === null
          ? null
          : Math.round(opportunity.deliveredPrice * 100),
        Math.round(economics.conservativeProfit * 100),
        JSON.stringify({
          ...economics,
          amazonHistoricalPercentile: opportunity.history.historicalPercentile,
          amazonSellerCount: opportunity.sellerCount,
          keepaFreshness: opportunity.freshness,
          amazonOpportunityScore: opportunity.score,
        }),
        economics.modelVersion,
        null,
        dataMode,
        now + 7 * 86_400_000,
        now,
      ),
  ]);
  return {
    id: tradeId,
    dealId: opportunity.id,
    name: opportunity.product,
    detected: new Date(now).toISOString(),
    economics,
    laterSupportedNetExit: null,
    status: 'Open',
    followUp: '7-day due',
    dataMode,
  };
}
