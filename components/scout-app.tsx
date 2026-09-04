'use client';

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Boxes,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Cog,
  Compass,
  Eye,
  FileSearch,
  Filter,
  Gauge,
  HandCoins,
  HeartPulse,
  Info,
  LayoutDashboard,
  ListFilter,
  MapPin,
  Menu,
  PackageCheck,
  Radar,
  RefreshCw,
  Scale,
  Search,
  ShieldAlert,
  Sparkles,
  Table2,
  Telescope,
  TrendingUp,
  Upload,
  UserRound,
  Vault,
  WandSparkles,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { ScoutCrest, RuneDivider } from '@/components/brand';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  deals,
  portfolio,
  releases,
  reviewItems as fixtureReviewItems,
  shadowTrades,
  sources,
} from '@/lib/fixtures';
import { money, percent, qualifiesForQuickFlip, type Deal } from '@/lib/domain';

type Section =
  | 'dashboard'
  | 'deals'
  | 'lot-lab'
  | 'market'
  | 'releases'
  | 'scanner'
  | 'watchlist'
  | 'shadow'
  | 'portfolio'
  | 'alerts'
  | 'sources'
  | 'review'
  | 'settings';

type ScoutAppProps = {
  initialSection?: string;
  initialDealId?: string;
  user?: { displayName: string; email: string } | null;
  signInPath?: string;
  signOutPath?: string;
};

const navItems: {
  section: Section;
  label: string;
  subtitle: string;
  href: string;
  icon: typeof Compass;
}[] = [
  {
    section: 'dashboard',
    label: 'Scout Board',
    subtitle: 'Market overview',
    href: '/',
    icon: LayoutDashboard,
  },
  {
    section: 'deals',
    label: 'Bounty Board',
    subtitle: 'Deal finder',
    href: '/deals',
    icon: Compass,
  },
  {
    section: 'lot-lab',
    label: 'Lot Lab',
    subtitle: 'Underwrite collections',
    href: '/lot-lab',
    icon: Boxes,
  },
  {
    section: 'market',
    label: 'Market Search',
    subtitle: 'Compare listings',
    href: '/market',
    icon: Search,
  },
  {
    section: 'releases',
    label: 'Release Codex',
    subtitle: 'Upcoming sets',
    href: '/releases',
    icon: BookOpen,
  },
  {
    section: 'scanner',
    label: 'Scrying Lens',
    subtitle: 'Scan a card',
    href: '/scanner',
    icon: Camera,
  },
  {
    section: 'portfolio',
    label: 'The Vault',
    subtitle: 'Inventory & results',
    href: '/portfolio',
    icon: Vault,
  },
  {
    section: 'watchlist',
    label: 'Watchtower',
    subtitle: 'Tracked products',
    href: '/watchlist',
    icon: Telescope,
  },
  {
    section: 'shadow',
    label: 'Shadow Mode',
    subtitle: 'Validate the edge',
    href: '/shadow',
    icon: Eye,
  },
  {
    section: 'alerts',
    label: 'Alerts',
    subtitle: 'Rules & activity',
    href: '/alerts',
    icon: Bell,
  },
  {
    section: 'sources',
    label: 'Market Realms',
    subtitle: 'Source health',
    href: '/sources',
    icon: Radar,
  },
  {
    section: 'review',
    label: 'Review Queue',
    subtitle: 'Uncertain records',
    href: '/review',
    icon: FileSearch,
  },
  {
    section: 'settings',
    label: 'Settings',
    subtitle: 'Rules & preferences',
    href: '/settings',
    icon: Cog,
  },
];

const pageMeta: Record<Section, { title: string; subtitle: string }> = {
  dashboard: { title: 'Scout Board', subtitle: 'Market overview' },
  deals: {
    title: 'Bounty Board',
    subtitle: 'Underpriced listings that survive the costs',
  },
  'lot-lab': {
    title: 'Lot Lab',
    subtitle: 'Conservative collection underwriting',
  },
  market: {
    title: 'Market Search',
    subtitle: 'Compare evidence, not just asking prices',
  },
  releases: {
    title: 'Release Codex',
    subtitle: 'Official releases, restocks and supply changes',
  },
  scanner: {
    title: 'Scrying Lens',
    subtitle: 'Identify a card or sealed product',
  },
  watchlist: {
    title: 'Watchtower',
    subtitle: 'Tracked products and target prices',
  },
  shadow: {
    title: 'Shadow Mode',
    subtitle: 'Measure what would really have happened',
  },
  portfolio: {
    title: 'The Vault',
    subtitle: 'Inventory, cash-out value and realised results',
  },
  alerts: {
    title: 'Alerts',
    subtitle: 'High-signal rules with strict confidence gates',
  },
  sources: {
    title: 'Market Realms',
    subtitle: 'Connector access, freshness and compliance',
  },
  review: {
    title: 'Review Queue',
    subtitle: 'Human decisions where automation is uncertain',
  },
  settings: {
    title: 'Settings',
    subtitle: 'Region, scoring and notification thresholds',
  },
};

const validSections = new Set(navItems.map((item) => item.section));

export function ScoutApp({
  initialSection = 'dashboard',
  initialDealId,
  user,
  signInPath = '/signin-with-chatgpt?return_to=%2F',
  signOutPath = '/signout-with-chatgpt?return_to=%2F',
}: ScoutAppProps) {
  const section = validSections.has(initialSection as Section)
    ? (initialSection as Section)
    : 'dashboard';
  const [trackedIds, setTrackedIds] = useState(
    () => new Set(deals.filter((item) => item.tracked).map((item) => item.id)),
  );
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(() =>
    initialDealId
      ? (deals.find((item) => item.id === initialDealId) ?? null)
      : null,
  );
  const [notice, setNotice] = useState(
    'Demo Mode uses fictional, isolated market records.',
  );

  const toggleTrack = (id: string) => {
    setTrackedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
        setNotice('Removed from Watchtower.');
      } else {
        next.add(id);
        setNotice('Added to Watchtower. Price and listing alerts are active.');
      }
      return next;
    });
  };

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: WebMCPTool) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => undefined);
      } catch {
        // WebMCP is an optional browser capability; the visible app remains complete.
      }
    };
    register({
      name: 'list_qualified_deals',
      title: 'List qualified TCG deals',
      description:
        'Return demo opportunities that pass the conservative quick-flip purchase gate.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute() {
        return deals.filter(qualifiesForQuickFlip).map((item) => ({
          id: item.id,
          product: item.canonicalProduct,
          allInCost: item.economics.allInCost,
          conservativeProfit: item.economics.conservativeProfit,
          roi: item.economics.roi,
          confidenceGrade: item.confidenceGrade,
          riskScore: item.riskScore,
        }));
      },
    });
    register({
      name: 'inspect_deal_economics',
      title: 'Inspect deal economics',
      description:
        'Return the cost, exit, risk and evidence details for one visible demo deal.',
      inputSchema: {
        type: 'object',
        properties: { dealId: { type: 'string' } },
        required: ['dealId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input) {
        const dealId =
          typeof input === 'object' && input && 'dealId' in input
            ? String(input.dealId)
            : '';
        const item = deals.find((candidate) => candidate.id === dealId);
        if (!item) throw new Error('Unknown dealId');
        setSelectedDeal(item);
        return {
          id: item.id,
          product: item.canonicalProduct,
          economics: item.economics,
          evidence: item.priceEvidence,
          risks: item.risks,
          passesQuickFlipGate: qualifiesForQuickFlip(item),
        };
      },
    });
    register({
      name: 'track_deal',
      title: 'Track a TCG deal',
      description:
        'Add one visible demo deal to the Watchtower and update the interface.',
      inputSchema: {
        type: 'object',
        properties: { dealId: { type: 'string' } },
        required: ['dealId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const dealId =
          typeof input === 'object' && input && 'dealId' in input
            ? String(input.dealId)
            : '';
        const item = deals.find((candidate) => candidate.id === dealId);
        if (!item) throw new Error('Unknown dealId');
        setTrackedIds((current) => new Set(current).add(dealId));
        setNotice(`${item.canonicalProduct} added to Watchtower.`);
        return { dealId, tracked: true };
      },
    });
    return () => lifecycle.abort();
  }, []);

  return (
    <div className="app-shell">
      <aside className="guild-sidebar">
        <BrandBlock />
        <nav aria-label="Primary navigation" className="guild-nav">
          {navItems.map((item) => (
            <NavLink
              active={section === item.section}
              item={item}
              key={item.section}
            />
          ))}
        </nav>
        <div className="realm-mini">
          <span className="pulse-dot" />
          <div>
            <strong>Demo realm</strong>
            <small>3 sources reporting</small>
          </div>
          <span className="mono">94%</span>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="mobile-menu">
            <Sheet>
              <SheetTrigger
                render={
                  <Button
                    aria-label="Open navigation"
                    variant="outline"
                    size="icon"
                  />
                }
              >
                <Menu />
              </SheetTrigger>
              <SheetContent side="left" className="mobile-sheet">
                <SheetHeader>
                  <SheetTitle>
                    <span className="display-font">TCG Scout</span>
                  </SheetTitle>
                  <SheetDescription>
                    Market intelligence workspace
                  </SheetDescription>
                </SheetHeader>
                <nav className="guild-nav mobile-guild-nav">
                  {navItems.map((item) => (
                    <NavLink
                      active={section === item.section}
                      item={item}
                      key={item.section}
                    />
                  ))}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
          <div className="page-heading">
            <span className="eyebrow">{pageMeta[section].subtitle}</span>
            <h1>{pageMeta[section].title}</h1>
          </div>
          <label className="market-search">
            <Search aria-hidden="true" />
            <input
              aria-label="Search cards, products, sets or listings"
              placeholder="Search the market…"
            />
            <kbd>⌘ K</kbd>
          </label>
          <div className="top-actions">
            <Badge className="demo-badge">
              <Sparkles /> Demo Mode
            </Badge>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label="View alerts"
                    variant="outline"
                    size="icon"
                  />
                }
              >
                <Bell />
              </TooltipTrigger>
              <TooltipContent>1 critical alert</TooltipContent>
            </Tooltip>
            <Select defaultValue="EUR">
              <SelectTrigger className="currency-select" aria-label="Currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EUR">EUR €</SelectItem>
                <SelectItem value="GBP">GBP £</SelectItem>
                <SelectItem value="USD">USD $</SelectItem>
              </SelectContent>
            </Select>
            <Account
              user={user}
              signInPath={signInPath}
              signOutPath={signOutPath}
            />
          </div>
        </header>

        <output className="status-ribbon" aria-live="polite">
          <Info aria-hidden="true" />
          <span>{notice}</span>
          <button aria-label="Dismiss message" onClick={() => setNotice('')}>
            {notice ? <X /> : null}
          </button>
        </output>

        <main className="main-content">
          {section === 'dashboard' && (
            <Dashboard
              onInspect={setSelectedDeal}
              onTrack={toggleTrack}
              trackedIds={trackedIds}
            />
          )}
          {section === 'deals' && (
            <DealsPage
              onInspect={setSelectedDeal}
              onTrack={toggleTrack}
              trackedIds={trackedIds}
            />
          )}
          {section === 'lot-lab' && <LotLab onNotice={setNotice} />}
          {section === 'market' && (
            <MarketPage onTrack={toggleTrack} trackedIds={trackedIds} />
          )}
          {section === 'releases' && <ReleasesPage onNotice={setNotice} />}
          {section === 'scanner' && <ScannerPage onNotice={setNotice} />}
          {section === 'portfolio' && <PortfolioPage onNotice={setNotice} />}
          {section === 'watchlist' && (
            <WatchlistPage
              onInspect={setSelectedDeal}
              onTrack={toggleTrack}
              trackedIds={trackedIds}
            />
          )}
          {section === 'shadow' && <ShadowPage />}
          {section === 'alerts' && <AlertsPage onNotice={setNotice} />}
          {section === 'sources' && <SourcesPage onNotice={setNotice} />}
          {section === 'review' && <ReviewPage onNotice={setNotice} />}
          {section === 'settings' && <SettingsPage onNotice={setNotice} />}
        </main>
      </div>

      <MobileBottomNav active={section} />
      <DealDetailDialog
        deal={selectedDeal}
        onOpenChange={(open) => !open && setSelectedDeal(null)}
        onNotice={setNotice}
        onTrack={toggleTrack}
        tracked={selectedDeal ? trackedIds.has(selectedDeal.id) : false}
      />
    </div>
  );
}

function BrandBlock() {
  return (
    <Link className="brand-block" href="/" aria-label="TCG Scout home">
      <ScoutCrest />
      <div>
        <strong>TCG SCOUT</strong>
        <small>Market intelligence</small>
      </div>
    </Link>
  );
}

function NavLink({
  active,
  item,
}: {
  active: boolean;
  item: (typeof navItems)[number];
}) {
  const Icon = item.icon;
  return (
    <Link
      className={cn('guild-link', active && 'active')}
      href={item.href}
      aria-current={active ? 'page' : undefined}
    >
      <span className="nav-medallion">
        <Icon />
      </span>
      <span>
        <strong>{item.label}</strong>
        <small>{item.subtitle}</small>
      </span>
      {active && <span className="active-rune" aria-hidden="true" />}
    </Link>
  );
}

function Account({
  user,
  signInPath,
  signOutPath,
}: {
  user?: ScoutAppProps['user'];
  signInPath: string;
  signOutPath: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            className="account-chip"
            href={user ? signOutPath : signInPath}
            target="_top"
            aria-label={user ? 'Account and sign out' : 'Sign in with ChatGPT'}
          />
        }
      >
        <span className="avatar">
          {user ? user.displayName.slice(0, 2).toUpperCase() : <UserRound />}
        </span>
        <span className="account-copy">
          <strong>{user?.displayName ?? 'Demo Scout'}</strong>
          <small>{user ? 'Signed in' : 'Sign in to persist'}</small>
        </span>
        <ChevronDown />
      </TooltipTrigger>
      <TooltipContent>
        {user ? user.email : 'Sign in with ChatGPT'}
      </TooltipContent>
    </Tooltip>
  );
}

function MobileBottomNav({ active }: { active: Section }) {
  const items = navItems.filter((item) =>
    ['dashboard', 'deals', 'market', 'scanner', 'alerts'].includes(
      item.section,
    ),
  );
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            className={cn(
              active === item.section && 'active',
              item.section === 'scanner' && 'scan-action',
            )}
            href={item.href}
            key={item.section}
          >
            <Icon />
            <span>{item.label.split(' ')[0]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Panel({
  children,
  className,
  parchment = false,
}: {
  children: React.ReactNode;
  className?: string;
  parchment?: boolean;
}) {
  return (
    <section
      className={cn('arcane-panel', parchment && 'parchment-panel', className)}
    >
      {children}
    </section>
  );
}

function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function ProductGlyph({
  deal: item,
  compact = false,
}: {
  deal: Deal;
  compact?: boolean;
}) {
  return (
    <div
      className={cn('product-glyph', `tint-${item.tint}`, compact && 'compact')}
      aria-label={`${item.canonicalProduct} placeholder image`}
    >
      <div className="card-sigil">
        <span>{item.game === 'Pokémon' ? 'PKM' : 'RFB'}</span>
        <WandSparkles />
      </div>
      {!compact && <small>{item.set}</small>}
    </div>
  );
}

function ScoreMedallion({
  score,
  risk = false,
  label = 'score',
}: {
  score: number;
  risk?: boolean;
  label?: string;
}) {
  const tone = risk
    ? score >= 60
      ? 'bad'
      : score >= 35
        ? 'warn'
        : 'good'
    : score >= 80
      ? 'good'
      : score >= 60
        ? 'warn'
        : 'muted';
  return (
    <div
      className={cn('score-medallion', tone)}
      aria-label={`${label}: ${score} out of 100`}
    >
      <span>{score}</span>
      <small>{risk ? 'risk' : 'score'}</small>
    </div>
  );
}

function Delta({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span className={cn('delta', positive ? 'positive' : 'negative')}>
      {positive ? <ArrowUpRight /> : <ArrowDownRight />}
      {percent(value)}
    </span>
  );
}

function Dashboard({
  onInspect,
  onTrack,
  trackedIds,
}: {
  onInspect: (deal: Deal) => void;
  onTrack: (id: string) => void;
  trackedIds: Set<string>;
}) {
  const qualified = deals.filter(qualifiesForQuickFlip);
  return (
    <div className="page-stack">
      <Panel className="command-panel">
        <div className="command-copy">
          <div className="panel-kicker">
            <Compass /> Live field ledger · Europe/Amsterdam
          </div>
          <h2>The Scout’s Table</h2>
          <p>
            Inspect opportunities that still work after shipping, fees, labour,
            liquidity and risk.
          </p>
          <div className="command-actions">
            <Button
              className="gold-button"
              onClick={() => {
                window.location.href = '/deals';
              }}
            >
              <Compass /> Scout deals
            </Button>
            <Button
              className="iron-button"
              variant="outline"
              onClick={() => {
                window.location.href = '/scanner';
              }}
            >
              <Camera /> Scan a card
            </Button>
          </div>
        </div>
        <div className="radar-orbit" aria-hidden="true">
          <span className="orbit orbit-one" />
          <span className="orbit orbit-two" />
          <span className="radar-cross" />
          <Compass />
          <b>{qualified.length}</b>
          <small>qualified hunts</small>
        </div>
        <div className="command-statuses">
          <span>
            <i className="status-live" /> eBay fixture refreshed 4m
          </span>
          <span>
            <i className="status-live" /> Cardmarket guide current
          </span>
          <span>
            <i className="status-warn" /> 1 parser needs review
          </span>
        </div>
      </Panel>

      <div className="metric-grid">
        <MetricPlaque
          icon={Sparkles}
          label="New opportunities"
          value="17"
          detail="5 since last scan"
          tone="gold"
        />
        <MetricPlaque
          icon={CircleDollarSign}
          label="Qualified quick flips"
          value={String(qualified.length)}
          detail="strict purchase gate"
          tone="green"
        />
        <MetricPlaque
          icon={Bell}
          label="Below target"
          value="4"
          detail="1 critical"
          tone="violet"
        />
        <MetricPlaque
          icon={CalendarDays}
          label="Releases nearing"
          value="3"
          detail="next in 7 days"
          tone="blue"
        />
        <MetricPlaque
          icon={HeartPulse}
          label="Scan health"
          value="94%"
          detail="18,612 records today"
          tone="green"
        />
        <MetricPlaque
          icon={ShieldAlert}
          label="Needs review"
          value="4"
          detail="no critical alerts emitted"
          tone="amber"
        />
      </div>

      <div className="content-grid primary-grid">
        <div className="wide-column">
          <SectionHeading
            title="Best Hunts Today"
            subtitle="Ranked by conservative profit, executability and confidence"
            action={
              <Link className="text-link" href="/deals">
                View bounty board <ArrowRight />
              </Link>
            }
          />
          <div className="deal-grid">
            {deals.slice(0, 3).map((item) => (
              <DealCard
                deal={item}
                key={item.id}
                onInspect={onInspect}
                onTrack={onTrack}
                tracked={trackedIds.has(item.id)}
              />
            ))}
          </div>
        </div>

        <div className="side-column">
          <Panel className="pulse-panel">
            <SectionHeading
              title="Market Pulse"
              subtitle="Seven-day movement"
            />
            <PulseRow
              name="Prismatic ETBs"
              game="Pokémon"
              value={0.084}
              points="0,31 18,27 36,29 54,20 72,23 90,12 108,8"
            />
            <PulseRow
              name="Origins displays"
              game="Riftbound"
              value={-0.051}
              points="0,9 18,12 36,10 54,17 72,18 90,25 108,28"
            />
            <PulseRow
              name="151 sealed"
              game="Pokémon"
              value={0.023}
              points="0,25 18,24 36,26 54,20 72,18 90,19 108,15"
            />
            <RuneDivider />
            <div className="pulse-note">
              <AlertTriangle />{' '}
              <span>
                <strong>Unusual activity</strong> Six retailers reduced Origins
                displays today.
              </span>
            </div>
          </Panel>

          <Panel className="watch-snapshot">
            <SectionHeading title="Watchtower" subtitle="Recent triggers" />
            <WatchEvent
              tone="critical"
              title="Target crossed"
              detail="Prismatic ETB pair · €126.45 all-in"
              time="11m"
            />
            <WatchEvent
              tone="positive"
              title="New sold evidence"
              detail="Destined Rivals · median +2.1%"
              time="47m"
            />
            <WatchEvent
              tone="warning"
              title="Price changed"
              detail="Origins display · exit now negative"
              time="2h"
            />
            <Link className="text-link block-link" href="/watchlist">
              Open Watchtower <ArrowRight />
            </Link>
          </Panel>
        </div>
      </div>

      <div className="content-grid lower-grid">
        <Panel className="release-strip">
          <SectionHeading
            title="Release Watch"
            subtitle="Official events and clearly marked community signals"
            action={
              <Link className="text-link" href="/releases">
                Open codex <ArrowRight />
              </Link>
            }
          />
          <div className="release-grid">
            {releases.map((release) => (
              <ReleaseTile key={release.id} release={release} />
            ))}
          </div>
        </Panel>
        <Panel className="source-strip">
          <SectionHeading title="Market Realms" subtitle="Source freshness" />
          {sources.map((source) => (
            <div className="source-mini-row" key={source.id}>
              <span
                className={cn(
                  'source-orb',
                  source.health === 'Healthy' && 'healthy',
                  source.health.includes('required') && 'muted',
                  source.health === 'Format change' && 'warning',
                )}
              />
              <div>
                <strong>{source.name}</strong>
                <small>{source.lastScan}</small>
              </div>
              <Badge variant="outline">{source.mode}</Badge>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function MetricPlaque({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Compass;
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <div className={cn('metric-plaque', `tone-${tone}`)}>
      <span className="metric-icon">
        <Icon />
      </span>
      <div>
        <small>{label}</small>
        <strong className="mono">{value}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}

function DealCard({
  deal: item,
  onInspect,
  onTrack,
  tracked,
}: {
  deal: Deal;
  onInspect: (deal: Deal) => void;
  onTrack: (id: string) => void;
  tracked: boolean;
}) {
  return (
    <article
      className={cn('deal-card', item.status === 'Likely Trap' && 'trap-card')}
    >
      <div className="deal-visual">
        <ProductGlyph deal={item} />
        <Badge
          className={cn(
            'status-badge',
            item.status.toLowerCase().replaceAll(' ', '-'),
          )}
        >
          {item.status}
        </Badge>
        <ScoreMedallion score={item.instantScore} />
      </div>
      <div className="deal-copy">
        <div className="deal-meta">
          <span>{item.game}</span>
          <i /> <span>{item.set}</span>
          <i /> <span>{item.listingAge} ago</span>
        </div>
        <h3>{item.canonicalProduct}</h3>
        <p className="listing-title">“{item.title}”</p>
        <div className="source-line">
          <span>{item.source}</span>
          <span>
            <MapPin /> {item.location}
          </span>
          <span>
            {item.seller} · {item.sellerScore}%
          </span>
        </div>
        <div className="economics-strip">
          <EconomicMetric
            label="All-in"
            value={money(item.economics.allInCost)}
          />
          <EconomicMetric
            label="Net exit"
            value={money(item.economics.conservativeNetExit)}
          />
          <EconomicMetric
            label="Profit"
            value={money(item.economics.conservativeProfit)}
            tone={
              item.economics.conservativeProfit >= 0 ? 'positive' : 'negative'
            }
          />
          <EconomicMetric
            label="ROI"
            value={percent(item.economics.roi)}
            tone={
              item.economics.roi >= 0.2
                ? 'positive'
                : item.economics.roi < 0
                  ? 'negative'
                  : undefined
            }
          />
        </div>
        <div className="evidence-row">
          <span>
            <Gauge /> {item.liquidity}
          </span>
          <span>
            Confidence {item.confidenceGrade} · {item.matchConfidence}%
          </span>
          <span>
            <ShieldAlert /> Risk {item.riskScore}
          </span>
        </div>
        <div className="tag-row">
          {item.tags.map((tag) => (
            <Badge variant="outline" key={tag}>
              {tag}
            </Badge>
          ))}
        </div>
        <div className="card-actions">
          <Button className="gold-button" onClick={() => onInspect(item)}>
            Inspect deal <ArrowRight />
          </Button>
          <Button
            className={cn('iron-button', tracked && 'tracked')}
            variant="outline"
            onClick={() => onTrack(item.id)}
          >
            {tracked ? <Check /> : <Eye />}
            {tracked ? 'Tracked' : 'Track'}
          </Button>
        </div>
      </div>
    </article>
  );
}

function EconomicMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'positive' | 'negative';
}) {
  return (
    <div>
      <small>{label}</small>
      <strong className={cn('mono', tone)}>{value}</strong>
    </div>
  );
}

function PulseRow({
  name,
  game,
  value,
  points,
}: {
  name: string;
  game: string;
  value: number;
  points: string;
}) {
  return (
    <div className="pulse-row">
      <div>
        <strong>{name}</strong>
        <small>{game}</small>
      </div>
      <svg aria-label={`${name} seven-day sparkline`} viewBox="0 0 108 36">
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
      <Delta value={value} />
    </div>
  );
}

function WatchEvent({
  tone,
  title,
  detail,
  time,
}: {
  tone: string;
  title: string;
  detail: string;
  time: string;
}) {
  return (
    <div className="watch-event">
      <span className={cn('event-gem', tone)} />
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <time>{time}</time>
    </div>
  );
}

function ReleaseTile({ release }: { release: (typeof releases)[number] }) {
  return (
    <article className="release-tile">
      <div className="release-date">
        <strong>{release.daysAway}</strong>
        <small>days</small>
      </div>
      <div className="release-copy">
        <span className="eyebrow">
          {release.game} · {release.product}
        </span>
        <h3>{release.name}</h3>
        <div className="release-meta">
          <span>{release.releaseDate}</span>
          <span>{release.preorderRange}</span>
          <span>{release.retailerCount} retailers</span>
        </div>
      </div>
      <Badge
        className={release.official ? 'official-badge' : 'unconfirmed-badge'}
      >
        {release.official ? <Check /> : <AlertTriangle />}
        {release.official ? 'Official' : 'Unconfirmed'}
      </Badge>
    </article>
  );
}

function DealsPage({
  onInspect,
  onTrack,
  trackedIds,
}: {
  onInspect: (deal: Deal) => void;
  onTrack: (id: string) => void;
  trackedIds: Set<string>;
}) {
  const [game, setGame] = useState('all');
  const [source, setSource] = useState('all');
  const [minimumProfit, setMinimumProfit] = useState('0');
  const [sort, setSort] = useState('score');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const list = deals.filter(
      (item) =>
        (game === 'all' || item.game === game) &&
        (source === 'all' || item.source === source) &&
        item.economics.conservativeProfit >= Number(minimumProfit || 0) &&
        `${item.title} ${item.canonicalProduct} ${item.set}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
    return [...list].sort((a, b) =>
      sort === 'profit'
        ? b.economics.conservativeProfit - a.economics.conservativeProfit
        : sort === 'risk'
          ? a.riskScore - b.riskScore
          : b.instantScore - a.instantScore,
    );
  }, [game, source, minimumProfit, sort, query]);

  return (
    <div className="page-stack">
      <Panel className="bounty-header">
        <div>
          <span className="panel-kicker">
            <Compass /> Acquisition underwriting
          </span>
          <h2>{filtered.length} current matches</h2>
          <p>
            Asking prices never masquerade as completed sales. Low-confidence
            matches cannot trigger Critical alerts.
          </p>
        </div>
        <div className="gate-summary">
          <strong>{deals.filter(qualifiesForQuickFlip).length}</strong>
          <span>pass the quick-flip gate</span>
          <small>≥ €25 profit · ≥ 20% ROI · A/B evidence</small>
        </div>
      </Panel>

      <Panel className="filter-bar">
        <label className="filter-search">
          <Search />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search listings and products"
          />
        </label>
        <Select value={game} onValueChange={(value) => setGame(value ?? 'all')}>
          <SelectTrigger aria-label="Filter by game">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All games</SelectItem>
            <SelectItem value="Pokémon">Pokémon</SelectItem>
            <SelectItem value="Riftbound">Riftbound</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={source}
          onValueChange={(value) => setSource(value ?? 'all')}
        >
          <SelectTrigger aria-label="Filter by source">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="Marktplaats">Marktplaats</SelectItem>
            <SelectItem value="eBay">eBay</SelectItem>
            <SelectItem value="Card Corner EU">Retailers</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={minimumProfit}
          onValueChange={(value) => setMinimumProfit(value ?? '0')}
        >
          <SelectTrigger aria-label="Minimum profit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Any profit</SelectItem>
            <SelectItem value="25">Profit ≥ €25</SelectItem>
            <SelectItem value="100">Profit ≥ €100</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={sort}
          onValueChange={(value) => setSort(value ?? 'score')}
        >
          <SelectTrigger aria-label="Sort deals">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="score">Best score</SelectItem>
            <SelectItem value="profit">Highest profit</SelectItem>
            <SelectItem value="risk">Lowest risk</SelectItem>
          </SelectContent>
        </Select>
        <Sheet>
          <SheetTrigger
            render={
              <Button variant="outline" className="iron-button">
                <Filter /> More filters
              </Button>
            }
          />
          <SheetContent className="filter-sheet">
            <SheetHeader>
              <SheetTitle>Refine the hunt</SheetTitle>
              <SheetDescription>
                Filter by economics, evidence and execution risk.
              </SheetDescription>
            </SheetHeader>
            <FilterSheet />
          </SheetContent>
        </Sheet>
        <div className="view-toggle">
          <Button
            size="icon"
            variant={view === 'cards' ? 'default' : 'outline'}
            onClick={() => setView('cards')}
            aria-label="Card view"
          >
            <Boxes />
          </Button>
          <Button
            size="icon"
            variant={view === 'table' ? 'default' : 'outline'}
            onClick={() => setView('table')}
            aria-label="Table view"
          >
            <Table2 />
          </Button>
        </div>
      </Panel>

      <div className="results-line">
        <span>
          Showing {filtered.length} of {deals.length} demo listings
        </span>
        <span>
          <Clock3 /> Last ranked 38 seconds ago
        </span>
      </div>
      {filtered.length === 0 ? (
        <Panel className="empty-state">
          <Compass />
          <h2>No bounty matches these rules</h2>
          <p>Widen the profit threshold or include another source.</p>
          <Button
            className="gold-button"
            onClick={() => {
              setGame('all');
              setSource('all');
              setMinimumProfit('0');
              setQuery('');
            }}
          >
            Clear filters
          </Button>
        </Panel>
      ) : view === 'cards' ? (
        <div className="deal-grid bounty-deal-grid">
          {filtered.map((item) => (
            <DealCard
              deal={item}
              key={item.id}
              onInspect={onInspect}
              onTrack={onTrack}
              tracked={trackedIds.has(item.id)}
            />
          ))}
        </div>
      ) : (
        <Panel className="data-table-panel">
          <DealTable deals={filtered} onInspect={onInspect} />
        </Panel>
      )}
    </div>
  );
}

function FilterSheet() {
  return (
    <div className="sheet-form">
      <label>
        <span>Minimum ROI</span>
        <Input defaultValue="20%" />
      </label>
      <label>
        <span>Minimum confidence</span>
        <Select defaultValue="B">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="A">A only</SelectItem>
            <SelectItem value="B">B or better</SelectItem>
            <SelectItem value="C">C or better</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <label>
        <span>Maximum risk score</span>
        <Input type="number" defaultValue="45" />
      </label>
      <label>
        <span>Listing age</span>
        <Select defaultValue="24">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Last hour</SelectItem>
            <SelectItem value="24">Last 24 hours</SelectItem>
            <SelectItem value="168">Last 7 days</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <label>
        <span>Exit market</span>
        <Select defaultValue="any">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any named exit</SelectItem>
            <SelectItem value="cardmarket">Cardmarket</SelectItem>
            <SelectItem value="ebay">eBay</SelectItem>
            <SelectItem value="local">Local</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <Button className="gold-button">
        <ListFilter /> Apply filters
      </Button>
    </div>
  );
}

function DealTable({
  deals: rows,
  onInspect,
}: {
  deals: Deal[];
  onInspect: (deal: Deal) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Opportunity</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>All-in</TableHead>
          <TableHead>Profit</TableHead>
          <TableHead>ROI</TableHead>
          <TableHead>Evidence</TableHead>
          <TableHead>Score</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((item) => (
          <TableRow key={item.id}>
            <TableCell>
              <div className="table-product">
                <ProductGlyph deal={item} compact />
                <div>
                  <strong>{item.canonicalProduct}</strong>
                  <small>
                    {item.game} · {item.set}
                  </small>
                </div>
              </div>
            </TableCell>
            <TableCell>
              {item.source}
              <small className="table-sub">{item.listingAge} ago</small>
            </TableCell>
            <TableCell className="mono">
              {money(item.economics.allInCost)}
            </TableCell>
            <TableCell
              className={cn(
                'mono',
                item.economics.conservativeProfit >= 0
                  ? 'positive'
                  : 'negative',
              )}
            >
              {money(item.economics.conservativeProfit)}
            </TableCell>
            <TableCell className="mono">
              {percent(item.economics.roi)}
            </TableCell>
            <TableCell>
              <Badge variant="outline">
                {item.confidenceGrade} · {item.matchConfidence}%
              </Badge>
              <small className="table-sub">{item.liquidity}</small>
            </TableCell>
            <TableCell>
              <ScoreMedallion score={item.instantScore} />
            </TableCell>
            <TableCell>
              <Button
                variant="outline"
                className="iron-button"
                onClick={() => onInspect(item)}
              >
                Inspect
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DealDetailDialog({
  deal: item,
  onOpenChange,
  onNotice,
  onTrack,
  tracked,
}: {
  deal: Deal | null;
  onOpenChange: (open: boolean) => void;
  onNotice: (text: string) => void;
  onTrack: (id: string) => void;
  tracked: boolean;
}) {
  if (!item) return null;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="deal-dialog">
        <DialogHeader className="deal-dialog-header">
          <div className="detail-product">
            <ProductGlyph deal={item} />
          </div>
          <div>
            <div className="deal-meta">
              <span>{item.game}</span>
              <i />
              <span>{item.set}</span>
              <i />
              <span>{item.source}</span>
            </div>
            <DialogTitle>{item.canonicalProduct}</DialogTitle>
            <DialogDescription>{item.title}</DialogDescription>
            <div className="tag-row">
              <Badge className="status-badge">{item.status}</Badge>
              <Badge variant="outline">
                Match {item.matchConfidence}% · Grade {item.confidenceGrade}
              </Badge>
            </div>
          </div>
          <ScoreMedallion score={item.instantScore} />
        </DialogHeader>
        <Tabs defaultValue="economics" className="detail-tabs">
          <TabsList variant="line">
            <TabsTrigger value="economics">Economics</TabsTrigger>
            <TabsTrigger value="evidence">Evidence</TabsTrigger>
            <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
            <TabsTrigger value="risks">Risks</TabsTrigger>
          </TabsList>
          <TabsContent value="economics">
            <EconomicsDetail deal={item} />
          </TabsContent>
          <TabsContent value="evidence">
            <EvidenceDetail deal={item} />
          </TabsContent>
          <TabsContent value="scenarios">
            <ScenarioDetail deal={item} />
          </TabsContent>
          <TabsContent value="risks">
            <RiskDetail deal={item} />
          </TabsContent>
        </Tabs>
        <DialogFooter className="detail-footer">
          <div className="detail-exit">
            <span>Preferred exit</span>
            <strong>{item.exitChannel}</strong>
            <small>Last verified {item.listingAge} ago</small>
          </div>
          <Button
            variant="outline"
            className={cn('iron-button', tracked && 'tracked')}
            onClick={() => onTrack(item.id)}
          >
            {tracked ? <Check /> : <Eye />}
            {tracked ? 'Tracked' : 'Track'}
          </Button>
          <Button
            variant="outline"
            className="iron-button"
            onClick={() =>
              onNotice(`${item.canonicalProduct} added to Shadow Mode.`)
            }
          >
            <Eye /> Shadow buy
          </Button>
          <Button
            className="gold-button"
            onClick={() =>
              onNotice(
                'Listing recheck queued. Purchase remains human-approved and stops before checkout.',
              )
            }
          >
            <RefreshCw /> Recheck listing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EconomicsDetail({ deal: item }: { deal: Deal }) {
  const e = item.economics;
  return (
    <div className="detail-grid">
      <Panel className="ledger-panel" parchment>
        <h3>Acquisition ledger</h3>
        <LedgerRow label="Item price" value={e.itemPrice} />
        <LedgerRow label="Inbound shipping" value={e.inboundShipping} />
        <LedgerRow
          label="Buyer & payment fees"
          value={e.buyerFees + e.paymentFees}
        />
        <LedgerRow
          label="Travel, import & labour"
          value={e.travelCost + e.importCosts + e.acquisitionLabor}
        />
        <LedgerRow label="All-in acquisition" value={e.allInCost} total />
      </Panel>
      <Panel className="ledger-panel" parchment>
        <h3>Conservative exit</h3>
        <LedgerRow label="Supported sale price" value={e.expectedSalePrice} />
        <LedgerRow
          label="Selling & payment fees"
          value={-(e.sellerFees + e.exitPaymentFees)}
        />
        <LedgerRow
          label="Shipping & packaging"
          value={-(e.outboundShipping + e.packaging)}
        />
        <LedgerRow
          label="Return, labour & liquidity reserve"
          value={-(e.expectedReturnLoss + e.sellingLabor + e.liquidityHaircut)}
        />
        <LedgerRow
          label="Conservative net exit"
          value={e.conservativeNetExit}
          total
        />
      </Panel>
      <div className="detail-metrics">
        <EconomicMetric
          label="Conservative profit"
          value={money(e.conservativeProfit)}
          tone={e.conservativeProfit >= 0 ? 'positive' : 'negative'}
        />
        <EconomicMetric label="ROI" value={percent(e.roi)} />
        <EconomicMetric label="Profit / hour" value={money(e.profitPerHour)} />
        <EconomicMetric
          label="Maximum item price"
          value={money(e.maximumItemPrice)}
        />
      </div>
      <div
        className={cn(
          'decision-banner',
          qualifiesForQuickFlip(item) ? 'pass' : 'reject',
        )}
      >
        {qualifiesForQuickFlip(item) ? <PackageCheck /> : <ShieldAlert />}
        <div>
          <strong>
            {qualifiesForQuickFlip(item)
              ? 'PASSES QUICK-FLIP GATE'
              : 'DOES NOT PASS PURCHASE GATE'}
          </strong>
          <span>
            {qualifiesForQuickFlip(item)
              ? 'Profit, ROI, evidence, liquidity and risk meet the starting thresholds.'
              : 'Keep in Shadow Mode or review manually; no purchase alert is recommended.'}
          </span>
        </div>
      </div>
    </div>
  );
}

function LedgerRow({
  label,
  value,
  total = false,
}: {
  label: string;
  value: number;
  total?: boolean;
}) {
  return (
    <div className={cn('ledger-row', total && 'total')}>
      <span>{label}</span>
      <strong className={cn('mono', value < 0 && 'negative')}>
        {money(value)}
      </strong>
    </div>
  );
}

function EvidenceDetail({ deal: item }: { deal: Deal }) {
  const comps = [
    {
      type: 'Verified sold',
      source: 'Cardmarket',
      price: item.economics.expectedSalePrice - 4,
      age: '2h',
      weight: 'High',
    },
    {
      type: 'Verified sold',
      source: 'eBay',
      price: item.economics.expectedSalePrice + 7,
      age: '1d',
      weight: 'High',
    },
    {
      type: 'Reference price',
      source: 'Cardmarket guide',
      price: item.economics.expectedSalePrice + 2,
      age: '6h',
      weight: 'Medium',
    },
    {
      type: 'Active ask',
      source: item.source,
      price: item.economics.itemPrice,
      age: item.listingAge,
      weight: 'Detection only',
    },
  ];
  return (
    <div>
      <div className="evidence-banner">
        <Scale />
        <div>
          <strong>{item.priceEvidence}</strong>
          <span>Active asks are separated from transaction evidence.</span>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Evidence</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Observed</TableHead>
            <TableHead>Age</TableHead>
            <TableHead>Model weight</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {comps.map((comp, index) => (
            <TableRow key={`${comp.type}-${index}`}>
              <TableCell>{comp.type}</TableCell>
              <TableCell>{comp.source}</TableCell>
              <TableCell className="mono">{money(comp.price)}</TableCell>
              <TableCell>{comp.age}</TableCell>
              <TableCell>
                <Badge variant="outline">{comp.weight}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ScenarioDetail({ deal: item }: { deal: Deal }) {
  const base = item.economics.conservativeNetExit;
  return (
    <div className="scenario-grid">
      {[
        {
          name: 'Bear',
          multiplier: 0.86,
          tone: 'negative',
          note: 'Supply expands; sales slow.',
        },
        {
          name: 'Base',
          multiplier: 1.03,
          tone: 'neutral',
          note: 'Recent trend and liquidity persist.',
        },
        {
          name: 'Bull',
          multiplier: 1.18,
          tone: 'positive',
          note: 'Catalyst lands without a reprint.',
        },
      ].map((scenario) => {
        const value = base * scenario.multiplier;
        return (
          <Panel
            key={scenario.name}
            className={cn('scenario-card', scenario.tone)}
          >
            <span className="eyebrow">6 month scenario</span>
            <h3>{scenario.name}</h3>
            <strong className="mono">
              {money(value * 0.96)}–{money(value * 1.04)}
            </strong>
            <small>Modelled net exit · confidence {item.confidenceGrade}</small>
            <p>{scenario.note}</p>
            <div className="scenario-roi">
              ROI{' '}
              <b>
                {percent(
                  (value - item.economics.allInCost) / item.economics.allInCost,
                )}
              </b>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

function RiskDetail({ deal: item }: { deal: Deal }) {
  return (
    <div className="risk-layout">
      <div className="risk-score-block">
        <ScoreMedallion score={item.riskScore} risk label="risk score" />
        <div>
          <h3>
            {item.riskScore < 30
              ? 'Controlled risk'
              : item.riskScore < 60
                ? 'Review advised'
                : 'High-risk opportunity'}
          </h3>
          <p>Risk is separate from deal and hold scores.</p>
        </div>
      </div>
      <div className="risk-list">
        {item.risks.map((risk) => (
          <div key={risk}>
            <AlertTriangle />
            <span>{risk}</span>
          </div>
        ))}
        {item.catalysts.map((catalyst) => (
          <div className="catalyst" key={catalyst}>
            <Sparkles />
            <span>{catalyst}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LotLab({ onNotice }: { onNotice: (text: string) => void }) {
  const [laborHours, setLaborHours] = useState(6.5);
  const [requiredProfit, setRequiredProfit] = useState(100);
  const [uploaded, setUploaded] = useState(false);
  const collectionNet = 292 - laborHours * 18 - 35 - 14 - 22;
  const maximumOffer = Math.max(0, collectionNet - requiredProfit);
  return (
    <div className="page-stack">
      <div className="lot-grid">
        <Panel className="upload-panel">
          <SectionHeading
            title="Collection intake"
            subtitle="Photos stay in Demo Mode and are not uploaded"
          />
          <label className={cn('drop-zone', uploaded && 'has-upload')}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(event) => {
                if (event.target.files?.length) {
                  setUploaded(true);
                  onNotice(
                    `${event.target.files.length} image${event.target.files.length > 1 ? 's' : ''} queued for local demo analysis.`,
                  );
                }
              }}
            />
            {uploaded ? (
              <>
                <Check />
                <strong>6 binder photos ready</strong>
                <span>Run candidate extraction or add more angles</span>
              </>
            ) : (
              <>
                <Upload />
                <strong>Drop binder or lot photos here</strong>
                <span>
                  JPEG, PNG or WebP · 12 MB each · front and back preferred
                </span>
              </>
            )}
          </label>
          <div className="upload-actions">
            <Button
              className="gold-button"
              onClick={() => {
                setUploaded(true);
                onNotice(
                  'Demo lot loaded. 31 candidates identified; 53 uncertain items moved to review.',
                );
              }}
            >
              <WandSparkles /> Load demo binder
            </Button>
            <Button variant="outline" className="iron-button">
              <FileSearch /> Inspection checklist
            </Button>
          </div>
          <div className="safety-note">
            <ShieldAlert />
            <span>
              Unknown items are valued at zero or bulk. Manual confirmation is
              required before underwriting.
            </span>
          </div>
        </Panel>
        <Panel className="offer-panel" parchment>
          <SectionHeading
            title="Maximum offer"
            subtitle="Exit-first, after labour and reserves"
          />
          <strong className="maximum-offer mono">{money(maximumOffer)}</strong>
          <div className="offer-confidence">
            <span>Confidence C</span>
            <Progress value={64} />
            <span>64%</span>
          </div>
          <LedgerRow label="Identified net exit" value={292} />
          <LedgerRow
            label={`Sorting & listing labour (${laborHours}h)`}
            value={-(laborHours * 18)}
          />
          <LedgerRow label="Unsold reserve" value={-35} />
          <LedgerRow label="Condition & counterfeit reserve" value={-14} />
          <LedgerRow label="Storage & packaging" value={-22} />
          <LedgerRow
            label="Required collection profit"
            value={-requiredProfit}
          />
          <LedgerRow
            label="Maximum collection offer"
            value={maximumOffer}
            total
          />
        </Panel>
      </div>
      <div className="content-grid lot-lower-grid">
        <Panel>
          <SectionHeading
            title="Candidate review"
            subtitle="31 identified · 53 uncertain · 3 priority checks"
            action={
              <Button variant="outline" className="iron-button">
                Resolve uncertainty
              </Button>
            }
          />
          <div className="candidate-grid">
            <CandidateCard
              name="Charizard 4/102 holo"
              detail="Base Set · probable unlimited · raw"
              value="€142–€186"
              confidence={72}
              tone="amber"
            />
            <CandidateCard
              name="Blastoise 2/102 holo"
              detail="Base Set · possible crease"
              value="€64–€98"
              confidence={81}
              tone="blue"
            />
            <CandidateCard
              name="Mixed modern holos × 29"
              detail="Bulk residual until verified"
              value="€18–€31"
              confidence={93}
              tone="emerald"
            />
          </div>
        </Panel>
        <Panel className="labor-editor">
          <SectionHeading
            title="Work assumptions"
            subtitle="Your time belongs in the economics"
          />
          <label>
            <span>Estimated labour hours</span>
            <Input
              type="number"
              min="0.5"
              step="0.5"
              value={laborHours}
              onChange={(event) => setLaborHours(Number(event.target.value))}
            />
          </label>
          <label>
            <span>Required net profit</span>
            <Input
              type="number"
              min="0"
              step="10"
              value={requiredProfit}
              onChange={(event) =>
                setRequiredProfit(Number(event.target.value))
              }
            />
          </label>
          <label>
            <span>Labour rate</span>
            <Input value="€18 / hour" readOnly />
          </label>
          <div
            className={cn(
              'decision-banner',
              maximumOffer >= 20 ? 'warn' : 'reject',
            )}
          >
            <Scale />
            <div>
              <strong>
                {maximumOffer >= 20
                  ? 'MANUAL INSPECTION REQUIRED'
                  : 'REJECT COLLECTION'}
              </strong>
              <span>
                {maximumOffer >= 20
                  ? `Do not offer above ${money(maximumOffer)} before inspecting the three priority cards.`
                  : 'Labour and reserves consume the supported value.'}
              </span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function CandidateCard({
  name,
  detail,
  value,
  confidence,
  tone,
}: {
  name: string;
  detail: string;
  value: string;
  confidence: number;
  tone: string;
}) {
  return (
    <article className="candidate-card">
      <div className={cn('candidate-art', `tone-${tone}`)}>
        <Sparkles />
      </div>
      <div>
        <h3>{name}</h3>
        <p>{detail}</p>
        <strong className="mono">{value}</strong>
        <div className="confidence-line">
          <span>Identification</span>
          <Progress value={confidence} />
          <span>{confidence}%</span>
        </div>
      </div>
      <Button variant="outline" size="sm">
        Edit
      </Button>
    </article>
  );
}

function MarketPage({
  onTrack,
  trackedIds,
}: {
  onTrack: (id: string) => void;
  trackedIds: Set<string>;
}) {
  const [selected, setSelected] = useState(deals[0]);
  const history = [128, 132, 129, 137, 142, 151, 154, 162, 169, 171, 178, 182];
  const points = history
    .map((value, index) => `${index * 38},${135 - (value - 120) * 1.65}`)
    .join(' ');
  return (
    <div className="page-stack">
      <Panel className="market-command">
        <label className="market-page-search">
          <Search />
          <Input
            placeholder="Search product, set, EAN or marketplace ID"
            defaultValue="Prismatic Evolutions ETB"
          />
        </label>
        <Button className="gold-button">Search market</Button>
      </Panel>
      <div className="market-layout">
        <Panel className="market-results">
          <SectionHeading
            title="Canonical products"
            subtitle="Identity before price comparison"
          />
          {deals.slice(0, 4).map((item) => (
            <button
              className={cn(
                'market-result',
                selected.id === item.id && 'active',
              )}
              onClick={() => setSelected(item)}
              key={item.id}
            >
              <ProductGlyph deal={item} compact />
              <span>
                <strong>{item.canonicalProduct}</strong>
                <small>
                  {item.game} · {item.productType} · {item.language}
                </small>
              </span>
              <Badge variant="outline">{item.matchConfidence}%</Badge>
            </button>
          ))}
        </Panel>
        <div className="market-detail-stack">
          <Panel className="price-chart-panel">
            <div className="chart-header">
              <div>
                <span className="eyebrow">
                  {selected.game} · {selected.set}
                </span>
                <h2>{selected.canonicalProduct}</h2>
                <p>Robust median from supported evidence</p>
              </div>
              <div className="chart-value">
                <strong className="mono">
                  {money(selected.economics.expectedSalePrice)}
                </strong>
                <Delta value={0.084} />
              </div>
            </div>
            <svg
              className="price-chart"
              aria-label="Twelve week price history"
              viewBox="0 0 420 150"
            >
              <title>Twelve week price history</title>
              <defs>
                <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor="#c99a43" stopOpacity=".35" />
                  <stop offset="1" stopColor="#c99a43" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`M${points} L418,150 L0,150Z`} fill="url(#chart-fill)" />
              <polyline
                points={points}
                fill="none"
                stroke="#e4bd65"
                strokeWidth="3"
              />
            </svg>
            <div className="chart-axis">
              <span>12 weeks ago</span>
              <span>Today</span>
            </div>
            <div className="market-stat-row">
              <EconomicMetric
                label="25th percentile"
                value={money(selected.economics.expectedSalePrice * 0.92)}
              />
              <EconomicMetric
                label="Weighted median"
                value={money(selected.economics.expectedSalePrice)}
              />
              <EconomicMetric
                label="75th percentile"
                value={money(selected.economics.expectedSalePrice * 1.08)}
              />
              <EconomicMetric
                label="Sold 30d"
                value={String(selected.soldCount30d ?? '—')}
              />
            </div>
          </Panel>
          <Panel className="comparison-panel">
            <SectionHeading
              title="Marketplace comparison"
              subtitle="Delivered prices; active asks separated from sold evidence"
              action={
                <Button
                  className="iron-button"
                  variant="outline"
                  onClick={() => onTrack(selected.id)}
                >
                  {trackedIds.has(selected.id) ? <Check /> : <Eye />}
                  {trackedIds.has(selected.id) ? 'Tracked' : 'Watch product'}
                </Button>
              }
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Delivered</TableHead>
                  <TableHead>Freshness</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <ComparisonRow
                  source="Cardmarket"
                  type="Verified sold cohort"
                  item={selected.economics.expectedSalePrice - 3}
                  delivered={selected.economics.expectedSalePrice - 3}
                  age="2h"
                  status="Evidence"
                />
                <ComparisonRow
                  source={selected.source}
                  type="Active listing"
                  item={selected.economics.itemPrice}
                  delivered={selected.economics.allInCost}
                  age={selected.listingAge}
                  status="Available"
                />
                <ComparisonRow
                  source="eBay NL"
                  type="Active asking"
                  item={selected.economics.expectedSalePrice + 12}
                  delivered={selected.economics.expectedSalePrice + 19}
                  age="41m"
                  status="Available"
                />
              </TableBody>
            </Table>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ComparisonRow({
  source,
  type,
  item,
  delivered,
  age,
  status,
}: {
  source: string;
  type: string;
  item: number;
  delivered: number;
  age: string;
  status: string;
}) {
  return (
    <TableRow>
      <TableCell>
        <strong>{source}</strong>
      </TableCell>
      <TableCell>{type}</TableCell>
      <TableCell className="mono">{money(item)}</TableCell>
      <TableCell className="mono">{money(delivered)}</TableCell>
      <TableCell>{age}</TableCell>
      <TableCell>
        <Badge variant="outline">{status}</Badge>
      </TableCell>
    </TableRow>
  );
}

function ReleasesPage({ onNotice }: { onNotice: (text: string) => void }) {
  return (
    <div className="page-stack">
      <Panel className="filter-bar release-filters">
        <Tabs defaultValue="timeline">
          <TabsList>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="table">Compact table</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select defaultValue="all">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All games</SelectItem>
            <SelectItem value="pokemon">Pokémon</SelectItem>
            <SelectItem value="riftbound">Riftbound</SelectItem>
          </SelectContent>
        </Select>
        <Select defaultValue="eu">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="eu">Europe</SelectItem>
            <SelectItem value="official">Official only</SelectItem>
            <SelectItem value="watched">Watched only</SelectItem>
          </SelectContent>
        </Select>
      </Panel>
      <div className="release-timeline">
        {releases.map((release, index) => (
          <div className="timeline-entry" key={release.id}>
            <div className="timeline-marker">
              <span>{release.daysAway}</span>
            </div>
            <Panel className="timeline-card">
              <div className="timeline-main">
                <span className="eyebrow">
                  {release.releaseDate} · {release.game}
                </span>
                <h2>{release.name}</h2>
                <p>
                  {release.product} · {release.status}
                </p>
                <div className="release-meta">
                  <span>MSRP {money(release.msrp)}</span>
                  <span>Current {release.preorderRange}</span>
                  <span>{release.retailerCount} retailers</span>
                </div>
              </div>
              <div className="breadth-meter">
                <span>Retail stock breadth</span>
                <Progress value={Math.min(100, release.retailerCount * 8)} />
                <small>{release.demand} interest</small>
              </div>
              <Badge
                className={
                  release.official ? 'official-badge' : 'unconfirmed-badge'
                }
              >
                {release.official ? <Check /> : <AlertTriangle />}
                {release.official
                  ? 'Official source'
                  : 'Unconfirmed community signal'}
              </Badge>
              <Button
                className="iron-button"
                variant="outline"
                onClick={() => onNotice(`${release.name} is now watched.`)}
              >
                <Eye /> Watch release
              </Button>
            </Panel>
            {index < releases.length - 1 && <span className="timeline-line" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScannerPage({ onNotice }: { onNotice: (text: string) => void }) {
  const [scanned, setScanned] = useState(false);
  return (
    <div className="scanner-layout">
      <Panel className="scanner-stage">
        <SectionHeading
          title="Scrying Lens"
          subtitle="Identify the object first; compare prices second"
        />
        <div className="lens-frame">
          <div className="lens-reticle">
            <span />
            <span />
            <Camera />
          </div>
          <label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                if (event.target.files?.[0]) {
                  setScanned(true);
                  onNotice(
                    'Image analysed locally in Demo Mode. Confirm the product match before using prices.',
                  );
                }
              }}
            />
            <Button className="gold-button" render={<span />}>
              <Camera /> Use camera or upload
            </Button>
          </label>
          <p>Front, back and identifying codes improve confidence.</p>
        </div>
        <div className="scanner-privacy">
          <ShieldAlert />
          <span>
            Uploads require MIME and file-signature validation in live mode.
            Demo files remain device-local.
          </span>
        </div>
      </Panel>
      <Panel className="scan-result" parchment>
        {scanned ? (
          <>
            <span className="eyebrow">Candidate match</span>
            <div className="scan-match">
              <ProductGlyph deal={deals[0]} />
              <div>
                <h2>{deals[0].canonicalProduct}</h2>
                <p>{deals[0].set} · English · sealed</p>
                <div className="confidence-line">
                  <span>Match confidence</span>
                  <Progress value={94} />
                  <span>94%</span>
                </div>
              </div>
            </div>
            <div className="scan-evidence">
              <LedgerRow label="Suggested identity" value={0} />
              <p>
                Visual packaging marks, set logo, product proportions and
                visible seal pattern agree. Barcode is not visible.
              </p>
            </div>
            <div className="scan-actions">
              <Button
                className="gold-button"
                onClick={() => {
                  window.location.href = '/market';
                }}
              >
                Compare market
              </Button>
              <Button className="iron-button" variant="outline">
                Correct match
              </Button>
            </div>
          </>
        ) : (
          <div className="result-empty">
            <Eye />
            <h2>No scan yet</h2>
            <p>
              A candidate identity, confidence and correction controls will
              appear here.
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}

function PortfolioPage({ onNotice }: { onNotice: (text: string) => void }) {
  const holdings = [
    {
      name: 'Prismatic Evolutions ETB',
      qty: 6,
      basis: 361.2,
      liquidation: 414,
      patient: 468,
      days: 41,
      status: 'Healthy',
    },
    {
      name: 'Riftbound Origins display',
      qty: 4,
      basis: 596,
      liquidation: 544,
      patient: 628,
      days: 67,
      status: 'Below basis',
    },
    {
      name: 'Scarlet & Violet—151 bundle',
      qty: 8,
      basis: 408,
      liquidation: 521.6,
      patient: 584,
      days: 83,
      status: 'Healthy',
    },
    {
      name: 'Mixed singles inventory',
      qty: 73,
      basis: 384,
      liquidation: 286,
      patient: 417,
      days: 119,
      status: 'Dead stock',
    },
  ];
  return (
    <div className="page-stack">
      <div className="metric-grid vault-metrics">
        <MetricPlaque
          icon={HandCoins}
          label="Cash invested"
          value={money(portfolio.cashInvested)}
          detail="all-in basis"
          tone="gold"
        />
        <MetricPlaque
          icon={Vault}
          label="Patient-sale value"
          value={money(portfolio.patientSaleValue)}
          detail="modelled, not realised"
          tone="blue"
        />
        <MetricPlaque
          icon={Scale}
          label="Conservative cash-out"
          value={money(portfolio.conservativeLiquidationValue)}
          detail="after exit costs"
          tone="green"
        />
        <MetricPlaque
          icon={TrendingUp}
          label="Realised profit"
          value={money(portfolio.realisedProfit)}
          detail="completed sales only"
          tone="green"
        />
        <MetricPlaque
          icon={Clock3}
          label="Average holding"
          value={`${portfolio.averageHoldingDays}d`}
          detail="sold and open lots"
          tone="violet"
        />
        <MetricPlaque
          icon={AlertTriangle}
          label="Dead inventory"
          value={money(portfolio.deadInventory)}
          detail="no sale evidence 90d+"
          tone="amber"
        />
      </div>
      <div className="vault-layout">
        <Panel className="holdings-panel">
          <SectionHeading
            title="Inventory lots"
            subtitle="FIFO or specific-lot accounting; partial sales supported"
            action={
              <div className="button-row">
                <Button
                  variant="outline"
                  className="iron-button"
                  onClick={() => onNotice('Purchase form opened in Demo Mode.')}
                >
                  Record purchase
                </Button>
                <Button
                  className="gold-button"
                  onClick={() =>
                    onNotice(
                      'Sale form opened. Realised profit will only be recorded after completion.',
                    )
                  }
                >
                  Record sale
                </Button>
              </div>
            }
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lot</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>All-in basis</TableHead>
                <TableHead>Cash-out</TableHead>
                <TableHead>Patient sale</TableHead>
                <TableHead>Held</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holdings.map((item) => (
                <TableRow key={item.name}>
                  <TableCell>
                    <strong>{item.name}</strong>
                  </TableCell>
                  <TableCell>{item.qty}</TableCell>
                  <TableCell className="mono">{money(item.basis)}</TableCell>
                  <TableCell className="mono">
                    {money(item.liquidation)}
                  </TableCell>
                  <TableCell className="mono">{money(item.patient)}</TableCell>
                  <TableCell>{item.days}d</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        item.status === 'Healthy'
                          ? 'positive-badge'
                          : item.status === 'Dead stock'
                            ? 'danger-badge'
                            : 'warning-badge'
                      }
                    >
                      {item.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
        <Panel className="exposure-panel">
          <SectionHeading title="Exposure" subtitle="By game and strategy" />
          <ExposureBar label="Pokémon" value={68} amount="€1,461" />
          <ExposureBar label="Riftbound" value={28} amount="€602" />
          <ExposureBar label="Other / cash" value={4} amount="€85" />
          <RuneDivider />
          <ExposureBar label="Quick flip" value={41} amount="€881" />
          <ExposureBar label="Long-term sealed" value={37} amount="€795" />
          <ExposureBar label="Singles" value={22} amount="€472" />
          <div className="tax-note">
            <Info />
            <span>
              Tax treatment depends on your situation. Preserve receipts, fees,
              travel, labour estimates and original FX rates.
            </span>
          </div>
        </Panel>
      </div>
      <Panel className="profit-callout">
        <div>
          <span>Realised result</span>
          <strong className="mono positive">
            {money(portfolio.realisedProfit)}
          </strong>
        </div>
        <div>
          <span>Unrealised result</span>
          <strong className="mono">{money(portfolio.unrealisedResult)}</strong>
        </div>
        <p>
          Estimated values are never labelled as realised profit. One completed
          demo sale was profitable and one was loss-making; both remain visible.
        </p>
        <Button variant="outline" className="iron-button">
          Export accounting CSV
        </Button>
      </Panel>
    </div>
  );
}

function ExposureBar({
  label,
  value,
  amount,
}: {
  label: string;
  value: number;
  amount: string;
}) {
  return (
    <div className="exposure-row">
      <div>
        <span>{label}</span>
        <strong className="mono">{amount}</strong>
      </div>
      <Progress value={value} />
      <small>{value}%</small>
    </div>
  );
}

function WatchlistPage({
  onInspect,
  onTrack,
  trackedIds,
}: {
  onInspect: (deal: Deal) => void;
  onTrack: (id: string) => void;
  trackedIds: Set<string>;
}) {
  const watched = deals.filter((item) => trackedIds.has(item.id));
  return (
    <div className="page-stack">
      <Panel className="watch-command">
        <div>
          <span className="panel-kicker">
            <Telescope /> 6 active rules
          </span>
          <h2>Products moving toward your buy price</h2>
          <p>
            Targets use all-in cost and evidence confidence—not a headline
            listing price.
          </p>
        </div>
        <Button className="gold-button">Create watch rule</Button>
      </Panel>
      <div className="watchlist-grid">
        {watched.map((item) => (
          <Panel className="watch-product" key={item.id}>
            <div className="watch-product-top">
              <ProductGlyph deal={item} compact />
              <div>
                <h3>{item.canonicalProduct}</h3>
                <p>
                  {item.source} · {item.location}
                </p>
              </div>
              <Badge
                className={
                  item.economics.allInCost <= item.economics.maximumItemPrice
                    ? 'positive-badge'
                    : 'warning-badge'
                }
              >
                {item.economics.allInCost <= item.economics.maximumItemPrice
                  ? 'Below target'
                  : 'Near target'}
              </Badge>
            </div>
            <div className="target-line">
              <span>
                All-in now{' '}
                <b className="mono">{money(item.economics.allInCost)}</b>
              </span>
              <Progress
                value={Math.min(
                  100,
                  (item.economics.maximumItemPrice / item.economics.allInCost) *
                    100,
                )}
              />
              <span>
                Max buy{' '}
                <b className="mono">{money(item.economics.maximumItemPrice)}</b>
              </span>
            </div>
            <div className="card-actions">
              <Button className="gold-button" onClick={() => onInspect(item)}>
                Inspect
              </Button>
              <Button
                variant="outline"
                className="iron-button"
                onClick={() => onTrack(item.id)}
              >
                Remove
              </Button>
            </div>
          </Panel>
        ))}
      </div>
      <Panel>
        <SectionHeading
          title="Triggered watch events"
          subtitle="Deduplicated and subject to cooldowns"
        />
        <WatchEvent
          tone="critical"
          title="Critical · all-in below maximum buy"
          detail="Prismatic ETB pair · confidence A · 97% match"
          time="11m"
        />
        <WatchEvent
          tone="positive"
          title="New sold evidence"
          detail="Destined Rivals · 3 comparable transactions"
          time="47m"
        />
        <WatchEvent
          tone="warning"
          title="Price changed after alert"
          detail="Origins display no longer profitable after fees"
          time="2h"
        />
      </Panel>
    </div>
  );
}

function ShadowPage() {
  return (
    <div className="page-stack">
      <Panel className="shadow-intro">
        <div>
          <span className="panel-kicker">
            <Eye /> Validation before capital
          </span>
          <h2>Shadow Mode keeps the losses</h2>
          <p>
            Every hypothetical trade is followed at 7, 30 and 90 days, including
            stale alerts and losing opportunities.
          </p>
        </div>
        <div className="shadow-score">
          <strong>71%</strong>
          <span>qualified-deal precision</span>
          <small>vs 46% baseline</small>
        </div>
      </Panel>
      <div className="metric-grid shadow-metrics">
        <MetricPlaque
          icon={PackageCheck}
          label="Executability"
          value="82%"
          detail="still buyable when opened"
          tone="green"
        />
        <MetricPlaque
          icon={Gauge}
          label="Value calibration"
          value="-3.8%"
          detail="conservative by design"
          tone="blue"
        />
        <MetricPlaque
          icon={Clock3}
          label="Median hold error"
          value="+6d"
          detail="model vs observed"
          tone="violet"
        />
        <MetricPlaque
          icon={ShieldAlert}
          label="False positives"
          value="14%"
          detail="includes fee traps"
          tone="amber"
        />
      </div>
      <div className="shadow-layout">
        <Panel>
          <SectionHeading
            title="Open hypothetical trades"
            subtitle="No cherry-picking: losing rows cannot be hidden"
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Opportunity</TableHead>
                <TableHead>Detected</TableHead>
                <TableHead>Predicted</TableHead>
                <TableHead>Later supported</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Follow-up</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shadowTrades.map((trade) => (
                <TableRow key={trade.id}>
                  <TableCell>
                    <strong>{trade.name}</strong>
                  </TableCell>
                  <TableCell>{trade.detected}</TableCell>
                  <TableCell className="mono">
                    {money(trade.predictedProfit)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'mono',
                      trade.laterProfit < 0 ? 'negative' : 'positive',
                    )}
                  >
                    {money(trade.laterProfit)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{trade.status}</Badge>
                  </TableCell>
                  <TableCell>{trade.followUp}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
        <Panel className="calibration-card">
          <SectionHeading
            title="TCG Scout vs baseline"
            subtitle="Conservative profit after all costs"
          />
          <div className="calibration-bars">
            <CalibrationBar label="TCG Scout" value={71} />
            <CalibrationBar label="Lowest visible ask" value={46} />
            <CalibrationBar label="Random watchlist" value={28} />
          </div>
          <RuneDivider />
          <p>
            <strong>Current lesson:</strong> cross-border discounts help
            detection, but shipping and thin exit evidence erase 31% of apparent
            opportunities.
          </p>
        </Panel>
      </div>
    </div>
  );
}

function CalibrationBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span>{label}</span>
      <Progress value={value} />
      <strong>{value}%</strong>
    </div>
  );
}

function AlertsPage({ onNotice }: { onNotice: (text: string) => void }) {
  const [critical, setCritical] = useState(90);
  return (
    <div className="page-stack">
      <Panel className="alert-rule-builder">
        <SectionHeading
          title="Purchase gates"
          subtitle="Critical alerts require high evidence and conservative economics"
          action={
            <Button
              className="gold-button"
              onClick={() => onNotice('Alert thresholds saved for Demo Mode.')}
            >
              Save rules
            </Button>
          }
        />
        <div className="rule-grid">
          <label>
            <span>Match confidence</span>
            <div className="rule-input">
              <Input
                type="number"
                value={critical}
                onChange={(event) => setCritical(Number(event.target.value))}
              />
              <b>% minimum</b>
            </div>
          </label>
          <label>
            <span>Net profit</span>
            <div className="rule-input">
              <Input defaultValue="25" />
              <b>EUR minimum</b>
            </div>
          </label>
          <label>
            <span>ROI</span>
            <div className="rule-input">
              <Input defaultValue="20" />
              <b>% minimum</b>
            </div>
          </label>
          <label>
            <span>Profit per hour</span>
            <div className="rule-input">
              <Input defaultValue="20" />
              <b>EUR minimum</b>
            </div>
          </label>
          <label>
            <span>Confidence grade</span>
            <Select defaultValue="B">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A">A only</SelectItem>
                <SelectItem value="B">B or better</SelectItem>
                <SelectItem value="C">C or better</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label>
            <span>Expected sale window</span>
            <Select defaultValue="90">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
                <SelectItem value="180">180 days</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        <div className="logic-strip">
          <span>Match ≥ {critical}%</span>
          <b>AND</b>
          <span>Profit ≥ €25</span>
          <b>AND</b>
          <span>ROI ≥ 20%</span>
          <b>AND</b>
          <span>Grade ≥ B</span>
          <b>AND</b>
          <span>Risk &lt; 60</span>
        </div>
      </Panel>
      <div className="alerts-layout">
        <Panel>
          <SectionHeading
            title="Recent alerts"
            subtitle="1 critical · 2 high · 4 medium"
          />
          <div className="alert-feed">
            <AlertItem
              priority="Critical"
              title="Prismatic ETB pair below maximum buy"
              detail="€126.45 all-in · €27.95 profit · 22.1% ROI · confidence A"
              time="11m"
            />
            <AlertItem
              priority="High"
              title="Destined Rivals price cut"
              detail="Recheck required before action · exit eBay NL"
              time="37m"
            />
            <AlertItem
              priority="Medium"
              title="Official Spiritforged preorder open"
              detail="7 retailers · €129–€159 · high interest"
              time="3h"
            />
          </div>
        </Panel>
        <Panel className="delivery-panel">
          <SectionHeading
            title="Delivery & cooldown"
            subtitle="Avoid duplicate noise"
          />
          <label>
            <span>Quiet hours</span>
            <Input defaultValue="23:00 – 07:00" />
          </label>
          <label>
            <span>Per-listing cooldown</span>
            <Select defaultValue="60">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="60">1 hour</SelectItem>
                <SelectItem value="240">4 hours</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label>
            <span>Critical delivery</span>
            <Select defaultValue="app">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="app">In app</SelectItem>
                <SelectItem value="email">In app + email</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <Button
            variant="outline"
            className="iron-button"
            onClick={() => onNotice('Test alert delivered in app.')}
          >
            Send test alert
          </Button>
        </Panel>
      </div>
    </div>
  );
}

function AlertItem({
  priority,
  title,
  detail,
  time,
}: {
  priority: string;
  title: string;
  detail: string;
  time: string;
}) {
  return (
    <div className={cn('alert-item', priority.toLowerCase())}>
      <span className="alert-seal">
        <Bell />
      </span>
      <div>
        <span className="eyebrow">{priority}</span>
        <h3>{title}</h3>
        <p>{detail}</p>
      </div>
      <time>{time}</time>
      <Button variant="outline" className="iron-button">
        Open
      </Button>
    </div>
  );
}

function SourcesPage({ onNotice }: { onNotice: (text: string) => void }) {
  return (
    <div className="page-stack">
      <Panel className="source-overview">
        <div>
          <span className="panel-kicker">
            <Radar /> Connector control
          </span>
          <h2>Failures stay isolated</h2>
          <p>
            Every source has explicit capabilities, access policy, rate limits
            and freshness. Demo records never mix with production data.
          </p>
        </div>
        <div className="source-count">
          <strong>2</strong>
          <span>fixture sources healthy</span>
          <small>0 genuinely live without credentials</small>
        </div>
      </Panel>
      <div className="source-card-grid">
        {sources.map((source) => (
          <Panel className="source-card" key={source.id}>
            <div className="source-card-head">
              <span
                className={cn(
                  'source-orb',
                  source.health === 'Healthy' && 'healthy',
                  source.health.includes('required') && 'muted',
                  source.health === 'Format change' && 'warning',
                )}
              />
              <div>
                <h3>{source.name}</h3>
                <p>{source.access}</p>
              </div>
              <Badge variant="outline">{source.mode}</Badge>
            </div>
            <dl>
              <div>
                <dt>Health</dt>
                <dd>{source.health}</dd>
              </div>
              <div>
                <dt>Last scan</dt>
                <dd>{source.lastScan}</dd>
              </div>
              <div>
                <dt>Next scan</dt>
                <dd>{source.nextScan}</dd>
              </div>
              <div>
                <dt>Records</dt>
                <dd className="mono">
                  {source.records.toLocaleString('nl-NL')}
                </dd>
              </div>
            </dl>
            <div className="compliance-note">
              <ShieldAlert />
              {source.note}
            </div>
            <div className="card-actions">
              <Button variant="outline" className="iron-button">
                Configure
              </Button>
              <Button
                className="gold-button"
                onClick={() =>
                  onNotice(
                    `${source.name} connection test complete: ${source.health}.`,
                  )
                }
              >
                <RefreshCw /> Test connection
              </Button>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function ReviewPage({ onNotice }: { onNotice: (text: string) => void }) {
  const [items, setItems] = useState(fixtureReviewItems);
  const resolve = (id: string) => {
    const title = items.find((item) => item.id === id)?.title;
    setItems((current) => current.filter((item) => item.id !== id));
    onNotice(
      `Resolved: ${title}. The correction is recorded for future matching.`,
    );
  };
  return (
    <div className="page-stack">
      <Panel className="review-header">
        <div>
          <span className="panel-kicker">
            <FileSearch /> Human-in-the-loop quality
          </span>
          <h2>{items.length} records need judgment</h2>
          <p>
            Uncertain records are withheld from high-confidence alerts until a
            scout resolves them.
          </p>
        </div>
        <div className="review-stat">
          <strong>
            {
              items.filter(
                (item) =>
                  item.severity === 'High' || item.severity === 'Critical',
              ).length
            }
          </strong>
          <span>priority reviews</span>
          <small>oldest 1 hour</small>
        </div>
      </Panel>
      {items.length ? (
        <Panel className="data-table-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Record</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Badge variant="outline">{item.type}</Badge>
                  </TableCell>
                  <TableCell>
                    <strong>{item.title}</strong>
                  </TableCell>
                  <TableCell>{item.source}</TableCell>
                  <TableCell>
                    <div className="table-progress">
                      <Progress value={item.confidence} />
                      <span>{item.confidence}%</span>
                    </div>
                  </TableCell>
                  <TableCell>{item.age}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        item.severity === 'Critical'
                          ? 'danger-badge'
                          : item.severity === 'High'
                            ? 'warning-badge'
                            : ''
                      }
                    >
                      {item.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      className="gold-button"
                      onClick={() => resolve(item.id)}
                    >
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      ) : (
        <Panel className="empty-state">
          <Check />
          <h2>Review queue cleared</h2>
          <p>
            New low-confidence matches, parser changes and suspicious records
            will appear here.
          </p>
        </Panel>
      )}
    </div>
  );
}

function SettingsPage({ onNotice }: { onNotice: (text: string) => void }) {
  return (
    <div className="page-stack settings-layout">
      <Tabs defaultValue="region">
        <TabsList variant="line">
          <TabsTrigger value="region">Region & costs</TabsTrigger>
          <TabsTrigger value="scores">Scoring</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="display">Display</TabsTrigger>
        </TabsList>
        <TabsContent value="region">
          <Panel className="settings-panel">
            <SectionHeading
              title="Scout territory"
              subtitle="Used for delivered prices, travel cost and user-facing time"
            />
            <div className="settings-grid">
              <label>
                <span>Home country</span>
                <Select defaultValue="nl">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nl">Netherlands</SelectItem>
                    <SelectItem value="be">Belgium</SelectItem>
                    <SelectItem value="de">Germany</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label>
                <span>Postcode</span>
                <Input defaultValue="3511" />
              </label>
              <label>
                <span>Local radius</span>
                <Input defaultValue="50 km" />
              </label>
              <label>
                <span>Currency</span>
                <Select defaultValue="eur">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eur">EUR (€)</SelectItem>
                    <SelectItem value="gbp">GBP (£)</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label>
                <span>Timezone</span>
                <Input defaultValue="Europe/Amsterdam" readOnly />
              </label>
              <label>
                <span>Travel cost</span>
                <Input defaultValue="€0.23 / km" />
              </label>
              <label>
                <span>Labour rate</span>
                <Input defaultValue="€18 / hour" />
              </label>
              <label>
                <span>Default exit</span>
                <Select defaultValue="best">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="best">Best supported exit</SelectItem>
                    <SelectItem value="cardmarket">Cardmarket</SelectItem>
                    <SelectItem value="ebay">eBay</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </div>
            <div className="button-row">
              <Button
                className="gold-button"
                onClick={() => onNotice('Settings saved for Demo Mode.')}
              >
                Save settings
              </Button>
              <Button variant="outline" className="iron-button">
                Reset defaults
              </Button>
            </div>
          </Panel>
        </TabsContent>
        <TabsContent value="scores">
          <Panel className="settings-panel">
            <SectionHeading
              title="Score weights"
              subtitle="Instant Deal, Long-Term Hold and Risk stay separate"
            />
            <ScoreWeight label="Discount to conservative value" value="30%" />
            <ScoreWeight label="Expected net resale margin" value="20%" />
            <ScoreWeight label="Liquidity" value="15%" />
            <ScoreWeight label="Seller reliability" value="10%" />
            <ScoreWeight label="Data confidence" value="10%" />
            <ScoreWeight label="Listing freshness" value="10%" />
            <ScoreWeight label="Cross-market edge" value="5%" />
            <Button className="gold-button">Save weights</Button>
          </Panel>
        </TabsContent>
        <TabsContent value="security">
          <Panel className="settings-panel">
            <SectionHeading
              title="Security controls"
              subtitle="Secrets stay server-side; purchase assistance stops before payment"
            />
            <div className="security-list">
              <div>
                <Check />
                <span>
                  <strong>Safe redirect validation</strong>
                  <small>Only same-origin relative return paths</small>
                </span>
              </div>
              <div>
                <Check />
                <span>
                  <strong>Connector credentials</strong>
                  <small>Encrypted at rest and redacted from logs</small>
                </span>
              </div>
              <div>
                <Check />
                <span>
                  <strong>Cart handoff</strong>
                  <small>
                    Short-lived token, allowlisted domain, price tolerance and
                    nonce
                  </small>
                </span>
              </div>
              <div>
                <ShieldAlert />
                <span>
                  <strong>Final checkout is never automated</strong>
                  <small>
                    No bids, offer acceptance, order submission or payment
                  </small>
                </span>
              </div>
            </div>
          </Panel>
        </TabsContent>
        <TabsContent value="display">
          <Panel className="settings-panel">
            <SectionHeading
              title="Display"
              subtitle="Dense by design, accessible by default"
            />
            <div className="settings-grid">
              <label>
                <span>Data density</span>
                <Select defaultValue="compact">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">Compact</SelectItem>
                    <SelectItem value="comfortable">Comfortable</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label>
                <span>Motion</span>
                <Select defaultValue="system">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">Follow system</SelectItem>
                    <SelectItem value="reduced">Reduced</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ScoreWeight({ label, value }: { label: string; value: string }) {
  return (
    <div className="score-weight">
      <span>{label}</span>
      <Progress value={Number.parseInt(value)} />
      <strong>{value}</strong>
    </div>
  );
}
