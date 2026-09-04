import {
  assessMarktplaatsTitle,
  conservativeMarktplaatsEconomics,
  listingAvailabilityAfterMisses,
  MARKTPLAATS_ACCESS_MODE,
  MARKTPLAATS_SOURCE_ID,
  marktplaatsQueryKind,
  marktplaatsScanIntervalMinutes,
  priceChange,
  type MarktplaatsDashboard,
  type MarktplaatsDashboardListing,
  type MarktplaatsParsedListing,
  type MarktplaatsSourceState,
} from '../marktplaats.ts';

const cents = (value: number) => Math.round(value * 100);
const euros = (value: number | null) =>
  value === null ? null : Math.round(value) / 100;

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function acquireMarktplaatsLock(
  db: D1Database,
  jobId: string,
  now = Date.now(),
) {
  await db
    .prepare('DELETE FROM scan_locks WHERE id = ? AND expires_at <= ?')
    .bind(MARKTPLAATS_SOURCE_ID, now)
    .run();
  await db
    .prepare(
      `INSERT INTO scan_locks (id, owner_job_id, acquired_at, expires_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .bind(MARKTPLAATS_SOURCE_ID, jobId, now, now + 14 * 60_000)
    .run();
  const lock = await db
    .prepare('SELECT owner_job_id FROM scan_locks WHERE id = ?')
    .bind(MARKTPLAATS_SOURCE_ID)
    .first<{ owner_job_id: string }>();
  return lock?.owner_job_id === jobId;
}

export async function releaseMarktplaatsLock(db: D1Database, jobId: string) {
  await db
    .prepare('DELETE FROM scan_locks WHERE id = ? AND owner_job_id = ?')
    .bind(MARKTPLAATS_SOURCE_ID, jobId)
    .run();
}

export async function readMarktplaatsPause(db: D1Database, now = Date.now()) {
  const row = await db
    .prepare(
      `SELECT status, reason, automatic_retry_at
       FROM marktplaats_source_health WHERE source_id = ?`,
    )
    .bind(MARKTPLAATS_SOURCE_ID)
    .first<{
      status: MarktplaatsSourceState;
      reason: string | null;
      automatic_retry_at: number | null;
    }>();
  if (!row || !row.automatic_retry_at || row.automatic_retry_at <= now)
    return null;
  if (!['blocked', 'paused', 'parser_review_required'].includes(row.status))
    return null;
  return row;
}

export async function readMarktplaatsRegionalSettings(db: D1Database) {
  const row = await db
    .prepare(
      `SELECT postcode, local_radius_km
       FROM user_settings
       WHERE TRIM(COALESCE(postcode, '')) <> ''
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .first<{ postcode: string; local_radius_km: number }>();
  return {
    postcode: row?.postcode?.trim() || undefined,
    distanceKm: Math.max(1, Math.min(250, row?.local_radius_km ?? 100)),
  };
}

export type MarktplaatsRunPersistence = {
  jobId: string;
  startedAt: number;
  finishedAt: number;
  status: MarktplaatsSourceState;
  reason: string | null;
  blockedCode: string | null;
  automaticRetryAt: number | null;
  queries: string[];
  pagesFetched: number;
  parsedBeforeDedupe: number;
  listings: MarktplaatsParsedListing[];
  parserConfidence: number | null;
  errors: string[];
  postcode?: string;
  distanceKm: number;
};

export async function persistMarktplaatsRun(
  db: D1Database,
  run: MarktplaatsRunPersistence,
) {
  const intervalMinutes = marktplaatsScanIntervalMinutes(
    process.env.MARKTPLAATS_SCAN_INTERVAL_MINUTES,
  );
  await db.batch([
    db
      .prepare(
        `INSERT INTO sources
          (id, name, access_type, mode, enabled, policy_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled,
           mode = excluded.mode, policy_json = excluded.policy_json,
           updated_at = excluded.updated_at`,
      )
      .bind(
        MARKTPLAATS_SOURCE_ID,
        'Marktplaats Public Monitor',
        'public_page',
        'Live',
        1,
        JSON.stringify({
          accessMode: MARKTPLAATS_ACCESS_MODE,
          checkoutAllowed: false,
          stopOnBlocks: true,
          concurrency: 1,
        }),
        run.startedAt,
        run.finishedAt,
      ),
    db
      .prepare(
        `INSERT INTO scan_runs
          (id, source_id, status, started_at, finished_at, records_fetched,
           records_normalised, matches, unmatched, alerts, error_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
      )
      .bind(
        run.jobId,
        MARKTPLAATS_SOURCE_ID,
        run.status,
        run.startedAt,
        run.finishedAt,
        run.parsedBeforeDedupe,
        run.listings.length,
        0,
        run.listings.length,
        0,
        run.blockedCode ?? run.errors[0] ?? null,
      ),
  ]);

  for (const query of run.queries) {
    const searchId = `marktplaats-search:${await sha256(query)}`;
    await db
      .prepare(
        `INSERT INTO marktplaats_search_definitions
          (id, query, kind, category, postcode, distance_km, enabled,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(query) DO UPDATE SET enabled = excluded.enabled,
           kind = excluded.kind, postcode = excluded.postcode,
           distance_km = excluded.distance_km,
           updated_at = excluded.updated_at`,
      )
      .bind(
        searchId,
        query,
        marktplaatsQueryKind(query),
        'hobby-en-vrije-tijd/verzamelkaartspellen-pokemon',
        run.postcode ?? null,
        run.distanceKm,
        1,
        run.startedAt,
        run.finishedAt,
      )
      .run();
  }

  let newListings = 0;
  let priceDrops = 0;
  let review = 0;
  for (const listing of run.listings) {
    const listingId = `listing:${MARKTPLAATS_SOURCE_ID}:${listing.sourceListingId}`;
    const previous = await db
      .prepare(
        `SELECT listings.item_price_cents, listings.title,
                marktplaats_listing_details.location,
                marktplaats_listing_details.delivery
         FROM listings
         LEFT JOIN marktplaats_listing_details
           ON marktplaats_listing_details.listing_id = listings.id
         WHERE listings.id = ?`,
      )
      .bind(listingId)
      .first<{
        item_price_cents: number;
        title: string;
        location: string | null;
        delivery: string | null;
      }>();
    const isNew = !previous;
    if (isNew) newListings += 1;
    const assessment = assessMarktplaatsTitle(
      listing.title,
      listing.snippet ?? '',
    );
    if (
      listing.price === null &&
      !assessment.riskFlags.includes('price_missing')
    )
      assessment.riskFlags.push('price_missing');
    assessment.reviewRequired =
      assessment.reviewRequired || listing.price === null;
    if (assessment.reviewRequired) review += 1;
    const currentPriceCents = cents(listing.price ?? 0);
    const change = priceChange(
      previous ? previous.item_price_cents / 100 : null,
      listing.price,
    );
    if (change?.kind === 'price_decrease') priceDrops += 1;
    const snapshotHash = await sha256(
      JSON.stringify({
        title: listing.title,
        price: listing.price,
        location: listing.location,
        delivery: listing.delivery,
      }),
    );
    const now = run.finishedAt;
    await db.batch([
      db
        .prepare(
          `INSERT INTO listings
            (id, source_id, external_id, source_listing_id, source_marketplace,
             product_id, seller_name, title, url, source_listing_url,
             item_price_cents, shipping_cents, currency, quantity, condition,
             language, match_confidence_bps, status, availability_status,
             detected_at, last_verified_at, first_seen_at, last_seen_at, demo_record)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(source_id, external_id) DO UPDATE SET
             seller_name = excluded.seller_name, title = excluded.title,
             url = excluded.url, source_listing_url = excluded.source_listing_url,
             item_price_cents = excluded.item_price_cents,
             match_confidence_bps = excluded.match_confidence_bps,
             status = excluded.status, availability_status = excluded.availability_status,
             last_verified_at = excluded.last_verified_at,
             last_seen_at = excluded.last_seen_at`,
        )
        .bind(
          listingId,
          MARKTPLAATS_SOURCE_ID,
          listing.sourceListingId,
          listing.sourceListingId,
          'marktplaats',
          null,
          listing.seller,
          listing.title,
          listing.sourceListingUrl,
          listing.sourceListingUrl,
          currentPriceCents,
          null,
          'EUR',
          assessment.quantity,
          assessment.sealedStatus,
          null,
          assessment.matchConfidence * 100,
          'active',
          'available',
          isNew ? now : run.startedAt,
          now,
          isNew ? now : run.startedAt,
          now,
          0,
        ),
      db
        .prepare(
          `INSERT INTO listing_snapshots
            (id, listing_id, item_price_cents, shipping_cents, currency,
             availability_status, content_hash, observed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(listing_id, content_hash) DO UPDATE SET
             observed_at = excluded.observed_at`,
        )
        .bind(
          `snapshot:${listingId}:${snapshotHash}`,
          listingId,
          currentPriceCents,
          null,
          'EUR',
          'available',
          snapshotHash,
          now,
        ),
      db
        .prepare(
          `INSERT INTO marktplaats_listing_details
            (listing_id, location, public_snippet, thumbnail_url,
             listing_timestamp_text, delivery, found_by_queries_json,
             assessment_json, distance_km, pickup_cost_cents,
             missing_scan_count, last_title, last_location, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(listing_id) DO UPDATE SET
             location = excluded.location,
             public_snippet = excluded.public_snippet,
             thumbnail_url = excluded.thumbnail_url,
             listing_timestamp_text = excluded.listing_timestamp_text,
             delivery = excluded.delivery,
             found_by_queries_json = excluded.found_by_queries_json,
             assessment_json = excluded.assessment_json,
             missing_scan_count = 0,
             last_title = excluded.last_title,
             last_location = excluded.last_location,
             updated_at = excluded.updated_at`,
        )
        .bind(
          listingId,
          listing.location,
          listing.snippet,
          listing.thumbnailUrl,
          listing.listingTimestampText,
          listing.delivery,
          JSON.stringify(listing.foundByQueries),
          JSON.stringify(assessment),
          null,
          null,
          0,
          listing.title,
          listing.location,
          isNew ? now : run.startedAt,
          now,
        ),
    ]);

    for (const query of listing.foundByQueries) {
      const searchId = `marktplaats-search:${await sha256(query)}`;
      await db
        .prepare(
          `INSERT INTO marktplaats_listing_discoveries
            (id, listing_id, search_id, first_seen_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(listing_id, search_id) DO UPDATE SET
             last_seen_at = excluded.last_seen_at`,
        )
        .bind(
          `discovery:${listingId}:${searchId}`,
          listingId,
          searchId,
          now,
          now,
        )
        .run();
    }

    const events: Array<{
      kind: string;
      from: string | null;
      to: string | null;
      payload: unknown;
    }> = [];
    if (isNew)
      events.push({
        kind: 'new_listing',
        from: null,
        to: null,
        payload: listing,
      });
    if (change)
      events.push({
        kind: change.kind,
        from: String(change.from),
        to: String(change.to),
        payload: change,
      });
    if (previous && previous.title !== listing.title)
      events.push({
        kind: 'title_change',
        from: previous.title,
        to: listing.title,
        payload: {},
      });
    if (previous && previous.delivery !== listing.delivery)
      events.push({
        kind: 'shipping_change',
        from: previous.delivery,
        to: listing.delivery,
        payload: {},
      });
    for (const event of events) {
      const eventId = `marktplaats-event:${listingId}:${event.kind}:${await sha256(
        JSON.stringify({ from: event.from, to: event.to, at: now }),
      )}`;
      await db
        .prepare(
          `INSERT INTO marktplaats_listing_events
            (id, listing_id, kind, from_value, to_value, payload_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`,
        )
        .bind(
          eventId,
          listingId,
          event.kind,
          event.from,
          event.to,
          JSON.stringify(event.payload),
          now,
        )
        .run();
    }
    if (assessment.reviewRequired) {
      await db
        .prepare(
          `INSERT INTO review_queue
            (id, user_id, source_id, listing_id, kind, severity,
             payload_json, status, data_mode, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`,
        )
        .bind(
          `review:${listingId}`,
          null,
          MARKTPLAATS_SOURCE_ID,
          listingId,
          'marktplaats_match',
          listing.price !== null && listing.price >= 250 ? 'High' : 'Medium',
          JSON.stringify({ listing, assessment }),
          'open',
          'production',
          now,
        )
        .run();
    }
  }

  if (run.status === 'healthy') {
    const missing = await db
      .prepare(
        `SELECT listings.id, marktplaats_listing_details.missing_scan_count
         FROM listings
         INNER JOIN marktplaats_listing_details
           ON marktplaats_listing_details.listing_id = listings.id
         WHERE listings.source_id = ? AND listings.last_seen_at < ?
           AND listings.status != 'unavailable'`,
      )
      .bind(MARKTPLAATS_SOURCE_ID, run.startedAt)
      .all<{ id: string; missing_scan_count: number }>();
    for (const row of missing.results) {
      const count = Number(row.missing_scan_count) + 1;
      const availability = listingAvailabilityAfterMisses(count);
      await db.batch([
        db
          .prepare(
            `UPDATE marktplaats_listing_details
             SET missing_scan_count = ?, updated_at = ? WHERE listing_id = ?`,
          )
          .bind(count, run.finishedAt, row.id),
        db
          .prepare(
            `UPDATE listings SET status = ?, availability_status = ?,
             last_verified_at = ? WHERE id = ?`,
          )
          .bind(
            availability,
            availability === 'unavailable' ? 'unavailable' : 'unknown',
            run.finishedAt,
            row.id,
          ),
      ]);
    }
  }

  const status = run.status;
  const successfulAt = status === 'healthy' ? run.finishedAt : null;
  const nextScanAt =
    status === 'healthy'
      ? run.finishedAt + intervalMinutes * 60_000
      : run.automaticRetryAt;
  await db
    .prepare(
      `INSERT INTO marktplaats_source_health
        (source_id, status, reason, blocked_code, automatic_retry_at,
         last_successful_scan_at, next_scan_at, parser_confidence_bps,
         queries, pages_fetched, listings_parsed, new_listings, qualified,
         review, duplicates, price_drops, alerts, errors, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_id) DO UPDATE SET
         status = excluded.status, reason = excluded.reason,
         blocked_code = excluded.blocked_code,
         automatic_retry_at = excluded.automatic_retry_at,
         last_successful_scan_at = COALESCE(excluded.last_successful_scan_at,
           marktplaats_source_health.last_successful_scan_at),
         next_scan_at = excluded.next_scan_at,
         parser_confidence_bps = excluded.parser_confidence_bps,
         queries = excluded.queries, pages_fetched = excluded.pages_fetched,
         listings_parsed = excluded.listings_parsed,
         new_listings = excluded.new_listings, qualified = excluded.qualified,
         review = excluded.review, duplicates = excluded.duplicates,
         price_drops = excluded.price_drops, alerts = excluded.alerts,
         errors = excluded.errors, updated_at = excluded.updated_at`,
    )
    .bind(
      MARKTPLAATS_SOURCE_ID,
      status,
      run.reason,
      run.blockedCode,
      run.automaticRetryAt,
      successfulAt,
      nextScanAt,
      run.parserConfidence === null
        ? null
        : Math.round(run.parserConfidence * 10_000),
      run.queries.length,
      run.pagesFetched,
      run.listings.length,
      newListings,
      0,
      review,
      Math.max(0, run.parsedBeforeDedupe - run.listings.length),
      priceDrops,
      0,
      run.errors.length,
      run.startedAt,
      run.finishedAt,
    )
    .run();

  return { newListings, priceDrops, review };
}

export async function listMarktplaatsDashboard(
  db: D1Database,
): Promise<MarktplaatsDashboard> {
  const health = await db
    .prepare(`SELECT * FROM marktplaats_source_health WHERE source_id = ?`)
    .bind(MARKTPLAATS_SOURCE_ID)
    .first<Record<string, string | number | null>>();
  const listingRows = await db
    .prepare(
      `SELECT listings.id, listings.source_listing_id,
              listings.source_listing_url, listings.title,
              listings.item_price_cents, listings.seller_name,
              listings.first_seen_at, listings.last_seen_at, listings.status,
              details.location, details.public_snippet, details.thumbnail_url,
              details.listing_timestamp_text, details.delivery,
              details.found_by_queries_json, details.assessment_json,
              details.distance_km, details.pickup_cost_cents,
              (SELECT payload_json FROM marktplaats_listing_events events
               WHERE events.listing_id = listings.id
                 AND events.kind = 'price_decrease'
               ORDER BY events.created_at DESC LIMIT 1) AS price_drop_json
       FROM listings
       INNER JOIN marktplaats_listing_details details
         ON details.listing_id = listings.id
       WHERE listings.source_id = ? AND listings.demo_record = 0
       ORDER BY listings.last_seen_at DESC LIMIT 100`,
    )
    .bind(MARKTPLAATS_SOURCE_ID)
    .all<Record<string, string | number | null>>();
  const now = Date.now();
  const listings: MarktplaatsDashboardListing[] = listingRows.results.map(
    (row) => {
      const assessment = JSON.parse(String(row.assessment_json || '{}'));
      const price = euros(Number(row.item_price_cents));
      const pickupCost = row.pickup_cost_cents
        ? {
            oneWayDistanceKm: Number(row.distance_km ?? 0),
            roundTripDistanceKm: Number(row.distance_km ?? 0) * 2,
            travelTimeHours: 0,
            fuelCost: 0,
            parking: 0,
            tolls: 0,
            travelTimeCost: 0,
            total: Number(row.pickup_cost_cents) / 100,
          }
        : null;
      const economics = conservativeMarktplaatsEconomics(price, pickupCost);
      const dropPayload = row.price_drop_json
        ? (JSON.parse(String(row.price_drop_json)) as {
            from: number;
            to: number;
            percentage: number;
          })
        : null;
      return {
        id: String(row.id),
        sourceListingId: String(row.source_listing_id),
        sourceListingUrl: String(row.source_listing_url),
        title: String(row.title),
        price,
        location: row.location ? String(row.location) : null,
        seller: row.seller_name ? String(row.seller_name) : null,
        snippet: row.public_snippet ? String(row.public_snippet) : null,
        thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : null,
        listingTimestampText: row.listing_timestamp_text
          ? String(row.listing_timestamp_text)
          : null,
        delivery: row.delivery ? String(row.delivery) : null,
        firstSeenAt: new Date(Number(row.first_seen_at)).toISOString(),
        lastSeenAt: new Date(Number(row.last_seen_at)).toISOString(),
        availability: String(
          row.status,
        ) as MarktplaatsDashboardListing['availability'],
        foundByQueries: JSON.parse(String(row.found_by_queries_json || '[]')),
        assessment,
        distanceKm: row.distance_km === null ? null : Number(row.distance_km),
        pickupCost,
        economics,
        score: Math.max(
          0,
          Math.min(49, Number(assessment.matchConfidence ?? 0) - 45),
        ),
        riskScore: Math.max(
          35,
          Math.min(100, 100 - Number(assessment.matchConfidence ?? 0) + 45),
        ),
        priority: 'REVIEW',
        isNew: now - Number(row.first_seen_at) <= 15 * 60_000,
        priceDrop: dropPayload
          ? { ...dropPayload, percentage: Math.abs(dropPayload.percentage) }
          : null,
      };
    },
  );
  return {
    accessMode: MARKTPLAATS_ACCESS_MODE,
    intervalMinutes: marktplaatsScanIntervalMinutes(
      process.env.MARKTPLAATS_SCAN_INTERVAL_MINUTES,
    ),
    status: (health?.status as MarktplaatsSourceState) ?? 'awaiting_first_scan',
    reason: health?.reason ? String(health.reason) : null,
    lastScanAt: health?.last_successful_scan_at
      ? new Date(Number(health.last_successful_scan_at)).toISOString()
      : null,
    nextScanAt: health?.next_scan_at
      ? new Date(Number(health.next_scan_at)).toISOString()
      : null,
    automaticRetryAt: health?.automatic_retry_at
      ? new Date(Number(health.automatic_retry_at)).toISOString()
      : null,
    parserConfidence:
      health?.parser_confidence_bps === null ||
      health?.parser_confidence_bps === undefined
        ? null
        : Number(health.parser_confidence_bps) / 10_000,
    metrics: {
      queries: Number(health?.queries ?? 0),
      pagesFetched: Number(health?.pages_fetched ?? 0),
      listingsParsed: Number(health?.listings_parsed ?? 0),
      newListings: Number(health?.new_listings ?? 0),
      qualified: Number(health?.qualified ?? 0),
      review: Number(health?.review ?? 0),
      duplicates: Number(health?.duplicates ?? 0),
      priceDrops: Number(health?.price_drops ?? 0),
      alerts: Number(health?.alerts ?? 0),
      errors: Number(health?.errors ?? 0),
    },
    listings,
  };
}
