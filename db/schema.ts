import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
};

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    displayName: text('display_name'),
    ...timestamps,
  },
  (table) => [uniqueIndex('idx_users_email').on(table.email)],
);

export const userSettings = sqliteTable('user_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  country: text('country').notNull().default('NL'),
  postcode: text('postcode'),
  currency: text('currency').notNull().default('EUR'),
  timezone: text('timezone').notNull().default('Europe/Amsterdam'),
  localRadiusKm: integer('local_radius_km').notNull().default(50),
  laborRateCents: integer('labor_rate_cents').notNull().default(1800),
  requiredRoiBps: integer('required_roi_bps').notNull().default(2000),
  requiredProfitCents: integer('required_profit_cents').notNull().default(2500),
  // Legacy column retained for migration compatibility. Application writes
  // always set this to false and the cleanup migration clears old values.
  demoMode: integer('demo_mode', { mode: 'boolean' }).notNull().default(true),
  ...timestamps,
});

export const products = sqliteTable(
  'products',
  {
    id: text('id').primaryKey(),
    game: text('game').notNull(),
    setName: text('set_name').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    productType: text('product_type').notNull(),
    language: text('language').notNull(),
    edition: text('edition'),
    cardNumber: text('card_number'),
    gtin: text('gtin'),
    releaseDate: text('release_date'),
    msrpCents: integer('msrp_cents'),
    msrpCurrency: text('msrp_currency'),
    manuallyVerified: integer('manually_verified', { mode: 'boolean' })
      .notNull()
      .default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('idx_products_slug').on(table.slug),
    index('idx_products_game_set').on(table.game, table.setName),
    index('idx_products_gtin').on(table.gtin),
  ],
);

export const sources = sqliteTable('sources', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  accessType: text('access_type').notNull(),
  mode: text('mode').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  policyJson: text('policy_json').notNull(),
  ...timestamps,
});

export const ebayDeletionReceipts = sqliteTable('ebay_deletion_receipts', {
  notificationId: text('notification_id').primaryKey(),
  topic: text('topic').notNull(),
  schemaVersion: text('schema_version').notNull(),
  eventDate: integer('event_date', { mode: 'timestamp_ms' }).notNull(),
  receivedAt: integer('received_at', { mode: 'timestamp_ms' }).notNull(),
  processedAt: integer('processed_at', { mode: 'timestamp_ms' }),
  status: text('status').notNull(),
  countsJson: text('counts_json').notNull().default('{}'),
  hmacKeyVersion: text('hmac_key_version').notNull().default('v1'),
  processingToken: text('processing_token'),
});

export const ebaySuppressedIdentities = sqliteTable(
  'ebay_suppressed_identities',
  {
    fingerprint: text('fingerprint').primaryKey(),
    identityType: text('identity_type').notNull(),
    hmacKeyVersion: text('hmac_key_version').notNull().default('v1'),
    notificationId: text('notification_id')
      .notNull()
      .references(() => ebayDeletionReceipts.notificationId),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('idx_ebay_suppressed_identity_type').on(table.identityType),
  ],
);

export const ebayDeletionListingTargets = sqliteTable(
  'ebay_deletion_listing_targets',
  {
    notificationId: text('notification_id')
      .notNull()
      .references(() => ebayDeletionReceipts.notificationId, {
        onDelete: 'cascade',
      }),
    sourceListingId: text('source_listing_id').notNull(),
    // An empty value represents a matching raw record that has no persisted
    // listing. Keeping this non-null makes the composite target unique even in
    // SQLite, where NULL values do not conflict with one another.
    listingId: text('listing_id').notNull(),
  },
  (table) => [
    uniqueIndex('idx_ebay_deletion_listing_target').on(
      table.notificationId,
      table.sourceListingId,
      table.listingId,
    ),
  ],
);

export const ebayDeletionValuationTargets = sqliteTable(
  'ebay_deletion_valuation_targets',
  {
    notificationId: text('notification_id')
      .notNull()
      .references(() => ebayDeletionReceipts.notificationId, {
        onDelete: 'cascade',
      }),
    valuationId: text('valuation_id').notNull(),
  },
  (table) => [
    uniqueIndex('idx_ebay_deletion_valuation_target').on(
      table.notificationId,
      table.valuationId,
    ),
  ],
);

export const scanRuns = sqliteTable(
  'scan_runs',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id),
    status: text('status').notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
    recordsFetched: integer('records_fetched').notNull().default(0),
    recordsNormalised: integer('records_normalised').notNull().default(0),
    matches: integer('matches').notNull().default(0),
    unmatched: integer('unmatched').notNull().default(0),
    alerts: integer('alerts').notNull().default(0),
    errorCode: text('error_code'),
  },
  (table) => [
    index('idx_scan_runs_source_started').on(table.sourceId, table.startedAt),
  ],
);

export const sourceRecords = sqliteTable(
  'source_records',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id),
    sourceListingId: text('source_listing_id').notNull(),
    payloadJson: text('payload_json').notNull(),
    payloadHash: text('payload_hash').notNull(),
    capturedAt: integer('captured_at', { mode: 'timestamp_ms' }).notNull(),
    demoRecord: integer('demo_record', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  (table) => [
    uniqueIndex('idx_source_records_source_hash').on(
      table.sourceId,
      table.payloadHash,
    ),
    index('idx_source_records_listing_time').on(
      table.sourceId,
      table.sourceListingId,
      table.capturedAt,
    ),
  ],
);

export const listings = sqliteTable(
  'listings',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id),
    externalId: text('external_id').notNull(),
    sourceListingId: text('source_listing_id').notNull().default(''),
    sourceMarketplace: text('source_marketplace').notNull().default('legacy'),
    productId: text('product_id').references(() => products.id),
    sellerName: text('seller_name'),
    title: text('title').notNull(),
    url: text('url').notNull(),
    sourceListingUrl: text('source_listing_url').notNull().default(''),
    itemPriceCents: integer('item_price_cents').notNull(),
    shippingCents: integer('shipping_cents'),
    currency: text('currency').notNull(),
    quantity: integer('quantity'),
    condition: text('condition'),
    language: text('language'),
    matchConfidenceBps: integer('match_confidence_bps'),
    status: text('status').notNull(),
    availabilityStatus: text('availability_status')
      .notNull()
      .default('unknown'),
    detectedAt: integer('detected_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`0`),
    lastVerifiedAt: integer('last_verified_at', {
      mode: 'timestamp_ms',
    })
      .notNull()
      .default(sql`0`),
    firstSeenAt: integer('first_seen_at', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
    demoRecord: integer('demo_record', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  (table) => [
    uniqueIndex('idx_listings_source_external').on(
      table.sourceId,
      table.externalId,
    ),
    index('idx_listings_product_status').on(table.productId, table.status),
    index('idx_listings_last_seen').on(table.lastSeenAt),
  ],
);

export const listingSnapshots = sqliteTable(
  'listing_snapshots',
  {
    id: text('id').primaryKey(),
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    itemPriceCents: integer('item_price_cents').notNull(),
    shippingCents: integer('shipping_cents'),
    currency: text('currency').notNull(),
    availabilityStatus: text('availability_status').notNull(),
    contentHash: text('content_hash').notNull(),
    observedAt: integer('observed_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('idx_listing_snapshots_listing_hash').on(
      table.listingId,
      table.contentHash,
    ),
    index('idx_listing_snapshots_listing_time').on(
      table.listingId,
      table.observedAt,
    ),
  ],
);

export const marktplaatsSearchDefinitions = sqliteTable(
  'marktplaats_search_definitions',
  {
    id: text('id').primaryKey(),
    query: text('query').notNull(),
    kind: text('kind').notNull(),
    category: text('category'),
    minimumPriceCents: integer('minimum_price_cents'),
    maximumPriceCents: integer('maximum_price_cents'),
    postcode: text('postcode'),
    distanceKm: integer('distance_km'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('idx_marktplaats_search_query').on(table.query),
    index('idx_marktplaats_search_enabled_kind').on(table.enabled, table.kind),
  ],
);

export const marktplaatsListingDetails = sqliteTable(
  'marktplaats_listing_details',
  {
    listingId: text('listing_id')
      .primaryKey()
      .references(() => listings.id, { onDelete: 'cascade' }),
    location: text('location'),
    publicSnippet: text('public_snippet'),
    thumbnailUrl: text('thumbnail_url'),
    listingTimestampText: text('listing_timestamp_text'),
    delivery: text('delivery'),
    foundByQueriesJson: text('found_by_queries_json').notNull().default('[]'),
    assessmentJson: text('assessment_json').notNull().default('{}'),
    distanceKm: real('distance_km'),
    pickupCostCents: integer('pickup_cost_cents'),
    missingScanCount: integer('missing_scan_count').notNull().default(0),
    lastTitle: text('last_title').notNull(),
    lastLocation: text('last_location'),
    ...timestamps,
  },
  (table) => [
    index('idx_marktplaats_details_missing').on(table.missingScanCount),
  ],
);

export const marktplaatsListingDiscoveries = sqliteTable(
  'marktplaats_listing_discoveries',
  {
    id: text('id').primaryKey(),
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    searchId: text('search_id')
      .notNull()
      .references(() => marktplaatsSearchDefinitions.id),
    firstSeenAt: integer('first_seen_at', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('idx_marktplaats_discovery_listing_search').on(
      table.listingId,
      table.searchId,
    ),
    index('idx_marktplaats_discovery_search_time').on(
      table.searchId,
      table.lastSeenAt,
    ),
  ],
);

export const marktplaatsListingEvents = sqliteTable(
  'marktplaats_listing_events',
  {
    id: text('id').primaryKey(),
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    fromValue: text('from_value'),
    toValue: text('to_value'),
    payloadJson: text('payload_json').notNull().default('{}'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('idx_marktplaats_events_listing_time').on(
      table.listingId,
      table.createdAt,
    ),
    index('idx_marktplaats_events_kind_time').on(table.kind, table.createdAt),
  ],
);

export const marktplaatsSourceHealth = sqliteTable(
  'marktplaats_source_health',
  {
    sourceId: text('source_id')
      .primaryKey()
      .references(() => sources.id),
    status: text('status').notNull(),
    reason: text('reason'),
    blockedCode: text('blocked_code'),
    automaticRetryAt: integer('automatic_retry_at', { mode: 'timestamp_ms' }),
    lastSuccessfulScanAt: integer('last_successful_scan_at', {
      mode: 'timestamp_ms',
    }),
    nextScanAt: integer('next_scan_at', { mode: 'timestamp_ms' }),
    parserConfidenceBps: integer('parser_confidence_bps'),
    queries: integer('queries').notNull().default(0),
    pagesFetched: integer('pages_fetched').notNull().default(0),
    listingsParsed: integer('listings_parsed').notNull().default(0),
    newListings: integer('new_listings').notNull().default(0),
    qualified: integer('qualified').notNull().default(0),
    review: integer('review').notNull().default(0),
    duplicates: integer('duplicates').notNull().default(0),
    priceDrops: integer('price_drops').notNull().default(0),
    alerts: integer('alerts').notNull().default(0),
    errors: integer('errors').notNull().default(0),
    ...timestamps,
  },
);

export const amazonMarketplaceProducts = sqliteTable(
  'amazon_marketplace_products',
  {
    id: text('id').primaryKey(),
    asin: text('asin').notNull(),
    marketplace: text('marketplace').notNull(),
    provider: text('provider').notNull().default('amazon_keepa'),
    canonicalProductId: text('canonical_product_id').references(
      () => products.id,
    ),
    ean: text('ean'),
    gtin: text('gtin'),
    manufacturerSku: text('manufacturer_sku'),
    title: text('title').notNull(),
    brand: text('brand'),
    manufacturer: text('manufacturer'),
    productGroup: text('product_group'),
    packageQuantity: integer('package_quantity'),
    productLanguage: text('product_language'),
    matchConfidenceBps: integer('match_confidence_bps'),
    matchMethod: text('match_method'),
    mappingJson: text('mapping_json').notNull().default('{}'),
    firstSeenAt: integer('first_seen_at', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
    demoRecord: integer('demo_record', { mode: 'boolean' })
      .notNull()
      .default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('idx_amazon_product_market_asin').on(
      table.marketplace,
      table.asin,
    ),
    index('idx_amazon_product_canonical').on(table.canonicalProductId),
  ],
);

export const amazonSnapshots = sqliteTable(
  'amazon_snapshots',
  {
    id: text('id').primaryKey(),
    amazonProductId: text('amazon_product_id')
      .notNull()
      .references(() => amazonMarketplaceProducts.id, { onDelete: 'cascade' }),
    sourceUpdatedAt: integer('source_updated_at', { mode: 'timestamp_ms' }),
    fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull(),
    currentPriceCents: integer('current_price_cents'),
    shippingCents: integer('shipping_cents'),
    shippingStatus: text('shipping_status').notNull(),
    deliveredPriceCents: integer('delivered_price_cents'),
    buyBoxPriceCents: integer('buy_box_price_cents'),
    amazonPriceCents: integer('amazon_price_cents'),
    lowestNewCents: integer('lowest_new_cents'),
    sellerType: text('seller_type').notNull(),
    sellerName: text('seller_name'),
    sellerCount: integer('seller_count'),
    offerCount: integer('offer_count'),
    availability: text('availability').notNull(),
    offerFreshness: text('offer_freshness').notNull(),
    contentHash: text('content_hash').notNull(),
    rawJson: text('raw_json').notNull(),
    demoRecord: integer('demo_record', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  (table) => [
    uniqueIndex('idx_amazon_snapshots_product_hash').on(
      table.amazonProductId,
      table.contentHash,
    ),
    index('idx_amazon_snapshots_product_time').on(
      table.amazonProductId,
      table.fetchedAt,
    ),
  ],
);

export const amazonPriceEvents = sqliteTable(
  'amazon_price_events',
  {
    id: text('id').primaryKey(),
    amazonProductId: text('amazon_product_id')
      .notNull()
      .references(() => amazonMarketplaceProducts.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    previousValue: text('previous_value'),
    currentValue: text('current_value'),
    payloadJson: text('payload_json').notNull().default('{}'),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
    demoRecord: integer('demo_record', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  (table) => [
    index('idx_amazon_events_product_time').on(
      table.amazonProductId,
      table.occurredAt,
    ),
    index('idx_amazon_events_kind_time').on(table.kind, table.occurredAt),
  ],
);

export const amazonSellerCountHistory = sqliteTable(
  'amazon_seller_count_history',
  {
    id: text('id').primaryKey(),
    amazonProductId: text('amazon_product_id')
      .notNull()
      .references(() => amazonMarketplaceProducts.id, { onDelete: 'cascade' }),
    sellerCount: integer('seller_count'),
    offerCount: integer('offer_count'),
    observedAt: integer('observed_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('idx_amazon_sellers_product_time').on(
      table.amazonProductId,
      table.observedAt,
    ),
  ],
);

export const amazonScanRuns = sqliteTable(
  'amazon_scan_runs',
  {
    id: text('id').primaryKey(),
    mode: text('mode').notNull(),
    status: text('status').notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }).notNull(),
    marketplacesJson: text('marketplaces_json').notNull(),
    productsChecked: integer('products_checked').notNull().default(0),
    priceChanges: integer('price_changes').notNull().default(0),
    newProducts: integer('new_products').notNull().default(0),
    qualified: integer('qualified').notNull().default(0),
    errors: integer('errors').notNull().default(0),
    errorCode: text('error_code'),
    reason: text('reason'),
  },
  (table) => [
    index('idx_amazon_runs_mode_time').on(table.mode, table.startedAt),
  ],
);

export const keepaUsage = sqliteTable(
  'keepa_usage',
  {
    id: text('id').primaryKey(),
    scanRunId: text('scan_run_id').references(() => amazonScanRuns.id),
    tokensAvailable: integer('tokens_available'),
    tokensUsed: integer('tokens_used').notNull().default(0),
    refillRate: integer('refill_rate'),
    refillInMs: integer('refill_in_ms'),
    skippedRequests: integer('skipped_requests').notNull().default(0),
    nextSafeScanAt: integer('next_safe_scan_at', { mode: 'timestamp_ms' }),
    capturedAt: integer('captured_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('idx_keepa_usage_time').on(table.capturedAt)],
);

export const amazonWatchRules = sqliteTable(
  'amazon_watch_rules',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    canonicalProductId: text('canonical_product_id').references(
      () => products.id,
    ),
    asin: text('asin'),
    marketplace: text('marketplace'),
    game: text('game'),
    setName: text('set_name'),
    ruleType: text('rule_type').notNull(),
    thresholdJson: text('threshold_json').notNull(),
    sourceUrl: text('source_url'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index('idx_amazon_watch_user_active').on(table.userId, table.active),
    index('idx_amazon_watch_asin_market').on(table.asin, table.marketplace),
  ],
);

export const scanLocks = sqliteTable('scan_locks', {
  id: text('id').primaryKey(),
  ownerJobId: text('owner_job_id').notNull(),
  acquiredAt: integer('acquired_at', { mode: 'timestamp_ms' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
});

export const priceObservations = sqliteTable(
  'price_observations',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id),
    evidenceType: text('evidence_type').notNull(),
    priceCents: integer('price_cents').notNull(),
    shippingCents: integer('shipping_cents'),
    currency: text('currency').notNull(),
    condition: text('condition'),
    language: text('language'),
    observedAt: integer('observed_at', { mode: 'timestamp_ms' }).notNull(),
    reliabilityWeight: real('reliability_weight').notNull(),
    excludedReason: text('excluded_reason'),
    demoRecord: integer('demo_record', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  (table) => [
    index('idx_price_observations_product_time').on(
      table.productId,
      table.observedAt,
    ),
    index('idx_price_observations_type').on(table.evidenceType),
  ],
);

export const valuationSnapshots = sqliteTable(
  'valuation_snapshots',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    conservativeCents: integer('conservative_cents'),
    fairValueCents: integer('fair_value_cents'),
    optimisticCents: integer('optimistic_cents'),
    confidenceGrade: text('confidence_grade').notNull(),
    observationCount: integer('observation_count').notNull(),
    assumptionsJson: text('assumptions_json').notNull(),
    modelVersion: text('model_version').notNull(),
    valuedAt: integer('valued_at', { mode: 'timestamp_ms' }).notNull(),
    demoRecord: integer('demo_record', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  (table) => [
    index('idx_valuations_product_time').on(table.productId, table.valuedAt),
  ],
);

export const dealScores = sqliteTable(
  'deal_scores',
  {
    id: text('id').primaryKey(),
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id),
    valuationId: text('valuation_id')
      .notNull()
      .references(() => valuationSnapshots.id),
    instantScore: integer('instant_score').notNull(),
    holdScore: integer('hold_score').notNull(),
    riskScore: integer('risk_score').notNull(),
    confidenceGrade: text('confidence_grade').notNull(),
    allInCostCents: integer('all_in_cost_cents').notNull(),
    conservativeNetExitCents: integer('conservative_net_exit_cents').notNull(),
    expectedProfitCents: integer('expected_profit_cents').notNull(),
    roiBps: integer('roi_bps').notNull(),
    profitPerHourCents: integer('profit_per_hour_cents').notNull(),
    maximumItemPriceCents: integer('maximum_item_price_cents').notNull(),
    maximumAllInCostCents: integer('maximum_all_in_cost_cents')
      .notNull()
      .default(0),
    preferredExit: text('preferred_exit').notNull(),
    explanationJson: text('explanation_json').notNull(),
    modelVersion: text('model_version').notNull(),
    scoredAt: integer('scored_at', { mode: 'timestamp_ms' }).notNull(),
    demoRecord: integer('demo_record', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  (table) => [
    index('idx_deal_scores_listing_time').on(table.listingId, table.scoredAt),
    index('idx_deal_scores_instant_confidence').on(
      table.instantScore,
      table.confidenceGrade,
    ),
  ],
);

export const watchlists = sqliteTable(
  'watchlists',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    dataMode: text('data_mode').notNull().default('production'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('idx_watchlists_user_name_mode').on(
      table.userId,
      table.name,
      table.dataMode,
    ),
  ],
);

export const watchlistItems = sqliteTable(
  'watchlist_items',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    watchlistId: text('watchlist_id').references(() => watchlists.id, {
      onDelete: 'cascade',
    }),
    productId: text('product_id').references(() => products.id),
    listingId: text('listing_id').references(() => listings.id),
    targetAllInCents: integer('target_all_in_cents'),
    muted: integer('muted', { mode: 'boolean' }).notNull().default(false),
    dataMode: text('data_mode').notNull().default('production'),
    ...timestamps,
  },
  (table) => [index('idx_watchlist_user').on(table.userId)],
);

export const alertRules = sqliteTable(
  'alert_rules',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    matchConfidenceBps: integer('match_confidence_bps').notNull().default(9000),
    minimumProfitCents: integer('minimum_profit_cents').notNull().default(2500),
    minimumRoiBps: integer('minimum_roi_bps').notNull().default(2000),
    minimumProfitPerHourCents: integer('minimum_profit_per_hour_cents')
      .notNull()
      .default(2000),
    minimumGrade: text('minimum_grade').notNull().default('B'),
    maximumHoldingDays: integer('maximum_holding_days').notNull().default(90),
    maximumRiskScore: integer('maximum_risk_score').notNull().default(59),
    dataMode: text('data_mode').notNull().default('production'),
    ...timestamps,
  },
  (table) => [index('idx_alert_rules_user').on(table.userId, table.enabled)],
);

export const alerts = sqliteTable(
  'alerts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    listingId: text('listing_id').references(() => listings.id),
    productId: text('product_id').references(() => products.id),
    priority: text('priority').notNull(),
    kind: text('kind').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    payloadJson: text('payload_json').notNull(),
    readAt: integer('read_at', { mode: 'timestamp_ms' }),
    snoozedUntil: integer('snoozed_until', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('idx_alerts_user_dedupe').on(table.userId, table.dedupeKey),
    index('idx_alerts_user_created').on(table.userId, table.createdAt),
  ],
);

export const shadowTrades = sqliteTable(
  'shadow_trades',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id),
    detectedPriceCents: integer('detected_price_cents').notNull(),
    executablePriceCents: integer('executable_price_cents'),
    predictedProfitCents: integer('predicted_profit_cents').notNull(),
    economicsJson: text('economics_json').notNull().default('{}'),
    modelVersion: text('model_version').notNull().default('legacy'),
    laterSupportedProfitCents: integer('later_supported_profit_cents'),
    status: text('status').notNull(),
    dataMode: text('data_mode').notNull().default('production'),
    nextFollowUpAt: integer('next_follow_up_at', {
      mode: 'timestamp_ms',
    }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('idx_shadow_user_followup').on(table.userId, table.nextFollowUpAt),
  ],
);

export const inventoryLots = sqliteTable(
  'inventory_lots',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    quantity: integer('quantity').notNull(),
    remainingQuantity: integer('remaining_quantity').notNull(),
    acquiredAt: integer('acquired_at', { mode: 'timestamp_ms' }).notNull(),
    itemPriceCents: integer('item_price_cents').notNull(),
    allInBasisCents: integer('all_in_basis_cents').notNull(),
    currency: text('currency').notNull(),
    historicalFxRate: real('historical_fx_rate').notNull(),
    strategy: text('strategy').notNull(),
    storageLocation: text('storage_location'),
    dataMode: text('data_mode').notNull().default('production'),
    ...timestamps,
  },
  (table) => [
    index('idx_inventory_user_product').on(table.userId, table.productId),
  ],
);

export const purchases = sqliteTable(
  'purchases',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    listingId: text('listing_id').references(() => listings.id),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    inventoryLotId: text('inventory_lot_id').references(() => inventoryLots.id),
    quantity: integer('quantity').notNull(),
    purchasedAt: integer('purchased_at', { mode: 'timestamp_ms' }).notNull(),
    itemPriceCents: integer('item_price_cents').notNull(),
    acquisitionCostsCents: integer('acquisition_costs_cents').notNull(),
    allInCostCents: integer('all_in_cost_cents').notNull(),
    currency: text('currency').notNull(),
    dataMode: text('data_mode').notNull().default('production'),
    ...timestamps,
  },
  (table) => [
    index('idx_purchases_user_date').on(table.userId, table.purchasedAt),
  ],
);

export const sales = sqliteTable(
  'sales',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    inventoryLotId: text('inventory_lot_id')
      .notNull()
      .references(() => inventoryLots.id),
    quantity: integer('quantity').notNull(),
    soldAt: integer('sold_at', { mode: 'timestamp_ms' }).notNull(),
    venue: text('venue').notNull(),
    grossCents: integer('gross_cents').notNull(),
    totalCostsCents: integer('total_costs_cents').notNull(),
    netProceedsCents: integer('net_proceeds_cents').notNull(),
    realisedProfitCents: integer('realised_profit_cents').notNull(),
    currency: text('currency').notNull(),
    dataMode: text('data_mode').notNull().default('production'),
    ...timestamps,
  },
  (table) => [index('idx_sales_user_date').on(table.userId, table.soldAt)],
);

export const reviewQueue = sqliteTable(
  'review_queue',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    sourceId: text('source_id').references(() => sources.id),
    listingId: text('listing_id').references(() => listings.id),
    kind: text('kind').notNull(),
    severity: text('severity').notNull(),
    payloadJson: text('payload_json').notNull(),
    status: text('status').notNull().default('open'),
    dataMode: text('data_mode').notNull().default('production'),
    resolvedBy: text('resolved_by').references(() => users.id),
    resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('idx_review_user_status_severity').on(
      table.userId,
      table.status,
      table.severity,
    ),
  ],
);

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    metadataJson: text('metadata_json').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('idx_audit_user_created').on(table.userId, table.createdAt),
  ],
);

export const communitySources = sqliteTable(
  'community_sources',
  {
    id: text('id').primaryKey(),
    platform: text('platform').notNull(),
    name: text('name').notNull(),
    externalCommunityId: text('external_community_id').notNull(),
    externalChannelId: text('external_channel_id'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
    gamesJson: text('games_json').notNull().default('[]'),
    categoriesJson: text('categories_json').notNull().default('[]'),
    reliabilityScoreBps: integer('reliability_score_bps'),
    status: text('status').notNull().default('disabled'),
    lastSignalAt: integer('last_signal_at', { mode: 'timestamp_ms' }),
    lastError: text('last_error'),
    dataMode: text('data_mode').notNull().default('production'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('idx_community_source_external').on(
      table.platform,
      table.externalCommunityId,
      table.externalChannelId,
    ),
    index('idx_community_source_enabled').on(table.platform, table.enabled),
  ],
);

export const communitySourceConfigs = sqliteTable(
  'community_source_configs',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => communitySources.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    scanIntervalMinutes: integer('scan_interval_minutes'),
    cursorJson: text('cursor_json').notNull().default('{}'),
    configJson: text('config_json').notNull().default('{}'),
    rawRetentionHours: integer('raw_retention_hours').notNull().default(24),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('idx_community_source_config_source_user').on(
      table.sourceId,
      table.userId,
    ),
  ],
);

export const communitySignals = sqliteTable(
  'community_signals',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => communitySources.id),
    externalId: text('external_id').notNull(),
    platform: text('platform').notNull(),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
    canonicalProductId: text('canonical_product_id').references(
      () => products.id,
    ),
    authorReliabilityId: text('author_reliability_id'),
    signalType: text('signal_type').notNull(),
    priceCents: integer('price_cents'),
    currency: text('currency'),
    retailerMention: text('retailer_mention'),
    marketplaceMention: text('marketplace_mention'),
    countryMention: text('country_mention'),
    regionMention: text('region_mention'),
    language: text('language'),
    quantity: integer('quantity'),
    urlsJson: text('urls_json').notNull().default('[]'),
    restockFlag: integer('restock_flag', { mode: 'boolean' })
      .notNull()
      .default(false),
    reprintFlag: integer('reprint_flag', { mode: 'boolean' })
      .notNull()
      .default(false),
    releaseFlag: integer('release_flag', { mode: 'boolean' })
      .notNull()
      .default(false),
    scarcityFlag: integer('scarcity_flag', { mode: 'boolean' })
      .notNull()
      .default(false),
    fraudWarningFlag: integer('fraud_warning_flag', { mode: 'boolean' })
      .notNull()
      .default(false),
    sentiment: text('sentiment').notNull(),
    intent: text('intent').notNull(),
    confidenceBps: integer('confidence_bps').notNull(),
    verificationStatus: text('verification_status')
      .notNull()
      .default('unverified'),
    officialReference: integer('official_reference', { mode: 'boolean' })
      .notNull()
      .default(false),
    unresolved: integer('unresolved', { mode: 'boolean' })
      .notNull()
      .default(false),
    textHash: text('text_hash').notNull(),
    rawExcerpt: text('raw_excerpt'),
    rawExpiresAt: integer('raw_expires_at', { mode: 'timestamp_ms' }),
    dataMode: text('data_mode').notNull().default('production'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('idx_community_signal_source_external').on(
      table.sourceId,
      table.externalId,
    ),
    index('idx_community_signal_product_time').on(
      table.canonicalProductId,
      table.occurredAt,
    ),
    index('idx_community_signal_type_time').on(
      table.signalType,
      table.occurredAt,
    ),
    index('idx_community_signal_unresolved').on(
      table.unresolved,
      table.confidenceBps,
    ),
  ],
);

export const communitySignalEntities = sqliteTable(
  'community_signal_entities',
  {
    id: text('id').primaryKey(),
    signalId: text('signal_id')
      .notNull()
      .references(() => communitySignals.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    value: text('value').notNull(),
    confidenceBps: integer('confidence_bps').notNull(),
    evidenceStart: integer('evidence_start'),
    evidenceEnd: integer('evidence_end'),
  },
  (table) => [
    index('idx_community_entity_signal').on(table.signalId),
    index('idx_community_entity_kind_value').on(table.kind, table.value),
  ],
);

export const communitySignalEvents = sqliteTable(
  'community_signal_events',
  {
    id: text('id').primaryKey(),
    dedupeKey: text('dedupe_key').notNull(),
    canonicalProductId: text('canonical_product_id').references(
      () => products.id,
    ),
    signalType: text('signal_type').notNull(),
    retailer: text('retailer'),
    marketplace: text('marketplace'),
    priceCents: integer('price_cents'),
    currency: text('currency'),
    firstDetectedAt: integer('first_detected_at', {
      mode: 'timestamp_ms',
    }).notNull(),
    lastDetectedAt: integer('last_detected_at', {
      mode: 'timestamp_ms',
    }).notNull(),
    mentionCount: integer('mention_count').notNull().default(1),
    uniqueAuthorCount: integer('unique_author_count').notNull().default(0),
    uniqueCommunityCount: integer('unique_community_count')
      .notNull()
      .default(1),
    platformsJson: text('platforms_json').notNull().default('[]'),
    sourceIdsJson: text('source_ids_json').notNull().default('[]'),
    verificationStatus: text('verification_status')
      .notNull()
      .default('unverified'),
    dataMode: text('data_mode').notNull().default('production'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('idx_community_event_dedupe').on(table.dedupeKey),
    index('idx_community_event_product_time').on(
      table.canonicalProductId,
      table.lastDetectedAt,
    ),
  ],
);

export const communityEventSignals = sqliteTable(
  'community_event_signals',
  {
    eventId: text('event_id')
      .notNull()
      .references(() => communitySignalEvents.id, { onDelete: 'cascade' }),
    signalId: text('signal_id')
      .notNull()
      .references(() => communitySignals.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('idx_community_event_signal').on(table.eventId, table.signalId),
    index('idx_community_event_signals_signal').on(table.signalId),
  ],
);

export const communityProductMomentum = sqliteTable(
  'community_product_momentum',
  {
    id: text('id').primaryKey(),
    canonicalProductId: text('canonical_product_id')
      .notNull()
      .references(() => products.id),
    calculatedAt: integer('calculated_at', {
      mode: 'timestamp_ms',
    }).notNull(),
    mentions15m: integer('mentions_15m').notNull().default(0),
    mentions1h: integer('mentions_1h').notNull().default(0),
    mentions6h: integer('mentions_6h').notNull().default(0),
    mentions24h: integer('mentions_24h').notNull().default(0),
    mentions7d: integer('mentions_7d').notNull().default(0),
    uniqueAuthors: integer('unique_authors').notNull().default(0),
    uniqueCommunities: integer('unique_communities').notNull().default(0),
    momentumScore: integer('momentum_score').notNull(),
    divergenceScore: integer('divergence_score').notNull(),
    hypeRiskScore: integer('hype_risk_score').notNull(),
    classification: text('classification').notNull(),
    metricsJson: text('metrics_json').notNull().default('{}'),
    dataMode: text('data_mode').notNull().default('production'),
  },
  (table) => [
    index('idx_community_momentum_product_time').on(
      table.canonicalProductId,
      table.calculatedAt,
    ),
    index('idx_community_momentum_score_time').on(
      table.momentumScore,
      table.calculatedAt,
    ),
  ],
);

export const communityAuthorReliability = sqliteTable(
  'community_author_reliability',
  {
    id: text('id').primaryKey(),
    platform: text('platform').notNull(),
    pseudonymousAuthorId: text('pseudonymous_author_id').notNull(),
    signalsSubmitted: integer('signals_submitted').notNull().default(0),
    signalsVerified: integer('signals_verified').notNull().default(0),
    signalsFalse: integer('signals_false').notNull().default(0),
    signalsExpired: integer('signals_expired').notNull().default(0),
    signalsPriceChangedBeforeVerification: integer(
      'signals_price_changed_before_verification',
    )
      .notNull()
      .default(0),
    reliabilityScoreBps: integer('reliability_score_bps'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('idx_community_author_platform_hash').on(
      table.platform,
      table.pseudonymousAuthorId,
    ),
  ],
);

export const communitySourceReliability = sqliteTable(
  'community_source_reliability',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => communitySources.id, { onDelete: 'cascade' }),
    signalsSubmitted: integer('signals_submitted').notNull().default(0),
    signalsVerified: integer('signals_verified').notNull().default(0),
    signalsFalse: integer('signals_false').notNull().default(0),
    medianLeadMinutes: integer('median_lead_minutes'),
    reliabilityScoreBps: integer('reliability_score_bps'),
    calculatedAt: integer('calculated_at', {
      mode: 'timestamp_ms',
    }).notNull(),
  },
  (table) => [
    uniqueIndex('idx_community_source_reliability_source').on(table.sourceId),
  ],
);

export const communityVerifications = sqliteTable(
  'community_verifications',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => communitySignalEvents.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    marketSource: text('market_source'),
    marketListingId: text('market_listing_id'),
    marketUrl: text('market_url'),
    communityDetectedAt: integer('community_detected_at', {
      mode: 'timestamp_ms',
    }).notNull(),
    marketVerifiedAt: integer('market_verified_at', {
      mode: 'timestamp_ms',
    }),
    officialSourceDetectedAt: integer('official_source_detected_at', {
      mode: 'timestamp_ms',
    }),
    priceAtCommunityDetectionCents: integer(
      'price_at_community_detection_cents',
    ),
    priceAtVerificationCents: integer('price_at_verification_cents'),
    deliveredPriceCents: integer('delivered_price_cents'),
    conservativeExitCents: integer('conservative_exit_cents'),
    predictedProfitCents: integer('predicted_profit_cents'),
    roiBps: integer('roi_bps'),
    confidenceGrade: text('confidence_grade'),
    detailsJson: text('details_json').notNull().default('{}'),
    dataMode: text('data_mode').notNull().default('production'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('idx_community_verification_event_time').on(
      table.eventId,
      table.createdAt,
    ),
  ],
);

export const communityLeadTime = sqliteTable(
  'community_lead_time',
  {
    id: text('id').primaryKey(),
    verificationId: text('verification_id')
      .notNull()
      .references(() => communityVerifications.id, { onDelete: 'cascade' }),
    sourceId: text('source_id')
      .notNull()
      .references(() => communitySources.id),
    communityDetectedAt: integer('community_detected_at', {
      mode: 'timestamp_ms',
    }).notNull(),
    marketSourceDetectedAt: integer('market_source_detected_at', {
      mode: 'timestamp_ms',
    }).notNull(),
    officialSourceDetectedAt: integer('official_source_detected_at', {
      mode: 'timestamp_ms',
    }),
    leadTimeMinutes: integer('lead_time_minutes').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('idx_community_lead_source_time').on(table.sourceId, table.createdAt),
  ],
);

export const communityHypeMetrics = sqliteTable(
  'community_hype_metrics',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => communitySignalEvents.id, { onDelete: 'cascade' }),
    calculatedAt: integer('calculated_at', {
      mode: 'timestamp_ms',
    }).notNull(),
    hypeRiskScore: integer('hype_risk_score').notNull(),
    lowHistoryAuthorRatioBps: integer('low_history_author_ratio_bps')
      .notNull()
      .default(0),
    repeatedTextRatioBps: integer('repeated_text_ratio_bps')
      .notNull()
      .default(0),
    repeatedLinkRatioBps: integer('repeated_link_ratio_bps')
      .notNull()
      .default(0),
    dominantSourceRatioBps: integer('dominant_source_ratio_bps')
      .notNull()
      .default(0),
    crossPostRatioBps: integer('cross_post_ratio_bps').notNull().default(0),
    indicatorsJson: text('indicators_json').notNull().default('[]'),
  },
  (table) => [
    index('idx_community_hype_event_time').on(
      table.eventId,
      table.calculatedAt,
    ),
  ],
);

export const communityScanRuns = sqliteTable(
  'community_scan_runs',
  {
    id: text('id').primaryKey(),
    platform: text('platform').notNull(),
    status: text('status').notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }).notNull(),
    eventsReceived: integer('events_received').notNull().default(0),
    messagesFiltered: integer('messages_filtered').notNull().default(0),
    signalsCreated: integer('signals_created').notNull().default(0),
    duplicatesClustered: integer('duplicates_clustered').notNull().default(0),
    productsMatched: integer('products_matched').notNull().default(0),
    signalsVerified: integer('signals_verified').notNull().default(0),
    signalsRejected: integer('signals_rejected').notNull().default(0),
    alertsEmitted: integer('alerts_emitted').notNull().default(0),
    rateLimitRemaining: integer('rate_limit_remaining'),
    classificationLatencyMs: integer('classification_latency_ms'),
    errorCode: text('error_code'),
    errorDetail: text('error_detail'),
  },
  (table) => [
    index('idx_community_scan_platform_time').on(
      table.platform,
      table.startedAt,
    ),
  ],
);

export const scoutIngestionRuns = sqliteTable(
  'scout_ingestion_runs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    externalRunId: text('external_run_id').notNull(),
    payloadHash: text('payload_hash').notNull(),
    status: text('status').notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }).notNull(),
    findingsReceived: integer('findings_received').notNull().default(0),
    insertedCount: integer('inserted_count').notNull().default(0),
    updatedCount: integer('updated_count').notNull().default(0),
    unchangedCount: integer('unchanged_count').notNull().default(0),
    rejectedCount: integer('rejected_count').notNull().default(0),
    errorsJson: text('errors_json').notNull().default('[]'),
    resultJson: text('result_json').notNull().default('{}'),
    dataMode: text('data_mode').notNull().default('production'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('idx_scout_ingestion_run_user_external').on(
      table.userId,
      table.externalRunId,
    ),
    index('idx_scout_ingestion_run_user_finished').on(
      table.userId,
      table.finishedAt,
    ),
  ],
);

export const scoutIngestionSourceChecks = sqliteTable(
  'scout_ingestion_source_checks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    runId: text('run_id')
      .notNull()
      .references(() => scoutIngestionRuns.id, { onDelete: 'cascade' }),
    sourceIdentifier: text('source_identifier').notNull(),
    status: text('status').notNull(),
    checkedAt: integer('checked_at', { mode: 'timestamp_ms' }).notNull(),
    coverageThrough: integer('coverage_through', { mode: 'timestamp_ms' }),
    errorCode: text('error_code'),
    detail: text('detail'),
    dataMode: text('data_mode').notNull().default('production'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('idx_scout_source_check_user_run_source').on(
      table.userId,
      table.runId,
      table.sourceIdentifier,
    ),
    index('idx_scout_source_check_user_source_time').on(
      table.userId,
      table.sourceIdentifier,
      table.checkedAt,
    ),
  ],
);

export const scoutFindings = sqliteTable(
  'scout_findings',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    dedupeKey: text('dedupe_key').notNull(),
    sourceKind: text('source_kind').notNull(),
    sourceIdentifier: text('source_identifier').notNull(),
    game: text('game').notNull(),
    productName: text('product_name'),
    productLanguage: text('product_language'),
    updateType: text('update_type').notNull(),
    summary: text('summary').notNull(),
    sourceUrl: text('source_url'),
    subreddit: text('subreddit'),
    sourcePostOrCommentId: text('source_post_or_comment_id'),
    retailerName: text('retailer_name'),
    retailerOrOfficialUrl: text('retailer_or_official_url'),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
    firstObservedAt: integer('first_observed_at', {
      mode: 'timestamp_ms',
    }).notNull(),
    lastObservedAt: integer('last_observed_at', {
      mode: 'timestamp_ms',
    }).notNull(),
    priceCents: integer('price_cents'),
    currency: text('currency'),
    region: text('region'),
    shippingToNetherlands: text('shipping_to_netherlands').notNull(),
    availability: text('availability').notNull(),
    verificationStatus: text('verification_status').notNull(),
    verificationEvidenceUrl: text('verification_evidence_url'),
    verificationObservedAt: integer('verification_observed_at', {
      mode: 'timestamp_ms',
    }),
    verificationEvidenceJson: text('verification_evidence_json'),
    collectionMethod: text('collection_method')
      .notNull()
      .default('chatgpt_web_research'),
    materialHash: text('material_hash').notNull(),
    latestRunId: text('latest_run_id')
      .notNull()
      .references(() => scoutIngestionRuns.id),
    dataMode: text('data_mode').notNull().default('production'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('idx_scout_finding_user_dedupe').on(
      table.userId,
      table.dedupeKey,
    ),
    index('idx_scout_finding_user_observed').on(
      table.userId,
      table.lastObservedAt,
    ),
    index('idx_scout_finding_user_source').on(
      table.userId,
      table.sourceIdentifier,
      table.sourcePostOrCommentId,
    ),
  ],
);

export const scoutFindingObservations = sqliteTable(
  'scout_finding_observations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    findingId: text('finding_id')
      .notNull()
      .references(() => scoutFindings.id, { onDelete: 'cascade' }),
    runId: text('run_id')
      .notNull()
      .references(() => scoutIngestionRuns.id),
    materialHash: text('material_hash').notNull(),
    observedAt: integer('observed_at', { mode: 'timestamp_ms' }).notNull(),
    payloadJson: text('payload_json').notNull(),
    dataMode: text('data_mode').notNull().default('production'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('idx_scout_observation_user_finding_material').on(
      table.userId,
      table.findingId,
      table.materialHash,
    ),
    index('idx_scout_observation_user_finding_time').on(
      table.userId,
      table.findingId,
      table.observedAt,
    ),
  ],
);

export const communityWatchRules = sqliteTable(
  'community_watch_rules',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    canonicalProductId: text('canonical_product_id')
      .notNull()
      .references(() => products.id),
    minimumMomentum: integer('minimum_momentum').notNull().default(80),
    minimumDiscordMentions: integer('minimum_discord_mentions')
      .notNull()
      .default(0),
    minimumRedditMentions: integer('minimum_reddit_mentions')
      .notNull()
      .default(0),
    minimumDivergence: integer('minimum_divergence').notNull().default(70),
    maximumHypeRisk: integer('maximum_hype_risk').notNull().default(50),
    minimumRestockMentions: integer('minimum_restock_mentions')
      .notNull()
      .default(0),
    minimumIndependentConfirmations: integer(
      'minimum_independent_confirmations',
    )
      .notNull()
      .default(2),
    officialCatalystRequired: integer('official_catalyst_required', {
      mode: 'boolean',
    })
      .notNull()
      .default(false),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('idx_community_watch_user_product').on(
      table.userId,
      table.canonicalProductId,
    ),
  ],
);

export const discordWorkerHealth = sqliteTable('discord_worker_health', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  detail: text('detail'),
  updatedAt: integer('updated_at').notNull(),
  lastMessageAt: integer('last_message_at'),
  lastIngestAt: integer('last_ingest_at'),
});

export const communityShadowEvaluations = sqliteTable(
  'community_shadow_evaluations',
  {
    id: text('id').primaryKey(),
    shadowTradeId: text('shadow_trade_id')
      .notNull()
      .references(() => shadowTrades.id, { onDelete: 'cascade' }),
    communityEventId: text('community_event_id')
      .notNull()
      .references(() => communitySignalEvents.id),
    communityDetectedAt: integer('community_detected_at', {
      mode: 'timestamp_ms',
    }).notNull(),
    marketVerifiedAt: integer('market_verified_at', {
      mode: 'timestamp_ms',
    }),
    priceAtCommunityDetectionCents: integer(
      'price_at_community_detection_cents',
    ),
    priceAtVerificationCents: integer('price_at_verification_cents'),
    priceAfter1hCents: integer('price_after_1h_cents'),
    priceAfter24hCents: integer('price_after_24h_cents'),
    priceAfter7dCents: integer('price_after_7d_cents'),
    communityMomentum: integer('community_momentum').notNull(),
    divergenceScore: integer('divergence_score').notNull(),
    hypeRiskScore: integer('hype_risk_score').notNull(),
    sourceReliability: integer('source_reliability').notNull(),
    economicsJson: text('economics_json').notNull().default('{}'),
    dataMode: text('data_mode').notNull().default('production'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('idx_community_shadow_trade').on(table.shadowTradeId),
    index('idx_community_shadow_event').on(table.communityEventId),
  ],
);
