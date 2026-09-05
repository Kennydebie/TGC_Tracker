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
  RadioTower,
  RefreshCw,
  ExternalLink,
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
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ScoutCrest, RuneDivider } from '@/components/brand';
import { NativeNavigationLink } from '@/components/native-navigation-link';
import { MarktplaatsScout } from '@/components/marktplaats-scout';
import { AmazonScout } from '@/components/amazon-scout';
import { CommunityRadar } from '@/components/community-radar';
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
  releases,
  reviewItems as fixtureReviewItems,
  shadowTrades,
  sources,
} from '@/lib/fixtures';
import {
  allInCostWithinMaximum,
  calculateEconomics,
  economicsCopy,
  money,
  percent,
  QUICK_FLIP_GATE,
  qualifiesForQuickFlip,
  type Deal,
  type DealEconomics,
} from '@/lib/domain';
import {
  completedSaleProfit,
  DEMO_COMPLETED_SALES,
  DEMO_PORTFOLIO_HOLDINGS,
  portfolioExposure,
  summarizeDemoPortfolio,
} from '@/lib/portfolio';
import { isSafeSourceListingUrl } from '@/lib/listing-url';
import type { MarktplaatsDashboard } from '@/lib/marktplaats';
import type { AmazonDashboard } from '@/lib/amazon';
import {
  buildPortfolioCsv,
  calculateLotOffer,
  daysUntilRelease,
  normalizeIdentity,
  searchDealsByIdentity,
  sortReleasesChronologically,
  validateAlertRule,
  validateUserSettings,
} from '@/lib/workflow-integrity';

type Section =
  | 'dashboard'
  | 'deals'
  | 'marketplaces'
  | 'community'
  | 'lot-lab'
  | 'market'
  | 'releases'
  | 'scanner'
  | 'watchlist'
  | 'shadow'
  | 'portfolio'
  | 'alerts'
  | 'review'
  | 'settings';

type MarketplaceView = 'ebay' | 'marktplaats' | 'amazon' | 'connections';

const LEGACY_MARKETPLACE_VIEWS: Record<string, MarketplaceView> = {
  marktplaats: 'marktplaats',
  amazon: 'amazon',
  sources: 'connections',
};

const MARKETPLACE_VIEWS = new Set<MarketplaceView>([
  'ebay',
  'marktplaats',
  'amazon',
  'connections',
]);

type ScoutAppProps = {
  initialSection?: string;
  initialDealId?: string;
  initialSearchParams?: Record<string, string>;
  initialDeals?: Deal[];
  user?: { displayName: string; email: string } | null;
  signInPath?: string;
  signOutPath?: string;
};

type ShadowTradeRow = {
  id: string;
  dealId: string;
  name: string;
  detected: string;
  economics: DealEconomics;
  laterSupportedNetExit: number | null;
  status: string;
  followUp: string;
  dataMode: 'demo' | 'production';
};

type RecheckResult = {
  availabilityStatus: Deal['availabilityStatus'];
  lastVerifiedAt: string;
  observedItemPrice?: number;
  observedShipping?: number;
  sourceListingUrl: string;
  priceChanged: boolean;
  shippingChanged: boolean;
};

type ReviewQueueItem = {
  id: string;
  type: string;
  title: string;
  source: string;
  confidence: number;
  age: string;
  severity: string;
  originalTitle: string;
  imageUrl: string | null;
  sourceUrl?: string | null;
  evidenceNote?: string;
  dataMode?: 'demo' | 'production' | 'session';
  sessionOnly?: boolean;
  parserField?: string;
  parsedValue?: string;
  currentCandidate: string;
  alternativeCandidates: string[];
  quantity: number;
  language: string;
  condition: string;
  productType: string;
  riskFlags: string[];
};

type UserSettings = {
  country: string;
  postcode: string;
  currency: 'EUR';
  timezone: string;
  localRadiusKm: number;
  laborRate: number;
  requiredRoi: number;
  requiredProfit: number;
};

const defaultUserSettings: UserSettings = {
  country: 'NL',
  postcode: '',
  currency: 'EUR',
  timezone: 'Europe/Amsterdam',
  localRadiusKm: 100,
  laborRate: 18,
  requiredRoi: 0.2,
  requiredProfit: 25,
};

function verificationLabel(item: Deal) {
  const status = item.availabilityStatus.replaceAll('_', ' ');
  const checked = new Date(item.lastVerifiedAt);
  const checkedLabel = Number.isNaN(checked.valueOf())
    ? 'verification time unavailable'
    : checked.toLocaleString('nl-NL', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Europe/Amsterdam',
      });
  return `${status} · checked ${checkedLabel}`;
}

function dealAgeLabel(item: Deal, now = Date.now()) {
  if (item.dataMode === 'demo') return `Fixture age label · ${item.listingAge}`;
  const detectedAt = Date.parse(item.detectedAt);
  if (!Number.isFinite(detectedAt)) return 'Detection time unavailable';
  const minutes = Math.max(0, Math.floor((now - detectedAt) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.floor(hours / 24)} d ago`;
}

function isLiveEbayDeal(item: Deal) {
  return (
    item.dataMode === 'production' &&
    (item.source.toLowerCase().includes('ebay') ||
      item.sourceMarketplace.toUpperCase().startsWith('EBAY_'))
  );
}

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
    section: 'marketplaces',
    label: 'Marketplaces',
    subtitle: 'eBay · Marktplaats · Amazon',
    href: '/marketplaces',
    icon: Radar,
  },
  {
    section: 'community',
    label: 'Community Radar',
    subtitle: 'Whispers & Signals',
    href: '/community',
    icon: RadioTower,
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
  marketplaces: {
    title: 'Marketplaces',
    subtitle: 'Listings, monitors and connections in one workspace',
  },
  community: {
    title: 'Community Radar',
    subtitle: 'Whispers & Signals',
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
  initialSearchParams = {},
  initialDeals = deals,
  user,
  signInPath = '/signin-with-chatgpt?return_to=%2F',
  signOutPath = '/signout-with-chatgpt?return_to=%2F',
}: ScoutAppProps) {
  const requestedSection = LEGACY_MARKETPLACE_VIEWS[initialSection]
    ? 'marketplaces'
    : initialSection;
  const section = validSections.has(requestedSection as Section)
    ? (requestedSection as Section)
    : 'dashboard';
  const [dealRecords, setDealRecords] = useState<Deal[]>(initialDeals);
  const [trackedIds, setTrackedIds] = useState(
    () =>
      new Set(
        initialDeals.filter((item) => item.tracked).map((item) => item.id),
      ),
  );
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(() =>
    initialDealId
      ? (initialDeals.find((item) => item.id === initialDealId) ?? null)
      : null,
  );
  const [notice, setNotice] = useState(() =>
    initialDeals.some((item) => item.dataMode === 'production')
      ? `${initialDeals.filter((item) => item.dataMode === 'production').length} live marketplace listings loaded. Demo records remain clearly isolated.`
      : 'Demo Mode uses fictional, isolated market records.',
  );
  const [globalQuery, setGlobalQuery] = useState('');
  const [pendingTrackIds, setPendingTrackIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [watchlistLoaded, setWatchlistLoaded] = useState(!user);
  const visiblePendingTrackIds = watchlistLoaded
    ? pendingTrackIds
    : new Set(dealRecords.map((item) => item.id));
  const [recheckingIds, setRecheckingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [shadowRows, setShadowRows] = useState<ShadowTradeRow[]>(shadowTrades);
  const productionRecordCount = dealRecords.filter(
    (item) => item.dataMode === 'production',
  ).length;
  const demoRecordCount = dealRecords.filter(
    (item) => item.dataMode === 'demo',
  ).length;
  const initialMarketplaceSource =
    initialSearchParams.source ??
    LEGACY_MARKETPLACE_VIEWS[initialSection] ??
    'ebay';

  useEffect(() => {
    if (!initialDealId) return;
    queueMicrotask(() =>
      setSelectedDeal(
        dealRecords.find((candidate) => candidate.id === initialDealId) ?? null,
      ),
    );
  }, [dealRecords, initialDealId]);

  useEffect(() => {
    document.documentElement.dataset.scoutHydrated = 'true';
    return () => {
      delete document.documentElement.dataset.scoutHydrated;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/deals')
      .then(async (response) => {
        if (!response.ok) throw new Error('Deals could not be loaded.');
        return (await response.json()) as { data: Deal[] };
      })
      .then((payload) => {
        if (!cancelled) {
          setDealRecords(payload.data);
          const productionCount = payload.data.filter(
            (item) => item.dataMode === 'production',
          ).length;
          if (productionCount > 0) {
            setNotice(
              `${productionCount} live marketplace listings loaded. Demo records remain clearly isolated.`,
            );
          }
        }
      })
      .catch(() => {
        if (!cancelled)
          setNotice(
            'Live records are unavailable; isolated demo data remains visible.',
          );
      });
    if (user) {
      void Promise.all([
        fetch('/api/watchlist').then(async (response) => {
          if (!response.ok) throw new Error('Watchlist could not be loaded.');
          return (await response.json()) as { dealIds?: string[] };
        }),
        fetch('/api/shadow').then(async (response) => {
          if (!response.ok)
            throw new Error('Shadow trades could not be loaded.');
          return (await response.json()) as { data?: ShadowTradeRow[] };
        }),
      ])
        .then(([watchlist, shadow]) => {
          if (cancelled) return;
          if (Array.isArray(watchlist.dealIds))
            setTrackedIds(new Set(watchlist.dealIds));
          if (Array.isArray(shadow.data))
            setShadowRows([...shadow.data, ...shadowTrades]);
        })
        .catch(() => {
          if (!cancelled)
            setNotice('Saved Watchtower data could not be loaded.');
        })
        .finally(() => {
          if (!cancelled) setWatchlistLoaded(true);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [user]);

  const toggleTrack = useCallback(
    async (id: string) => {
      if (!user) {
        setNotice('Sign in with ChatGPT before saving Watchtower changes.');
        return;
      }
      const currentlyTracked = trackedIds.has(id);
      setPendingTrackIds((current) => new Set(current).add(id));
      try {
        const response = await fetch(
          `/api/watchlist/${encodeURIComponent(id)}`,
          {
            method: currentlyTracked ? 'DELETE' : 'PUT',
          },
        );
        const payload = (await response.json()) as {
          tracked?: boolean;
          error?: string;
        };
        if (!response.ok)
          throw new Error(payload.error ?? 'Watchtower update failed');
        setTrackedIds((current) => {
          const next = new Set(current);
          if (payload.tracked) next.add(id);
          else next.delete(id);
          return next;
        });
        setNotice(
          payload.tracked ? 'Saved to Watchtower.' : 'Removed from Watchtower.',
        );
      } catch (error) {
        setNotice(
          error instanceof Error ? error.message : 'Watchtower update failed',
        );
      } finally {
        setPendingTrackIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    },
    [trackedIds, user],
  );

  const recheckDeal = async (
    item: Deal,
    openAfterRecheck = false,
  ): Promise<RecheckResult | null> => {
    setRecheckingIds((current) => new Set(current).add(item.id));
    try {
      const response = await fetch(
        `/api/deals/${encodeURIComponent(item.id)}/recheck`,
        { method: 'POST' },
      );
      const payload = (await response.json()) as RecheckResult & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error ?? 'Listing recheck failed');
      setDealRecords((current) =>
        current.map((deal) =>
          deal.id === item.id
            ? {
                ...deal,
                lastVerifiedAt: payload.lastVerifiedAt,
                availabilityStatus: payload.availabilityStatus,
                sourceListingUrl: payload.sourceListingUrl,
                economics:
                  payload.observedItemPrice == null
                    ? deal.economics
                    : {
                        ...calculateEconomics({
                          ...deal.economics,
                          itemPrice: payload.observedItemPrice,
                          inboundShipping:
                            payload.observedShipping ??
                            deal.economics.inboundShipping,
                        }),
                      },
              }
            : deal,
        ),
      );
      setSelectedDeal((current) =>
        current?.id === item.id
          ? {
              ...current,
              lastVerifiedAt: payload.lastVerifiedAt,
              availabilityStatus: payload.availabilityStatus,
              sourceListingUrl: payload.sourceListingUrl,
              economics:
                payload.observedItemPrice == null
                  ? current.economics
                  : calculateEconomics({
                      ...current.economics,
                      itemPrice: payload.observedItemPrice,
                      inboundShipping:
                        payload.observedShipping ??
                        current.economics.inboundShipping,
                    }),
            }
          : current,
      );
      const state = payload.availabilityStatus.replaceAll('_', ' ');
      setNotice(`Listing rechecked: ${state}.`);
      if (
        openAfterRecheck &&
        payload.availabilityStatus !== 'unavailable' &&
        item.dataMode === 'production' &&
        isSafeSourceListingUrl(item.sourceMarketplace, payload.sourceListingUrl)
      ) {
        window.open(payload.sourceListingUrl, '_blank', 'noopener,noreferrer');
      } else if (openAfterRecheck && item.dataMode === 'demo') {
        setNotice(
          'Demo listing rechecked. It has no external marketplace destination.',
        );
      }
      return payload;
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Listing recheck failed',
      );
      return null;
    } finally {
      setRecheckingIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  };

  const shadowBuy = async (item: Deal) => {
    if (!user) {
      setNotice('Sign in with ChatGPT before creating a Shadow Mode trade.');
      return;
    }
    const response = await fetch(
      `/api/deals/${encodeURIComponent(item.id)}/shadow-buy`,
      { method: 'POST' },
    );
    const payload = (await response.json()) as {
      data?: ShadowTradeRow;
      error?: string;
    };
    if (!response.ok || !payload.data) {
      setNotice(payload.error ?? 'Shadow trade could not be saved.');
      return;
    }
    setShadowRows((current) => [payload.data!, ...current]);
    setNotice(`${item.canonicalProduct} saved to Shadow Mode.`);
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
        return dealRecords.filter(qualifiesForQuickFlip).map((item) => ({
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
        const item = dealRecords.find((candidate) => candidate.id === dealId);
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
      async execute(input) {
        const dealId =
          typeof input === 'object' && input && 'dealId' in input
            ? String(input.dealId)
            : '';
        const item = dealRecords.find((candidate) => candidate.id === dealId);
        if (!item) throw new Error('Unknown dealId');
        await toggleTrack(dealId);
        return { dealId, tracked: true, persisted: Boolean(user) };
      },
    });
    return () => lifecycle.abort();
  }, [dealRecords, toggleTrack, user]);

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
            <strong>
              {productionRecordCount > 0 ? 'Live market feed' : 'Demo realm'}
            </strong>
            <small>
              {productionRecordCount > 0
                ? `${productionRecordCount} production records`
                : `${sources.length + 1} configured sources`}
            </small>
          </div>
          <span className="mono">
            {productionRecordCount > 0 ? 'online' : 'isolated'}
          </span>
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
          <form
            className="market-search"
            onSubmit={(event) => {
              event.preventDefault();
              window.location.href = `/deals?q=${encodeURIComponent(globalQuery)}`;
            }}
          >
            <Search aria-hidden="true" />
            <input
              aria-label="Search cards, products, sets or listings"
              placeholder="Search the market…"
              value={globalQuery}
              onChange={(event) => setGlobalQuery(event.target.value)}
            />
            <kbd>⌘ K</kbd>
          </form>
          <div className="top-actions">
            <Badge className="demo-badge">
              {productionRecordCount > 0 ? <HeartPulse /> : <Sparkles />}
              {productionRecordCount > 0
                ? `${productionRecordCount} live · ${demoRecordCount} demo`
                : 'Demo Mode'}
            </Badge>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label="View alerts"
                    variant="outline"
                    size="icon"
                    nativeButton={false}
                    render={
                      <NativeNavigationLink
                        href="/alerts"
                        aria-label="View alerts"
                      />
                    }
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
              deals={dealRecords}
              onInspect={setSelectedDeal}
              onOpenListing={(deal) => void recheckDeal(deal, true)}
              onTrack={toggleTrack}
              pendingTrackIds={visiblePendingTrackIds}
              recheckingIds={recheckingIds}
              trackedIds={trackedIds}
            />
          )}
          {section === 'deals' && (
            <DealsPage
              deals={dealRecords}
              initialQuery={initialSearchParams.q ?? ''}
              onInspect={setSelectedDeal}
              onOpenListing={(deal) => void recheckDeal(deal, true)}
              onTrack={toggleTrack}
              pendingTrackIds={visiblePendingTrackIds}
              recheckingIds={recheckingIds}
              trackedIds={trackedIds}
            />
          )}
          {section === 'marketplaces' && (
            <MarketplacesPage
              deals={dealRecords}
              initialConfigureId={initialSearchParams.configure}
              initialSource={initialMarketplaceSource}
              onInspect={setSelectedDeal}
              onNotice={setNotice}
              onOpenListing={(deal) => void recheckDeal(deal, true)}
              onTrack={toggleTrack}
              pendingTrackIds={visiblePendingTrackIds}
              recheckingIds={recheckingIds}
              trackedIds={trackedIds}
            />
          )}
          {section === 'community' && (
            <CommunityRadar
              initialEventId={initialSearchParams.event}
              signInPath={signInPath}
              userSignedIn={Boolean(user)}
            />
          )}
          {section === 'lot-lab' && <LotLab onNotice={setNotice} />}
          {section === 'market' && (
            <MarketPage
              deals={dealRecords}
              initialDealId={initialSearchParams.dealId}
              initialProductId={initialSearchParams.productId}
              initialQuery={initialSearchParams.q ?? ''}
              onTrack={toggleTrack}
              trackedIds={trackedIds}
            />
          )}
          {section === 'releases' && (
            <ReleasesPage
              initialReleaseId={initialSearchParams.releaseId}
              onNotice={setNotice}
            />
          )}
          {section === 'scanner' && (
            <ScannerPage deals={dealRecords} onNotice={setNotice} />
          )}
          {section === 'portfolio' && <PortfolioPage onNotice={setNotice} />}
          {section === 'watchlist' && (
            <WatchlistPage
              deals={dealRecords}
              onInspect={setSelectedDeal}
              onOpenListing={(deal) => void recheckDeal(deal, true)}
              onTrack={toggleTrack}
              recheckingIds={recheckingIds}
              trackedIds={trackedIds}
            />
          )}
          {section === 'shadow' && <ShadowPage trades={shadowRows} />}
          {section === 'alerts' && (
            <AlertsPage
              deals={dealRecords}
              onInspect={setSelectedDeal}
              onNotice={setNotice}
              onOpenListing={(deal) => void recheckDeal(deal, true)}
              recheckingIds={recheckingIds}
              userSignedIn={Boolean(user)}
            />
          )}
          {section === 'review' && (
            <ReviewPage
              initialSource={initialSearchParams.source}
              onNotice={setNotice}
              userSignedIn={Boolean(user)}
            />
          )}
          {section === 'settings' && (
            <SettingsPage onNotice={setNotice} userSignedIn={Boolean(user)} />
          )}
        </main>
      </div>

      <MobileBottomNav active={section} />
      <DealDetailDialog
        deal={selectedDeal}
        onOpenChange={(open) => !open && setSelectedDeal(null)}
        onOpenListing={(deal) => void recheckDeal(deal, true)}
        onRecheck={(deal) => void recheckDeal(deal)}
        onShadow={(deal) => void shadowBuy(deal)}
        onTrack={toggleTrack}
        rechecking={selectedDeal ? recheckingIds.has(selectedDeal.id) : false}
        tracking={
          selectedDeal ? visiblePendingTrackIds.has(selectedDeal.id) : false
        }
        tracked={selectedDeal ? trackedIds.has(selectedDeal.id) : false}
      />
    </div>
  );
}

function BrandBlock() {
  return (
    <NativeNavigationLink
      className="brand-block"
      href="/"
      aria-label="TCG Scout home"
    >
      <ScoutCrest />
      <div>
        <strong>TCG SCOUT</strong>
        <small>Market intelligence</small>
      </div>
    </NativeNavigationLink>
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
    <NativeNavigationLink
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
    </NativeNavigationLink>
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
          <NativeNavigationLink
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
          <NativeNavigationLink
            className={cn(
              active === item.section && 'active',
              item.section === 'scanner' && 'scan-action',
            )}
            href={item.href}
            key={item.section}
          >
            <Icon />
            <span>{item.label.split(' ')[0]}</span>
          </NativeNavigationLink>
        );
      })}
    </nav>
  );
}

function Panel({
  children,
  className,
  parchment = false,
  ...props
}: React.ComponentProps<'section'> & {
  parchment?: boolean;
}) {
  return (
    <section
      className={cn('arcane-panel', parchment && 'parchment-panel', className)}
      {...props}
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
  deals: records,
  onInspect,
  onOpenListing,
  onTrack,
  pendingTrackIds,
  recheckingIds,
  trackedIds,
}: {
  deals: Deal[];
  onInspect: (deal: Deal) => void;
  onOpenListing: (deal: Deal) => void;
  onTrack: (id: string) => Promise<void>;
  pendingTrackIds: Set<string>;
  recheckingIds: Set<string>;
  trackedIds: Set<string>;
}) {
  const qualified = records.filter(qualifiesForQuickFlip);
  const liveEbayRecords = records.filter(isLiveEbayDeal);
  const demoRecords = records.filter((item) => item.dataMode === 'demo');
  const featuredRecords =
    liveEbayRecords.length > 0 ? liveEbayRecords : records;
  const latestEbayVerification = liveEbayRecords[0]?.lastVerifiedAt;
  const dashboardSources = sources.map((source) =>
    source.id === 'ebay' && liveEbayRecords.length > 0
      ? {
          ...source,
          health: 'Healthy',
          lastScan: latestEbayVerification
            ? `Verified ${new Date(latestEbayVerification).toLocaleString(
                'nl-NL',
                {
                  timeZone: 'Europe/Amsterdam',
                },
              )}`
            : 'Live records received',
          records: liveEbayRecords.length,
        }
      : source,
  );
  const orderedReleases = sortReleasesChronologically(releases);
  const nextReleaseDays = Math.min(
    ...orderedReleases.map(
      (release) =>
        daysUntilRelease(release.releaseDate) ?? Number.POSITIVE_INFINITY,
    ),
  );
  return (
    <div className="page-stack">
      <Panel className="command-panel">
        <div className="command-copy">
          <div className="panel-kicker">
            <Compass /> Evidence-aware ledger · Europe/Amsterdam
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
            <i
              className={
                liveEbayRecords.length > 0 ? 'status-live' : 'status-warn'
              }
            />{' '}
            {liveEbayRecords.length > 0
              ? `eBay connected · ${liveEbayRecords.length} active asks`
              : 'eBay awaiting its first authenticated listing scan'}
          </span>
          <span>
            <i className="status-warn" /> Cardmarket official URLs required
          </span>
          <span>
            <i className="status-warn" /> {fixtureReviewItems.length} fixture
            records need review
          </span>
        </div>
      </Panel>

      <div className="metric-grid">
        <MetricPlaque
          icon={Sparkles}
          label="Visible opportunities"
          value={String(records.length)}
          detail={`${records.filter((item) => item.dataMode === 'production').length} live · ${records.filter((item) => item.dataMode === 'demo').length} demo`}
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
          value={String(
            records.filter((item) => allInCostWithinMaximum(item.economics))
              .length,
          )}
          detail={`${qualified.length} pass every gate`}
          tone="violet"
        />
        <MetricPlaque
          icon={CalendarDays}
          label="Releases nearing"
          value={String(releases.length)}
          detail={
            Number.isFinite(nextReleaseDays)
              ? `next in ${Math.max(0, nextReleaseDays)} days`
              : 'no dated release'
          }
          tone="blue"
        />
        <MetricPlaque
          icon={HeartPulse}
          label="Live source records"
          value={String(
            records.filter((item) => item.dataMode === 'production').length,
          )}
          detail={
            liveEbayRecords.length > 0
              ? 'eBay Browse authenticated'
              : 'awaiting a live source scan'
          }
          tone="green"
        />
        <MetricPlaque
          icon={ShieldAlert}
          label="Needs review"
          value={String(fixtureReviewItems.length)}
          detail="no critical alerts emitted"
          tone="amber"
        />
      </div>

      <div className="content-grid primary-grid">
        <div className="wide-column">
          <SectionHeading
            title={
              liveEbayRecords.length > 0
                ? 'Latest Live eBay Listings'
                : 'Best Hunts Today'
            }
            subtitle={
              liveEbayRecords.length > 0
                ? 'Observed active asks from the official API · not completed-sale evidence'
                : 'Ranked demo opportunities using conservative economics'
            }
            action={
              <NativeNavigationLink className="text-link" href="/deals">
                View bounty board <ArrowRight />
              </NativeNavigationLink>
            }
          />
          <div className="deal-grid">
            {featuredRecords.slice(0, 3).map((item) => (
              <DealCard
                deal={item}
                key={item.id}
                onInspect={onInspect}
                onOpenListing={onOpenListing}
                onTrack={onTrack}
                rechecking={recheckingIds.has(item.id)}
                surface="dashboard"
                tracking={pendingTrackIds.has(item.id)}
                tracked={trackedIds.has(item.id)}
              />
            ))}
          </div>
        </div>

        <div className="side-column">
          <Panel className="pulse-panel">
            <SectionHeading
              title="Market Pulse"
              subtitle="Fictional demo seven-day movement"
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
                <strong>Fixture signal</strong> The demo cohort models six
                retailer reductions.
              </span>
            </div>
          </Panel>

          <Panel className="watch-snapshot">
            <SectionHeading title="Watchtower" subtitle="Recent triggers" />
            <WatchEvent
              deal={demoRecords[0] ?? null}
              tone="critical"
              title="Target crossed"
              time="Fixture event 1"
              onOpenListing={onOpenListing}
              rechecking={Boolean(
                demoRecords[0] && recheckingIds.has(demoRecords[0].id),
              )}
            />
            <WatchEvent
              deal={demoRecords[1] ?? null}
              tone="positive"
              title="New sold evidence"
              detail="Fictional Destined Rivals completed-sale cohort"
              time="Fixture event 2"
              onOpenListing={onOpenListing}
              rechecking={Boolean(
                demoRecords[1] && recheckingIds.has(demoRecords[1].id),
              )}
            />
            <WatchEvent
              deal={demoRecords[2] ?? null}
              tone="warning"
              title="Price changed"
              detail="Origins display · exit now negative"
              time="Fixture event 3"
              onOpenListing={onOpenListing}
              rechecking={Boolean(
                demoRecords[2] && recheckingIds.has(demoRecords[2].id),
              )}
            />
            <NativeNavigationLink
              className="text-link block-link"
              href="/watchlist"
            >
              Open Watchtower <ArrowRight />
            </NativeNavigationLink>
          </Panel>
        </div>
      </div>

      <div className="content-grid lower-grid">
        <Panel className="release-strip">
          <SectionHeading
            title="Release Watch"
            subtitle="Official events and clearly marked community signals"
            action={
              <NativeNavigationLink className="text-link" href="/releases">
                Open codex <ArrowRight />
              </NativeNavigationLink>
            }
          />
          <div className="release-grid">
            {orderedReleases.map((release) => (
              <ReleaseTile key={release.id} release={release} />
            ))}
          </div>
        </Panel>
        <Panel className="source-strip">
          <SectionHeading title="Marketplaces" subtitle="Source freshness" />
          {dashboardSources.map((source) => (
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
  onOpenListing,
  onTrack,
  rechecking,
  surface,
  tracking,
  tracked,
}: {
  deal: Deal;
  onInspect: (deal: Deal) => void;
  onOpenListing: (deal: Deal) => void;
  onTrack: (id: string) => Promise<void>;
  rechecking: boolean;
  surface: 'dashboard' | 'deals';
  tracking: boolean;
  tracked: boolean;
}) {
  const copy = economicsCopy(item.economics);
  return (
    <article
      className={cn('deal-card', item.status === 'Likely Trap' && 'trap-card')}
      data-economics-surface={surface}
      data-deal-id={item.id}
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
          <i /> <span>{dealAgeLabel(item)}</span>
        </div>
        <Badge variant="outline">
          {item.dataMode === 'demo'
            ? 'DEMO · fictional listing'
            : 'LIVE SOURCE'}
        </Badge>
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
          <EconomicMetric label="All-in" value={copy.allInCost} />
          <EconomicMetric label="Net exit" value={copy.conservativeNetExit} />
          <EconomicMetric
            label="Profit"
            value={copy.conservativeProfit}
            tone={
              item.economics.conservativeProfit >= 0 ? 'positive' : 'negative'
            }
          />
          <EconomicMetric
            label="ROI"
            value={copy.roi}
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
            disabled={tracking}
            onClick={() => void onTrack(item.id)}
          >
            {tracking ? (
              <RefreshCw className="spin" />
            ) : tracked ? (
              <Check />
            ) : (
              <Eye />
            )}
            {tracking ? 'Saving…' : tracked ? 'Tracked' : 'Track'}
          </Button>
          <Button
            className="iron-button"
            variant="outline"
            disabled={rechecking || item.availabilityStatus === 'unavailable'}
            onClick={() => onOpenListing(item)}
          >
            {rechecking ? <RefreshCw className="spin" /> : <ExternalLink />}
            {rechecking
              ? 'Rechecking…'
              : item.availabilityStatus === 'unavailable'
                ? 'Unavailable'
                : 'Open listing'}
          </Button>
        </div>
        <small className="verification-line">{verificationLabel(item)}</small>
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
  deal,
  tone,
  title,
  detail,
  time,
  onOpenListing,
  rechecking = false,
}: {
  deal?: Deal | null;
  tone: string;
  title: string;
  detail?: string;
  time: string;
  onOpenListing?: (deal: Deal) => void;
  rechecking?: boolean;
}) {
  const derivedDetail = deal
    ? `${deal.canonicalProduct} · ${economicsCopy(deal.economics).allInCost} all-in · ${economicsCopy(deal.economics).conservativeProfit} profit · ${economicsCopy(deal.economics).roi} ROI`
    : detail;
  return (
    <div
      className="watch-event"
      data-economics-surface={deal ? 'watchtower' : undefined}
      data-deal-id={deal?.id}
    >
      <span className={cn('event-gem', tone)} />
      <div>
        <strong>{title}</strong>
        <small>{derivedDetail}</small>
      </div>
      <time>{time}</time>
      {deal && onOpenListing ? (
        <Button
          size="sm"
          variant="outline"
          disabled={rechecking || deal.availabilityStatus === 'unavailable'}
          onClick={() => onOpenListing(deal)}
        >
          {rechecking ? <RefreshCw className="spin" /> : <ExternalLink />}
          {rechecking ? 'Rechecking…' : 'Open listing'}
        </Button>
      ) : null}
    </div>
  );
}

function ReleaseTile({ release }: { release: (typeof releases)[number] }) {
  const daysAway = daysUntilRelease(release.releaseDate);
  return (
    <article className="release-tile">
      <div className="release-date">
        <strong>{daysAway === null ? '—' : Math.max(0, daysAway)}</strong>
        <small>{daysAway !== null && daysAway < 0 ? 'days ago' : 'days'}</small>
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
  deals: records,
  initialQuery,
  onInspect,
  onOpenListing,
  onTrack,
  pendingTrackIds,
  recheckingIds,
  trackedIds,
}: {
  deals: Deal[];
  initialQuery: string;
  onInspect: (deal: Deal) => void;
  onOpenListing: (deal: Deal) => void;
  onTrack: (id: string) => Promise<void>;
  pendingTrackIds: Set<string>;
  recheckingIds: Set<string>;
  trackedIds: Set<string>;
}) {
  const [game, setGame] = useState('all');
  const [source, setSource] = useState('all');
  const [minimumProfit, setMinimumProfit] = useState('0');
  const [sort, setSort] = useState('score');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [query, setQuery] = useState(initialQuery);
  const [minimumRoi, setMinimumRoi] = useState(0);
  const [minimumGrade, setMinimumGrade] = useState('C');
  const [maximumRisk, setMaximumRisk] = useState(100);
  const [maximumAgeHours, setMaximumAgeHours] = useState(168);
  const [exitMarket, setExitMarket] = useState('any');
  const clearFilters = () => {
    setGame('all');
    setSource('all');
    setMinimumProfit('0');
    setSort('score');
    setQuery('');
    setMinimumRoi(0);
    setMinimumGrade('C');
    setMaximumRisk(100);
    setMaximumAgeHours(168);
    setExitMarket('any');
  };
  const activeFilterCount = [
    game !== 'all',
    source !== 'all',
    minimumProfit !== '0',
    sort !== 'score',
    Boolean(query.trim()),
    minimumRoi !== 0,
    minimumGrade !== 'C',
    maximumRisk !== 100,
    maximumAgeHours !== 168,
    exitMarket !== 'any',
  ].filter(Boolean).length;
  const filtered = useMemo(() => {
    const gradeRank = { A: 3, B: 2, C: 1, D: 0 } as const;
    const list = records.filter((item) => {
      const requiredRank = gradeRank[minimumGrade as keyof typeof gradeRank];
      const exitMatches =
        exitMarket === 'any' ||
        item.exitChannel.toLowerCase().includes(exitMarket);
      return (
        (game === 'all' || item.game === game) &&
        (source === 'all' || item.source === source) &&
        item.economics.conservativeProfit >= Number(minimumProfit || 0) &&
        item.economics.roi >= minimumRoi &&
        gradeRank[item.confidenceGrade] >= requiredRank &&
        item.riskScore <= maximumRisk &&
        item.detectedMinutesAgo <= maximumAgeHours * 60 &&
        exitMatches &&
        `${item.title} ${item.canonicalProduct} ${item.set}`
          .toLowerCase()
          .includes(query.toLowerCase())
      );
    });
    return [...list].sort((a, b) =>
      sort === 'profit'
        ? b.economics.conservativeProfit - a.economics.conservativeProfit
        : sort === 'risk'
          ? a.riskScore - b.riskScore
          : b.instantScore - a.instantScore,
    );
  }, [
    exitMarket,
    game,
    maximumAgeHours,
    maximumRisk,
    minimumGrade,
    minimumProfit,
    minimumRoi,
    query,
    records,
    sort,
    source,
  ]);

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
          <strong>{records.filter(qualifiesForQuickFlip).length}</strong>
          <span>pass the quick-flip gate</span>
          <small>
            ≥ {money(QUICK_FLIP_GATE.minimumProfit)} profit · ≥{' '}
            {percent(QUICK_FLIP_GATE.minimumRoi)} ROI · A/B evidence
          </small>
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
            <SelectValue>{game === 'all' ? 'All games' : game}</SelectValue>
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
            <SelectValue>
              {source === 'all' ? 'All sources' : source}
            </SelectValue>
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
            <SelectValue>
              {{
                '0': 'Any profit',
                '25': 'Profit ≥ €25',
                '100': 'Profit ≥ €100',
              }[minimumProfit] ?? `Profit ≥ €${minimumProfit}`}
            </SelectValue>
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
            <SelectValue>
              {{
                score: 'Best score',
                profit: 'Highest profit',
                risk: 'Lowest risk',
              }[sort] ?? 'Best score'}
            </SelectValue>
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
                {activeFilterCount ? ` (${activeFilterCount} active)` : ''}
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
            <FilterSheet
              exitMarket={exitMarket}
              maximumAgeHours={maximumAgeHours}
              maximumRisk={maximumRisk}
              minimumGrade={minimumGrade}
              minimumRoi={minimumRoi}
              onExitMarketChange={setExitMarket}
              onMaximumAgeHoursChange={setMaximumAgeHours}
              onMaximumRiskChange={setMaximumRisk}
              onMinimumGradeChange={setMinimumGrade}
              onMinimumRoiChange={setMinimumRoi}
            />
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
          Showing {filtered.length} of {records.length} listings ·{' '}
          {records.filter((item) => item.dataMode === 'production').length} live
          · {records.filter((item) => item.dataMode === 'demo').length} demo
        </span>
        <span>
          <Clock3 /> Ranking refreshes with the loaded source records
        </span>
      </div>
      {filtered.length === 0 ? (
        <Panel className="empty-state">
          <Compass />
          <h2>No bounty matches these rules</h2>
          <p>Widen the profit threshold or include another source.</p>
          <Button className="gold-button" onClick={clearFilters}>
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
              onOpenListing={onOpenListing}
              onTrack={onTrack}
              rechecking={recheckingIds.has(item.id)}
              surface="deals"
              tracking={pendingTrackIds.has(item.id)}
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

function FilterSheet({
  exitMarket,
  maximumAgeHours,
  maximumRisk,
  minimumGrade,
  minimumRoi,
  onExitMarketChange,
  onMaximumAgeHoursChange,
  onMaximumRiskChange,
  onMinimumGradeChange,
  onMinimumRoiChange,
}: {
  exitMarket: string;
  maximumAgeHours: number;
  maximumRisk: number;
  minimumGrade: string;
  minimumRoi: number;
  onExitMarketChange: (value: string) => void;
  onMaximumAgeHoursChange: (value: number) => void;
  onMaximumRiskChange: (value: number) => void;
  onMinimumGradeChange: (value: string) => void;
  onMinimumRoiChange: (value: number) => void;
}) {
  return (
    <div className="sheet-form">
      <label>
        <span>Minimum ROI</span>
        <Input
          aria-label="Minimum ROI percent"
          type="number"
          min="0"
          max="500"
          value={Math.round(minimumRoi * 100)}
          onChange={(event) =>
            onMinimumRoiChange(Number(event.target.value) / 100)
          }
        />
      </label>
      <label>
        <span>Minimum confidence</span>
        <Select
          value={minimumGrade}
          onValueChange={(value) => onMinimumGradeChange(value ?? 'C')}
        >
          <SelectTrigger aria-label="Minimum confidence grade">
            <SelectValue>
              {{ A: 'A only', B: 'B or better', C: 'C or better' }[
                minimumGrade
              ] ?? minimumGrade}
            </SelectValue>
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
        <Input
          type="number"
          min="0"
          max="100"
          value={maximumRisk}
          onChange={(event) => onMaximumRiskChange(Number(event.target.value))}
        />
      </label>
      <label>
        <span>Listing age</span>
        <Select
          value={String(maximumAgeHours)}
          onValueChange={(value) =>
            onMaximumAgeHoursChange(Number(value ?? 168))
          }
        >
          <SelectTrigger aria-label="Listing age">
            <SelectValue>
              {{
                '1': 'Last hour',
                '24': 'Last 24 hours',
                '168': 'Last 7 days',
              }[String(maximumAgeHours)] ?? `${maximumAgeHours} hours`}
            </SelectValue>
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
        <Select
          value={exitMarket}
          onValueChange={(value) => onExitMarketChange(value ?? 'any')}
        >
          <SelectTrigger>
            <SelectValue>
              {{
                any: 'Any named exit',
                cardmarket: 'Cardmarket',
                ebay: 'eBay',
                local: 'Local',
              }[exitMarket] ?? exitMarket}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any named exit</SelectItem>
            <SelectItem value="cardmarket">Cardmarket</SelectItem>
            <SelectItem value="ebay">eBay</SelectItem>
            <SelectItem value="local">Local</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <p className="safety-note">
        <ListFilter /> Filters apply immediately to the Bounty Board.
      </p>
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
              <small className="table-sub">{dealAgeLabel(item)}</small>
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
  onOpenListing,
  onRecheck,
  onShadow,
  onTrack,
  rechecking,
  tracking,
  tracked,
}: {
  deal: Deal | null;
  onOpenChange: (open: boolean) => void;
  onOpenListing: (deal: Deal) => void;
  onRecheck: (deal: Deal) => void;
  onShadow: (deal: Deal) => void;
  onTrack: (id: string) => Promise<void>;
  rechecking: boolean;
  tracking: boolean;
  tracked: boolean;
}) {
  if (!item) return null;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className="deal-dialog"
        data-economics-surface="deal-detail"
        data-deal-id={item.id}
      >
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
            <small>{verificationLabel(item)}</small>
          </div>
          <Button
            variant="outline"
            className={cn('iron-button', tracked && 'tracked')}
            disabled={tracking}
            onClick={() => void onTrack(item.id)}
          >
            {tracking ? (
              <RefreshCw className="spin" />
            ) : tracked ? (
              <Check />
            ) : (
              <Eye />
            )}
            {tracking ? 'Saving…' : tracked ? 'Tracked' : 'Track'}
          </Button>
          <Button
            variant="outline"
            className="iron-button"
            onClick={() => onShadow(item)}
          >
            <Eye /> Shadow buy
          </Button>
          <Button
            className="gold-button"
            disabled={rechecking}
            onClick={() => onRecheck(item)}
          >
            <RefreshCw className={cn(rechecking && 'spin')} />
            {rechecking ? 'Rechecking…' : 'Recheck listing'}
          </Button>
          <Button
            className="gold-button"
            disabled={rechecking || item.availabilityStatus === 'unavailable'}
            onClick={() => onOpenListing(item)}
          >
            <ExternalLink />
            {item.availabilityStatus === 'unavailable'
              ? 'Unavailable'
              : 'Open listing'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EconomicsDetail({ deal: item }: { deal: Deal }) {
  const e = item.economics;
  const copy = economicsCopy(e);
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
          value={copy.conservativeProfit}
          tone={e.conservativeProfit >= 0 ? 'positive' : 'negative'}
        />
        <EconomicMetric label="ROI" value={copy.roi} />
        <EconomicMetric label="Profit / hour" value={copy.profitPerHour} />
        <EconomicMetric
          label="Maximum item price"
          value={copy.maximumItemPrice}
        />
        <EconomicMetric
          label="Maximum all-in cost"
          value={copy.maximumAllInCost}
        />
      </div>
      <p className="safety-note">
        Item price {copy.itemPrice} is compared with maximum item price{' '}
        {copy.maximumItemPrice}. All-in cost {copy.allInCost} is compared with
        maximum all-in cost {copy.maximumAllInCost}.
      </p>
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
      type: 'Fictional demonstration transaction',
      source: 'Cardmarket',
      price: item.economics.expectedSalePrice - 4,
      age: 'Fixture offset T-2h',
      weight: 'High',
    },
    {
      type: 'Fictional demonstration transaction',
      source: 'eBay',
      price: item.economics.expectedSalePrice + 7,
      age: 'Fixture offset T-1d',
      weight: 'High',
    },
    {
      type: 'Reference price',
      source: 'Cardmarket guide',
      price: item.economics.expectedSalePrice + 2,
      age: 'Fixture offset T-6h',
      weight: 'Medium',
    },
    {
      type: 'Active ask',
      source: item.source,
      price: item.economics.itemPrice,
      age: dealAgeLabel(item),
      weight: 'Detection only',
    },
  ];
  return (
    <div>
      <div className="evidence-banner">
        <Scale />
        <div>
          <strong>{item.priceEvidence}</strong>
          <span>
            Active asks are separated from completed-sale evidence. Demo
            transactions are never presented as verified market sales.
          </span>
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

type LotCandidate = {
  id: string;
  name: string;
  detail: string;
  value: string;
  confidence: number;
  tone: string;
  quantity: number;
  condition: string;
  evidenceNote: string;
};

const demoLotCandidates: LotCandidate[] = [
  {
    id: 'lot-charizard',
    name: 'Charizard 4/102 holo',
    detail: 'Base Set · probable unlimited · raw',
    value: '€142–€186',
    confidence: 72,
    tone: 'amber',
    quantity: 1,
    condition: 'Raw · condition unverified',
    evidenceNote:
      'Front-only fictional binder photo; edition and condition need review.',
  },
  {
    id: 'lot-blastoise',
    name: 'Blastoise 2/102 holo',
    detail: 'Base Set · possible crease',
    value: '€64–€98',
    confidence: 81,
    tone: 'blue',
    quantity: 1,
    condition: 'Raw · possible crease',
    evidenceNote: 'Fictional image candidate; crease has not been inspected.',
  },
  {
    id: 'lot-modern-holos',
    name: 'Mixed modern holos',
    detail: 'Bulk residual until verified',
    value: '€18–€31',
    confidence: 93,
    tone: 'emerald',
    quantity: 29,
    condition: 'Mixed · ungraded',
    evidenceNote: 'Grouped as bulk; no individual market values are assumed.',
  },
];

const demoLotReviewItems: ReviewQueueItem[] = demoLotCandidates.map(
  (candidate, index) => ({
    id: `lot-review:${candidate.id}`,
    type: index === 2 ? 'Bulk grouping' : 'Product match',
    title: `Confirm ${candidate.name}`,
    source: 'Lot Lab demo binder',
    confidence: candidate.confidence,
    age: 'This session',
    severity: index === 0 ? 'High' : 'Medium',
    originalTitle: candidate.name,
    imageUrl: null,
    sourceUrl: null,
    evidenceNote: candidate.evidenceNote,
    dataMode: 'session',
    sessionOnly: true,
    currentCandidate: candidate.name,
    alternativeCandidates: [],
    quantity: candidate.quantity,
    language: 'Unknown from fictional photo',
    condition: candidate.condition,
    productType: index === 2 ? 'Bulk cards' : 'Single card',
    riskFlags: ['Fictional binder image', 'Manual confirmation required'],
  }),
);

function LotLab({ onNotice }: { onNotice: (text: string) => void }) {
  const [laborHours, setLaborHours] = useState('6.5');
  const [requiredProfit, setRequiredProfit] = useState('100');
  const [selectedFileCount, setSelectedFileCount] = useState(0);
  const [demoLoaded, setDemoLoaded] = useState(false);
  const [candidates, setCandidates] = useState(demoLotCandidates);
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(
    null,
  );
  const [candidateDraft, setCandidateDraft] = useState<LotCandidate | null>(
    null,
  );
  const uploaded = selectedFileCount > 0;
  const numberFromDraft = (value: string) =>
    value.trim() ? Number(value) : Number.NaN;
  const offer = calculateLotOffer({
    grossExit: 292,
    laborHours: numberFromDraft(laborHours),
    laborRate: 18,
    liquidityHaircut: 35,
    expectedLoss: 14,
    sellingCosts: 22,
    requiredProfit: numberFromDraft(requiredProfit),
  });
  const maximumOffer = offer.maximumOffer;
  const activeCandidate = candidates.find(
    (candidate) => candidate.id === editingCandidateId,
  );
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
                  setSelectedFileCount(event.target.files.length);
                  onNotice(
                    `${event.target.files.length} image${event.target.files.length > 1 ? 's' : ''} queued for local demo analysis.`,
                  );
                }
              }}
            />
            {uploaded ? (
              <>
                <Check />
                <strong>
                  {selectedFileCount} binder photo
                  {selectedFileCount === 1 ? '' : 's'} selected
                </strong>
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
                setSelectedFileCount(6);
                setDemoLoaded(true);
                onNotice(
                  'Fictional demo binder loaded: 3 visible candidates and 3 linked review items. Nothing was persisted.',
                );
              }}
            >
              <WandSparkles /> Load demo binder
            </Button>
            <Button
              variant="outline"
              className="iron-button"
              onClick={() =>
                onNotice(
                  'Inspection checklist: seals, corners, quantity, language, condition and authenticity.',
                )
              }
            >
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
          <strong className="maximum-offer mono">
            {maximumOffer === null ? 'Unavailable' : money(maximumOffer)}
          </strong>
          <div className="offer-confidence">
            <span>Confidence C</span>
            <Progress value={64} />
            <span>64%</span>
          </div>
          <LedgerRow label="Identified net exit" value={292} />
          <LedgerRow
            label={`Sorting & listing labour (${laborHours || '—'}h)`}
            value={-(offer.laborCost ?? 0)}
          />
          <LedgerRow label="Unsold reserve" value={-35} />
          <LedgerRow label="Condition & counterfeit reserve" value={-14} />
          <LedgerRow label="Storage & packaging" value={-22} />
          <LedgerRow
            label="Required collection profit"
            value={-Math.max(0, numberFromDraft(requiredProfit) || 0)}
          />
          <LedgerRow
            label="Maximum collection offer"
            value={maximumOffer ?? 0}
            total
          />
        </Panel>
      </div>
      <div className="content-grid lot-lower-grid">
        <Panel>
          <SectionHeading
            title="Candidate review"
            subtitle={
              demoLoaded
                ? '3 fictional candidates · 3 linked review checks · session only'
                : 'Fictional examples · load the demo binder to link its review checks'
            }
            action={
              <Button
                variant="outline"
                className="iron-button"
                onClick={() => {
                  if (!demoLoaded) {
                    onNotice(
                      'Load the demo binder before opening its review items.',
                    );
                    return;
                  }
                  window.location.href = '/review?source=lot-lab';
                }}
              >
                {demoLoaded ? 'Resolve 3 linked checks' : 'Load demo to review'}
              </Button>
            }
          />
          <div className="candidate-grid">
            {candidates.map((candidate) => (
              <CandidateCard
                key={candidate.id}
                {...candidate}
                onEdit={() => {
                  setEditingCandidateId(candidate.id);
                  setCandidateDraft({ ...candidate });
                }}
              />
            ))}
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
              aria-invalid={Boolean(offer.errors.laborHours)}
              onChange={(event) => setLaborHours(event.target.value)}
            />
            {offer.errors.laborHours ? (
              <small className="field-error">{offer.errors.laborHours}</small>
            ) : null}
          </label>
          <label>
            <span>Required net profit</span>
            <Input
              type="number"
              min="0"
              step="10"
              value={requiredProfit}
              aria-invalid={Boolean(offer.errors.requiredProfit)}
              onChange={(event) => setRequiredProfit(event.target.value)}
            />
            {offer.errors.requiredProfit ? (
              <small className="field-error">
                {offer.errors.requiredProfit}
              </small>
            ) : null}
          </label>
          <label>
            <span>Labour rate</span>
            <Input value="€18 / hour" readOnly />
          </label>
          <div
            className={cn(
              'decision-banner',
              maximumOffer !== null && maximumOffer >= 20 ? 'warn' : 'reject',
            )}
          >
            <Scale />
            <div>
              <strong>
                {maximumOffer === null
                  ? 'CORRECT INVALID ASSUMPTIONS'
                  : maximumOffer >= 20
                    ? 'MANUAL INSPECTION REQUIRED'
                    : 'REJECT COLLECTION'}
              </strong>
              <span>
                {maximumOffer === null
                  ? 'The offer is withheld until every cost input is finite and non-negative.'
                  : maximumOffer >= 20
                    ? `Do not offer above ${money(maximumOffer)} before inspecting the three priority cards.`
                    : 'Labour and reserves consume the supported value.'}
              </span>
            </div>
          </div>
        </Panel>
      </div>
      <Dialog
        open={Boolean(activeCandidate && candidateDraft)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingCandidateId(null);
            setCandidateDraft(null);
          }
        }}
      >
        {candidateDraft ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Review fictional lot candidate</DialogTitle>
              <DialogDescription>
                Correct identity and evidence only. The demo value range is not
                recalculated or treated as sale evidence.
              </DialogDescription>
            </DialogHeader>
            <div className="dialog-form-grid">
              <label>
                Candidate identity
                <Input
                  value={candidateDraft.name}
                  onChange={(event) =>
                    setCandidateDraft({
                      ...candidateDraft,
                      name: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Quantity
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={candidateDraft.quantity}
                  onChange={(event) =>
                    setCandidateDraft({
                      ...candidateDraft,
                      quantity: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Condition
                <Input
                  value={candidateDraft.condition}
                  onChange={(event) =>
                    setCandidateDraft({
                      ...candidateDraft,
                      condition: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Captured evidence note
                <Input
                  value={candidateDraft.evidenceNote}
                  onChange={(event) =>
                    setCandidateDraft({
                      ...candidateDraft,
                      evidenceNote: event.target.value,
                    })
                  }
                />
              </label>
            </div>
            <DialogFooter>
              <Button
                className="gold-button"
                disabled={
                  !candidateDraft.name.trim() ||
                  !Number.isInteger(candidateDraft.quantity) ||
                  candidateDraft.quantity < 1 ||
                  !candidateDraft.evidenceNote.trim()
                }
                onClick={() => {
                  setCandidates((current) =>
                    current.map((candidate) =>
                      candidate.id === candidateDraft.id
                        ? candidateDraft
                        : candidate,
                    ),
                  );
                  onNotice(
                    `${candidateDraft.name} was updated in this demo session; its modelled range was not changed.`,
                  );
                  setEditingCandidateId(null);
                  setCandidateDraft(null);
                }}
              >
                Save candidate review
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function CandidateCard({
  name,
  detail,
  value,
  confidence,
  tone,
  quantity,
  condition,
  evidenceNote,
  onEdit,
}: Omit<LotCandidate, 'id'> & {
  onEdit: () => void;
}) {
  return (
    <article className="candidate-card">
      <div className={cn('candidate-art', `tone-${tone}`)}>
        <Sparkles />
      </div>
      <div>
        <h3>
          {name} {quantity > 1 ? `× ${quantity}` : ''}
        </h3>
        <p>{detail}</p>
        <small>{condition}</small>
        <small>{evidenceNote}</small>
        <strong className="mono">{value}</strong>
        <div className="confidence-line">
          <span>Identification</span>
          <Progress value={confidence} />
          <span>{confidence}%</span>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onEdit}>
        Edit
      </Button>
    </article>
  );
}

function MarketPage({
  deals: records,
  initialDealId,
  initialProductId,
  initialQuery,
  onTrack,
  trackedIds,
}: {
  deals: Deal[];
  initialDealId?: string;
  initialProductId?: string;
  initialQuery: string;
  onTrack: (id: string) => Promise<void>;
  trackedIds: Set<string>;
}) {
  const initialSearchValue =
    initialQuery || initialProductId?.replaceAll('-', ' ') || '';
  const [selected, setSelected] = useState<Deal | null>(() => {
    const initial = searchDealsByIdentity(
      records,
      initialSearchValue,
      initialDealId,
    );
    return initial[0] ?? null;
  });
  const [marketQuery, setMarketQuery] = useState(initialSearchValue);
  const [marketResults, setMarketResults] = useState(() =>
    searchDealsByIdentity(records, initialSearchValue, initialDealId),
  );
  useEffect(() => {
    queueMicrotask(() => {
      const next = searchDealsByIdentity(
        records,
        initialSearchValue,
        initialDealId,
      );
      setMarketResults(next);
      setSelected((current) => {
        if (current) {
          const refreshed = next.find((item) => item.id === current.id);
          if (refreshed) return refreshed;
        }
        return next[0] ?? null;
      });
    });
  }, [initialDealId, initialSearchValue, records]);
  const runMarketSearch = () => {
    const next = searchDealsByIdentity(records, marketQuery);
    setMarketResults(next);
    setSelected(next[0] ?? null);
  };
  return (
    <div className="page-stack">
      <Panel className="market-command">
        <label className="market-page-search">
          <Search />
          <Input
            placeholder="Search product, set, EAN or marketplace ID"
            value={marketQuery}
            onChange={(event) => setMarketQuery(event.target.value)}
          />
        </label>
        <Button className="gold-button" onClick={runMarketSearch}>
          Search market
        </Button>
      </Panel>
      <div className="market-layout">
        <Panel className="market-results">
          <SectionHeading
            title="Canonical products"
            subtitle="Identity before price comparison"
          />
          {marketResults.length ? (
            marketResults.map((item) => (
              <button
                className={cn(
                  'market-result',
                  selected?.id === item.id && 'active',
                )}
                onClick={() => setSelected(item)}
                key={item.id}
              >
                <ProductGlyph deal={item} compact />
                <span>
                  <strong>{item.canonicalProduct}</strong>
                  <small>
                    {item.game} · {item.set} · {item.productType} ·{' '}
                    {item.language}
                  </small>
                </span>
                <Badge variant="outline">{item.matchConfidence}%</Badge>
              </button>
            ))
          ) : (
            <output className="market-no-results">
              <Search />
              <strong>No supported market comparison</strong>
              <span>
                No canonical record matches “{marketQuery || 'this query'}”. No
                unrelated product has been substituted.
              </span>
            </output>
          )}
        </Panel>
        {selected ? (
          <div className="market-detail-stack">
            <Panel className="price-chart-panel">
              <div className="chart-header">
                <div>
                  <span className="eyebrow">
                    {selected.game} · {selected.set}
                  </span>
                  <h2>{selected.canonicalProduct}</h2>
                  <p>
                    Modelled conservative exit—not an observed market median
                  </p>
                </div>
                <div className="chart-value">
                  <strong className="mono">
                    {money(selected.economics.expectedSalePrice)}
                  </strong>
                  <Badge variant="outline">MODELLED VALUE</Badge>
                </div>
              </div>
              <div className="market-evidence-gap">
                <Info />
                <div>
                  <strong>No product-scoped time series is available</strong>
                  <span>
                    TCG Scout will not draw a synthetic history from another
                    product. {selected.priceEvidence}
                  </span>
                </div>
              </div>
              <div className="market-stat-row">
                <EconomicMetric
                  label="Observed ask"
                  value={money(selected.economics.itemPrice)}
                />
                <EconomicMetric
                  label="Modelled gross exit"
                  value={money(selected.economics.expectedSalePrice)}
                />
                <EconomicMetric
                  label="Conservative net exit"
                  value={money(selected.economics.conservativeNetExit)}
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
                    onClick={() => void onTrack(selected.id)}
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
                    source={selected.source}
                    type="Observed active ask"
                    item={selected.economics.itemPrice}
                    delivered={selected.economics.allInCost}
                    age={dealAgeLabel(selected)}
                    status="Available"
                  />
                  <ComparisonRow
                    source="TCG Scout model"
                    type="Modelled exit after fees and reserves"
                    item={selected.economics.expectedSalePrice}
                    delivered={selected.economics.conservativeNetExit}
                    age="Scenario"
                    status="Modelled"
                  />
                </TableBody>
              </Table>
            </Panel>
          </div>
        ) : (
          <Panel className="empty-state market-empty-detail">
            <Search />
            <h2>No evidence panel selected</h2>
            <p>
              Refine the canonical product, set, game or listing ID. Existing
              details were cleared when the search returned no match.
            </p>
          </Panel>
        )}
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

function ReleasesPage({
  initialReleaseId,
  onNotice,
}: {
  initialReleaseId?: string;
  onNotice: (text: string) => void;
}) {
  const [view, setView] = useState('timeline');
  const [gameFilter, setGameFilter] = useState('all');
  const [scopeFilter, setScopeFilter] = useState('eu');
  const [watchedReleaseIds, setWatchedReleaseIds] = useState(
    () =>
      new Set(
        releases
          .filter((release) => release.watched)
          .map((release) => release.id),
      ),
  );
  const filteredReleases = sortReleasesChronologically(
    releases.filter(
      (release) =>
        (gameFilter === 'all' ||
          normalizeIdentity(release.game) === gameFilter) &&
        (scopeFilter !== 'official' || release.official) &&
        (scopeFilter !== 'watched' || watchedReleaseIds.has(release.id)),
    ),
  );
  const toggleReleaseWatch = (release: (typeof releases)[number]) => {
    const wasWatched = watchedReleaseIds.has(release.id);
    setWatchedReleaseIds((current) => {
      const next = new Set(current);
      if (wasWatched) next.delete(release.id);
      else next.add(release.id);
      return next;
    });
    onNotice(
      wasWatched
        ? `${release.name} was removed from this session's release watch.`
        : `${release.name} is now watched for this session.`,
    );
  };
  return (
    <div className="page-stack">
      <Panel className="filter-bar release-filters">
        <Tabs
          value={view}
          onValueChange={(value) => setView(value ?? 'timeline')}
        >
          <TabsList>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="table">Compact table</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select
          value={gameFilter}
          onValueChange={(value) => setGameFilter(value ?? 'all')}
        >
          <SelectTrigger aria-label="Filter releases by game">
            <SelectValue>
              {{ all: 'All games', pokemon: 'Pokémon', riftbound: 'Riftbound' }[
                gameFilter
              ] ?? 'All games'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All games</SelectItem>
            <SelectItem value="pokemon">Pokémon</SelectItem>
            <SelectItem value="riftbound">Riftbound</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={scopeFilter}
          onValueChange={(value) => setScopeFilter(value ?? 'eu')}
        >
          <SelectTrigger aria-label="Filter releases by scope">
            <SelectValue>
              {{
                eu: 'Europe',
                official: 'Official only',
                watched: 'Watched only',
              }[scopeFilter] ?? 'Europe'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="eu">Europe</SelectItem>
            <SelectItem value="official">Official only</SelectItem>
            <SelectItem value="watched">Watched only</SelectItem>
          </SelectContent>
        </Select>
      </Panel>
      {filteredReleases.length === 0 ? (
        <Panel className="empty-state">
          <CalendarDays />
          <h2>No releases match these filters</h2>
          <p>Try another game or include releases that are not watched yet.</p>
        </Panel>
      ) : view === 'timeline' ? (
        <div className="release-timeline" data-release-view="timeline">
          {filteredReleases.map((release, index) => (
            <div
              className={cn(
                'timeline-entry',
                initialReleaseId === release.id && 'highlighted',
              )}
              key={release.id}
            >
              <div className="timeline-marker">
                <span>
                  {Math.max(0, daysUntilRelease(release.releaseDate) ?? 0)}
                </span>
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
                  aria-pressed={watchedReleaseIds.has(release.id)}
                  onClick={() => toggleReleaseWatch(release)}
                >
                  {watchedReleaseIds.has(release.id) ? <Check /> : <Eye />}
                  {watchedReleaseIds.has(release.id)
                    ? 'Watching release'
                    : 'Watch release'}
                </Button>
              </Panel>
              {index < filteredReleases.length - 1 && (
                <span className="timeline-line" />
              )}
            </div>
          ))}
        </div>
      ) : view === 'calendar' ? (
        <Panel className="release-strip" data-release-view="calendar">
          <SectionHeading
            title="Release date cards"
            subtitle="Upcoming dates in chronological order"
          />
          <div className="release-grid">
            {filteredReleases.map((release) => (
              <ReleaseTile key={release.id} release={release} />
            ))}
          </div>
        </Panel>
      ) : (
        <Panel className="data-table-panel" data-release-view="table">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Game</TableHead>
                <TableHead>Release</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Source status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReleases.map((release) => (
                <TableRow key={release.id}>
                  <TableCell>{release.releaseDate}</TableCell>
                  <TableCell>{release.game}</TableCell>
                  <TableCell>{release.name}</TableCell>
                  <TableCell>{release.product}</TableCell>
                  <TableCell>
                    {release.official ? 'Official' : 'Unconfirmed'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
    </div>
  );
}

function ScannerPage({
  deals: records,
  onNotice,
}: {
  deals: Deal[];
  onNotice: (text: string) => void;
}) {
  const [scanned, setScanned] = useState(false);
  const demoDeal = records[0];
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
          <Button
            className="gold-button"
            onClick={() => {
              setScanned(true);
              onNotice(
                'Demo scan simulated. No file was read, retained or analysed.',
              );
            }}
          >
            <WandSparkles /> Simulate Demo Scan
          </Button>
          <p>
            This simulation loads a predetermined fixture. No image recognition
            occurs and no file is selected or retained.
          </p>
        </div>
        <div className="scanner-privacy">
          <ShieldAlert />
          <span>
            A future live scanner must verify that an upload is a genuine image
            before reading it. This demo does not upload or inspect any file.
          </span>
        </div>
      </Panel>
      <Panel className="scan-result" parchment>
        {scanned && demoDeal ? (
          <>
            <span className="eyebrow">Candidate match</span>
            <div className="scan-match">
              <ProductGlyph deal={demoDeal} />
              <div>
                <h2>{demoDeal.canonicalProduct}</h2>
                <p>{demoDeal.set} · predetermined demonstration candidate</p>
                <Badge variant="outline">SIMULATED · not image-derived</Badge>
              </div>
            </div>
            <div className="scan-evidence">
              <LedgerRow label="Suggested identity" value={0} />
              <p>
                No visual evidence was evaluated. Confirming a production match
                requires a real recognition pipeline and human review.
              </p>
            </div>
            <div className="scan-actions">
              <Button
                className="gold-button"
                onClick={() => {
                  window.location.href = `/market?dealId=${encodeURIComponent(demoDeal.id)}`;
                }}
              >
                Compare market
              </Button>
              <Button
                className="iron-button"
                variant="outline"
                onClick={() => {
                  setScanned(false);
                  onNotice('Simulated candidate cleared.');
                }}
              >
                Clear demo candidate
              </Button>
            </div>
          </>
        ) : (
          <div className="result-empty">
            <Eye />
            <h2>No scan yet</h2>
            <p>
              A predetermined demo candidate will appear here. Real image
              recognition and correction are not enabled.
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}

function PortfolioPage({ onNotice }: { onNotice: (text: string) => void }) {
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [inventoryLots, setInventoryLots] = useState<
    {
      id: string;
      name: string;
      remainingQuantity: number;
      allInBasis: number;
    }[]
  >([]);
  const [portfolioBusy, setPortfolioBusy] = useState(false);
  const [purchaseDealId, setPurchaseDealId] = useState(deals[0]?.id ?? '');
  const [purchaseQuantity, setPurchaseQuantity] = useState(1);
  const [purchaseItemPrice, setPurchaseItemPrice] = useState(
    deals[0]?.economics.itemPrice ?? 0,
  );
  const [purchaseCosts, setPurchaseCosts] = useState(
    deals[0]?.economics.nonItemAcquisitionCosts ?? 0,
  );
  const [saleLotId, setSaleLotId] = useState('');
  const [saleGross, setSaleGross] = useState(0);
  const [saleCosts, setSaleCosts] = useState(0);
  const loadInventory = async () => {
    const response = await fetch('/api/purchases');
    const payload = (await response.json()) as {
      data?: typeof inventoryLots;
      error?: string;
    };
    if (response.ok && payload.data) {
      setInventoryLots(payload.data);
      setSaleLotId((current) => current || payload.data?.[0]?.id || '');
    }
  };
  useEffect(() => {
    const timeout = window.setTimeout(() => void loadInventory(), 0);
    return () => window.clearTimeout(timeout);
  }, []);
  const holdings = DEMO_PORTFOLIO_HOLDINGS;
  const portfolio = summarizeDemoPortfolio();
  const gameExposure = portfolioExposure(holdings, 'game');
  const strategyExposure = portfolioExposure(holdings, 'strategy');
  const selectedPurchaseDeal =
    deals.find((deal) => deal.id === purchaseDealId) ?? null;
  const purchaseValid =
    Boolean(selectedPurchaseDeal) &&
    Number.isInteger(purchaseQuantity) &&
    purchaseQuantity >= 1 &&
    Number.isFinite(purchaseItemPrice) &&
    purchaseItemPrice >= 0 &&
    Number.isFinite(purchaseCosts) &&
    purchaseCosts >= 0;
  const saleValid =
    Boolean(saleLotId) &&
    Number.isFinite(saleGross) &&
    saleGross >= 0 &&
    Number.isFinite(saleCosts) &&
    saleCosts >= 0;
  return (
    <div className="page-stack">
      <div className="metric-grid vault-metrics">
        <MetricPlaque
          icon={HandCoins}
          label="Cash invested"
          value={money(portfolio.cashInvested)}
          detail="4 displayed fictional open lots"
          tone="gold"
        />
        <MetricPlaque
          icon={Vault}
          label="Patient-sale value"
          value={money(portfolio.patientSaleValue)}
          detail="4 displayed lots · modelled"
          tone="blue"
        />
        <MetricPlaque
          icon={Scale}
          label="Conservative cash-out"
          value={money(portfolio.conservativeLiquidationValue)}
          detail="4 displayed lots · after exit costs"
          tone="green"
        />
        <MetricPlaque
          icon={TrendingUp}
          label="Realised profit"
          value={money(portfolio.realisedProfit)}
          detail="2 displayed fictional closed sales"
          tone="green"
        />
        <MetricPlaque
          icon={Clock3}
          label="Average holding"
          value={`${portfolio.averageHoldingDays}d`}
          detail="4 displayed open lots"
          tone="violet"
        />
        <MetricPlaque
          icon={AlertTriangle}
          label="Dead inventory"
          value={money(portfolio.deadInventory)}
          detail="basis of displayed 90d+ lot"
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
                  onClick={() => setPurchaseOpen(true)}
                >
                  Record purchase
                </Button>
                <Button
                  className="gold-button"
                  disabled={!inventoryLots.length}
                  onClick={() => setSaleOpen(true)}
                >
                  Record sale
                </Button>
              </div>
            }
          />
          <p className="scope-note">
            Headline values reconcile to the four fictional open lots below.
            Account-saved demo lots remain separate until cash-out evidence is
            recorded.
          </p>
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
              {inventoryLots.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <strong>{item.name}</strong>
                    <small className="table-sub">Persisted demo lot</small>
                  </TableCell>
                  <TableCell>{item.remainingQuantity}</TableCell>
                  <TableCell className="mono">
                    {money(item.allInBasis)}
                  </TableCell>
                  <TableCell>—</TableCell>
                  <TableCell>—</TableCell>
                  <TableCell>New</TableCell>
                  <TableCell>
                    <Badge variant="outline">Demo saved</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
        <Panel className="exposure-panel">
          <SectionHeading title="Exposure" subtitle="By game and strategy" />
          {gameExposure.map((entry) => (
            <ExposureBar
              key={entry.label}
              label={entry.label}
              value={entry.percentage}
              amount={money(entry.amount)}
            />
          ))}
          <RuneDivider />
          {strategyExposure.map((entry) => (
            <ExposureBar
              key={entry.label}
              label={entry.label}
              value={entry.percentage}
              amount={money(entry.amount)}
            />
          ))}
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
          Estimated values are never labelled as realised profit. The two
          fictional completed-sale rows below reconcile to this fixture total.
        </p>
        <div className="completed-sale-ledger">
          {DEMO_COMPLETED_SALES.map((sale) => (
            <div key={sale.id}>
              <span>{sale.name}</span>
              <small>
                Gross {money(sale.grossProceeds)} · costs{' '}
                {money(sale.sellingCosts)} · basis {money(sale.basis)}
              </small>
              <strong
                className={cn(
                  'mono',
                  completedSaleProfit(sale) >= 0 ? 'positive' : 'negative',
                )}
              >
                {money(completedSaleProfit(sale))}
              </strong>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          className="iron-button"
          onClick={() => {
            const csv = buildPortfolioCsv([
              ...holdings.map((item) => ({
                product: item.name,
                quantity: item.qty,
                costBasis: item.basis,
                cashOutNet: item.liquidation,
                patientNet: item.patient,
                status: item.status,
                dataMode: 'demo' as const,
              })),
              ...inventoryLots.map((item) => ({
                product: item.name,
                quantity: item.remainingQuantity,
                costBasis: item.allInBasis,
                cashOutNet: null,
                patientNet: null,
                status: 'Awaiting valuation evidence',
                dataMode: 'demo' as const,
              })),
            ]);
            const url = URL.createObjectURL(
              new Blob([csv], { type: 'text/csv;charset=utf-8' }),
            );
            const link = document.createElement('a');
            link.href = url;
            link.download = 'tcg-scout-accounting.csv';
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
            onNotice(
              'Accounting CSV download started with the displayed fixture lots and any separate account-saved demo lots.',
            );
          }}
        >
          Export accounting CSV
        </Button>
      </Panel>
      <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record purchase</DialogTitle>
            <DialogDescription>
              Creates a persisted demo purchase and inventory lot.
            </DialogDescription>
          </DialogHeader>
          <label>
            <span>Canonical product</span>
            <Select
              value={purchaseDealId}
              onValueChange={(value) => {
                if (!value) return;
                const deal = deals.find((item) => item.id === value);
                setPurchaseDealId(value);
                if (deal) {
                  setPurchaseItemPrice(deal.economics.itemPrice);
                  setPurchaseCosts(deal.economics.nonItemAcquisitionCosts);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue>
                  {selectedPurchaseDeal?.canonicalProduct ?? 'Choose a product'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {deals.map((deal) => (
                  <SelectItem key={deal.id} value={deal.id}>
                    {deal.canonicalProduct} · {deal.set}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label>
            <span>Quantity</span>
            <Input
              type="number"
              min="1"
              step="1"
              value={purchaseQuantity}
              aria-invalid={
                !Number.isInteger(purchaseQuantity) || purchaseQuantity < 1
              }
              onChange={(event) =>
                setPurchaseQuantity(Number(event.target.value))
              }
            />
          </label>
          <label>
            <span>Item price</span>
            <Input
              type="number"
              min="0"
              value={purchaseItemPrice}
              aria-invalid={purchaseItemPrice < 0}
              onChange={(event) =>
                setPurchaseItemPrice(Number(event.target.value))
              }
            />
          </label>
          <label>
            <span>Acquisition costs</span>
            <Input
              type="number"
              min="0"
              value={purchaseCosts}
              aria-invalid={purchaseCosts < 0}
              onChange={(event) => setPurchaseCosts(Number(event.target.value))}
            />
          </label>
          <DialogFooter>
            <Button
              className="gold-button"
              disabled={portfolioBusy || !purchaseValid}
              onClick={async () => {
                setPortfolioBusy(true);
                try {
                  const response = await fetch('/api/purchases', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      dealId: selectedPurchaseDeal?.id,
                      quantity: purchaseQuantity,
                      itemPrice: purchaseItemPrice,
                      acquisitionCosts: purchaseCosts,
                      strategy: 'Quick flip',
                    }),
                  });
                  const payload = (await response.json()) as { error?: string };
                  if (!response.ok)
                    throw new Error(
                      payload.error ?? 'Purchase could not be saved',
                    );
                  await loadInventory();
                  setPurchaseOpen(false);
                  onNotice('Purchase and inventory lot saved.');
                } catch (error) {
                  onNotice(
                    error instanceof Error ? error.message : 'Purchase failed',
                  );
                } finally {
                  setPortfolioBusy(false);
                }
              }}
            >
              {portfolioBusy ? 'Saving…' : 'Save purchase'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={saleOpen} onOpenChange={setSaleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record completed sale</DialogTitle>
            <DialogDescription>
              Realised profit is calculated only after this persisted sale.
            </DialogDescription>
          </DialogHeader>
          <label>
            <span>Inventory lot</span>
            <Select
              value={saleLotId}
              onValueChange={(value) => setSaleLotId(value ?? '')}
            >
              <SelectTrigger>
                <SelectValue>
                  {inventoryLots.find((lot) => lot.id === saleLotId)?.name ??
                    'Choose an inventory lot'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {inventoryLots.map((lot) => (
                  <SelectItem key={lot.id} value={lot.id}>
                    {lot.name} · {lot.remainingQuantity} available
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label>
            <span>Gross proceeds</span>
            <Input
              type="number"
              min="0"
              value={saleGross}
              aria-invalid={saleGross < 0}
              onChange={(event) => setSaleGross(Number(event.target.value))}
            />
          </label>
          <label>
            <span>Selling costs</span>
            <Input
              type="number"
              min="0"
              value={saleCosts}
              aria-invalid={saleCosts < 0}
              onChange={(event) => setSaleCosts(Number(event.target.value))}
            />
          </label>
          <DialogFooter>
            <Button
              className="gold-button"
              disabled={portfolioBusy || !saleValid}
              onClick={async () => {
                setPortfolioBusy(true);
                try {
                  const response = await fetch('/api/sales', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      inventoryLotId: saleLotId,
                      quantity: 1,
                      venue: 'Demo completed sale',
                      gross: saleGross,
                      costs: saleCosts,
                    }),
                  });
                  const payload = (await response.json()) as { error?: string };
                  if (!response.ok)
                    throw new Error(payload.error ?? 'Sale could not be saved');
                  await loadInventory();
                  setSaleOpen(false);
                  onNotice(
                    'Completed sale saved and realised profit calculated.',
                  );
                } catch (error) {
                  onNotice(
                    error instanceof Error ? error.message : 'Sale failed',
                  );
                } finally {
                  setPortfolioBusy(false);
                }
              }}
            >
              {portfolioBusy ? 'Saving…' : 'Save completed sale'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  deals: records,
  onInspect,
  onOpenListing,
  onTrack,
  recheckingIds,
  trackedIds,
}: {
  deals: Deal[];
  onInspect: (deal: Deal) => void;
  onOpenListing: (deal: Deal) => void;
  onTrack: (id: string) => Promise<void>;
  recheckingIds: Set<string>;
  trackedIds: Set<string>;
}) {
  const watched = records.filter((item) => trackedIds.has(item.id));
  return (
    <div className="page-stack">
      <Panel className="watch-command">
        <div>
          <span className="panel-kicker">
            <Telescope /> {watched.length} tracked product
            {watched.length === 1 ? '' : 's'} · 1 shared purchase gate
          </span>
          <h2>Products moving toward your buy price</h2>
          <p>
            Targets use all-in cost and evidence confidence—not a headline
            listing price.
          </p>
        </div>
        <Button
          className="gold-button"
          onClick={() => {
            window.location.href = '/alerts';
          }}
        >
          Configure shared alert gates
        </Button>
      </Panel>
      <div className="watchlist-grid">
        {watched.length ? (
          watched.map((item) => {
            const percentageAboveTarget =
              item.economics.maximumAllInCost > 0
                ? ((item.economics.allInCost -
                    item.economics.maximumAllInCost) /
                    item.economics.maximumAllInCost) *
                  100
                : null;
            return (
              <Panel
                className="watch-product"
                data-economics-surface="watchtower"
                data-deal-id={item.id}
                key={item.id}
              >
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
                      allInCostWithinMaximum(item.economics)
                        ? 'positive-badge'
                        : 'warning-badge'
                    }
                  >
                    {allInCostWithinMaximum(item.economics)
                      ? 'Below target'
                      : percentageAboveTarget === null
                        ? 'Target unavailable'
                        : `${Math.abs(percentageAboveTarget).toFixed(1)}% above target`}
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
                      (item.economics.maximumAllInCost /
                        item.economics.allInCost) *
                        100,
                    )}
                  />
                  <span>
                    Max all-in{' '}
                    <b className="mono">
                      {money(item.economics.maximumAllInCost)}
                    </b>
                  </span>
                </div>
                <div className="card-actions">
                  <Button
                    className="gold-button"
                    onClick={() => onInspect(item)}
                  >
                    Inspect
                  </Button>
                  <Button
                    variant="outline"
                    className="iron-button"
                    onClick={() => void onTrack(item.id)}
                  >
                    Remove
                  </Button>
                  <Button
                    variant="outline"
                    className="iron-button"
                    disabled={recheckingIds.has(item.id)}
                    onClick={() => onOpenListing(item)}
                  >
                    {recheckingIds.has(item.id) ? (
                      <RefreshCw className="spin" />
                    ) : (
                      <ExternalLink />
                    )}
                    {recheckingIds.has(item.id)
                      ? 'Rechecking…'
                      : 'Open listing'}
                  </Button>
                </div>
              </Panel>
            );
          })
        ) : (
          <Panel className="empty-state">
            <Telescope />
            <h2>No products are tracked</h2>
            <p>Use Watch product on a deal or market record to add one.</p>
          </Panel>
        )}
      </div>
      <Panel>
        <SectionHeading
          title="Triggered watch events"
          subtitle="Deduplicated and subject to cooldowns"
        />
        <WatchEvent
          deal={watched[0] ?? records[0] ?? null}
          tone="critical"
          title="Critical · all-in below maximum buy"
          time="Fixture event 1"
          onOpenListing={onOpenListing}
          rechecking={Boolean(
            (watched[0] ?? records[0]) &&
            recheckingIds.has((watched[0] ?? records[0]).id),
          )}
        />
        <WatchEvent
          deal={records[1] ?? null}
          tone="positive"
          title="New sold evidence"
          detail="Fictional Destined Rivals completed-sale cohort · 3 records"
          time="Fixture event 2"
          onOpenListing={onOpenListing}
          rechecking={Boolean(records[1] && recheckingIds.has(records[1].id))}
        />
        <WatchEvent
          deal={records[2] ?? null}
          tone="warning"
          title="Price changed after alert"
          detail="Origins display no longer profitable after fees"
          time="Fixture event 3"
          onOpenListing={onOpenListing}
          rechecking={Boolean(records[2] && recheckingIds.has(records[2].id))}
        />
      </Panel>
    </div>
  );
}

function ShadowPage({ trades }: { trades: ShadowTradeRow[] }) {
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
              {trades.map((trade) => {
                const laterProfit =
                  trade.laterSupportedNetExit == null
                    ? null
                    : trade.laterSupportedNetExit - trade.economics.allInCost;
                return (
                  <TableRow
                    key={trade.id}
                    data-economics-surface="shadow"
                    data-deal-id={trade.dealId}
                  >
                    <TableCell>
                      <strong>{trade.name}</strong>
                    </TableCell>
                    <TableCell>{trade.detected}</TableCell>
                    <TableCell className="mono">
                      {money(trade.economics.conservativeProfit)} ·{' '}
                      {percent(trade.economics.roi)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'mono',
                        laterProfit != null && laterProfit < 0
                          ? 'negative'
                          : 'positive',
                      )}
                    >
                      {laterProfit == null ? '—' : money(laterProfit)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{trade.status}</Badge>
                    </TableCell>
                    <TableCell>{trade.followUp}</TableCell>
                  </TableRow>
                );
              })}
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

function AlertsPage({
  deals: records,
  onInspect,
  onNotice,
  onOpenListing,
  recheckingIds,
  userSignedIn,
}: {
  deals: Deal[];
  onInspect: (deal: Deal) => void;
  onNotice: (text: string) => void;
  onOpenListing: (deal: Deal) => void;
  recheckingIds: Set<string>;
  userSignedIn: boolean;
}) {
  const [critical, setCritical] = useState<number>(
    QUICK_FLIP_GATE.matchConfidence,
  );
  const [minimumProfit, setMinimumProfit] = useState<number>(
    QUICK_FLIP_GATE.minimumProfit,
  );
  const [minimumRoi, setMinimumRoi] = useState(
    QUICK_FLIP_GATE.minimumRoi * 100,
  );
  const [minimumProfitPerHour, setMinimumProfitPerHour] = useState<number>(
    QUICK_FLIP_GATE.minimumProfitPerHour,
  );
  const [minimumGrade, setMinimumGrade] = useState('B');
  const [maximumHoldingDays, setMaximumHoldingDays] = useState<number>(
    QUICK_FLIP_GATE.maximumHoldingDays,
  );
  const [savingRules, setSavingRules] = useState(false);
  const primaryDeal = records[0] ?? null;
  const destinedRivalsDeal =
    records.find((item) =>
      normalizeIdentity(item.canonicalProduct).includes('destined rivals'),
    ) ?? null;
  const alertErrors = validateAlertRule({
    matchConfidence: critical,
    minimumProfit,
    minimumRoi: minimumRoi / 100,
    minimumProfitPerHour,
    maximumHoldingDays,
    maximumRiskScore: QUICK_FLIP_GATE.maximumRiskScore,
  });
  const alertRulesValid = Object.keys(alertErrors).length === 0;
  useEffect(() => {
    if (!userSignedIn) return;
    void fetch('/api/alert-rules')
      .then(
        async (response) =>
          (await response.json()) as {
            data?: {
              matchConfidence: number;
              minimumProfit: number;
              minimumRoi: number;
              minimumProfitPerHour: number;
              minimumGrade: string;
              maximumHoldingDays: number;
            };
          },
      )
      .then((payload) => {
        if (!payload.data) return;
        setCritical(payload.data.matchConfidence);
        setMinimumProfit(payload.data.minimumProfit);
        setMinimumRoi(Math.round(payload.data.minimumRoi * 100));
        setMinimumProfitPerHour(payload.data.minimumProfitPerHour);
        setMinimumGrade(payload.data.minimumGrade);
        setMaximumHoldingDays(payload.data.maximumHoldingDays);
      });
  }, [userSignedIn]);
  const saveRules = async () => {
    if (!alertRulesValid) {
      onNotice('Correct the highlighted purchase gates before saving.');
      return;
    }
    if (!userSignedIn) {
      onNotice('Sign in with ChatGPT before saving alert rules.');
      return;
    }
    setSavingRules(true);
    try {
      const response = await fetch('/api/alert-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchConfidence: critical,
          minimumProfit,
          minimumRoi: minimumRoi / 100,
          minimumProfitPerHour,
          minimumGrade,
          maximumHoldingDays,
          maximumRiskScore: QUICK_FLIP_GATE.maximumRiskScore,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(payload.error ?? 'Alert rules could not be saved');
      onNotice('Alert rules saved to your account.');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Alert rules failed');
    } finally {
      setSavingRules(false);
    }
  };
  return (
    <div className="page-stack">
      <Panel className="alert-rule-builder">
        <SectionHeading
          title="Purchase gates"
          subtitle="Critical alerts require high evidence and conservative economics"
          action={
            <Button
              className="gold-button"
              disabled={savingRules || !alertRulesValid}
              onClick={() => void saveRules()}
            >
              {savingRules ? 'Saving…' : 'Save rules'}
            </Button>
          }
        />
        <div className="rule-grid">
          <label>
            <span>Match confidence</span>
            <div className="rule-input">
              <Input
                type="number"
                min="0"
                max="100"
                value={critical}
                aria-invalid={Boolean(alertErrors.matchConfidence)}
                onChange={(event) => setCritical(Number(event.target.value))}
              />
              <b>% minimum</b>
            </div>
            {alertErrors.matchConfidence ? (
              <small className="field-error">
                {alertErrors.matchConfidence}
              </small>
            ) : null}
          </label>
          <label>
            <span>Net profit</span>
            <div className="rule-input">
              <Input
                type="number"
                min="0"
                max="100000"
                value={minimumProfit}
                aria-invalid={Boolean(alertErrors.minimumProfit)}
                onChange={(event) =>
                  setMinimumProfit(Number(event.target.value))
                }
              />
              <b>EUR minimum</b>
            </div>
            {alertErrors.minimumProfit ? (
              <small className="field-error">{alertErrors.minimumProfit}</small>
            ) : null}
          </label>
          <label>
            <span>ROI</span>
            <div className="rule-input">
              <Input
                type="number"
                min="0"
                max="500"
                value={minimumRoi}
                aria-invalid={Boolean(alertErrors.minimumRoi)}
                onChange={(event) => setMinimumRoi(Number(event.target.value))}
              />
              <b>% minimum</b>
            </div>
            {alertErrors.minimumRoi ? (
              <small className="field-error">
                Enter an ROI from 0% to 500%.
              </small>
            ) : null}
          </label>
          <label>
            <span>Profit per hour</span>
            <div className="rule-input">
              <Input
                type="number"
                min="0"
                max="100000"
                value={minimumProfitPerHour}
                aria-invalid={Boolean(alertErrors.minimumProfitPerHour)}
                onChange={(event) =>
                  setMinimumProfitPerHour(Number(event.target.value))
                }
              />
              <b>EUR minimum</b>
            </div>
            {alertErrors.minimumProfitPerHour ? (
              <small className="field-error">
                {alertErrors.minimumProfitPerHour}
              </small>
            ) : null}
          </label>
          <label>
            <span>Confidence grade</span>
            <Select
              value={minimumGrade}
              onValueChange={(value) => setMinimumGrade(value ?? 'B')}
            >
              <SelectTrigger>
                <SelectValue>
                  {{ A: 'A only', B: 'B or better', C: 'C or better' }[
                    minimumGrade
                  ] ?? minimumGrade}
                </SelectValue>
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
            <Select
              value={String(maximumHoldingDays)}
              onValueChange={(value) =>
                setMaximumHoldingDays(Number(value ?? 90))
              }
            >
              <SelectTrigger>
                <SelectValue>{maximumHoldingDays} days</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
                <SelectItem value="180">180 days</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        {alertRulesValid ? (
          <div className="logic-strip">
            <span>Match ≥ {critical}%</span>
            <b>AND</b>
            <span>Profit ≥ {money(minimumProfit)}</span>
            <b>AND</b>
            <span>ROI ≥ {minimumRoi}%</span>
            <b>AND</b>
            <span>Grade ≥ {minimumGrade}</span>
            <b>AND</b>
            <span>Risk ≤ {QUICK_FLIP_GATE.maximumRiskScore}</span>
          </div>
        ) : (
          <div className="logic-strip invalid" role="alert">
            Preview withheld until every purchase gate is within range.
          </div>
        )}
      </Panel>
      <div className="alerts-layout">
        <Panel>
          <SectionHeading
            title="Recent alerts"
            subtitle="Fictional demonstration feed · 3 visible"
          />
          <div className="alert-feed">
            {primaryDeal ? (
              <AlertItem
                deal={primaryDeal}
                priority="Critical"
                title={`${primaryDeal.canonicalProduct} below maximum all-in`}
                time="Fixture event 1"
                onOpen={() => onInspect(primaryDeal)}
                onOpenListing={() => onOpenListing(primaryDeal)}
                rechecking={recheckingIds.has(primaryDeal.id)}
              />
            ) : null}
            <AlertItem
              priority="High"
              title="Destined Rivals price cut"
              detail="Recheck required before action · exit eBay NL"
              deal={destinedRivalsDeal ?? undefined}
              time="Fixture event 2"
              onOpen={() => {
                if (destinedRivalsDeal) onInspect(destinedRivalsDeal);
                else
                  onNotice('The linked Destined Rivals record is unavailable.');
              }}
            />
            <AlertItem
              priority="Medium"
              title="Official Spiritforged preorder open"
              detail="7 retailers · €129–€159 · high interest"
              time="Fixture event 3"
              onOpen={() => {
                window.location.href =
                  '/releases?releaseId=riftbound-spiritforged';
              }}
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
                <SelectValue>1 hour</SelectValue>
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
                <SelectValue>In app</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="app">In app</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <Button
            variant="outline"
            className="iron-button"
            onClick={() =>
              onNotice(
                'Demo alert preview shown in this page; no notification was sent.',
              )
            }
          >
            Send test alert
          </Button>
        </Panel>
      </div>
    </div>
  );
}

function AlertItem({
  deal,
  priority,
  title,
  detail,
  time,
  onOpen,
  onOpenListing,
  rechecking = false,
}: {
  deal?: Deal;
  priority: string;
  title: string;
  detail?: string;
  time: string;
  onOpen: () => void;
  onOpenListing?: () => void;
  rechecking?: boolean;
}) {
  const derivedDetail = deal
    ? `${economicsCopy(deal.economics).allInCost} all-in · ${economicsCopy(deal.economics).conservativeProfit} profit · ${economicsCopy(deal.economics).roi} ROI · confidence ${deal.confidenceGrade}`
    : detail;
  return (
    <div
      className={cn('alert-item', priority.toLowerCase())}
      data-economics-surface={deal ? 'alerts' : undefined}
      data-deal-id={deal?.id}
    >
      <span className="alert-seal">
        <Bell />
      </span>
      <div>
        <span className="eyebrow">{priority}</span>
        <h3>{title}</h3>
        <p>{derivedDetail}</p>
      </div>
      <time>{time}</time>
      <div className="alert-actions">
        <Button variant="outline" className="iron-button" onClick={onOpen}>
          Open
        </Button>
        {deal && onOpenListing ? (
          <Button
            variant="outline"
            className="iron-button"
            disabled={rechecking}
            onClick={onOpenListing}
          >
            {rechecking ? <RefreshCw className="spin" /> : <ExternalLink />}
            {rechecking ? 'Rechecking…' : 'Open listing'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function MarketplacesPage({
  deals: records,
  initialConfigureId,
  initialSource,
  onInspect,
  onNotice,
  onOpenListing,
  onTrack,
  pendingTrackIds,
  recheckingIds,
  trackedIds,
}: {
  deals: Deal[];
  initialConfigureId?: string;
  initialSource?: string;
  onInspect: (deal: Deal) => void;
  onNotice: (text: string) => void;
  onOpenListing: (deal: Deal) => void;
  onTrack: (id: string) => Promise<void>;
  pendingTrackIds: Set<string>;
  recheckingIds: Set<string>;
  trackedIds: Set<string>;
}) {
  const requestedView = initialConfigureId ? 'connections' : initialSource;
  const [activeView, setActiveView] = useState<MarketplaceView>(
    MARKETPLACE_VIEWS.has(requestedView as MarketplaceView)
      ? (requestedView as MarketplaceView)
      : 'ebay',
  );
  const liveEbayRecords = records.filter(isLiveEbayDeal);

  const selectView = (view: MarketplaceView) => {
    setActiveView(view);
    const url = new URL(window.location.href);
    url.searchParams.set('source', view);
    if (view !== 'connections') url.searchParams.delete('configure');
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  };

  return (
    <div className="page-stack marketplace-hub">
      <Panel className="marketplace-hub-intro">
        <div>
          <span className="panel-kicker">
            <Radar /> Unified marketplace desk
          </span>
          <h2>One place for every marketplace</h2>
          <p>
            Browse eBay, Marktplaats and Amazon without jumping between sidebar
            areas. Each record still names its source and evidence type so an
            active ask is never mistaken for a completed sale.
          </p>
        </div>
        <div className="marketplace-hub-counts" aria-label="Marketplace status">
          <strong className="mono">{liveEbayRecords.length}</strong>
          <span>live eBay asks</span>
          <small>Official API · production data</small>
        </div>
      </Panel>

      <Tabs
        className="marketplace-hub-tabs"
        value={activeView}
        onValueChange={(value) => selectView(value as MarketplaceView)}
      >
        <TabsList variant="line" aria-label="Marketplace workspace">
          <TabsTrigger value="ebay">eBay</TabsTrigger>
          <TabsTrigger value="marktplaats">Marktplaats</TabsTrigger>
          <TabsTrigger value="amazon">Amazon</TabsTrigger>
          <TabsTrigger value="connections">Connections &amp; setup</TabsTrigger>
        </TabsList>

        <TabsContent value="ebay">
          <div className="page-stack marketplace-ebay-view">
            <Panel className="marketplace-live-summary">
              <div>
                <span className="panel-kicker">
                  <HeartPulse /> eBay Browse API
                </span>
                <h2>Live eBay listings</h2>
                <p>
                  These are observed active asks from eBay’s official API. They
                  are not completed-sale evidence and are not automatically
                  qualified as profitable deals.
                </p>
              </div>
              <NativeNavigationLink
                className="iron-link"
                href="/marketplaces?source=connections&configure=ebay"
              >
                Connection settings
              </NativeNavigationLink>
            </Panel>
            {liveEbayRecords.length > 0 ? (
              <div className="deal-grid marketplace-deal-grid">
                {liveEbayRecords.slice(0, 12).map((item) => (
                  <DealCard
                    deal={item}
                    key={item.id}
                    onInspect={onInspect}
                    onOpenListing={onOpenListing}
                    onTrack={onTrack}
                    rechecking={recheckingIds.has(item.id)}
                    surface="deals"
                    tracking={pendingTrackIds.has(item.id)}
                    tracked={trackedIds.has(item.id)}
                  />
                ))}
              </div>
            ) : (
              <Panel className="empty-state marketplace-empty">
                <Radar />
                <h3>No live eBay listings yet</h3>
                <p>
                  Open Connections &amp; setup to test the official API, then
                  run an authenticated scan. Demo records stay out of this feed.
                </p>
              </Panel>
            )}
          </div>
        </TabsContent>

        <TabsContent value="marktplaats">
          <MarktplaatsScout />
        </TabsContent>

        <TabsContent value="amazon">
          <AmazonScout />
        </TabsContent>

        <TabsContent value="connections">
          <SourcesPage
            initialConfigureId={initialConfigureId}
            onNotice={onNotice}
            productionDeals={records.filter(
              (item) => item.dataMode === 'production',
            )}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const sourceSetupGuidance: Record<
  string,
  { title: string; summary: string; steps: string[]; operatorOnly: boolean }
> = {
  'fixture-market': {
    title: 'Isolated Demo Marketplace',
    summary:
      'No setup is required. This source makes no network requests and keeps fictional records isolated.',
    steps: ['Use Test connection to verify the bundled fixture adapter.'],
    operatorOnly: false,
  },
  ebay: {
    title: 'eBay Browse API',
    summary:
      'The public browser never accepts or reveals eBay secrets. A deployment operator must configure official API credentials.',
    steps: [
      'Create an application in the eBay Developer Program.',
      'Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in the private hosting environment.',
      'Set EBAY_MARKETPLACE when a marketplace other than EBAY_NL is required.',
      'Redeploy, then return here and run Test connection.',
    ],
    operatorOnly: true,
  },
  cardmarket: {
    title: 'Cardmarket public reference data',
    summary:
      'This connector needs Cardmarket-authorized catalogue and price-guide download URLs. It is reference data, not live sold evidence.',
    steps: [
      'Obtain authorized catalogue and price-guide access from Cardmarket.',
      'Add the approved URLs to the private server environment.',
      'Redeploy and test the connector; no HTML scraping fallback is used.',
    ],
    operatorOnly: true,
  },
  retailers: {
    title: 'Retailer Watch adapters',
    summary:
      'No retailer adapter is installed. Each retailer requires documented API/feed permission and an allowlisted adapter.',
    steps: [
      'Choose a retailer that provides an authorized API or product feed.',
      'Implement and review its source-specific adapter and rate limits.',
      'Enable it server-side only after access and compliance are verified.',
    ],
    operatorOnly: true,
  },
  'amazon-keepa': {
    title: 'Keepa for Amazon Scout',
    summary:
      'Keepa is the supported Amazon data provider. Amazon HTML scraping is never used as a fallback.',
    steps: [
      'Create a Keepa API plan and copy the API key.',
      'Set KEEPA_API_KEY in the private hosting environment.',
      'Redeploy, then verify token balance and authenticated scan status in Amazon Scout.',
    ],
    operatorOnly: true,
  },
  'marktplaats-public': {
    title: 'Marktplaats Public Monitor',
    summary:
      'No credentials are required. The scheduled monitor is conservative and stops on blocks, challenges or parser changes.',
    steps: [
      'Review postcode and distance settings in the private deployment environment.',
      'Wait for the scheduled scan, then use Refresh status in Marktplaats Scout.',
      'If blocked, wait for the displayed retry; no bypass is attempted.',
    ],
    operatorOnly: true,
  },
};

function readableSourceStatus(value: string) {
  const labels: Record<string, string> = {
    fixture: 'Fixture adapter ready',
    configured: 'Configured',
    credentials_required: 'Private API credentials required',
    public_monitor: 'Public monitor configured',
    official_api_not_configured: 'Official API not configured',
    official_urls_required: 'Authorized catalogue URLs required',
    existing_key_only: 'Existing developer access required',
    authorized_adapter_required: 'Allowlisted adapter required',
    healthy: 'Healthy',
    key_required: 'Private API key required',
  };
  return labels[value] ?? value.replaceAll('_', ' ');
}

function SourcesPage({
  initialConfigureId,
  onNotice,
  productionDeals,
}: {
  initialConfigureId?: string;
  onNotice: (text: string) => void;
  productionDeals: Deal[];
}) {
  const liveEbayDeals = productionDeals.filter(isLiveEbayDeal);
  const latestEbayVerification = liveEbayDeals[0]?.lastVerifiedAt;
  const [testingSourceId, setTestingSourceId] = useState<string | null>(null);
  const [configureId, setConfigureId] = useState<string | null>(
    initialConfigureId && sourceSetupGuidance[initialConfigureId]
      ? initialConfigureId
      : null,
  );
  const [marktplaatsSource, setMarktplaatsSource] =
    useState<MarktplaatsDashboard | null>(null);
  const [amazonSource, setAmazonSource] = useState<AmazonDashboard | null>(
    null,
  );
  const [sourceResults, setSourceResults] = useState<
    Record<string, { ok: boolean; status: string; checkedAt: string }>
  >({});
  const effectiveSourceResults =
    liveEbayDeals.length > 0 && !sourceResults.ebay
      ? {
          ...sourceResults,
          ebay: {
            ok: true,
            status: `Authenticated · ${liveEbayDeals.length} active asks received`,
            checkedAt: latestEbayVerification ?? new Date().toISOString(),
          },
        }
      : sourceResults;
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/marktplaats', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { data: MarktplaatsDashboard };
      })
      .then((payload) => {
        if (!cancelled && payload) setMarktplaatsSource(payload.data);
      });
    void fetch('/api/amazon', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { data: AmazonDashboard };
      })
      .then((payload) => {
        if (!cancelled && payload) setAmazonSource(payload.data);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const testSource = async (sourceId: string, sourceName: string) => {
    const apiId = sourceId === 'cardmarket' ? 'cardmarket-public' : sourceId;
    setTestingSourceId(sourceId);
    try {
      const response = await fetch(
        `/api/sources/${encodeURIComponent(apiId)}/test`,
        { method: 'POST' },
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        status?: string;
        checkedAt?: string;
        error?: string;
      };
      const result = {
        ok: Boolean(payload.ok),
        status: readableSourceStatus(
          payload.status ?? payload.error ?? `HTTP ${response.status}`,
        ),
        checkedAt: payload.checkedAt ?? new Date().toISOString(),
      };
      setSourceResults((current) => ({ ...current, [sourceId]: result }));
      onNotice(`${sourceName}: ${result.status}.`);
    } catch (error) {
      onNotice(
        error instanceof Error ? error.message : 'Connection test failed',
      );
    } finally {
      setTestingSourceId(null);
    }
  };
  const displayedSources = sources.map((source) => {
    if (source.id !== 'ebay') return source;
    const result = effectiveSourceResults.ebay;
    if (!result) return source;
    return {
      ...source,
      health: result.ok ? 'Healthy' : result.status,
      lastScan: new Date(result.checkedAt).toLocaleString('nl-NL', {
        timeZone: 'Europe/Amsterdam',
      }),
      nextScan: result.ok ? 'Scheduled scan or manual run' : 'After setup',
      records: liveEbayDeals.length,
      mode: result.ok ? ('Live' as const) : source.mode,
    };
  });
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
          <strong>
            {sources.filter((source) => source.mode === 'Fixture').length +
              (amazonSource?.dataMode === 'fixture' ? 1 : 0)}
          </strong>
          <span>isolated fixture connector</span>
          <small>
            {(effectiveSourceResults.ebay?.ok ? 1 : 0) +
              (marktplaatsSource?.status === 'healthy' ? 1 : 0) +
              (amazonSource?.apiConnected ? 1 : 0)}{' '}
            genuinely live
          </small>
        </div>
      </Panel>
      <div className="source-card-grid">
        <Panel className="source-card" key="marktplaats-public">
          <div className="source-card-head">
            <span
              className={cn(
                'source-orb',
                marktplaatsSource?.status === 'healthy' && 'healthy',
                ['blocked', 'parser_review_required'].includes(
                  marktplaatsSource?.status ?? '',
                ) && 'warning',
              )}
            />
            <div>
              <h3>Marktplaats Public Monitor</h3>
              <p>Public Monitor · credentials not required</p>
            </div>
            <Badge variant="outline">Live</Badge>
          </div>
          <dl>
            <div>
              <dt>Health</dt>
              <dd>
                {marktplaatsSource?.status
                  .replaceAll('_', ' ')
                  .replace(/^./, (letter) => letter.toUpperCase()) ??
                  'Awaiting first scan'}
              </dd>
            </div>
            <div>
              <dt>Last scan</dt>
              <dd>
                {marktplaatsSource?.lastScanAt
                  ? new Date(marktplaatsSource.lastScanAt).toLocaleString(
                      'nl-NL',
                      { timeZone: 'Europe/Amsterdam' },
                    )
                  : 'Never'}
              </dd>
            </div>
            <div>
              <dt>Next scan</dt>
              <dd>
                {marktplaatsSource?.nextScanAt
                  ? new Date(marktplaatsSource.nextScanAt).toLocaleString(
                      'nl-NL',
                      { timeZone: 'Europe/Amsterdam' },
                    )
                  : 'Every 15 minutes'}
              </dd>
            </div>
            <div>
              <dt>Queries / listings</dt>
              <dd className="mono">
                {marktplaatsSource?.metrics.queries ?? 0} /{' '}
                {marktplaatsSource?.metrics.listingsParsed ?? 0}
              </dd>
            </div>
          </dl>
          <div className="compliance-note">
            <ShieldAlert />
            Public-page monitoring may be restricted by the source. The monitor
            stops automatically on access blocks and does not bypass anti-bot
            controls.
          </div>
          <div className="card-actions">
            <NativeNavigationLink
              className="iron-link"
              href="/marketplaces?source=marktplaats"
            >
              Open Scout
            </NativeNavigationLink>
            <Button
              variant="outline"
              className="iron-button"
              onClick={() => setConfigureId('marktplaats-public')}
            >
              Setup & recovery
            </Button>
            <Button
              className="gold-button"
              disabled={testingSourceId === 'marktplaats-public'}
              onClick={() =>
                void testSource(
                  'marktplaats-public',
                  'Marktplaats Public Monitor',
                )
              }
            >
              <RefreshCw
                className={cn(
                  testingSourceId === 'marktplaats-public' && 'spin',
                )}
              />
              {testingSourceId === 'marktplaats-public'
                ? 'Testing…'
                : 'Check configuration'}
            </Button>
          </div>
        </Panel>
        <Panel className="source-card" key="amazon-keepa">
          <div className="source-card-head">
            <span
              className={cn(
                'source-orb',
                amazonSource?.apiConnected && 'healthy',
                amazonSource?.sourceState === 'rate_limited' && 'warning',
                !amazonSource?.apiConnected && 'muted',
              )}
            />
            <div>
              <h3>Keepa / Amazon Scout</h3>
              <p>Official API · no Amazon HTML fallback</p>
            </div>
            <Badge variant="outline">
              {amazonSource?.apiConnected
                ? 'Live'
                : amazonSource?.dataMode === 'fixture'
                  ? 'Fixture'
                  : 'Disabled'}
            </Badge>
          </div>
          <dl>
            <div>
              <dt>API</dt>
              <dd>
                {amazonSource?.apiConnected
                  ? 'Connected'
                  : amazonSource?.sourceState === 'key_required'
                    ? 'Key required'
                    : 'No authenticated success'}
              </dd>
            </div>
            <div>
              <dt>Token balance</dt>
              <dd className="mono">
                {amazonSource?.tokens.available?.toLocaleString('nl-NL') ??
                  'Unavailable'}
              </dd>
            </div>
            <div>
              <dt>Last / next scan</dt>
              <dd>
                {amazonSource?.lastScanAt
                  ? new Date(amazonSource.lastScanAt).toLocaleString('nl-NL', {
                      timeZone: 'Europe/Amsterdam',
                    })
                  : 'Awaiting authenticated scan'}
              </dd>
            </div>
            <div>
              <dt>Checked / changes / qualified</dt>
              <dd className="mono">
                {amazonSource?.metrics.productsChecked ?? 0} /{' '}
                {amazonSource?.metrics.priceChanges ?? 0} /{' '}
                {amazonSource?.metrics.qualified ?? 0}
              </dd>
            </div>
          </dl>
          <div className="compliance-note">
            <ShieldAlert />
            Keepa covers DE, FR, IT and ES here. NL and BE watches remain saved
            for manual or future provider support. No scraping fallback.
          </div>
          <div className="card-actions">
            <NativeNavigationLink
              className="iron-link"
              href="/marketplaces?source=amazon"
            >
              Open Amazon Scout
            </NativeNavigationLink>
            <Button
              variant="outline"
              className="iron-button"
              onClick={() => setConfigureId('amazon-keepa')}
            >
              Setup instructions
            </Button>
          </div>
        </Panel>
        {displayedSources
          .filter((source) => source.id !== 'marktplaats')
          .map((source) => (
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
              {effectiveSourceResults[source.id] ? (
                <output className="safety-note">
                  <HeartPulse />
                  <span>
                    {effectiveSourceResults[source.id].ok
                      ? 'Connected'
                      : 'Not connected'}{' '}
                    · {effectiveSourceResults[source.id].status} ·{' '}
                    {new Date(
                      effectiveSourceResults[source.id].checkedAt,
                    ).toLocaleTimeString('nl-NL', {
                      timeZone: 'Europe/Amsterdam',
                    })}
                  </span>
                </output>
              ) : null}
              <div className="card-actions">
                <Button
                  variant="outline"
                  className="iron-button"
                  onClick={() => setConfigureId(source.id)}
                >
                  {source.id === 'fixture-market'
                    ? 'About demo source'
                    : 'Setup instructions'}
                </Button>
                <Button
                  className="gold-button"
                  disabled={testingSourceId === source.id}
                  onClick={() => void testSource(source.id, source.name)}
                >
                  <RefreshCw
                    className={cn(testingSourceId === source.id && 'spin')}
                  />
                  {testingSourceId === source.id
                    ? 'Testing…'
                    : 'Test connection'}
                </Button>
              </div>
            </Panel>
          ))}
      </div>
      <Dialog
        open={Boolean(configureId)}
        onOpenChange={(open) => !open && setConfigureId(null)}
      >
        {configureId && sourceSetupGuidance[configureId] ? (
          <DialogContent className="source-setup-dialog">
            <DialogHeader>
              <DialogTitle>
                {sourceSetupGuidance[configureId].title}
              </DialogTitle>
              <DialogDescription>
                {sourceSetupGuidance[configureId].summary}
              </DialogDescription>
            </DialogHeader>
            <ol>
              {sourceSetupGuidance[configureId].steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div className="safety-note">
              <ShieldAlert />
              <span>
                {sourceSetupGuidance[configureId].operatorOnly
                  ? 'Operator-only setup: secrets and provider URLs stay in the private server environment.'
                  : 'This fixture contains fictional data and is never production evidence.'}
              </span>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function ReviewPage({
  initialSource,
  onNotice,
  userSignedIn,
}: {
  initialSource?: string;
  onNotice: (text: string) => void;
  userSignedIn: boolean;
}) {
  const [items, setItems] = useState<ReviewQueueItem[]>(() => [
    ...(userSignedIn ? [] : (fixtureReviewItems as ReviewQueueItem[])),
    ...(initialSource === 'lot-lab' ? demoLotReviewItems : []),
  ]);
  const [loading, setLoading] = useState(userSignedIn);
  const [activeItem, setActiveItem] = useState<ReviewQueueItem | null>(null);
  const [resolution, setResolution] = useState('');
  const [candidate, setCandidate] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [parserValue, setParserValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userSignedIn) return;
    let cancelled = false;
    void fetch('/api/review')
      .then(async (response) => {
        if (!response.ok) throw new Error('Review queue could not be loaded.');
        return (await response.json()) as { data: ReviewQueueItem[] };
      })
      .then((payload) => {
        if (!cancelled)
          setItems([
            ...payload.data,
            ...(initialSource === 'lot-lab' ? demoLotReviewItems : []),
          ]);
      })
      .catch((error) => {
        if (!cancelled)
          onNotice(
            error instanceof Error ? error.message : 'Review queue failed.',
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialSource, onNotice, userSignedIn]);

  const openReview = (item: ReviewQueueItem) => {
    setActiveItem(item);
    setResolution('');
    setCandidate(item.currentCandidate);
    setQuantity(String(item.quantity));
    setParserValue(item.parsedValue ?? '');
  };

  const candidateResolution = [
    'accept_candidate',
    'select_alternative',
    'edit_fields',
  ].includes(resolution);
  const quantityNumber = Number(quantity);
  const quantityError =
    candidateResolution &&
    (!Number.isInteger(quantityNumber) ||
      quantityNumber < 1 ||
      quantityNumber > 10_000)
      ? 'Quantity must be a whole number from 1 to 10,000.'
      : '';
  const parserError =
    activeItem?.type === 'Parser change' &&
    resolution === 'edit_fields' &&
    !parserValue.trim()
      ? 'Enter the corrected parser value.'
      : '';
  const resolutionError = !resolution ? 'Choose an explicit resolution.' : '';

  const resolve = async () => {
    if (!activeItem) return;
    if (resolutionError || quantityError || parserError) return;
    if (activeItem.sessionOnly) {
      if (resolution !== 'defer')
        setItems((current) =>
          current.filter((item) => item.id !== activeItem.id),
        );
      setActiveItem(null);
      onNotice(
        resolution === 'defer'
          ? 'The session-only lot check remains in this page.'
          : 'The linked demo lot check was resolved for this session only.',
      );
      return;
    }
    if (!userSignedIn) {
      onNotice('Sign in with ChatGPT before resolving review records.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(
        `/api/review/${encodeURIComponent(activeItem.id)}/resolve`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            resolution,
            details: {
              candidate: candidate.trim(),
              quantity: quantityNumber,
              parserField: activeItem.parserField,
              parserValue: parserValue.trim(),
              originalTitle: activeItem.originalTitle,
            },
          }),
        },
      );
      const payload = (await response.json()) as {
        data?: { status: string };
        error?: string;
      };
      if (!response.ok || !payload.data)
        throw new Error(payload.error ?? 'Review resolution failed.');
      if (payload.data.status === 'resolved')
        setItems((current) =>
          current.filter((item) => item.id !== activeItem.id),
        );
      setActiveItem(null);
      onNotice(
        resolution === 'defer'
          ? 'Review deferred; the record remains in the queue.'
          : `Resolution saved before ${activeItem.title} left the queue.`,
      );
    } catch (error) {
      onNotice(
        error instanceof Error ? error.message : 'Review resolution failed.',
      );
    } finally {
      setSaving(false);
    }
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
          {initialSource === 'lot-lab' ? (
            <small>
              The three Lot Lab records are linked fictional session data; they
              are not mixed into the account queue or production storage.
            </small>
          ) : null}
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
      {loading ? (
        <Panel className="empty-state">
          <RefreshCw className="spin" />
          <h2>Loading your review queue</h2>
          <p>
            Waiting for the account-scoped records before accepting changes.
          </p>
        </Panel>
      ) : items.length ? (
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
                      onClick={() => openReview(item)}
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
      <Dialog
        open={Boolean(activeItem)}
        onOpenChange={(open) => !open && !saving && setActiveItem(null)}
      >
        <DialogContent className="review-dialog">
          <DialogHeader>
            <DialogTitle>Resolve uncertain record</DialogTitle>
            <DialogDescription>
              Inspect the original listing and record an explicit outcome. The
              item only leaves the queue after the server confirms persistence.
            </DialogDescription>
          </DialogHeader>
          {activeItem ? (
            <div className="review-dialog-grid">
              <div className="review-original">
                <span className="eyebrow">Original listing title</span>
                <h3>{activeItem.originalTitle}</h3>
                <div className="review-evidence-state">
                  {activeItem.imageUrl ? (
                    <span>
                      A captured image reference is retained with this record;
                      use the verified source link below to inspect it.
                    </span>
                  ) : (
                    <span>No captured image is available for this record.</span>
                  )}
                  {activeItem.sourceUrl ? (
                    <a
                      href={activeItem.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink /> Open retained source evidence
                    </a>
                  ) : (
                    <span>
                      No verified original URL is retained for this fictional
                      record.
                    </span>
                  )}
                  <small>
                    {activeItem.evidenceNote ??
                      'The fixture preserves the reported title and risk flags only.'}
                  </small>
                </div>
                <dl>
                  <div>
                    <dt>Source</dt>
                    <dd>{activeItem.source}</dd>
                  </div>
                  <div>
                    <dt>Confidence</dt>
                    <dd>{activeItem.confidence}%</dd>
                  </div>
                  <div>
                    <dt>Condition</dt>
                    <dd>{activeItem.condition}</dd>
                  </div>
                  <div>
                    <dt>Language</dt>
                    <dd>{activeItem.language}</dd>
                  </div>
                </dl>
                <div className="risk-list">
                  {activeItem.riskFlags.map((flag) => (
                    <Badge variant="outline" key={flag}>
                      {flag}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="review-resolution">
                <label>
                  <span>Resolution</span>
                  <Select
                    value={resolution}
                    onValueChange={(value) => value && setResolution(value)}
                  >
                    <SelectTrigger
                      aria-label="Review resolution"
                      aria-invalid={Boolean(resolutionError)}
                    >
                      <SelectValue>
                        {resolution
                          ? resolution.replaceAll('_', ' ')
                          : 'Choose a resolution'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {activeItem.type !== 'Parser change' &&
                      !activeItem.riskFlags.includes('Empty packaging') ? (
                        <>
                          <SelectItem value="accept_candidate">
                            Accept current candidate
                          </SelectItem>
                          <SelectItem value="select_alternative">
                            Select alternative
                          </SelectItem>
                          <SelectItem value="edit_fields">
                            Edit product fields
                          </SelectItem>
                        </>
                      ) : null}
                      {activeItem.type === 'Parser change' ? (
                        <SelectItem value="edit_fields">
                          Correct parser field
                        </SelectItem>
                      ) : null}
                      {activeItem.riskFlags.includes('Empty packaging') ? (
                        <SelectItem value="packaging_only">
                          Confirm packaging only
                        </SelectItem>
                      ) : null}
                      <SelectItem value="duplicate">Duplicate</SelectItem>
                      <SelectItem value="reject_listing">
                        Reject listing
                      </SelectItem>
                      <SelectItem value="defer">Defer</SelectItem>
                    </SelectContent>
                  </Select>
                  {resolutionError ? (
                    <small className="field-error">{resolutionError}</small>
                  ) : null}
                </label>
                {activeItem.type === 'Parser change' ? (
                  <label>
                    <span>
                      Corrected {activeItem.parserField ?? 'shipping'} value
                    </span>
                    <Input
                      value={parserValue}
                      aria-invalid={Boolean(parserError)}
                      onChange={(event) => setParserValue(event.target.value)}
                      placeholder="For example: shipping included"
                    />
                    {parserError ? (
                      <small className="field-error">{parserError}</small>
                    ) : null}
                  </label>
                ) : (
                  <label>
                    <span>Canonical candidate</span>
                    <Input
                      value={candidate}
                      disabled={!candidateResolution}
                      onChange={(event) => setCandidate(event.target.value)}
                    />
                  </label>
                )}
                {activeItem.type !== 'Parser change' &&
                activeItem.alternativeCandidates.length ? (
                  <div className="candidate-options">
                    <span>Suggested alternatives</span>
                    {activeItem.alternativeCandidates.map((alternative) => (
                      <Button
                        variant="outline"
                        className="iron-button"
                        key={alternative}
                        onClick={() => {
                          setCandidate(alternative);
                          setResolution('select_alternative');
                        }}
                      >
                        {alternative}
                      </Button>
                    ))}
                  </div>
                ) : null}
                {activeItem.type !== 'Parser change' ? (
                  <label>
                    <span>Quantity</span>
                    <Input
                      type="number"
                      min="1"
                      max="10000"
                      step="1"
                      value={quantity}
                      disabled={!candidateResolution}
                      aria-invalid={Boolean(quantityError)}
                      onChange={(event) => setQuantity(event.target.value)}
                    />
                    {quantityError ? (
                      <small className="field-error">{quantityError}</small>
                    ) : null}
                  </label>
                ) : null}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              className="iron-button"
              disabled={saving}
              onClick={() => setActiveItem(null)}
            >
              Cancel
            </Button>
            <Button
              className="gold-button"
              disabled={
                saving ||
                Boolean(resolutionError || quantityError || parserError) ||
                (candidateResolution && !candidate.trim())
              }
              onClick={() => void resolve()}
            >
              {saving ? 'Saving resolution…' : 'Save resolution'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SettingsPage({
  onNotice,
  userSignedIn,
}: {
  onNotice: (text: string) => void;
  userSignedIn: boolean;
}) {
  const [settings, setSettings] = useState<UserSettings>(defaultUserSettings);
  const [saving, setSaving] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(!userSignedIn);
  const settingsErrors = validateUserSettings(settings);
  const settingsValid = Object.keys(settingsErrors).length === 0;

  useEffect(() => {
    if (!userSignedIn) return;
    let cancelled = false;
    void fetch('/api/settings')
      .then(async (response) => {
        if (!response.ok) throw new Error('Settings could not be loaded.');
        return (await response.json()) as { data: UserSettings };
      })
      .then((payload) => {
        if (!cancelled) setSettings(payload.data);
      })
      .catch((error) => {
        if (!cancelled)
          onNotice(
            error instanceof Error ? error.message : 'Settings load failed.',
          );
      })
      .finally(() => {
        if (!cancelled) setSettingsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [onNotice, userSignedIn]);

  const saveSettings = async () => {
    if (!settingsValid) {
      onNotice('Correct the highlighted settings before saving.');
      return;
    }
    if (!userSignedIn) {
      onNotice('Sign in with ChatGPT before saving settings.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const payload = (await response.json()) as {
        data?: UserSettings;
        error?: string;
      };
      if (!response.ok || !payload.data)
        throw new Error(payload.error ?? 'Settings could not be saved.');
      setSettings(payload.data);
      onNotice('Settings saved to your account.');
    } catch (error) {
      onNotice(
        error instanceof Error ? error.message : 'Settings save failed.',
      );
    } finally {
      setSaving(false);
    }
  };

  const resetSettings = () => {
    setSettings(defaultUserSettings);
    onNotice('Defaults restored locally. Save settings to persist them.');
  };

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
                <Select
                  value={settings.country.toLowerCase()}
                  onValueChange={(value) =>
                    value &&
                    setSettings((current) => ({
                      ...current,
                      country: value.toUpperCase(),
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue>
                      {{ nl: 'Netherlands', be: 'Belgium', de: 'Germany' }[
                        settings.country.toLowerCase()
                      ] ?? settings.country}
                    </SelectValue>
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
                <Input
                  disabled={!settingsLoaded || saving}
                  value={settings.postcode}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      postcode: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Local radius</span>
                <Input
                  disabled={!settingsLoaded || saving}
                  type="number"
                  min="1"
                  max="500"
                  step="1"
                  value={settings.localRadiusKm}
                  aria-invalid={Boolean(settingsErrors.localRadiusKm)}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      localRadiusKm: Number(event.target.value),
                    }))
                  }
                />
                {settingsErrors.localRadiusKm ? (
                  <small className="field-error">
                    {settingsErrors.localRadiusKm}
                  </small>
                ) : null}
              </label>
              <label>
                <span>Currency</span>
                <Input value="EUR (€)" readOnly />
              </label>
              <label>
                <span>Timezone</span>
                <Input value={settings.timezone} readOnly />
              </label>
              <label>
                <span>Travel cost</span>
                <Input value="€0.23 / km (model default)" readOnly />
              </label>
              <label>
                <span>Labour rate</span>
                <Input
                  disabled={!settingsLoaded || saving}
                  type="number"
                  min="0"
                  max="500"
                  step="0.5"
                  value={settings.laborRate}
                  aria-invalid={Boolean(settingsErrors.laborRate)}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      laborRate: Number(event.target.value),
                    }))
                  }
                />
                {settingsErrors.laborRate ? (
                  <small className="field-error">
                    {settingsErrors.laborRate}
                  </small>
                ) : null}
              </label>
              <label>
                <span>Default exit</span>
                <Input value="Best supported sold evidence" readOnly />
              </label>
            </div>
            <div className="button-row">
              <Button
                className="gold-button"
                disabled={saving || !settingsLoaded || !settingsValid}
                onClick={() => void saveSettings()}
              >
                {saving ? 'Saving…' : 'Save settings'}
              </Button>
              <Button
                variant="outline"
                className="iron-button"
                disabled={saving || !settingsLoaded}
                onClick={resetSettings}
              >
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
            <p className="settings-note">
              Weights are fixed in the versioned deal-economics model. Your
              personal qualification gates are stored separately.
            </p>
            <div className="settings-grid">
              <label>
                <span>Required ROI</span>
                <Input
                  disabled={!settingsLoaded || saving}
                  type="number"
                  min="0"
                  max="500"
                  step="1"
                  value={Math.round(settings.requiredRoi * 100)}
                  aria-invalid={Boolean(settingsErrors.requiredRoi)}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      requiredRoi: Number(event.target.value) / 100,
                    }))
                  }
                />
                {settingsErrors.requiredRoi ? (
                  <small className="field-error">
                    Enter an ROI from 0% to 500%.
                  </small>
                ) : null}
              </label>
              <label>
                <span>Required profit (€)</span>
                <Input
                  disabled={!settingsLoaded || saving}
                  type="number"
                  min="0"
                  max="100000"
                  step="1"
                  value={settings.requiredProfit}
                  aria-invalid={Boolean(settingsErrors.requiredProfit)}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      requiredProfit: Number(event.target.value),
                    }))
                  }
                />
                {settingsErrors.requiredProfit ? (
                  <small className="field-error">
                    {settingsErrors.requiredProfit}
                  </small>
                ) : null}
              </label>
            </div>
            <Button
              className="gold-button"
              disabled={saving || !settingsLoaded || !settingsValid}
              onClick={() => void saveSettings()}
            >
              {saving ? 'Saving…' : 'Save scoring gates'}
            </Button>
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
                  <small>
                    Supplied only through the server environment and never
                    returned to the public browser
                  </small>
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
                <Input value="Compact product preset" readOnly />
              </label>
              <label>
                <span>Motion</span>
                <Input value="Follows operating-system preference" readOnly />
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
