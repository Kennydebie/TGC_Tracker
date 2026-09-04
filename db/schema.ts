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
