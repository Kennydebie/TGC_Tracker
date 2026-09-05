import { getD1 } from '@/db';
import { getConnector } from '@/lib/connectors/registry';
import { validateSourceListingUrl } from '@/lib/listing-url';
import { rejectCrossSiteMutation } from '@/lib/security';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = rejectCrossSiteMutation(request);
  if (blocked) return blocked;
  const { id } = await params;
  const db = getD1();
  const listing = await db
    .prepare(
      `SELECT id, source_listing_id, source_marketplace, source_listing_url,
              item_price_cents, shipping_cents, currency
       FROM listings WHERE id = ? AND demo_record = 0`,
    )
    .bind(id)
    .first<{
      id: string;
      source_listing_id: string;
      source_marketplace: string;
      source_listing_url: string;
      item_price_cents: number;
      shipping_cents: number | null;
      currency: string;
    }>();
  if (!listing)
    return Response.json({ error: 'Deal not found' }, { status: 404 });
  validateSourceListingUrl(
    listing.source_marketplace,
    listing.source_listing_url,
  );
  const connector = getConnector(listing.source_marketplace);
  if (!connector?.getListing)
    return Response.json(
      { error: 'Listing recheck is not configured for this source' },
      { status: 424 },
    );
  try {
    const current = await connector.getListing(listing.source_listing_id);
    const checkedAt = new Date().toISOString();
    if (!current) {
      await db
        .prepare(
          `UPDATE listings SET availability_status = 'unavailable',
             status = 'inactive', last_verified_at = ?, last_seen_at = ?
           WHERE id = ?`,
        )
        .bind(Date.parse(checkedAt), Date.parse(checkedAt), id)
        .run();
      return Response.json({
        dataMode: 'production',
        dealId: id,
        availabilityStatus: 'unavailable',
        lastVerifiedAt: checkedAt,
        sourceListingUrl: listing.source_listing_url,
        priceChanged: false,
        shippingChanged: false,
      });
    }
    const itemPriceCents = Math.round(current.itemPrice * 100);
    const shippingCents =
      current.shipping === null ? null : Math.round(current.shipping * 100);
    validateSourceListingUrl(
      current.sourceMarketplace,
      current.sourceListingUrl,
    );
    const priceChanged = itemPriceCents !== listing.item_price_cents;
    const shippingChanged = shippingCents !== listing.shipping_cents;
    const availabilityStatus = priceChanged
      ? 'price_changed'
      : shippingChanged
        ? 'shipping_changed'
        : 'available';
    const contentHash = `${itemPriceCents}:${shippingCents}:${availabilityStatus}`;
    await db.batch([
      db
        .prepare(
          `UPDATE listings SET item_price_cents = ?, shipping_cents = ?,
             source_listing_url = ?, url = ?, availability_status = ?,
             last_verified_at = ?, last_seen_at = ? WHERE id = ?`,
        )
        .bind(
          itemPriceCents,
          shippingCents,
          current.sourceListingUrl,
          current.sourceListingUrl,
          availabilityStatus,
          Date.parse(checkedAt),
          Date.parse(checkedAt),
          id,
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
          crypto.randomUUID(),
          id,
          itemPriceCents,
          shippingCents,
          current.currency,
          availabilityStatus,
          contentHash,
          Date.parse(checkedAt),
        ),
    ]);
    return Response.json({
      dataMode: 'production',
      dealId: id,
      availabilityStatus,
      lastVerifiedAt: checkedAt,
      observedItemPrice: current.itemPrice,
      observedShipping: current.shipping,
      observedAllInCost:
        current.shipping === null ? null : current.itemPrice + current.shipping,
      sourceListingUrl: current.sourceListingUrl,
      priceChanged,
      shippingChanged,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Recheck failed' },
      { status: 502 },
    );
  }
}
