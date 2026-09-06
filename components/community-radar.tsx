'use client';

import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BellRing,
  Bot,
  ChartNoAxesCombined,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Eye,
  Gauge,
  MessageCircle,
  RadioTower,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Waves,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { DiscordConnection } from '@/components/discord-connection';
import { ScoutIntegrationCredentials } from '@/components/scout-integration-credentials';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  CommunityDashboard,
  CommunityProductRadar,
  CommunitySignalType,
  ScoutResearchFinding,
} from '@/lib/community';
import { cn } from '@/lib/utils';

const eur = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
});

const integer = new Intl.NumberFormat('nl-NL');

function percent(value: number | null) {
  if (value === null) return 'Unknown';
  return `${value >= 0 ? '+' : ''}${Math.round(value)}%`;
}

function ratio(value: number | null) {
  if (value === null) return 'Awaiting evidence';
  return `${Math.round(value * 100)}%`;
}

function readableSignal(value: CommunitySignalType) {
  return value.replaceAll('_', ' ');
}

function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? 'Unknown time'
    : date.toLocaleTimeString('nl-NL', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Amsterdam',
      });
}

function dateTimeLabel(value: string | null) {
  if (!value) return 'Not yet';
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? 'Unknown time'
    : date.toLocaleString('nl-NL', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Europe/Amsterdam',
      });
}

function safeResearchUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

type WatchThresholds = {
  minimumMomentum: number;
  minimumDiscordMentions: number;
  minimumRedditMentions: number;
  minimumDivergence: number;
  maximumHypeRisk: number;
  minimumRestockMentions: number;
  minimumIndependentConfirmations: number;
  officialCatalystRequired: boolean;
};

const defaultWatchThresholds: WatchThresholds = {
  minimumMomentum: 80,
  minimumDiscordMentions: 0,
  minimumRedditMentions: 0,
  minimumDivergence: 70,
  maximumHypeRisk: 50,
  minimumRestockMentions: 0,
  minimumIndependentConfirmations: 2,
  officialCatalystRequired: false,
};

export function CommunityRadar({
  initialEventId,
  signInPath,
  userSignedIn,
}: {
  initialEventId?: string;
  signInPath: string;
  userSignedIn: boolean;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [dashboard, setDashboard] = useState<CommunityDashboard | null>(null);
  const [selected, setSelected] = useState<CommunityProductRadar | null>(null);
  const [notice, setNotice] = useState('');
  const [dialogNotice, setDialogNotice] = useState('');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [ignoredIds, setIgnoredIds] = useState<Set<string>>(() => new Set());
  const [watchedIds, setWatchedIds] = useState<Set<string>>(() => new Set());
  const [sourceFormOpen, setSourceFormOpen] = useState(false);
  const [sourcePlatform, setSourcePlatform] = useState<'reddit' | 'discord'>(
    'reddit',
  );
  const [sourceName, setSourceName] = useState('');
  const [communityId, setCommunityId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [watchThresholds, setWatchThresholds] = useState<WatchThresholds>(
    defaultWatchThresholds,
  );

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/community', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Community Radar could not be loaded.');
        return (await response.json()) as { data: CommunityDashboard };
      })
      .then((payload) => {
        if (!cancelled) {
          setDashboard(payload.data);
          if (initialEventId)
            setSelected(
              payload.data.products.find(
                (product) => product.id === initialEventId,
              ) ?? null,
            );
        }
      })
      .catch((error) => {
        if (!cancelled)
          setNotice(
            error instanceof Error
              ? error.message
              : 'Community Radar could not be loaded.',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [initialEventId, refreshKey]);

  useEffect(() => {
    const timer = setInterval(
      () => setRefreshKey((value) => value + 1),
      30_000,
    );
    return () => clearInterval(timer);
  }, []);

  const openProduct = (product: CommunityProductRadar) => {
    setDialogNotice('');
    setSelected(product);
  };

  const visibleProducts = useMemo(
    () =>
      dashboard?.products.filter((product) => !ignoredIds.has(product.id)) ??
      [],
    [dashboard, ignoredIds],
  );

  const action = async (
    id: string,
    path: string,
    body: Record<string, unknown>,
    success: string,
  ) => {
    setPendingAction(id);
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok)
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      const message = payload.message ?? success;
      if (selected) setDialogNotice(message);
      else setNotice(message);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Action failed.';
      if (selected) setDialogNotice(message);
      else setNotice(message);
      return false;
    } finally {
      setPendingAction(null);
    }
  };

  const watch = async (product: CommunityProductRadar) => {
    if (
      await action(
        `watch:${product.id}`,
        '/api/community/watch',
        { eventId: product.id, ...watchThresholds },
        'Community thresholds saved to Watchtower.',
      )
    )
      setWatchedIds((current) => new Set(current).add(product.id));
  };

  const ignore = async (product: CommunityProductRadar) => {
    if (
      await action(
        `ignore:${product.id}`,
        `/api/community/events/${encodeURIComponent(product.id)}/ignore`,
        {},
        'Community event ignored.',
      )
    ) {
      setIgnoredIds((current) => new Set(current).add(product.id));
      if (selected?.id === product.id) setSelected(null);
    }
  };

  const shadow = async (product: CommunityProductRadar) => {
    await action(
      `shadow:${product.id}`,
      '/api/community/shadow',
      { eventId: product.id },
      `Shadow Mode saved the ${product.leadTimeMinutes ?? 0}-minute community lead.`,
    );
  };

  const verify = async (product: CommunityProductRadar) => {
    await action(
      `verify:${product.id}`,
      '/api/community/verify',
      { eventId: product.id },
      'Marketplace verification complete.',
    );
  };

  const saveSource = async () => {
    const ok = await action(
      'save-source',
      '/api/community/sources',
      {
        platform: sourcePlatform,
        name: sourceName,
        externalCommunityId: communityId,
        externalChannelId: sourcePlatform === 'discord' ? channelId : null,
        enabled: true,
        games: ['Pokémon', 'Riftbound'],
        categories: ['Deals', 'Restocks', 'Prices', 'Reprints'],
      },
      'Community source saved. Credentials and permissions are still checked server-side.',
    );
    if (ok) {
      setSourceName('');
      setCommunityId('');
      setChannelId('');
      setSourceFormOpen(false);
      setRefreshKey((value) => value + 1);
    }
  };

  if (!dashboard) {
    return (
      <section className="community-loading" aria-busy={!notice}>
        {notice ? <AlertTriangle /> : <RefreshCw className="spin" />}
        <div>
          <strong>
            {notice
              ? 'Community Radar is temporarily unavailable'
              : 'Listening for permitted community signals'}
          </strong>
          <span>
            {notice || 'Loading connector health and isolated evidence…'}
          </span>
        </div>
      </section>
    );
  }

  const earlySignals = visibleProducts.filter(
    (product) => product.classification === 'EARLY_SIGNAL',
  );
  const hypeProducts = visibleProducts.filter(
    (product) => product.hypeRisk >= 55,
  );
  const confirmedProducts = visibleProducts.filter(
    (product) =>
      product.verificationStatus === 'confirmed' &&
      (product.marketEvidence.estimatedNetProfit ?? 0) >= 25,
  );
  const supplyProducts = visibleProducts.filter((product) =>
    ['SUPPLY_EXPANSION', 'SUPPLY_CONTRACTION'].includes(product.classification),
  );
  const reprintSignals = dashboard.recentSignals.filter((signal) =>
    signal.signalType.includes('REPRINT'),
  );
  const restockSignals = dashboard.recentSignals.filter((signal) =>
    ['RESTOCK_REPORT', 'LOCAL_STOCK_REPORT', 'SOLD_OUT_REPORT'].includes(
      signal.signalType,
    ),
  );

  return (
    <div className="community-radar-page">
      <section
        className="community-status-panel"
        aria-label="Community Radar status"
      >
        <div className="community-title-lockup">
          <span className="panel-kicker">
            <RadioTower /> COMMUNITY RADAR · WHISPERS &amp; SIGNALS
          </span>
          <h2>Listen early. Verify before acting.</h2>
          <p>
            Community activity changes investigation priority—not fair value.
            Market evidence and conservative economics remain authoritative.
          </p>
          <div className="community-mode-row">
            <Badge variant="outline">PRODUCTION DERIVED SIGNALS</Badge>
            <Badge variant="outline">NO COMMUNITY-ONLY BUY ALERTS</Badge>
          </div>
        </div>
        <div className="community-connector-health">
          <ConnectorHealth
            icon={MessageCircle}
            name="Reddit"
            connected={dashboard.reddit.connected}
            status={dashboard.reddit.status}
            detail={dashboard.reddit.detail}
          />
          <ConnectorHealth
            icon={Bot}
            name="Discord"
            connected={dashboard.discord.connected}
            status={dashboard.discord.status}
            detail={dashboard.discord.detail}
          />
          <ResearchImportHealth
            status={dashboard.researchImport}
            signedIn={userSignedIn}
          />
        </div>
      </section>

      <div className="discord-connect-entry">
        <DiscordConnection
          signedIn={userSignedIn}
          signInPath={signInPath}
          onRefresh={() => setRefreshKey((value) => value + 1)}
        />
        <span>
          Connect your bot and check whether real messages are arriving.
        </span>
      </div>

      {dashboard.admin ? <ScoutIntegrationCredentials /> : null}

      {notice ? (
        <output className="community-notice" aria-live="polite">
          <Activity /> {notice}
        </output>
      ) : null}

      <section
        className="community-metric-grid"
        aria-label="Community Radar metrics"
      >
        <CommunityMetric
          label="Signals 24h"
          value={integer.format(dashboard.metrics.signals24h)}
          icon={Waves}
        />
        <CommunityMetric
          label="Products trending"
          value={integer.format(dashboard.metrics.productsTrending)}
          icon={ChartNoAxesCombined}
        />
        <CommunityMetric
          label="Early signals"
          value={integer.format(dashboard.metrics.earlySignals)}
          icon={Sparkles}
        />
        <CommunityMetric
          label="Confirmed community deals"
          value={integer.format(dashboard.metrics.confirmedDeals)}
          icon={BadgeCheck}
        />
        <CommunityMetric
          label="High hype-risk products"
          value={integer.format(dashboard.metrics.highHypeRiskProducts)}
          icon={ShieldAlert}
        />
        <CommunityMetric
          label="Best lead-time source"
          value={dashboard.metrics.bestLeadTimeSource ?? 'No measured result'}
          icon={Clock3}
          compact
        />
      </section>

      <section
        className="community-section"
        aria-labelledby="trending-now-heading"
      >
        <SectionHeading
          kicker="TRENDING NOW"
          title="Attention moving faster than the market"
          detail={`${visibleProducts.length} products ranked from derived momentum, independence and reliability.`}
        />
        <div className="community-product-grid">
          {visibleProducts.map((product) => (
            <TrendingCard
              key={product.id}
              product={product}
              watched={watchedIds.has(product.id)}
              pendingAction={pendingAction}
              onInvestigate={openProduct}
              onWatch={watch}
              onIgnore={ignore}
              onShadow={shadow}
            />
          ))}
        </div>
      </section>

      <div className="community-dual-grid">
        <section
          className="community-section community-focus-panel"
          aria-labelledby="early-signals-heading"
        >
          <SectionHeading
            kicker="EARLY SIGNALS"
            title="Community ahead of price"
            detail="High divergence is an investigation priority, never an automatic trade."
          />
          {earlySignals.length ? (
            earlySignals.map((product) => (
              <SignalSummary
                key={product.id}
                product={product}
                onOpen={openProduct}
              />
            ))
          ) : (
            <EmptyEvidence label="No early signals meet the current evidence gate." />
          )}
        </section>
        <section
          className="community-section community-focus-panel danger"
          aria-labelledby="hype-risk-heading"
        >
          <SectionHeading
            kicker="HYPE RISK"
            title="Low-diversity promotion watch"
            detail="Patterns describe coordination risk without accusing individuals."
          />
          {hypeProducts.length ? (
            hypeProducts.map((product) => (
              <SignalSummary
                key={product.id}
                product={product}
                onOpen={openProduct}
                danger
              />
            ))
          ) : (
            <EmptyEvidence label="No elevated hype clusters detected." />
          )}
        </section>
      </div>

      <div className="community-dual-grid">
        <section
          className="community-section community-focus-panel"
          aria-labelledby="confirmed-community-deals-heading"
        >
          <SectionHeading
            kicker="CONFIRMED COMMUNITY DEALS"
            title="Reports supported by market evidence"
            detail="Only verified listings with conservative deal economics appear here."
          />
          {confirmedProducts.length ? (
            confirmedProducts.map((product) => (
              <EvidenceSummary
                key={product.id}
                product={product}
                onOpen={openProduct}
                kind="confirmed"
              />
            ))
          ) : (
            <EmptyEvidence label="No community report currently has verified profitable market evidence." />
          )}
        </section>
        <section
          className="community-section community-focus-panel"
          aria-labelledby="supply-signals-heading"
        >
          <SectionHeading
            kicker="SUPPLY SIGNALS"
            title="Breadth and seller-count movement"
            detail="Expansion and contraction are separated from demand chatter."
          />
          {supplyProducts.length ? (
            supplyProducts.map((product) => (
              <EvidenceSummary
                key={product.id}
                product={product}
                onOpen={openProduct}
                kind="supply"
              />
            ))
          ) : (
            <EmptyEvidence label="No supply expansion or contraction currently clears the evidence gate." />
          )}
        </section>
      </div>

      <Tabs defaultValue="signals" className="community-tabs">
        <TabsList variant="line" aria-label="Community Radar evidence sections">
          <TabsTrigger value="signals">Recent signals</TabsTrigger>
          <TabsTrigger value="restocks">Restock reports</TabsTrigger>
          <TabsTrigger value="reprints">Reprint watch</TabsTrigger>
          <TabsTrigger value="research">Scheduled research</TabsTrigger>
          <TabsTrigger value="sources">Information sources</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>
        <TabsContent value="signals">
          <SignalTable signals={dashboard.recentSignals} />
        </TabsContent>
        <TabsContent value="restocks">
          <SignalTable signals={restockSignals} />
        </TabsContent>
        <TabsContent value="reprints">
          <div className="community-reprint-grid">
            {reprintSignals.map((signal) => (
              <article className="community-reprint-card" key={signal.id}>
                <span className="signal-platform">{signal.platform}</span>
                <h3>
                  {signal.officialReference
                    ? 'REPRINT CONFIRMED REFERENCE'
                    : 'UNCONFIRMED REPRINT RUMOR'}
                </h3>
                <p>{signal.rawExcerpt}</p>
                <small>
                  {signal.officialReference
                    ? 'An allowlisted authoritative domain was referenced; the linked page still requires separate verification.'
                    : 'No authoritative source was found. Supply expansion remains unconfirmed.'}
                </small>
              </article>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="research">
          <ResearchFindingGrid findings={dashboard.researchFindings} />
        </TabsContent>
        <TabsContent value="sources">
          <SourceConfiguration
            dashboard={dashboard}
            open={sourceFormOpen}
            setOpen={setSourceFormOpen}
            platform={sourcePlatform}
            setPlatform={setSourcePlatform}
            name={sourceName}
            setName={setSourceName}
            communityId={communityId}
            setCommunityId={setCommunityId}
            channelId={channelId}
            setChannelId={setChannelId}
            pending={pendingAction === 'save-source'}
            onSave={() => void saveSource()}
          />
        </TabsContent>
        <TabsContent value="performance">
          <PerformanceDashboard dashboard={dashboard} />
        </TabsContent>
      </Tabs>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        {selected ? (
          <DialogContent className="community-detail-dialog">
            <DialogHeader>
              <span className="panel-kicker">
                <Search /> WHY IS THIS TRENDING?
              </span>
              <DialogTitle>{selected.product}</DialogTitle>
              <DialogDescription>{selected.conclusion}</DialogDescription>
            </DialogHeader>
            <WhyTrending product={selected} />
            <WatchThresholdEditor
              value={watchThresholds}
              onChange={setWatchThresholds}
            />
            {dialogNotice ? (
              <div className="community-dialog-notice" role="alert">
                <Activity />
                <span>{dialogNotice}</span>
                {!userSignedIn ? (
                  <a
                    className={buttonVariants({ variant: 'outline' })}
                    href={
                      selected
                        ? `/signin-with-chatgpt?return_to=${encodeURIComponent(
                            `/community?event=${selected.id}`,
                          )}`
                        : signInPath
                    }
                  >
                    Sign in and keep this product
                  </a>
                ) : null}
              </div>
            ) : null}
            <div className="community-dialog-actions">
              <Button
                className="gold-button"
                disabled={pendingAction === `verify:${selected.id}`}
                onClick={() => void verify(selected)}
              >
                {pendingAction === `verify:${selected.id}` ? (
                  <RefreshCw className="spin" />
                ) : (
                  <BadgeCheck />
                )}
                Verify market
              </Button>
              <Button
                variant="outline"
                className="iron-button"
                disabled={pendingAction === `watch:${selected.id}`}
                onClick={() => void watch(selected)}
              >
                <Eye /> Watch
              </Button>
              {selected.marketEvidence.sourceUrl ? (
                <a
                  className={cn(
                    buttonVariants({ variant: 'outline' }),
                    'iron-button',
                  )}
                  href={selected.marketEvidence.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink /> Open verified source
                </a>
              ) : null}
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function WatchThresholdEditor({
  value,
  onChange,
}: {
  value: WatchThresholds;
  onChange: (value: WatchThresholds) => void;
}) {
  const fields: Array<{
    key: Exclude<keyof WatchThresholds, 'officialCatalystRequired'>;
    label: string;
    max: number;
  }> = [
    { key: 'minimumMomentum', label: 'Momentum ≥', max: 100 },
    { key: 'minimumDiscordMentions', label: 'Discord mentions ≥', max: 10000 },
    { key: 'minimumRedditMentions', label: 'Reddit mentions ≥', max: 10000 },
    { key: 'minimumDivergence', label: 'Divergence ≥', max: 100 },
    { key: 'maximumHypeRisk', label: 'Hype risk ≤', max: 100 },
    { key: 'minimumRestockMentions', label: 'Restock mentions ≥', max: 10000 },
    {
      key: 'minimumIndependentConfirmations',
      label: 'Independent confirmations ≥',
      max: 1000,
    },
  ];
  return (
    <section className="community-watch-config">
      <header>
        <div>
          <span>WATCHTOWER CONDITIONS</span>
          <h3>Notify only when every configured gate passes</h3>
        </div>
        <small>Community urgency never replaces financial evidence.</small>
      </header>
      <div>
        {fields.map((field) => (
          <label key={field.key}>
            {field.label}
            <input
              type="number"
              min={0}
              max={field.max}
              value={value[field.key]}
              onChange={(event) =>
                onChange({
                  ...value,
                  [field.key]: Math.max(
                    0,
                    Math.min(field.max, Number(event.target.value) || 0),
                  ),
                })
              }
            />
          </label>
        ))}
        <label className="community-check-condition">
          <input
            type="checkbox"
            checked={value.officialCatalystRequired}
            onChange={(event) =>
              onChange({
                ...value,
                officialCatalystRequired: event.target.checked,
              })
            }
          />
          Official catalyst required
        </label>
      </div>
    </section>
  );
}

function ConnectorHealth({
  icon: Icon,
  name,
  connected,
  status,
  detail,
}: {
  icon: typeof Bot;
  name: string;
  connected: boolean;
  status: string;
  detail: string;
}) {
  return (
    <article className={cn('community-connector', connected && 'connected')}>
      <Icon />
      <div>
        <span>{name}</span>
        <strong>{connected ? 'Connected' : status.replaceAll('_', ' ')}</strong>
        <small>{detail}</small>
      </div>
      {connected ? <CheckCircle2 /> : <XCircle />}
    </article>
  );
}

function ResearchImportHealth({
  status,
  signedIn,
}: {
  status: CommunityDashboard['researchImport'];
  signedIn: boolean;
}) {
  const healthy = signedIn && status.lastRunStatus === 'completed';
  return (
    <article className={cn('community-connector', healthy && 'connected')}>
      <Search />
      <div>
        <span>Web research</span>
        <strong>
          {!signedIn
            ? 'Sign in to view imports'
            : status.lastRunStatus
              ? `Last run ${status.lastRunStatus}`
              : 'Awaiting first import'}
        </strong>
        <small>
          {signedIn
            ? `Last successful import: ${dateTimeLabel(status.lastSuccessfulImportAt)}`
            : 'Imports are isolated to your ChatGPT account.'}
        </small>
        {status.actionableError ? (
          <small className="community-research-error">
            {status.actionableError}
          </small>
        ) : null}
      </div>
      {healthy ? <CheckCircle2 /> : <AlertTriangle />}
    </article>
  );
}

function CommunityMetric({
  label,
  value,
  icon: Icon,
  compact = false,
}: {
  label: string;
  value: string;
  icon: typeof Waves;
  compact?: boolean;
}) {
  return (
    <article className="community-metric">
      <span>
        <Icon /> {label}
      </span>
      <strong className={compact ? 'compact' : undefined}>{value}</strong>
    </article>
  );
}

function SectionHeading({
  kicker,
  title,
  detail,
}: {
  kicker: string;
  title: string;
  detail: string;
}) {
  return (
    <header className="community-section-heading">
      <div>
        <span>{kicker}</span>
        <h2 id={`${kicker.toLowerCase().replaceAll(' ', '-')}-heading`}>
          {title}
        </h2>
      </div>
      <p>{detail}</p>
    </header>
  );
}

function TrendingCard({
  product,
  watched,
  pendingAction,
  onInvestigate,
  onWatch,
  onIgnore,
  onShadow,
}: {
  product: CommunityProductRadar;
  watched: boolean;
  pendingAction: string | null;
  onInvestigate: (product: CommunityProductRadar) => void;
  onWatch: (product: CommunityProductRadar) => Promise<void>;
  onIgnore: (product: CommunityProductRadar) => Promise<void>;
  onShadow: (product: CommunityProductRadar) => Promise<void>;
}) {
  const confirmedDeal =
    product.verificationStatus === 'confirmed' &&
    (product.marketEvidence.estimatedNetProfit ?? 0) >= 25;
  return (
    <article
      className={cn(
        'community-product-card',
        product.classification === 'EARLY_SIGNAL' && 'early',
        product.hypeRisk >= 75 && 'high-hype',
      )}
      data-community-event={product.id}
    >
      <header>
        <div>
          <span>{product.game}</span>
          <h3>{product.product}</h3>
        </div>
        <div className="momentum-orb">
          <strong>{product.momentumScore}</strong>
          <span>momentum</span>
        </div>
      </header>
      <div className="community-classification-row">
        <Badge variant="outline">
          {product.classification.replaceAll('_', ' ')}
        </Badge>
        <span className={cn('hype-label', product.hypeRisk >= 75 && 'danger')}>
          Hype {product.hypeRisk}/100 · {product.hypeRiskLabel}
        </span>
      </div>
      <dl className="community-product-stats">
        <div>
          <dt>Discord mentions</dt>
          <dd>{percent(product.discordChange)}</dd>
        </div>
        <div>
          <dt>Reddit mentions</dt>
          <dd>{percent(product.redditChange)}</dd>
        </div>
        <div>
          <dt>Unique authors</dt>
          <dd>{integer.format(product.uniqueAuthors)}</dd>
        </div>
        <div>
          <dt>Communities</dt>
          <dd>{integer.format(product.uniqueCommunities)}</dd>
        </div>
        <div>
          <dt>Market price</dt>
          <dd>{percent(product.priceMomentum)}</dd>
        </div>
        <div>
          <dt>Seller count</dt>
          <dd>{percent(product.sellerCountMomentum)}</dd>
        </div>
        <div>
          <dt>Stock breadth</dt>
          <dd>{percent(product.stockBreadthMomentum)}</dd>
        </div>
        <div>
          <dt>Divergence</dt>
          <dd>{product.divergenceScore}/100</dd>
        </div>
      </dl>
      <div className="community-score-bars">
        <label>
          Momentum <Progress value={product.momentumScore} />
        </label>
        <label>
          Divergence <Progress value={product.divergenceScore} />
        </label>
      </div>
      {confirmedDeal ? (
        <div className="community-confirmed-economics">
          <span>
            <BadgeCheck /> MARKET EVIDENCE CONFIRMED
          </span>
          <strong>
            {eur.format(product.marketEvidence.estimatedNetProfit ?? 0)} ·{' '}
            {ratio(product.marketEvidence.roi)} ROI
          </strong>
          <small>
            Community lead {product.leadTimeMinutes ?? 0}m · confidence{' '}
            {product.marketEvidence.confidenceGrade ?? 'ungraded'}
          </small>
        </div>
      ) : (
        <p className="community-no-buy">
          <AlertTriangle /> No buy recommendation. Market verification and
          margin are required.
        </p>
      )}
      <div className="community-card-actions">
        <Button className="gold-button" onClick={() => onInvestigate(product)}>
          <Search /> Investigate
        </Button>
        <a
          className={cn(buttonVariants({ variant: 'outline' }), 'iron-button')}
          href={`/market?productId=${encodeURIComponent(product.canonicalProductId)}`}
        >
          <ChartNoAxesCombined /> View market
        </a>
        <Button
          variant="outline"
          className="iron-button"
          onClick={() => onInvestigate(product)}
        >
          <Waves /> View signals
        </Button>
        <Button
          variant="outline"
          className="iron-button"
          disabled={watched || pendingAction === `watch:${product.id}`}
          onClick={() => void onWatch(product)}
        >
          {pendingAction === `watch:${product.id}` ? (
            <RefreshCw className="spin" />
          ) : (
            <Eye />
          )}
          {watched ? 'Watched' : 'Watch'}
        </Button>
        {confirmedDeal ? (
          <Button
            variant="outline"
            className="iron-button"
            disabled={pendingAction === `shadow:${product.id}`}
            onClick={() => void onShadow(product)}
          >
            <Gauge /> Shadow Buy
          </Button>
        ) : null}
        <Button
          variant="ghost"
          disabled={pendingAction === `ignore:${product.id}`}
          onClick={() => void onIgnore(product)}
        >
          Ignore
        </Button>
      </div>
    </article>
  );
}

function EvidenceSummary({
  product,
  onOpen,
  kind,
}: {
  product: CommunityProductRadar;
  onOpen: (product: CommunityProductRadar) => void;
  kind: 'confirmed' | 'supply';
}) {
  return (
    <button
      className={cn('community-evidence-summary', kind)}
      onClick={() => onOpen(product)}
    >
      <span>{kind === 'confirmed' ? <BadgeCheck /> : <Waves />}</span>
      <div>
        <strong>{product.product}</strong>
        <small>
          {kind === 'confirmed'
            ? `${eur.format(product.marketEvidence.estimatedNetProfit ?? 0)} estimated net · ${ratio(product.marketEvidence.roi)} ROI · +${product.leadTimeMinutes ?? 0}m lead`
            : `${product.classification.replaceAll('_', ' ')} · sellers ${percent(product.sellerCountMomentum)} · stock ${percent(product.stockBreadthMomentum)}`}
        </small>
      </div>
      <b>
        {kind === 'confirmed'
          ? product.marketEvidence.confidenceGrade
          : product.divergenceScore}
      </b>
    </button>
  );
}

function SignalSummary({
  product,
  onOpen,
  danger = false,
}: {
  product: CommunityProductRadar;
  onOpen: (product: CommunityProductRadar) => void;
  danger?: boolean;
}) {
  return (
    <button
      className={cn('community-signal-summary', danger && 'danger')}
      onClick={() => onOpen(product)}
    >
      <span>{danger ? <ShieldAlert /> : <Sparkles />}</span>
      <div>
        <strong>{product.product}</strong>
        <small>{product.conclusion}</small>
      </div>
      <b>{danger ? product.hypeRisk : product.divergenceScore}</b>
    </button>
  );
}

function EmptyEvidence({ label }: { label: string }) {
  return <p className="community-empty-evidence">{label}</p>;
}

function SignalTable({
  signals,
}: {
  signals: CommunityDashboard['recentSignals'];
}) {
  return (
    <section
      className="community-signal-table"
      aria-label="Recent community signals"
    >
      <header>
        <span>TIME</span>
        <span>SOURCE</span>
        <span>SIGNAL</span>
        <span>EVIDENCE</span>
        <span>STATUS</span>
      </header>
      {signals.map((signal) => (
        <article key={signal.id} data-community-signal={signal.id}>
          <time>{timeLabel(signal.occurredAt)}</time>
          <div>
            <strong>{signal.platform}</strong>
            <small>{signal.community}</small>
          </div>
          <div>
            <strong>{readableSignal(signal.signalType)}</strong>
            <small>{signal.product ?? 'Unresolved product'}</small>
          </div>
          <p>{signal.rawExcerpt}</p>
          <Badge variant="outline">
            {signal.officialReference
              ? 'official reference'
              : signal.verificationStatus.replaceAll('_', ' ')}
          </Badge>
        </article>
      ))}
    </section>
  );
}

function researchPrice(finding: ScoutResearchFinding) {
  if (finding.price === null || finding.currency === null)
    return 'Price unknown';
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: finding.currency,
  }).format(finding.price);
}

function researchLabel(value: string) {
  return value.replaceAll('_', ' ');
}

function verificationLabel(value: ScoutResearchFinding['verificationStatus']) {
  if (value === 'retailer_checked') return 'Retailer checked';
  if (value === 'official_checked') return 'Official source checked';
  return 'Community report';
}

function ResearchFindingGrid({
  findings,
}: {
  findings: ScoutResearchFinding[];
}) {
  if (!findings.length)
    return (
      <EmptyEvidence label="No scheduled-research findings have been imported for this account." />
    );
  return (
    <section
      className="community-research-grid"
      aria-label="ChatGPT scheduled research findings"
    >
      {findings.map((finding) => {
        const sourceUrl = safeResearchUrl(finding.sourceUrl);
        const evidenceUrl = safeResearchUrl(
          finding.verificationEvidenceUrl ?? finding.retailerOrOfficialUrl,
        );
        return (
          <article className="community-research-card" key={finding.id}>
            <header>
              <div>
                <span className="signal-platform">Scheduled research</span>
                <h3>{finding.productName ?? 'Unknown product'}</h3>
                <small>
                  {finding.game === 'pokemon' ? 'Pokémon' : 'Riftbound'}
                  {finding.productLanguage
                    ? ` · ${finding.productLanguage}`
                    : ''}
                </small>
              </div>
              <Badge variant="outline">
                {researchLabel(finding.updateType)}
              </Badge>
            </header>
            <p>{finding.summary}</p>
            <dl>
              <div>
                <dt>Price</dt>
                <dd>{researchPrice(finding)}</dd>
              </div>
              <div>
                <dt>Region</dt>
                <dd>{finding.region ?? 'Unknown'}</dd>
              </div>
              <div>
                <dt>Availability</dt>
                <dd>{researchLabel(finding.availability)}</dd>
              </div>
              <div>
                <dt>Ships to NL</dt>
                <dd>{researchLabel(finding.shippingToNetherlands)}</dd>
              </div>
              <div>
                <dt>Verification</dt>
                <dd>{verificationLabel(finding.verificationStatus)}</dd>
              </div>
              <div>
                <dt>Observed</dt>
                <dd>{dateTimeLabel(finding.observedAt)}</dd>
              </div>
            </dl>
            <footer>
              {sourceUrl ? (
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                  Original source <ExternalLink />
                </a>
              ) : (
                <span>Source URL unavailable</span>
              )}
              {evidenceUrl && evidenceUrl !== sourceUrl ? (
                <a href={evidenceUrl} target="_blank" rel="noopener noreferrer">
                  Verification evidence <ExternalLink />
                </a>
              ) : null}
            </footer>
          </article>
        );
      })}
    </section>
  );
}

function SourceConfiguration({
  dashboard,
  open,
  setOpen,
  platform,
  setPlatform,
  name,
  setName,
  communityId,
  setCommunityId,
  channelId,
  setChannelId,
  pending,
  onSave,
}: {
  dashboard: CommunityDashboard;
  open: boolean;
  setOpen: (value: boolean) => void;
  platform: 'reddit' | 'discord';
  setPlatform: (value: 'reddit' | 'discord') => void;
  name: string;
  setName: (value: string) => void;
  communityId: string;
  setCommunityId: (value: string) => void;
  channelId: string;
  setChannelId: (value: string) => void;
  pending: boolean;
  onSave: () => void;
}) {
  return (
    <section className="community-sources-panel">
      <div className="community-source-list">
        <div className="community-source-health-grid">
          <SourceHealthSummary dashboard={dashboard} platform="reddit" />
          <SourceHealthSummary dashboard={dashboard} platform="discord" />
        </div>
        {dashboard.sources.map((source) => (
          <article key={source.id} className="community-source-card">
            <div className="community-source-icon">
              {source.platform === 'discord' ? <Bot /> : <MessageCircle />}
            </div>
            <div>
              <span>{source.platform}</span>
              <h3>{source.name}</h3>
              <p>
                {source.games.join(' · ')} · {source.categories.join(' · ')}
              </p>
              <small>
                {source.platform === 'discord'
                  ? `Guild ${source.guildId ?? 'not set'} · channel ${source.channelId ?? 'not set'}`
                  : `15-minute incremental scan · ${source.rateLimitRemaining ?? 'unknown'} rate-limit remaining`}
              </small>
            </div>
            <dl>
              <div>
                <dt>Reliability</dt>
                <dd>
                  {source.reliability === null
                    ? 'Unrated'
                    : `${source.reliability}%`}
                </dd>
              </div>
              <div>
                <dt>Median lead</dt>
                <dd>
                  {source.medianLeadMinutes === null
                    ? 'Unmeasured'
                    : `+${source.medianLeadMinutes}m`}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{source.status.replaceAll('_', ' ')}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      <div className="community-source-config">
        <header>
          <div>
            <span className="panel-kicker">
              <RadioTower /> COMMUNITY SOURCE
            </span>
            <h3>Explicit access only</h3>
          </div>
          <Button className="gold-button" onClick={() => setOpen(!open)}>
            {open ? 'Cancel' : 'Add source'}
          </Button>
        </header>
        <p>
          Reddit uses official OAuth with incremental cursors. Discord ingests
          only allowlisted guilds and channels through an official bot;
          message-content permission is validated separately.
        </p>
        {open ? (
          <div className="community-source-form">
            <label>
              Platform
              <select
                value={platform}
                onChange={(event) =>
                  setPlatform(event.target.value as 'reddit' | 'discord')
                }
              >
                <option value="reddit">Reddit</option>
                <option value="discord">Discord</option>
              </select>
            </label>
            <label>
              Name
              <input
                value={name}
                maxLength={200}
                onChange={(event) => setName(event.target.value)}
                placeholder="EU restock reports"
              />
            </label>
            <label>
              {platform === 'discord' ? 'Guild ID' : 'Community name'}
              <input
                value={communityId}
                maxLength={200}
                onChange={(event) => setCommunityId(event.target.value)}
                placeholder={
                  platform === 'discord'
                    ? '123456789012345678'
                    : 'community_name'
                }
              />
            </label>
            {platform === 'discord' ? (
              <label>
                Channel ID
                <input
                  value={channelId}
                  maxLength={30}
                  onChange={(event) => setChannelId(event.target.value)}
                  placeholder="123456789012345678"
                />
              </label>
            ) : null}
            <Button
              className="gold-button"
              disabled={
                pending ||
                !name.trim() ||
                !communityId.trim() ||
                (platform === 'discord' && !channelId.trim())
              }
              onClick={onSave}
            >
              {pending ? <RefreshCw className="spin" /> : <RadioTower />}
              Save allowlisted source
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SourceHealthSummary({
  dashboard,
  platform,
}: {
  dashboard: CommunityDashboard;
  platform: 'reddit' | 'discord';
}) {
  const connector = dashboard[platform];
  const sources = dashboard.sources.filter(
    (source) => source.platform === platform,
  );
  const productionSources = sources.filter(
    (source) => source.dataMode === 'production',
  );
  const latest = [...sources]
    .filter((source) => source.lastSignalAt)
    .sort(
      (left, right) =>
        Date.parse(right.lastSignalAt ?? '') -
        Date.parse(left.lastSignalAt ?? ''),
    )[0];
  const error = productionSources.find((source) => source.lastError)?.lastError;
  return (
    <article className="community-source-health">
      <header>
        {platform === 'reddit' ? <MessageCircle /> : <Bot />}
        <div>
          <span>{platform}</span>
          <strong>{connector.status.replaceAll('_', ' ')}</strong>
        </div>
      </header>
      <dl>
        <div>
          <dt>
            {platform === 'reddit' ? 'Communities monitored' : 'Guilds allowed'}
          </dt>
          <dd>
            {
              new Set(
                productionSources.map((source) =>
                  platform === 'reddit' ? source.name : source.guildId,
                ),
              ).size
            }
          </dd>
        </div>
        <div>
          <dt>
            {platform === 'reddit' ? 'Scan interval' : 'Channels allowed'}
          </dt>
          <dd>
            {platform === 'reddit'
              ? '15m'
              : new Set(productionSources.map((source) => source.channelId))
                  .size}
          </dd>
        </div>
        <div>
          <dt>{platform === 'reddit' ? 'Rate limit' : 'Message content'}</dt>
          <dd>
            {platform === 'reddit'
              ? (productionSources.find(
                  (source) => source.rateLimitRemaining !== null,
                )?.rateLimitRemaining ?? 'unverified')
              : latest?.lastSignalAt
                ? 'observed'
                : 'unverified'}
          </dd>
        </div>
        <div>
          <dt>Last event</dt>
          <dd>
            {latest?.lastSignalAt ? timeLabel(latest.lastSignalAt) : 'none'}
          </dd>
        </div>
        <div>
          <dt>Signals today</dt>
          <dd>
            {integer.format(
              productionSources.reduce(
                (total, source) => total + source.signalsToday,
                0,
              ),
            )}
          </dd>
        </div>
        <div>
          <dt>Errors</dt>
          <dd>{error ?? 'none recorded'}</dd>
        </div>
      </dl>
      <p>{connector.detail}</p>
    </article>
  );
}

function PerformanceDashboard({
  dashboard,
}: {
  dashboard: CommunityDashboard;
}) {
  const performance = dashboard.performance;
  const platformRows = (['discord', 'reddit'] as const).map((platform) => {
    const signals = dashboard.recentSignals.filter(
      (signal) => signal.platform === platform,
    );
    return {
      label: platform,
      total: signals.length,
      verified: signals.filter(
        (signal) => signal.verificationStatus === 'confirmed',
      ).length,
    };
  });
  const typeRows = Object.entries(
    dashboard.recentSignals.reduce<Record<string, number>>((counts, signal) => {
      counts[signal.signalType] = (counts[signal.signalType] ?? 0) + 1;
      return counts;
    }, {}),
  )
    .sort(([, left], [, right]) => right - left)
    .slice(0, 5)
    .map(([label, total]) => ({ label, total }));
  const gameRows = [
    ...new Set(dashboard.products.map((product) => product.game)),
  ].map((game) => {
    const products = dashboard.products.filter(
      (product) => product.game === game,
    );
    return {
      label: game,
      total: products.length,
      detail: `${Math.round(
        products.reduce((total, product) => total + product.momentumScore, 0) /
          products.length,
      )} avg momentum`,
    };
  });
  const confidenceRows = [
    {
      label: 'A · 90–100',
      total: dashboard.recentSignals.filter((signal) => signal.confidence >= 90)
        .length,
    },
    {
      label: 'B · 75–89',
      total: dashboard.recentSignals.filter(
        (signal) => signal.confidence >= 75 && signal.confidence < 90,
      ).length,
    },
    {
      label: 'Review · <75',
      total: dashboard.recentSignals.filter((signal) => signal.confidence < 75)
        .length,
    },
  ];
  return (
    <section className="community-performance">
      <div className="community-performance-grid">
        <CommunityMetric
          label="Signals detected"
          value={integer.format(performance.signalsDetected)}
          icon={RadioTower}
        />
        <CommunityMetric
          label="Verified signal rate"
          value={ratio(performance.verifiedRate)}
          icon={BadgeCheck}
        />
        <CommunityMetric
          label="False signal rate"
          value={ratio(performance.falseSignalRate)}
          icon={XCircle}
        />
        <CommunityMetric
          label="Median verification"
          value={
            performance.medianVerificationMinutes === null
              ? 'Unmeasured'
              : `${Math.round(performance.medianVerificationMinutes)}m`
          }
          icon={Clock3}
        />
        <CommunityMetric
          label="Median lead time"
          value={
            performance.medianLeadMinutes === null
              ? 'Unmeasured'
              : `+${Math.round(performance.medianLeadMinutes)}m`
          }
          icon={Sparkles}
        />
        <CommunityMetric
          label="Profitable confirmed"
          value={ratio(performance.profitableConfirmedRate)}
          icon={BadgeCheck}
        />
        <CommunityMetric
          label="Average move after signal"
          value={ratio(performance.averagePriceMove24h)}
          icon={ChartNoAxesCombined}
        />
      </div>
      <div className="community-performance-breakdowns">
        <PerformanceBreakdown title="By platform" rows={platformRows} />
        <PerformanceBreakdown title="By signal type" rows={typeRows} />
        <PerformanceBreakdown title="By game" rows={gameRows} />
        <PerformanceBreakdown title="By confidence" rows={confidenceRows} />
      </div>
      <div className="community-performance-note">
        <Gauge />
        <div>
          <strong>Edge must be measured, not assumed.</strong>
          <p>
            Community detection, verification timing and later price
            observations are stored separately so Shadow Mode can determine
            whether earlier action actually helped.
          </p>
        </div>
      </div>
    </section>
  );
}

function PerformanceBreakdown({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    label: string;
    total: number;
    verified?: number;
    detail?: string;
  }>;
}) {
  return (
    <section className="community-performance-breakdown">
      <h3>{title}</h3>
      {rows.map((row) => (
        <div key={row.label}>
          <span>{row.label.replaceAll('_', ' ')}</span>
          <strong>{row.total}</strong>
          <small>
            {row.detail ??
              (row.verified === undefined
                ? 'derived records'
                : `${row.verified} verified`)}
          </small>
        </div>
      ))}
    </section>
  );
}

function WhyTrending({ product }: { product: CommunityProductRadar }) {
  const topSignals = Object.entries(product.signalCounts)
    .sort(([, left], [, right]) => Number(right) - Number(left))
    .slice(0, 5);
  return (
    <div className="why-trending">
      <div className="why-trending-metrics">
        <div>
          <span>Momentum</span>
          <strong>{product.momentumScore}</strong>
        </div>
        <div>
          <span>Divergence</span>
          <strong>{product.divergenceScore}</strong>
        </div>
        <div>
          <span>Hype risk</span>
          <strong>{product.hypeRisk}</strong>
        </div>
        <div>
          <span>Reliability</span>
          <strong>{product.sourceReliability}</strong>
        </div>
      </div>
      <section>
        <h3>Signal composition</h3>
        <div className="signal-composition">
          {topSignals.map(([type, count]) => (
            <span key={type}>
              <b>{count}</b> {type.replaceAll('_', ' ').toLowerCase()}
            </span>
          ))}
        </div>
      </section>
      <section>
        <h3>Source distribution</h3>
        <div className="source-distribution">
          {product.sourceDistribution.map((source) => (
            <div key={`${source.platform}:${source.source}`}>
              <span>
                {source.platform} · {source.source}
              </span>
              <strong>{source.mentions}</strong>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3>Signal timeline</h3>
        <ol className="community-timeline">
          {product.timeline.map((item) => (
            <li key={item.id} className={item.status}>
              <time>{timeLabel(item.at)}</time>
              <span />
              <div>
                <strong>{item.label}</strong>
                <small>{item.source}</small>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="market-evidence-summary">
        <h3>Market changes</h3>
        <dl>
          <div>
            <dt>Observed item</dt>
            <dd>
              {product.marketEvidence.itemPrice === null
                ? 'Unknown'
                : eur.format(product.marketEvidence.itemPrice)}
            </dd>
          </div>
          <div>
            <dt>Delivered NL</dt>
            <dd>
              {product.marketEvidence.deliveredPrice === null
                ? 'Unknown'
                : eur.format(product.marketEvidence.deliveredPrice)}
            </dd>
          </div>
          <div>
            <dt>Conservative exit</dt>
            <dd>
              {product.marketEvidence.conservativeExit === null
                ? 'Unknown'
                : eur.format(product.marketEvidence.conservativeExit)}
            </dd>
          </div>
          <div>
            <dt>Seller count</dt>
            <dd>{percent(product.sellerCountMomentum)}</dd>
          </div>
          <div>
            <dt>Stock breadth</dt>
            <dd>{percent(product.stockBreadthMomentum)}</dd>
          </div>
          <div>
            <dt>Lead time</dt>
            <dd>
              {product.leadTimeMinutes === null
                ? 'Unmeasured'
                : `+${product.leadTimeMinutes}m`}
            </dd>
          </div>
        </dl>
      </section>
      <p className="community-safety-note">
        <BellRing /> Community adjustment is capped at ±10 score points and can
        never turn negative economics into profit.
      </p>
    </div>
  );
}
