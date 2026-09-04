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

export const listings = sqliteTable(
  'listings',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id),
    externalId: text('external_id').notNull(),
    productId: text('product_id').references(() => products.id),
    sellerName: text('seller_name'),
    title: text('title').notNull(),
    url: text('url').notNull(),
    itemPriceCents: integer('item_price_cents').notNull(),
    shippingCents: integer('shipping_cents'),
    currency: text('currency').notNull(),
    quantity: integer('quantity'),
    condition: text('condition'),
    language: text('language'),
    matchConfidenceBps: integer('match_confidence_bps'),
    status: text('status').notNull(),
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
    preferredExit: text('preferred_exit').notNull(),
    explanationJson: text('explanation_json').notNull(),
    modelVersion: text('model_version').notNull(),
    scoredAt: integer('scored_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('idx_deal_scores_listing_time').on(table.listingId, table.scoredAt),
    index('idx_deal_scores_instant_confidence').on(
      table.instantScore,
      table.confidenceGrade,
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
    productId: text('product_id').references(() => products.id),
    listingId: text('listing_id').references(() => listings.id),
    targetAllInCents: integer('target_all_in_cents'),
    muted: integer('muted', { mode: 'boolean' }).notNull().default(false),
    ...timestamps,
  },
  (table) => [index('idx_watchlist_user').on(table.userId)],
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
    laterSupportedProfitCents: integer('later_supported_profit_cents'),
    status: text('status').notNull(),
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
    ...timestamps,
  },
  (table) => [
    index('idx_inventory_user_product').on(table.userId, table.productId),
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
    ...timestamps,
  },
  (table) => [index('idx_sales_user_date').on(table.userId, table.soldAt)],
);

export const reviewQueue = sqliteTable(
  'review_queue',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id').references(() => sources.id),
    listingId: text('listing_id').references(() => listings.id),
    kind: text('kind').notNull(),
    severity: text('severity').notNull(),
    payloadJson: text('payload_json').notNull(),
    status: text('status').notNull().default('open'),
    resolvedBy: text('resolved_by').references(() => users.id),
    resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('idx_review_status_severity').on(table.status, table.severity),
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
