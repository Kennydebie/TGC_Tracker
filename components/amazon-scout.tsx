'use client';

import {
  AlertTriangle,
  BellRing,
  Boxes,
  Clock3,
  ExternalLink,
  Eye,
  History,
  KeyRound,
  PackageCheck,
  Radar,
  ShieldCheck,
  ShoppingBag,
  Store,
  Telescope,
  TrendingDown,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { NativeNavigationLink } from '@/components/native-navigation-link';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AMAZON_MARKETPLACES,
  DEFAULT_AMAZON_MARKETS,
  buildAmazonProductUrl,
  isAllowedAmazonProductUrl,
  type AmazonDashboard,
  type AmazonMarketplaceCode,
  type AmazonOpportunity,
} from '@/lib/amazon';
import { money, percent } from '@/lib/domain';
import { cn } from '@/lib/utils';

const emptyDashboard: AmazonDashboard = {
  sourceState: 'key_required',
  apiConnected: false,
  dataMode: 'fixture',
  keyAvailable: false,
  reason: 'Loading Amazon Scout source state…',
  markets: DEFAULT_AMAZON_MARKETS,
  keepaMarkets: ['DE', 'FR', 'IT', 'ES'],
  unsupportedKeepaMarkets: ['NL', 'BE'],
  watchedIntervalMinutes: 15,
  discoveryIntervalMinutes: 180,
  lastScanAt: null,
  nextWatchedScanAt: null,
  nextDiscoveryScanAt: null,
  tokens: {
    available: null,
    usedThisScan: 0,
    refillRatePerMinute: null,
    nextSafeScanAt: null,
    skipped: 0,
  },
  metrics: {
    productsMonitored: 0,
    productsChecked: 0,
    priceChanges: 0,
    priceDrops: 0,
    newProducts: 0,
    qualified: 0,
    errors: 0,
  },
  opportunities: [],
};

type WatchRule = {
  id: string;
  asin: string | null;
  marketplace: string | null;
  sourceUrl: string | null;
};

function dateTime(value: string | null) {
  if (!value) return 'Awaiting scan';
  return new Intl.DateTimeFormat('nl-NL', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Amsterdam',
  }).format(new Date(value));
}

function price(value: number | null) {
  return value === null ? 'Unknown' : money(value);
}

function statusLabel(state: AmazonDashboard['sourceState']) {
  return {
    connected: 'Connected',
    key_required: 'Keepa API key required',
    invalid_key: 'Keepa key rejected',
    token_limited: 'Token reserve active',
    rate_limited: 'Keepa rate limited',
    error: 'Awaiting authenticated scan',
  }[state];
}

export function AmazonScout() {
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [watchRules, setWatchRules] = useState<WatchRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [market, setMarket] = useState<'ALL' | AmazonMarketplaceCode>('ALL');
  const [manualUrl, setManualUrl] = useState('');
  const [savingWatch, setSavingWatch] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [historyRange, setHistoryRange] = useState('90d');

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/amazon', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Amazon Scout status is unavailable.');
        return (await response.json()) as {
          data: AmazonDashboard;
          watchRules?: WatchRule[];
        };
      })
      .then((payload) => {
        if (cancelled) return;
        setDashboard(payload.data);
        setWatchRules(payload.watchRules ?? []);
      })
      .catch((reason) => {
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : 'Amazon Scout failed to load.',
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const opportunities = useMemo(
    () =>
      dashboard.opportunities.filter(
        (item) => market === 'ALL' || item.marketplace === market,
      ),
    [dashboard.opportunities, market],
  );
  const groups = useMemo(
    () => ({
      best: opportunities.filter((item) => item.qualified || item.score >= 65),
      drops: opportunities.filter((item) => item.priceDropPercentage !== null),
      lows: opportunities.filter(
        (item) =>
          item.history.historicalPercentile !== null &&
          item.history.historicalPercentile <= 10,
      ),
      restocks: opportunities.filter((item) => item.isRestock),
      discovered: opportunities.filter((item) => item.newlyDiscovered),
      review: opportunities.filter((item) => item.reviewRequired),
      watched: opportunities.filter((item) => item.watched),
    }),
    [opportunities],
  );
  const comparisonProduct =
    dashboard.opportunities.find(
      (item) => item.canonicalProductId === 'pokemon-prismatic-etb',
    )?.canonicalProductId ?? dashboard.opportunities[0]?.canonicalProductId;
  const comparison = dashboard.opportunities.filter(
    (item) => item.canonicalProductId === comparisonProduct,
  );
  const cheapest = comparison
    .filter((item) => item.deliveredPrice !== null)
    .sort(
      (left, right) =>
        Number(left.deliveredPrice) - Number(right.deliveredPrice),
    )[0];

  const saveWatch = async (url: string) => {
    setSavingWatch(true);
    setNotice(null);
    try {
      const response = await fetch('/api/amazon/watch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, ruleType: 'monitor' }),
      });
      const payload = (await response.json()) as {
        data?: WatchRule;
        message?: string;
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error ?? 'Watch rule could not be saved.');
      if (payload.data)
        setWatchRules((current) => [payload.data as WatchRule, ...current]);
      setManualUrl('');
      setNotice(payload.message ?? 'Amazon ASIN added to your watchlist.');
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : 'Watch rule could not be saved.',
      );
    } finally {
      setSavingWatch(false);
    }
  };

  const shadowBuy = async (opportunity: AmazonOpportunity) => {
    try {
      const response = await fetch('/api/amazon/shadow', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: opportunity.id }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(payload.error ?? 'Shadow Buy could not be saved.');
      setNotice(
        `${opportunity.product} saved to Shadow Mode for 7, 30 and 90-day review.`,
      );
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : 'Shadow Buy could not be saved.',
      );
    }
  };

  return (
    <div className="page-stack amazon-page">
      <section
        className={cn(
          'panel amazon-status-panel',
          !dashboard.apiConnected && 'key-required',
        )}
        aria-label="Amazon Scout status"
      >
        <div className="amazon-status-copy">
          <span className="panel-kicker">
            <ShoppingBag /> AMAZON SCOUT · MERCHANT REALMS
          </span>
          <h2>{statusLabel(dashboard.sourceState)}</h2>
          <p>
            Official Keepa API intelligence · manual Amazon handoff only · no
            Amazon HTML scraping, login or checkout automation.
          </p>
          <div className="amazon-mode-row">
            <Badge variant={dashboard.apiConnected ? 'default' : 'outline'}>
              {dashboard.apiConnected
                ? 'Live Keepa authenticated'
                : 'API not connected'}
            </Badge>
            <Badge variant="outline">
              {dashboard.dataMode === 'fixture'
                ? 'FIXTURE DATA · isolated'
                : 'PRODUCTION DATA'}
            </Badge>
          </div>
          {dashboard.reason ? (
            <div className="source-warning" role="alert">
              <KeyRound /> <span>{dashboard.reason}</span>
            </div>
          ) : null}
          {error ? (
            <div className="source-warning" role="alert">
              <AlertTriangle /> <span>{error}</span>
            </div>
          ) : null}
          {notice ? <output className="amazon-notice">{notice}</output> : null}
        </div>
        <dl className="amazon-status-facts">
          <div>
            <dt>Markets</dt>
            <dd>{dashboard.markets.join(' · ')}</dd>
          </div>
          <div>
            <dt>Keepa coverage</dt>
            <dd>{dashboard.keepaMarkets.join(' · ')}</dd>
          </div>
          <div>
            <dt>Watched ASIN scan</dt>
            <dd>Every {dashboard.watchedIntervalMinutes} min</dd>
          </div>
          <div>
            <dt>Discovery</dt>
            <dd>Every {dashboard.discoveryIntervalMinutes / 60}h</dd>
          </div>
          <div>
            <dt>Last authenticated scan</dt>
            <dd>{dateTime(dashboard.lastScanAt)}</dd>
          </div>
          <div>
            <dt>Tokens</dt>
            <dd>
              {dashboard.tokens.available === null
                ? 'Unavailable'
                : `${dashboard.tokens.available.toLocaleString('nl-NL')} available`}
            </dd>
          </div>
        </dl>
      </section>

      <section
        className="amazon-metrics"
        aria-label="Latest Amazon scan metrics"
      >
        <AmazonMetric
          label="Products monitored"
          value={dashboard.metrics.productsMonitored}
        />
        <AmazonMetric
          label="Products checked"
          value={dashboard.metrics.productsChecked}
        />
        <AmazonMetric
          label="Price changes"
          value={dashboard.metrics.priceChanges}
        />
        <AmazonMetric
          label="Price drops"
          value={dashboard.metrics.priceDrops}
        />
        <AmazonMetric
          label="New products"
          value={dashboard.metrics.newProducts}
        />
        <AmazonMetric label="Qualified" value={dashboard.metrics.qualified} />
      </section>

      <section className="panel amazon-watch-console">
        <div>
          <span className="panel-kicker">
            <Telescope /> MANUAL AMAZON URL MODE
          </span>
          <h3>Watch an official Amazon product URL</h3>
          <p>
            The ASIN and marketplace are extracted locally. No Amazon page is
            fetched. NL and BE watches are saved for a future supported
            provider; Keepa currently covers DE, FR, IT and ES here.
          </p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveWatch(manualUrl);
          }}
        >
          <label htmlFor="amazon-url">Amazon product URL</label>
          <div>
            <Input
              id="amazon-url"
              placeholder="https://www.amazon.de/dp/B0…"
              value={manualUrl}
              onChange={(event) => setManualUrl(event.target.value)}
            />
            <Button disabled={savingWatch || !manualUrl.trim()} type="submit">
              <BellRing /> {savingWatch ? 'Saving…' : 'Add to Watchlist'}
            </Button>
          </div>
        </form>
      </section>

      <section
        className="amazon-toolbar"
        aria-label="Amazon marketplace filter"
      >
        <label htmlFor="amazon-market">Marketplace</label>
        <select
          id="amazon-market"
          value={market}
          onChange={(event) =>
            setMarket(event.target.value as 'ALL' | AmazonMarketplaceCode)
          }
        >
          <option value="ALL">All EU markets</option>
          {dashboard.markets.map((code) => (
            <option key={code} value={code}>
              {AMAZON_MARKETPLACES[code].label}
            </option>
          ))}
        </select>
        <span>
          {opportunities.length} displayed · {watchRules.length} personal URL
          watches
        </span>
      </section>

      <section
        className="panel amazon-arbitrage"
        aria-label="EU market comparison"
      >
        <div className="section-heading">
          <div>
            <span className="eyebrow">EU MARKET ARBITRAGE</span>
            <h2>
              {comparison[0]?.product ?? 'Awaiting comparable Amazon offers'}
            </h2>
          </div>
          {cheapest ? (
            <Badge>CHEAPEST DELIVERED · {cheapest.marketplace}</Badge>
          ) : (
            <Badge variant="outline">Delivered cost unresolved</Badge>
          )}
        </div>
        <div className="amazon-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Marketplace</th>
                <th>Item</th>
                <th>Shipping</th>
                <th>Delivered NL</th>
                <th>Seller</th>
                <th>90d median</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.markets.map((code) => {
                const offer = comparison.find(
                  (item) => item.marketplace === code,
                );
                return (
                  <tr
                    key={code}
                    className={offer?.id === cheapest?.id ? 'cheapest' : ''}
                  >
                    <td>{AMAZON_MARKETPLACES[code].label}</td>
                    <td>{price(offer?.currentPrice ?? null)}</td>
                    <td>
                      {offer
                        ? `${price(offer.shipping)} · ${offer.shippingStatus}`
                        : 'No fixture observation'}
                    </td>
                    <td>{price(offer?.deliveredPrice ?? null)}</td>
                    <td>{offer?.sellerType.replaceAll('_', ' ') ?? '—'}</td>
                    <td>{price(offer?.history.median90d ?? null)}</td>
                    <td>
                      {offer
                        ? offer.freshness
                        : code === 'NL' || code === 'BE'
                          ? 'No Keepa coverage'
                          : 'Not observed'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="amazon-table-note">
          EU rows add no invented import duty. Estimated shipping remains
          visibly estimated; unknown shipping produces no delivered price.
        </p>
      </section>

      <Tabs defaultValue="best" className="amazon-tabs">
        <TabsList variant="line" aria-label="Amazon opportunity groups">
          <TabsTrigger value="best">Best deals</TabsTrigger>
          <TabsTrigger value="drops">Price drops</TabsTrigger>
          <TabsTrigger value="lows">Historical low</TabsTrigger>
          <TabsTrigger value="restocks">Restocks</TabsTrigger>
          <TabsTrigger value="discovered">New</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
          <TabsTrigger value="watched">Watched</TabsTrigger>
        </TabsList>
        <AmazonGroup
          value="best"
          title="BEST AMAZON DEALS"
          items={groups.best}
          {...groupActions()}
        />
        <AmazonGroup
          value="drops"
          title="PRICE DROPS"
          items={groups.drops}
          {...groupActions()}
        />
        <AmazonGroup
          value="lows"
          title="NEAR HISTORICAL LOW"
          items={groups.lows}
          {...groupActions()}
        />
        <AmazonGroup
          value="restocks"
          title="NEW RESTOCKS"
          items={groups.restocks}
          {...groupActions()}
        />
        <AmazonGroup
          value="discovered"
          title="NEWLY DISCOVERED"
          items={groups.discovered}
          {...groupActions()}
        />
        <AmazonGroup
          value="review"
          title="NEEDS REVIEW"
          items={groups.review}
          {...groupActions()}
        />
        <AmazonGroup
          value="watched"
          title="WATCHED PRODUCTS"
          items={groups.watched}
          {...groupActions()}
        />
      </Tabs>

      <section className="panel amazon-compliance">
        <ShieldCheck />
        <p>
          Keepa timestamps are not checkout guarantees. TCG Scout never buys,
          selects quantity, submits payment, or treats an active
          Amazon/Cardmarket ask as completed-sale evidence. Fixture exit values
          are modelled and explicitly isolated from production evidence.
        </p>
      </section>
    </div>
  );

  function groupActions() {
    return {
      loading,
      expanded,
      historyRange,
      onHistoryRange: setHistoryRange,
      onInspect: (item: AmazonOpportunity) =>
        setExpanded((current) => (current === item.id ? null : item.id)),
      onWatch: (item: AmazonOpportunity) =>
        void saveWatch(item.sourceListingUrl),
      onShadow: (item: AmazonOpportunity) => void shadowBuy(item),
    };
  }
}

function AmazonMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel amazon-metric">
      <span>{label}</span>
      <strong>{value.toLocaleString('nl-NL')}</strong>
    </div>
  );
}

type AmazonGroupProps = {
  value: string;
  title: string;
  items: AmazonOpportunity[];
  loading: boolean;
  expanded: string | null;
  historyRange: string;
  onHistoryRange: (value: string) => void;
  onInspect: (item: AmazonOpportunity) => void;
  onWatch: (item: AmazonOpportunity) => void;
  onShadow: (item: AmazonOpportunity) => void;
};

function AmazonGroup({
  value,
  title,
  items,
  loading,
  ...actions
}: AmazonGroupProps) {
  return (
    <TabsContent value={value}>
      <div className="section-heading amazon-group-heading">
        <div>
          <span className="eyebrow">Merchant Realms</span>
          <h2>{title}</h2>
        </div>
        <Badge variant="outline">{items.length}</Badge>
      </div>
      {loading ? (
        <div className="panel amazon-empty">Loading Amazon source state…</div>
      ) : items.length ? (
        <div className="amazon-card-grid">
          {items.map((item) => (
            <AmazonOpportunityCard key={item.id} item={item} {...actions} />
          ))}
        </div>
      ) : (
        <div className="panel amazon-empty">
          No opportunities in this group for the selected marketplace.
        </div>
      )}
    </TabsContent>
  );
}

function AmazonOpportunityCard({
  item,
  expanded,
  historyRange,
  onHistoryRange,
  onInspect,
  onWatch,
  onShadow,
}: Omit<AmazonGroupProps, 'value' | 'title' | 'items' | 'loading'> & {
  item: AmazonOpportunity;
}) {
  const safeUrl = isAllowedAmazonProductUrl(item.sourceListingUrl)
    ? buildAmazonProductUrl(item.asin, item.marketplace)
    : null;
  const historyMaximum = Math.max(
    ...item.history.points.map((point) => point.price),
    item.currentPrice ?? 1,
  );
  return (
    <article
      className={cn(
        'panel amazon-opportunity-card',
        item.qualified && 'qualified',
        item.reviewRequired && 'review',
      )}
      data-amazon-opportunity={item.id}
    >
      <div className="amazon-card-head">
        <div>
          <span className="eyebrow">
            {item.game} · {AMAZON_MARKETPLACES[item.marketplace].label}
          </span>
          <h3>{item.product}</h3>
          <code>{item.asin}</code>
        </div>
        <div className="amazon-card-badges">
          <Badge>{item.score} OPPORTUNITY</Badge>
          <Badge variant="outline">
            {item.dataMode === 'fixture' ? 'FIXTURE' : 'PRODUCTION'}
          </Badge>
        </div>
      </div>
      <div className="amazon-price-hero">
        <strong>{price(item.currentPrice)}</strong>
        <span>
          Delivered NL <b>{price(item.deliveredPrice)}</b>
        </span>
        {item.priceDropPercentage !== null ? (
          <em>
            <TrendingDown /> {price(item.previousPrice)} →{' '}
            {price(item.currentPrice)} · -{percent(item.priceDropPercentage)}
          </em>
        ) : null}
      </div>
      <dl className="amazon-card-facts">
        <div>
          <dt>Seller</dt>
          <dd>
            <Store /> {item.sellerType.replaceAll('_', ' ')}
          </dd>
        </div>
        <div>
          <dt>Shipping</dt>
          <dd>
            {price(item.shipping)} · {item.shippingStatus}
          </dd>
        </div>
        <div>
          <dt>90d median</dt>
          <dd>{price(item.history.median90d)}</dd>
        </div>
        <div>
          <dt>Historical percentile</dt>
          <dd>
            {item.history.historicalPercentile === null
              ? 'Unknown'
              : `${item.history.historicalPercentile}% · lower than ${100 - item.history.historicalPercentile}%`}
          </dd>
        </div>
        <div>
          <dt>Seller count</dt>
          <dd>
            {item.sellerCount ?? 'Unknown'}
            {item.sellerCountChange === null
              ? ''
              : ` (${item.sellerCountChange > 0 ? '+' : ''}${item.sellerCountChange})`}
          </dd>
        </div>
        <div>
          <dt>Quantity</dt>
          <dd>
            <Boxes /> {item.quantity.units ?? '?'} ·{' '}
            {item.quantity.canonicalUnit}
          </dd>
        </div>
        <div>
          <dt>Conservative exit</dt>
          <dd>
            {price(item.economics.conservativeExit)} ·{' '}
            {item.economics.preferredExit}
          </dd>
        </div>
        <div>
          <dt>Profit / ROI</dt>
          <dd>
            {price(item.economics.conservativeProfit)} ·{' '}
            {item.economics.roi === null
              ? 'Unknown'
              : percent(item.economics.roi)}
          </dd>
        </div>
        <div>
          <dt>MSRP</dt>
          <dd>{item.msrpStatus}</dd>
        </div>
        <div>
          <dt>Freshness</dt>
          <dd>
            <Clock3 /> {item.freshness} · {item.ageMinutes ?? '?'} min
          </dd>
        </div>
      </dl>
      <div className="amazon-confidence">
        <span>Canonical match</span>
        <Progress value={item.matchConfidence} />
        <strong>{item.matchConfidence}%</strong>
      </div>
      <div className="amazon-risk-row">
        <Badge variant="outline">Risk {item.risk}/100</Badge>
        <Badge variant="outline">Liquidity {item.liquidity}</Badge>
        <Badge variant="outline">Language {item.productLanguage}</Badge>
        {item.reviewRequired ? (
          <Badge className="warning-badge">NEEDS REVIEW</Badge>
        ) : null}
      </div>
      {expanded === item.id ? (
        <section
          className="amazon-inspection"
          aria-label={`Inspect ${item.product}`}
        >
          <div className="amazon-history-head">
            <span>
              <History /> Price history
            </span>
            <div>
              {['24h', '7d', '30d', '90d', '1y'].map((range) => (
                <button
                  className={historyRange === range ? 'active' : ''}
                  key={range}
                  onClick={() => onHistoryRange(range)}
                  type="button"
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          <div
            className="amazon-sparkline"
            aria-label={`${historyRange} price history`}
          >
            {item.history.points.map((point) => (
              <span
                key={point.at}
                style={{
                  height: `${Math.max(8, (point.price / historyMaximum) * 100)}%`,
                }}
                title={`${dateTime(point.at)} · ${price(point.price)}`}
              />
            ))}
          </div>
          <p>
            <PackageCheck /> Expected price {price(item.currentPrice)} · last
            Keepa update {item.ageMinutes ?? 'unknown'} minutes ago · offer
            freshness {item.freshness}. Checkout price and shipping are not
            guaranteed.
          </p>
          <p>
            Evidence: {item.economics.exitEvidence.replaceAll('_', ' ')} ·
            maximum item {price(item.economics.maximumAmazonItemPrice)} ·
            maximum delivered{' '}
            {price(item.economics.maximumAmazonDeliveredPrice)}.
          </p>
          {item.riskFlags.length ? (
            <ul>
              {item.riskFlags.map((flag) => (
                <li key={flag}>{flag.replaceAll('_', ' ')}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      <div className="amazon-card-actions">
        <Button variant="outline" onClick={() => onInspect(item)}>
          <Eye /> {expanded === item.id ? 'Close' : 'Inspect'}
        </Button>
        <Button variant="outline" onClick={() => onWatch(item)}>
          <Telescope /> Watch
        </Button>
        {safeUrl ? (
          <NativeNavigationLink
            className={buttonVariants()}
            href={safeUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink /> Open Amazon
          </NativeNavigationLink>
        ) : null}
        <Button variant="outline" onClick={() => onShadow(item)}>
          <Radar /> Shadow Buy
        </Button>
      </div>
    </article>
  );
}
