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
  ExternalLink,
  Scale,
  Search,
  ShoppingBag,
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
import { isSafeSourceListingUrl } from '@/lib/listing-url';
import type { MarktplaatsDashboard } from '@/lib/marktplaats';
import type { AmazonDashboard } from '@/lib/amazon';

type Section =
  | 'dashboard'
  | 'deals'
  | 'marktplaats'
  | 'amazon'
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
    section: 'marktplaats',
    label: 'Marktplaats Scout',
    subtitle: 'Local Market Hunt',
    href: '/marktplaats',
    icon: MapPin,
  },
  {
    section: 'amazon',
    label: 'Amazon Scout',
    subtitle: 'Merchant Realms',
    href: '/amazon',
    icon: ShoppingBag,
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
  marktplaats: {
    title: 'Marktplaats Scout',
    subtitle: 'Local Market Hunt',
  },
  amazon: {
    title: 'Amazon Scout',
    subtitle: 'Merchant Realms',
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
  const [dealRecords, setDealRecords] = useState<Deal[]>(deals);
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
        if (!cancelled) setDealRecords(payload.data);
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
            <strong>Demo realm</strong>
            <small>{sources.length + 1} configured sources</small>
          </div>
          <span className="mono">isolated</span>
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
              <Sparkles /> Demo Mode
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
              onInspect={setSelectedDeal}
              onOpenListing={(deal) => void recheckDeal(deal, true)}
              onTrack={toggleTrack}
              pendingTrackIds={visiblePendingTrackIds}
              recheckingIds={recheckingIds}
              trackedIds={trackedIds}
            />
          )}
          {section === 'marktplaats' && <MarktplaatsScout />}
          {section === 'amazon' && <AmazonScout />}
          {section === 'lot-lab' && <LotLab onNotice={setNotice} />}
          {section === 'market' && (
            <MarketPage
              deals={dealRecords}
              onTrack={toggleTrack}
              trackedIds={trackedIds}
            />
          )}
          {section === 'releases' && <ReleasesPage onNotice={setNotice} />}
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
              deal={dealRecords[0] ?? null}
              onInspect={setSelectedDeal}
              onNotice={setNotice}
              onOpenListing={(deal) => void recheckDeal(deal, true)}
              recheckingIds={recheckingIds}
              userSignedIn={Boolean(user)}
            />
          )}
          {section === 'sources' && <SourcesPage onNotice={setNotice} />}
          {section === 'review' && (
            <ReviewPage onNotice={setNotice} userSignedIn={Boolean(user)} />
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
            <i className="status-warn" /> eBay live credentials required
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
          detail={`next in ${Math.min(...releases.map((item) => item.daysAway))} days`}
          tone="blue"
        />
        <MetricPlaque
          icon={HeartPulse}
          label="Live source records"
          value={String(
            records.filter((item) => item.dataMode === 'production').length,
          )}
          detail="credentials required for eBay"
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
            title="Best Hunts Today"
            subtitle="Ranked by conservative profit, executability and confidence"
            action={
              <NativeNavigationLink className="text-link" href="/deals">
                View bounty board <ArrowRight />
              </NativeNavigationLink>
            }
          />
          <div className="deal-grid">
            {records.slice(0, 3).map((item) => (
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
              deal={records[0] ?? null}
              tone="critical"
              title="Target crossed"
              time="11m"
              onOpenListing={onOpenListing}
              rechecking={Boolean(
                records[0] && recheckingIds.has(records[0].id),
              )}
            />
            <WatchEvent
              deal={records[1] ?? null}
              tone="positive"
              title="New sold evidence"
              detail="Destined Rivals · median +2.1%"
              time="47m"
              onOpenListing={onOpenListing}
              rechecking={Boolean(
                records[1] && recheckingIds.has(records[1].id),
              )}
            />
            <WatchEvent
              deal={records[2] ?? null}
              tone="warning"
              title="Price changed"
              detail="Origins display · exit now negative"
              time="2h"
              onOpenListing={onOpenListing}
              rechecking={Boolean(
                records[2] && recheckingIds.has(records[2].id),
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
          <i /> <span>{item.listingAge} ago</span>
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
  const [game, setGame] = useState('all');
  const [source, setSource] = useState('all');
  const [minimumProfit, setMinimumProfit] = useState('0');
  const [sort, setSort] = useState('score');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [query, setQuery] = useState('');
  const [minimumRoi, setMinimumRoi] = useState(0);
  const [minimumGrade, setMinimumGrade] = useState('C');
  const [maximumRisk, setMaximumRisk] = useState(100);
  const [maximumAgeHours, setMaximumAgeHours] = useState(168);
  const [exitMarket, setExitMarket] = useState('any');
  useEffect(() => {
    const search = new URLSearchParams(window.location.search).get('q');
    if (search) queueMicrotask(() => setQuery(search));
  }, []);
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
        <Input
          type="number"
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
        <Select
          value={exitMarket}
          onValueChange={(value) => onExitMarketChange(value ?? 'any')}
        >
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
      age: '2h',
      weight: 'High',
    },
    {
      type: 'Fictional demonstration transaction',
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

function LotLab({ onNotice }: { onNotice: (text: string) => void }) {
  const [laborHours, setLaborHours] = useState(6.5);
  const [requiredProfit, setRequiredProfit] = useState(100);
  const [selectedFileCount, setSelectedFileCount] = useState(0);
  const uploaded = selectedFileCount > 0;
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
                onNotice(
                  'Demo lot loaded. 31 candidates identified; 53 uncertain items moved to review.',
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
              <Button
                variant="outline"
                className="iron-button"
                onClick={() => {
                  window.location.href = '/review';
                }}
              >
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
              onEdit={() =>
                onNotice('Candidate editor opened for Charizard 4/102.')
              }
            />
            <CandidateCard
              name="Blastoise 2/102 holo"
              detail="Base Set · possible crease"
              value="€64–€98"
              confidence={81}
              tone="blue"
              onEdit={() =>
                onNotice('Candidate editor opened for Blastoise 2/102.')
              }
            />
            <CandidateCard
              name="Mixed modern holos × 29"
              detail="Bulk residual until verified"
              value="€18–€31"
              confidence={93}
              tone="emerald"
              onEdit={() =>
                onNotice('Candidate editor opened for modern holo lot.')
              }
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
  onEdit,
}: {
  name: string;
  detail: string;
  value: string;
  confidence: number;
  tone: string;
  onEdit: () => void;
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
      <Button variant="outline" size="sm" onClick={onEdit}>
        Edit
      </Button>
    </article>
  );
}

function MarketPage({
  deals: records,
  onTrack,
  trackedIds,
}: {
  deals: Deal[];
  onTrack: (id: string) => Promise<void>;
  trackedIds: Set<string>;
}) {
  const [selected, setSelected] = useState(records[0]);
  const [marketQuery, setMarketQuery] = useState('Prismatic Evolutions ETB');
  const [marketResults, setMarketResults] = useState(records.slice(0, 4));
  useEffect(() => {
    queueMicrotask(() => {
      setMarketResults(records.slice(0, 4));
      setSelected(
        (current) =>
          records.find((item) => item.id === current?.id) ?? records[0],
      );
    });
  }, [records]);
  const history = [128, 132, 129, 137, 142, 151, 154, 162, 169, 171, 178, 182];
  const points = history
    .map((value, index) => `${index * 38},${135 - (value - 120) * 1.65}`)
    .join(' ');
  if (!selected)
    return (
      <Panel className="empty-state">
        <Search />
        <h2>No market records available</h2>
      </Panel>
    );
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
        <Button
          className="gold-button"
          onClick={() => {
            const next = records.filter((item) =>
              `${item.canonicalProduct} ${item.set} ${item.sourceListingId}`
                .toLowerCase()
                .includes(marketQuery.toLowerCase()),
            );
            setMarketResults(next);
            setSelected(next[0] ?? records[0]);
          }}
        >
          Search market
        </Button>
      </Panel>
      <div className="market-layout">
        <Panel className="market-results">
          <SectionHeading
            title="Canonical products"
            subtitle="Identity before price comparison"
          />
          {marketResults.map((item) => (
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
                  source="Cardmarket"
                  type="Fictional demonstration transaction cohort"
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
  const filteredReleases = releases.filter(
    (release) =>
      (gameFilter === 'all' || release.game.toLowerCase() === gameFilter) &&
      (scopeFilter !== 'official' || release.official) &&
      (scopeFilter !== 'watched' || watchedReleaseIds.has(release.id)),
  );
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
          <SelectTrigger>
            <SelectValue />
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
      {view === 'timeline' ? (
        <div className="release-timeline" data-release-view="timeline">
          {filteredReleases.map((release, index) => (
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
                  onClick={() => {
                    setWatchedReleaseIds((current) =>
                      new Set(current).add(release.id),
                    );
                    onNotice(
                      `${release.name} is now watched for this session.`,
                    );
                  }}
                >
                  <Eye /> Watch release
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
            title="Release calendar"
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
            Uploads require MIME and file-signature validation in live mode.
            Demo files remain device-local.
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
                  window.location.href = '/market';
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
        <Button
          variant="outline"
          className="iron-button"
          onClick={() => {
            const rows = [
              ['Lot', 'Quantity', 'All-in basis'],
              ...holdings.map((item) => [item.name, item.qty, item.basis]),
              ...inventoryLots.map((item) => [
                item.name,
                item.remainingQuantity,
                item.allInBasis,
              ]),
            ];
            const csv = rows.map((row) => row.join(',')).join('\n');
            const url = URL.createObjectURL(
              new Blob([csv], { type: 'text/csv;charset=utf-8' }),
            );
            const link = document.createElement('a');
            link.href = url;
            link.download = 'tcg-scout-accounting.csv';
            link.click();
            URL.revokeObjectURL(url);
            onNotice('Accounting CSV exported.');
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
            <span>Quantity</span>
            <Input
              type="number"
              min="1"
              value={purchaseQuantity}
              onChange={(event) =>
                setPurchaseQuantity(Number(event.target.value))
              }
            />
          </label>
          <label>
            <span>Item price</span>
            <Input
              type="number"
              value={purchaseItemPrice}
              onChange={(event) =>
                setPurchaseItemPrice(Number(event.target.value))
              }
            />
          </label>
          <label>
            <span>Acquisition costs</span>
            <Input
              type="number"
              value={purchaseCosts}
              onChange={(event) => setPurchaseCosts(Number(event.target.value))}
            />
          </label>
          <DialogFooter>
            <Button
              className="gold-button"
              disabled={portfolioBusy}
              onClick={async () => {
                setPortfolioBusy(true);
                try {
                  const response = await fetch('/api/purchases', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      dealId: deals[0]?.id,
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
                <SelectValue />
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
              value={saleGross}
              onChange={(event) => setSaleGross(Number(event.target.value))}
            />
          </label>
          <label>
            <span>Selling costs</span>
            <Input
              type="number"
              value={saleCosts}
              onChange={(event) => setSaleCosts(Number(event.target.value))}
            />
          </label>
          <DialogFooter>
            <Button
              className="gold-button"
              disabled={portfolioBusy || !saleLotId}
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
            <Telescope /> 6 active rules
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
          Create watch rule
        </Button>
      </Panel>
      <div className="watchlist-grid">
        {watched.map((item) => (
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
                  (item.economics.maximumAllInCost / item.economics.allInCost) *
                    100,
                )}
              />
              <span>
                Max all-in{' '}
                <b className="mono">{money(item.economics.maximumAllInCost)}</b>
              </span>
            </div>
            <div className="card-actions">
              <Button className="gold-button" onClick={() => onInspect(item)}>
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
                {recheckingIds.has(item.id) ? 'Rechecking…' : 'Open listing'}
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
          deal={watched[0] ?? records[0] ?? null}
          tone="critical"
          title="Critical · all-in below maximum buy"
          time="11m"
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
          detail="Destined Rivals · 3 comparable transactions"
          time="47m"
          onOpenListing={onOpenListing}
          rechecking={Boolean(records[1] && recheckingIds.has(records[1].id))}
        />
        <WatchEvent
          deal={records[2] ?? null}
          tone="warning"
          title="Price changed after alert"
          detail="Origins display no longer profitable after fees"
          time="2h"
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
  deal,
  onInspect,
  onNotice,
  onOpenListing,
  recheckingIds,
  userSignedIn,
}: {
  deal: Deal | null;
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
              disabled={savingRules}
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
                value={critical}
                onChange={(event) => setCritical(Number(event.target.value))}
              />
              <b>% minimum</b>
            </div>
          </label>
          <label>
            <span>Net profit</span>
            <div className="rule-input">
              <Input
                type="number"
                value={minimumProfit}
                onChange={(event) =>
                  setMinimumProfit(Number(event.target.value))
                }
              />
              <b>EUR minimum</b>
            </div>
          </label>
          <label>
            <span>ROI</span>
            <div className="rule-input">
              <Input
                type="number"
                value={minimumRoi}
                onChange={(event) => setMinimumRoi(Number(event.target.value))}
              />
              <b>% minimum</b>
            </div>
          </label>
          <label>
            <span>Profit per hour</span>
            <div className="rule-input">
              <Input
                type="number"
                value={minimumProfitPerHour}
                onChange={(event) =>
                  setMinimumProfitPerHour(Number(event.target.value))
                }
              />
              <b>EUR minimum</b>
            </div>
          </label>
          <label>
            <span>Confidence grade</span>
            <Select
              value={minimumGrade}
              onValueChange={(value) => setMinimumGrade(value ?? 'B')}
            >
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
            <Select
              value={String(maximumHoldingDays)}
              onValueChange={(value) =>
                setMaximumHoldingDays(Number(value ?? 90))
              }
            >
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
          <span>Profit ≥ {money(minimumProfit)}</span>
          <b>AND</b>
          <span>ROI ≥ {minimumRoi}%</span>
          <b>AND</b>
          <span>Grade ≥ {minimumGrade}</span>
          <b>AND</b>
          <span>Risk ≤ {QUICK_FLIP_GATE.maximumRiskScore}</span>
        </div>
      </Panel>
      <div className="alerts-layout">
        <Panel>
          <SectionHeading
            title="Recent alerts"
            subtitle="Fictional demonstration feed · 3 visible"
          />
          <div className="alert-feed">
            {deal ? (
              <AlertItem
                deal={deal}
                priority="Critical"
                title={`${deal.canonicalProduct} below maximum all-in`}
                time="11m"
                onOpen={() => onInspect(deal)}
                onOpenListing={() => onOpenListing(deal)}
                rechecking={recheckingIds.has(deal.id)}
              />
            ) : null}
            <AlertItem
              priority="High"
              title="Destined Rivals price cut"
              detail="Recheck required before action · exit eBay NL"
              time="37m"
              onOpen={() => {
                window.location.href = '/deals';
              }}
            />
            <AlertItem
              priority="Medium"
              title="Official Spiritforged preorder open"
              detail="7 retailers · €129–€159 · high interest"
              time="3h"
              onOpen={() => {
                window.location.href = '/releases';
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
  );
}

function SourcesPage({ onNotice }: { onNotice: (text: string) => void }) {
  const [testingSourceId, setTestingSourceId] = useState<string | null>(null);
  const [marktplaatsSource, setMarktplaatsSource] =
    useState<MarktplaatsDashboard | null>(null);
  const [amazonSource, setAmazonSource] = useState<AmazonDashboard | null>(
    null,
  );
  const [sourceResults, setSourceResults] = useState<
    Record<string, { ok: boolean; status: string; checkedAt: string }>
  >({});
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
        status: payload.status ?? payload.error ?? `HTTP ${response.status}`,
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
            {sources.filter(
              (source) => source.mode === 'Live' && source.health === 'Healthy',
            ).length +
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
            <NativeNavigationLink className="iron-link" href="/marktplaats">
              Open Scout
            </NativeNavigationLink>
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
            <NativeNavigationLink className="iron-link" href="/amazon">
              Open Amazon Scout
            </NativeNavigationLink>
          </div>
        </Panel>
        {sources
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
              {sourceResults[source.id] ? (
                <output className="safety-note">
                  <HeartPulse />
                  <span>
                    {sourceResults[source.id].ok
                      ? 'Connected'
                      : 'Not connected'}{' '}
                    · {sourceResults[source.id].status} ·{' '}
                    {new Date(
                      sourceResults[source.id].checkedAt,
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
                  onClick={() => {
                    window.location.href = '/settings';
                  }}
                >
                  Configure
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
    </div>
  );
}

function ReviewPage({
  onNotice,
  userSignedIn,
}: {
  onNotice: (text: string) => void;
  userSignedIn: boolean;
}) {
  const [items, setItems] = useState<ReviewQueueItem[]>(() =>
    userSignedIn ? [] : (fixtureReviewItems as ReviewQueueItem[]),
  );
  const [loading, setLoading] = useState(userSignedIn);
  const [activeItem, setActiveItem] = useState<ReviewQueueItem | null>(null);
  const [resolution, setResolution] = useState('accept_candidate');
  const [candidate, setCandidate] = useState('');
  const [quantity, setQuantity] = useState('1');
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
        if (!cancelled) setItems(payload.data);
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
  }, [onNotice, userSignedIn]);

  const openReview = (item: ReviewQueueItem) => {
    setActiveItem(item);
    setResolution('accept_candidate');
    setCandidate(item.currentCandidate);
    setQuantity(String(item.quantity));
  };

  const resolve = async () => {
    if (!activeItem) return;
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
              quantity: Math.max(1, Number.parseInt(quantity) || 1),
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
                    <SelectTrigger aria-label="Review resolution">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="accept_candidate">
                        Accept current candidate
                      </SelectItem>
                      <SelectItem value="select_alternative">
                        Select alternative
                      </SelectItem>
                      <SelectItem value="edit_fields">Edit fields</SelectItem>
                      <SelectItem value="packaging_only">
                        Packaging only
                      </SelectItem>
                      <SelectItem value="duplicate">Duplicate</SelectItem>
                      <SelectItem value="reject_listing">
                        Reject listing
                      </SelectItem>
                      <SelectItem value="defer">Defer</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label>
                  <span>Canonical candidate</span>
                  <Input
                    value={candidate}
                    onChange={(event) => setCandidate(event.target.value)}
                  />
                </label>
                {activeItem.alternativeCandidates.length ? (
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
                <label>
                  <span>Quantity</span>
                  <Input
                    inputMode="numeric"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                </label>
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
              disabled={saving || !candidate.trim()}
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
                  inputMode="numeric"
                  value={settings.localRadiusKm}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      localRadiusKm: Number(event.target.value),
                    }))
                  }
                />
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
                  inputMode="decimal"
                  value={settings.laborRate}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      laborRate: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                <span>Default exit</span>
                <Input value="Best supported sold evidence" readOnly />
              </label>
            </div>
            <div className="button-row">
              <Button
                className="gold-button"
                disabled={saving || !settingsLoaded}
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
                  inputMode="decimal"
                  value={Math.round(settings.requiredRoi * 100)}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      requiredRoi: Number(event.target.value) / 100,
                    }))
                  }
                />
              </label>
              <label>
                <span>Required profit (€)</span>
                <Input
                  disabled={!settingsLoaded || saving}
                  inputMode="decimal"
                  value={settings.requiredProfit}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      requiredProfit: Number(event.target.value),
                    }))
                  }
                />
              </label>
            </div>
            <Button
              className="gold-button"
              disabled={saving || !settingsLoaded}
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
