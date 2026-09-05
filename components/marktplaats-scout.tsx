'use client';

import {
  AlertTriangle,
  Clock3,
  ExternalLink,
  MapPin,
  Radar,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { NativeNavigationLink } from '@/components/native-navigation-link';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  isAllowedMarktplaatsListingUrl,
  MARKTPLAATS_UGLY_QUERIES,
  type MarktplaatsDashboard,
  type MarktplaatsDashboardListing,
} from '@/lib/marktplaats';
import { money, percent } from '@/lib/domain';
import { cn } from '@/lib/utils';

const emptyDashboard: MarktplaatsDashboard = {
  accessMode: 'public_monitor',
  intervalMinutes: 15,
  status: 'awaiting_first_scan',
  reason: null,
  lastScanAt: null,
  nextScanAt: null,
  automaticRetryAt: null,
  parserConfidence: null,
  metrics: {
    queries: 0,
    pagesFetched: 0,
    listingsParsed: 0,
    newListings: 0,
    qualified: 0,
    review: 0,
    duplicates: 0,
    priceDrops: 0,
    alerts: 0,
    errors: 0,
  },
  listings: [],
};

function dateTime(value: string | null) {
  if (!value) return 'Awaiting first scan';
  return new Intl.DateTimeFormat('nl-NL', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Amsterdam',
  }).format(new Date(value));
}

function statusLabel(status: MarktplaatsDashboard['status']) {
  return {
    healthy: 'Healthy',
    paused: 'Paused',
    blocked: 'Blocked',
    parser_review_required: 'Parser review required',
    awaiting_first_scan: 'Awaiting first scan',
  }[status];
}

export function MarktplaatsScout() {
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/marktplaats', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Marktplaats status is unavailable.');
        return (await response.json()) as { data: MarktplaatsDashboard };
      })
      .then(({ data }) => {
        if (cancelled) return;
        setDashboard(data);
        const critical = data.listings.find(
          (listing) => listing.priority === 'CRITICAL' && listing.isNew,
        );
        if (
          critical &&
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted'
        )
          new Notification('🔥 MARKTPLAATS HUNT', {
            body: `${critical.title} · ${critical.price === null ? 'Price on request' : money(critical.price)}`,
          });
      })
      .catch((reason) => {
        if (!cancelled)
          setError(
            reason instanceof Error ? reason.message : 'Status load failed.',
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const groups = useMemo(() => {
    const ugly = new Set<string>(MARKTPLAATS_UGLY_QUERIES);
    return {
      new: dashboard.listings.filter((listing) => listing.isNew),
      best: dashboard.listings.filter(
        (listing) => listing.priority !== 'REVIEW',
      ),
      local: dashboard.listings.filter((listing) =>
        /ophalen/i.test(listing.delivery ?? ''),
      ),
      ugly: dashboard.listings.filter((listing) =>
        listing.foundByQueries.some((query) => ugly.has(query)),
      ),
      drops: dashboard.listings.filter((listing) => listing.priceDrop),
      review: dashboard.listings.filter(
        (listing) => listing.priority === 'REVIEW',
      ),
    };
  }, [dashboard.listings]);

  const blocked = ['blocked', 'paused', 'parser_review_required'].includes(
    dashboard.status,
  );
  return (
    <div className="page-stack marktplaats-page">
      <section
        className={cn('panel marktplaats-status-panel', blocked && 'blocked')}
        aria-label="Marktplaats Scout status"
      >
        <div className="marktplaats-status-copy">
          <span className="panel-kicker">
            <Radar /> MARKTPLAATS SCOUT
          </span>
          <h2>{statusLabel(dashboard.status)}</h2>
          <p>
            Public search pages only · one request at a time · no login,
            messaging, bidding or checkout automation.
          </p>
          {dashboard.reason ? (
            <div className="source-warning" role="alert">
              <AlertTriangle />
              <span>{dashboard.reason}</span>
            </div>
          ) : null}
          {error ? (
            <div className="source-warning" role="alert">
              <AlertTriangle /> <span>{error}</span>
            </div>
          ) : null}
          <div className="marktplaats-status-actions">
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => {
                setError(null);
                setLoading(true);
                setRefreshKey((current) => current + 1);
              }}
            >
              <RefreshCw className={cn(loading && 'spin')} />
              Refresh status
            </Button>
            <NativeNavigationLink
              className={buttonVariants({ variant: 'outline' })}
              href="/marketplaces?source=connections&configure=marktplaats-public"
            >
              Setup & recovery
            </NativeNavigationLink>
          </div>
        </div>
        <dl className="marktplaats-status-facts">
          <div>
            <dt>Access mode</dt>
            <dd>Public monitor</dd>
          </div>
          <div>
            <dt>Scan interval</dt>
            <dd>{dashboard.intervalMinutes} minutes</dd>
          </div>
          <div>
            <dt>Last scan</dt>
            <dd>{dateTime(dashboard.lastScanAt)}</dd>
          </div>
          <div>
            <dt>{blocked ? 'Automatic retry' : 'Next scan'}</dt>
            <dd>
              {dateTime(
                blocked ? dashboard.automaticRetryAt : dashboard.nextScanAt,
              )}
            </dd>
          </div>
        </dl>
      </section>

      {!dashboard.lastScanAt ? (
        <output className="panel marktplaats-first-scan">
          <Clock3 />
          <div>
            <strong>No completed scan has been recorded yet</strong>
            <p>
              Refreshing checks stored status only; it does not trigger a public
              source request. Scheduled scans run server-side. Open Setup &amp;
              recovery to verify the deployment configuration.
            </p>
          </div>
        </output>
      ) : null}

      <section className="marktplaats-metrics" aria-label="Latest scan metrics">
        <Metric label="Queries" value={dashboard.metrics.queries} />
        <Metric
          label="Listings scanned"
          value={dashboard.metrics.listingsParsed}
        />
        <Metric label="New listings" value={dashboard.metrics.newListings} />
        <Metric label="Qualified" value={dashboard.metrics.qualified} />
        <Metric label="Review" value={dashboard.metrics.review} />
        <Metric label="Price drops" value={dashboard.metrics.priceDrops} />
      </section>

      <section className="panel marktplaats-compliance">
        <ShieldCheck />
        <p>
          Public-page monitoring may be restricted by the source. The monitor
          stops automatically on access blocks and does not bypass anti-bot
          controls. Active asking prices are not treated as completed sales.
        </p>
      </section>

      <Tabs defaultValue="new" className="marktplaats-tabs">
        <TabsList variant="line" aria-label="Marktplaats listing groups">
          <TabsTrigger value="new">New in 15 min</TabsTrigger>
          <TabsTrigger value="best">Best deals</TabsTrigger>
          <TabsTrigger value="local">Local pickup</TabsTrigger>
          <TabsTrigger value="ugly">Ugly listings</TabsTrigger>
          <TabsTrigger value="drops">Price drops</TabsTrigger>
          <TabsTrigger value="review">Needs review</TabsTrigger>
        </TabsList>
        <ListingGroup
          value="new"
          title="NEW IN LAST 15 MINUTES"
          listings={groups.new}
          loading={loading}
          hasCompletedScan={Boolean(dashboard.lastScanAt)}
        />
        <ListingGroup
          value="best"
          title="BEST DEALS"
          listings={groups.best}
          loading={loading}
          hasCompletedScan={Boolean(dashboard.lastScanAt)}
        />
        <ListingGroup
          value="local"
          title="LOCAL PICKUP"
          listings={groups.local}
          loading={loading}
          hasCompletedScan={Boolean(dashboard.lastScanAt)}
        />
        <ListingGroup
          value="ugly"
          title="UGLY LISTINGS"
          listings={groups.ugly}
          loading={loading}
          hasCompletedScan={Boolean(dashboard.lastScanAt)}
        />
        <ListingGroup
          value="drops"
          title="PRICE DROPS"
          listings={groups.drops}
          loading={loading}
          hasCompletedScan={Boolean(dashboard.lastScanAt)}
        />
        <ListingGroup
          value="review"
          title="NEEDS REVIEW"
          listings={groups.review}
          loading={loading}
          hasCompletedScan={Boolean(dashboard.lastScanAt)}
        />
      </Tabs>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel marktplaats-metric">
      <span>{label}</span>
      <strong>{value.toLocaleString('nl-NL')}</strong>
    </div>
  );
}

function ListingGroup({
  value,
  title,
  listings,
  loading,
  hasCompletedScan,
}: {
  value: string;
  title: string;
  listings: MarktplaatsDashboardListing[];
  loading: boolean;
  hasCompletedScan: boolean;
}) {
  return (
    <TabsContent value={value}>
      <div className="section-heading marktplaats-group-heading">
        <div>
          <span className="eyebrow">Local market hunt</span>
          <h2>{title}</h2>
        </div>
        <Badge variant="outline">{listings.length}</Badge>
      </div>
      {loading ? (
        <div className="panel marktplaats-empty">Loading scan history…</div>
      ) : listings.length ? (
        <div className="marktplaats-listing-grid">
          {listings.map((listing) => (
            <MarktplaatsListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : (
        <div className="panel marktplaats-empty">
          {hasCompletedScan
            ? 'No listings in this group from the latest completed scan.'
            : 'No completed scan exists yet; this is not a zero-result scan.'}
        </div>
      )}
    </TabsContent>
  );
}

function MarktplaatsListingCard({
  listing,
}: {
  listing: MarktplaatsDashboardListing;
}) {
  const safeUrl = isAllowedMarktplaatsListingUrl(listing.sourceListingUrl)
    ? listing.sourceListingUrl
    : null;
  return (
    <article
      className="panel marktplaats-listing-card"
      id={listing.sourceListingId}
    >
      <div className="marktplaats-listing-head">
        <div>
          <span className="eyebrow">
            {listing.assessment.game} · {listing.assessment.productType}
          </span>
          <h3>{listing.title}</h3>
        </div>
        <Badge className={listing.priority === 'REVIEW' ? 'warning-badge' : ''}>
          {listing.priority}
        </Badge>
      </div>
      <div className="marktplaats-price-row">
        <strong>
          {listing.price === null ? 'Price on request' : money(listing.price)}
        </strong>
        {listing.priceDrop ? (
          <span className="price-drop">
            <TrendingDown /> {money(listing.priceDrop.from)} →{' '}
            {money(listing.priceDrop.to)} · -
            {percent(listing.priceDrop.percentage)}
          </span>
        ) : null}
      </div>
      <p className="marktplaats-snippet">
        {listing.snippet ?? 'No public description snippet was available.'}
      </p>
      <dl className="marktplaats-listing-facts">
        <div>
          <dt>Location</dt>
          <dd>
            <MapPin /> {listing.location ?? 'Not displayed'}
          </dd>
        </div>
        <div>
          <dt>Listing age</dt>
          <dd>
            <Clock3 /> {listing.listingTimestampText ?? 'Unknown'}
          </dd>
        </div>
        <div>
          <dt>Distance</dt>
          <dd>
            {listing.distanceKm === null
              ? 'Not available'
              : `${listing.distanceKm} km`}
          </dd>
        </div>
        <div>
          <dt>Pickup cost</dt>
          <dd>
            {listing.pickupCost
              ? money(listing.pickupCost.total)
              : 'Needs distance'}
          </dd>
        </div>
        <div>
          <dt>All-in cost</dt>
          <dd>
            {listing.economics
              ? money(listing.economics.allInCost)
              : 'Price required'}
          </dd>
        </div>
        <div>
          <dt>Net profit</dt>
          <dd>
            {listing.economics
              ? `${money(listing.economics.conservativeProfit)} · no sold evidence`
              : 'Not calculated'}
          </dd>
        </div>
      </dl>
      <div className="marktplaats-confidence">
        <span>Product match</span>
        <Progress value={listing.assessment.matchConfidence} />
        <strong>{listing.assessment.matchConfidence}%</strong>
      </div>
      <div className="marktplaats-tags">
        <Badge variant="outline">Score {listing.score}</Badge>
        <Badge variant="outline">Risk {listing.riskScore}</Badge>
        <Badge variant="outline">
          {listing.delivery ?? 'Delivery unknown'}
        </Badge>
        <Badge variant="outline">{listing.availability}</Badge>
      </div>
      {listing.assessment.riskFlags.length ? (
        <div className="marktplaats-risk-flags">
          <AlertTriangle /> {listing.assessment.riskFlags.join(' · ')}
        </div>
      ) : null}
      <div className="button-row">
        {safeUrl ? (
          <NativeNavigationLink
            className="marktplaats-open-button"
            href={safeUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            <ExternalLink /> OPEN ON MARKTPLAATS
          </NativeNavigationLink>
        ) : (
          <span className="marktplaats-url-blocked">Source URL rejected</span>
        )}
        <details className="marktplaats-inspect">
          <summary>INSPECT</summary>
          <div>
            <strong>Evidence boundary</strong>
            <p>
              This is an observed active asking price. No completed-sale
              evidence is attached, so conservative exit value remains zero and
              the listing cannot become Critical.
            </p>
            <span>Seller: {listing.seller ?? 'Not displayed'}</span>
            <span>
              Found by: {listing.foundByQueries.join(', ') || 'Unknown query'}
            </span>
          </div>
        </details>
      </div>
    </article>
  );
}
