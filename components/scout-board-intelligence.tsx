'use client';

/* oxlint-disable jsx-a11y/no-noninteractive-tabindex */

import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { NativeNavigationLink } from '@/components/native-navigation-link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  ScoutResearchFinding,
  ScoutResearchImportStatus,
} from '@/lib/community';
import { money } from '@/lib/domain';
import {
  checkedScoutActionUrl,
  isScoutDateOnly,
  rankScoutFindings,
  type ScoutAttentionLevel,
  type ScoutFindingAssessment,
} from '@/lib/scout-priority';
import {
  buildScoutRoadmap,
  type ScoutRoadmapMilestone,
} from '@/lib/scout-roadmap';
import { cn } from '@/lib/utils';

type ScoutBoardResponse = {
  data: {
    findings: ScoutResearchFinding[];
    roadmapFindings: ScoutResearchFinding[];
    roadmapCoverageLimited: boolean;
    importStatus: ScoutResearchImportStatus;
  };
};

const attentionIcons = {
  critical: AlertTriangle,
  high: Sparkles,
  watch: Clock3,
  info: Route,
  expired: CheckCircle2,
} satisfies Record<ScoutAttentionLevel, typeof AlertTriangle>;

function safeExternalUrl(value: string | null): string | null {
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

function dateTime(value: string) {
  return new Intl.DateTimeFormat('nl-NL', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Amsterdam',
  }).format(new Date(value));
}

function dateOnly(value: string) {
  return new Intl.DateTimeFormat('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Amsterdam',
  }).format(new Date(value));
}

function milestoneDate(value: string) {
  return isScoutDateOnly(value)
    ? `${dateOnly(value)} · time not specified`
    : dateTime(value);
}

function externalHost(value: string) {
  return new URL(value).hostname.replace(/^www\./, '');
}

function findingTitle(finding: ScoutResearchFinding) {
  return (
    finding.headline ??
    finding.productName ??
    finding.updateType.replaceAll('_', ' ')
  );
}

function sourceLabel(finding: ScoutResearchFinding) {
  if (finding.retailerName) return finding.retailerName;
  if (finding.subreddit) return `r/${finding.subreddit}`;
  if (finding.sourceKind === 'official') return 'Official source';
  return finding.sourceIdentifier;
}

function evidenceLabel(
  finding: ScoutResearchFinding,
  verificationCurrent: boolean,
) {
  if (finding.verificationStatus !== 'community_report' && !verificationCurrent)
    return 'Reverification needed';
  if (finding.verificationStatus === 'official_checked')
    return 'Officially checked';
  if (finding.verificationStatus === 'retailer_checked')
    return 'Retailer checked';
  return 'Needs direct verification';
}

function timelineLabel(
  kind: 'deadline' | 'opens' | 'event' | null,
  assessment: ScoutFindingAssessment,
) {
  if (kind === 'deadline')
    return assessment.sourceBacked &&
      assessment.verificationCurrent &&
      assessment.actionState === 'open'
      ? 'Act by'
      : 'Reported deadline';
  if (kind === 'opens')
    return assessment.sourceBacked && assessment.verificationCurrent
      ? 'Opens'
      : 'Reported opening';
  return assessment.sourceBacked && assessment.verificationCurrent
    ? 'Event'
    : 'Reported event';
}

function visibleActionInstruction(
  finding: ScoutResearchFinding,
  assessment: ScoutFindingAssessment,
) {
  if (assessment.actionState === 'closed')
    return 'The action window is closed. Keep the future event on the calendar and wait for a sourced update.';
  if (!assessment.sourceBacked)
    return assessment.requiresEconomics
      ? 'Verify the report against the original seller or official source, then underwrite the full economics before deciding.'
      : 'Verify this report against an official or retailer source before taking any action.';
  if (!assessment.verificationCurrent)
    return 'Recheck the source now. The previous verification is too old for an action recommendation.';
  if (assessment.actionState === 'unknown')
    return 'Verify that the action window is open before following the reported instruction.';
  if (assessment.requiresEconomics)
    return 'Inspect the listing and underwrite completed-sale evidence, fees, shipping, profit and ROI before deciding.';
  if (assessment.actionState === 'upcoming')
    return isScoutDateOnly(finding.actionOpensAt)
      ? 'The action window is not confirmed open yet. Check the source on the reported opening date; no exact time was published.'
      : 'The action window is not open yet. Check the source at the reported opening time.';
  return (
    finding.actionInstruction ?? 'Review the sourced update before the event.'
  );
}

function visibleActionLabel(assessment: ScoutFindingAssessment) {
  if (!assessment.sourceBacked) return 'Verify source first';
  if (!assessment.verificationCurrent) return 'Reverify first';
  if (assessment.actionState === 'unknown') return 'Confirm opening first';
  if (assessment.requiresEconomics) return 'Before any purchase';
  if (assessment.actionState === 'upcoming') return 'Prepare next';
  return 'Do next';
}

function roadmapMonthLabel(year: number, monthIndex: number) {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    timeZone: 'Europe/Amsterdam',
  }).format(new Date(Date.UTC(year, monthIndex, 1, 12)));
}

function roadmapRangeLabel(startMonthKey: string, endMonthKey: string) {
  const label = (value: string) => {
    const [year, month] = value.split('-').map(Number);
    return `${roadmapMonthLabel(year, month - 1)} ${year}`;
  };
  return `${label(startMonthKey)} — ${label(endMonthKey)}`;
}

function roadmapMilestoneTime(milestone: ScoutRoadmapMilestone) {
  if (milestone.precision === 'date') return 'Time not published';
  return new Intl.DateTimeFormat('nl-NL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Amsterdam',
  }).format(new Date(milestone.at));
}

function roadmapMilestoneDateLabel(milestone: ScoutRoadmapMilestone) {
  const [year, month, day] = milestone.dateKey.split('-').map(Number);
  const fullDate = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'long',
    timeZone: 'Europe/Amsterdam',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  return milestone.precision === 'date'
    ? `${fullDate}, time not published`
    : `${fullDate} at ${roadmapMilestoneTime(milestone)} Europe/Amsterdam`;
}

function roadmapMilestonePercent(
  milestone: ScoutRoadmapMilestone,
  year: number,
  monthIndex: number,
) {
  const day = Number(milestone.dateKey.slice(8, 10));
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Math.min(98, Math.max(2, ((day - 0.5) / daysInMonth) * 100));
}

function roadmapStatus(milestone: ScoutRoadmapMilestone) {
  if (milestone.temporalState === 'cancelled') return 'Cancelled';
  if (milestone.temporalState === 'closed') return 'Closed';
  if (milestone.temporalState === 'past') return 'Past';
  const currentStatus =
    milestone.provenance === 'reported'
      ? 'Reported · verify'
      : milestone.provenance === 'checked_stale'
        ? 'Reverify'
        : milestone.isPrimary
          ? milestone.kind === 'event' &&
            milestone.assessment.actionState === 'closed'
            ? 'Scheduled'
            : milestone.assessment.label
          : 'Scheduled';
  return milestone.temporalState === 'today'
    ? `Today · ${currentStatus}`
    : currentStatus;
}

function roadmapMilestoneGroups(milestones: ScoutRoadmapMilestone[]) {
  const featuredIds = new Set(
    milestones
      .filter((milestone) => ['critical', 'high'].includes(milestone.attention))
      .map((milestone) => milestone.id),
  );
  for (const milestone of milestones) {
    if (featuredIds.size >= 4) break;
    featuredIds.add(milestone.id);
  }
  return {
    visible: milestones.filter((milestone) => featuredIds.has(milestone.id)),
    hidden: milestones.filter((milestone) => !featuredIds.has(milestone.id)),
  };
}

function RoadmapMilestoneCard({
  milestone,
}: {
  milestone: ScoutRoadmapMilestone;
}) {
  const description = milestone.finding.actionInstruction
    ? visibleActionInstruction(milestone.finding, milestone.assessment)
    : milestone.finding.summary;
  return (
    <li
      className={cn(
        'scout-roadmap-milestone',
        `attention-${milestone.attention}`,
        `temporal-${milestone.temporalState}`,
        `provenance-${milestone.provenance}`,
        milestone.precision === 'date' && 'precision-date',
      )}
    >
      <div className="scout-roadmap-date">
        <time
          dateTime={milestone.at}
          aria-label={roadmapMilestoneDateLabel(milestone)}
        >
          <strong>{Number(milestone.dateKey.slice(8, 10))}</strong>
          <span>{roadmapMilestoneTime(milestone)}</span>
        </time>
        <span>{timelineLabel(milestone.kind, milestone.assessment)}</span>
      </div>
      <div className="scout-roadmap-copy">
        <div className="scout-roadmap-meta">
          <span>
            {milestone.finding.game === 'pokemon' ? 'Pokémon' : 'Riftbound'}
          </span>
          <strong>{roadmapStatus(milestone)}</strong>
        </div>
        <h4>{findingTitle(milestone.finding)}</h4>
        <small>{sourceLabel(milestone.finding)}</small>
        <p>{description}</p>
      </div>
    </li>
  );
}

export function ScoutBoardIntelligence({
  initialFindings,
  initialRoadmapFindings,
  initialRoadmapCoverageLimited,
  initialImportStatus,
  signInPath,
  userSignedIn,
}: {
  initialFindings: ScoutResearchFinding[];
  initialRoadmapFindings: ScoutResearchFinding[];
  initialRoadmapCoverageLimited: boolean;
  initialImportStatus: ScoutResearchImportStatus;
  signInPath: string;
  userSignedIn: boolean;
}) {
  const [findings, setFindings] = useState(initialFindings);
  const [roadmapFindings, setRoadmapFindings] = useState(
    initialRoadmapFindings,
  );
  const [roadmapCoverageLimited, setRoadmapCoverageLimited] = useState(
    initialRoadmapCoverageLimited,
  );
  const [importStatus, setImportStatus] = useState(initialImportStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const roadmapScrollRef = useRef<HTMLElement>(null);
  const currentMonthRef = useRef<HTMLLIElement>(null);
  const roadmapPositionedRef = useRef(false);

  const scrollRoadmapToCurrent = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const scrollRegion = roadmapScrollRef.current;
      const currentMonth = currentMonthRef.current;
      if (!scrollRegion || !currentMonth) return;
      scrollRegion.scrollTo({
        behavior,
        left: Math.max(
          0,
          currentMonth.offsetLeft -
            (scrollRegion.clientWidth - currentMonth.clientWidth) / 2,
        ),
      });
    },
    [],
  );

  const refresh = useCallback(async () => {
    if (!userSignedIn) return;
    // Keep urgency, expiry and verification-age decisions moving forward even
    // when the API request fails or hangs.
    setClock(Date.now());
    setLoading(true);
    try {
      const response = await fetch('/api/scout-board', { cache: 'no-store' });
      if (!response.ok) throw new Error('Scout Board could not be refreshed.');
      const payload = (await response.json()) as ScoutBoardResponse;
      setFindings(payload.data.findings);
      setRoadmapFindings(
        payload.data.roadmapFindings ?? payload.data.findings ?? [],
      );
      setRoadmapCoverageLimited(Boolean(payload.data.roadmapCoverageLimited));
      setImportStatus(payload.data.importStatus);
      setClock(Date.now());
      setError(null);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : 'Scout Board could not be refreshed.',
      );
    } finally {
      setLoading(false);
    }
  }, [userSignedIn]);

  useEffect(() => {
    if (!userSignedIn) return;
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 60_000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, userSignedIn]);

  const ranked = useMemo(
    () => rankScoutFindings(findings, clock),
    [clock, findings],
  );
  const roadmap = useMemo(
    () => buildScoutRoadmap(roadmapFindings, clock),
    [clock, roadmapFindings],
  );
  useEffect(() => {
    if (!userSignedIn || roadmapPositionedRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      scrollRoadmapToCurrent('auto');
      roadmapPositionedRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [roadmap.startMonthKey, scrollRoadmapToCurrent, userSignedIn]);
  const activePriorities = ranked.filter(
    ({ assessment }) => assessment.level !== 'expired',
  );
  const visiblePriorities = (
    activePriorities.length > 0 ? activePriorities : ranked
  ).slice(0, 6);
  const urgentCount = activePriorities.filter(({ assessment }) =>
    ['critical', 'high'].includes(assessment.level),
  ).length;
  const latestRun = importStatus.latestRun;
  const runStatusLabel = latestRun
    ? importStatus.lastRunStatus === 'completed'
      ? 'Import completed'
      : importStatus.lastRunStatus === 'partial'
        ? 'Import saved with gaps'
        : 'Import failed'
    : 'Waiting for first run';

  return (
    <section
      className="scout-intelligence"
      aria-labelledby="scout-board-heading"
    >
      <header className="scout-intelligence-header">
        <div>
          <span className="panel-kicker">
            <Route aria-hidden="true" /> SCHEDULED MARKET INTELLIGENCE
          </span>
          <h2 id="scout-board-heading">Market roadmap</h2>
          <p>
            See every sourced opening, deadline and release month by month.
            Priority below still separates verified action from asking prices
            and hype.
          </p>
        </div>
        <div className="scout-run-heartbeat" aria-live="polite">
          <div>
            <span
              className={cn(
                'scout-run-dot',
                importStatus.lastRunStatus === 'completed' && 'is-healthy',
                importStatus.lastRunStatus === 'partial' && 'is-warning',
                importStatus.lastRunStatus === 'failed' && 'is-error',
              )}
            />
            <span>
              <strong>{runStatusLabel}</strong>
              {' · '}
              {latestRun
                ? dateTime(latestRun.finishedAt)
                : 'No scheduled run received yet'}
            </span>
          </div>
          {latestRun ? (
            <small>
              {latestRun.sourcesChecked} sources checked ·{' '}
              {latestRun.inserted + latestRun.updated} changed ·{' '}
              {latestRun.sourcesUnavailable} unavailable
            </small>
          ) : null}
          <Button
            className="iron-button scout-refresh-button"
            variant="outline"
            size="sm"
            disabled={loading || !userSignedIn}
            onClick={() => void refresh()}
          >
            <RefreshCw className={cn(loading && 'is-spinning')} />
            {loading ? 'Refreshing' : 'Refresh'}
          </Button>
        </div>
      </header>

      {!userSignedIn ? (
        <div className="scout-board-empty scout-board-signin">
          <ShieldCheck aria-hidden="true" />
          <div>
            <h3>Sign in to see your private research timeline</h3>
            <p>
              Scheduled findings stay isolated to the account that imported
              them.
            </p>
          </div>
          <NativeNavigationLink
            className="gold-button button-link"
            href={signInPath}
          >
            Sign in with ChatGPT
          </NativeNavigationLink>
        </div>
      ) : null}

      {error ? (
        <div className="scout-board-error" role="alert">
          <AlertTriangle aria-hidden="true" /> {error}
        </div>
      ) : null}

      {userSignedIn && importStatus.actionableError ? (
        <div className="scout-board-error" role="alert">
          <AlertTriangle aria-hidden="true" />
          <span>
            <strong>Scheduled research needs attention.</strong>{' '}
            {importStatus.actionableError}
          </span>
        </div>
      ) : null}

      {userSignedIn ? (
        <>
          <section
            className="scout-roadmap-section"
            aria-labelledby="scout-roadmap-heading"
          >
            <div className="scout-board-section-heading">
              <div>
                <span>Release &amp; action roadmap</span>
                <h3 id="scout-roadmap-heading">
                  {roadmapRangeLabel(
                    roadmap.startMonthKey,
                    roadmap.endMonthKey,
                  )}
                </h3>
              </div>
              <div className="scout-roadmap-heading-meta">
                <div className="scout-roadmap-jumps">
                  <button
                    type="button"
                    onClick={() =>
                      roadmapScrollRef.current?.scrollTo({
                        behavior: 'smooth',
                        left: 0,
                      })
                    }
                  >
                    Back to July
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollRoadmapToCurrent()}
                  >
                    Jump to today
                  </button>
                </div>
                <Badge variant="outline">Europe/Amsterdam</Badge>
              </div>
            </div>
            {roadmapCoverageLimited || roadmap.rangeLimited ? (
              <output className="scout-roadmap-coverage" aria-live="polite">
                <AlertTriangle aria-hidden="true" />
                The roadmap is showing the loaded date range, not a complete
                archive. New scheduled imports remain visible when received.
              </output>
            ) : null}
            {/* A labelled overflow region must be focusable so keyboard users
                can pan the month axis with arrow keys. */}
            <section
              className="scout-roadmap-scroll"
              ref={roadmapScrollRef}
              aria-label={`Market roadmap from ${roadmapRangeLabel(
                roadmap.startMonthKey,
                roadmap.endMonthKey,
              )}`}
              tabIndex={0}
            >
              <ol className="scout-roadmap">
                {roadmap.months.map((month) => {
                  const milestoneGroups = roadmapMilestoneGroups(
                    month.milestones,
                  );
                  return (
                    <li
                      className={cn(
                        'scout-roadmap-month',
                        month.isCurrent && 'is-current',
                        month.milestones.length === 0 && 'is-empty',
                      )}
                      key={month.key}
                      ref={month.isCurrent ? currentMonthRef : undefined}
                    >
                      <header>
                        <time
                          dateTime={`${month.key}-01`}
                          aria-current={month.isCurrent ? 'date' : undefined}
                        >
                          <strong>
                            {roadmapMonthLabel(month.year, month.monthIndex)}
                          </strong>
                          <span>{month.year}</span>
                        </time>
                        <small>
                          {month.milestones.length === 1
                            ? '1 dated item'
                            : `${month.milestones.length} dated items`}
                        </small>
                      </header>
                      <div className="scout-roadmap-axis" aria-hidden="true">
                        <i />
                        {month.milestones.map((milestone) => (
                          <b
                            className={cn(
                              'scout-roadmap-axis-marker',
                              `marker-${milestone.attention}`,
                              milestone.precision === 'date' && 'is-date-only',
                              ['past', 'closed', 'cancelled'].includes(
                                milestone.temporalState,
                              ) && 'is-past',
                            )}
                            key={milestone.id}
                            style={{
                              left: `${roadmapMilestonePercent(
                                milestone,
                                month.year,
                                month.monthIndex,
                              )}%`,
                            }}
                          />
                        ))}
                        {month.todayPercent !== null ? (
                          <span style={{ left: `${month.todayPercent}%` }}>
                            Today
                          </span>
                        ) : null}
                      </div>
                      {month.milestones.length > 0 ? (
                        <>
                          <ol className="scout-roadmap-milestones">
                            {milestoneGroups.visible.map((milestone) => (
                              <RoadmapMilestoneCard
                                key={milestone.id}
                                milestone={milestone}
                              />
                            ))}
                          </ol>
                          {milestoneGroups.hidden.length > 0 ? (
                            <details className="scout-roadmap-more">
                              <summary>
                                Show {milestoneGroups.hidden.length} more dated
                                items
                              </summary>
                              <ol className="scout-roadmap-milestones">
                                {milestoneGroups.hidden.map((milestone) => (
                                  <RoadmapMilestoneCard
                                    key={milestone.id}
                                    milestone={milestone}
                                  />
                                ))}
                              </ol>
                            </details>
                          ) : null}
                        </>
                      ) : (
                        <div className="scout-roadmap-empty-month">
                          <CalendarClock aria-hidden="true" />
                          <span>
                            {roadmapCoverageLimited
                              ? 'No loaded dates'
                              : 'No sourced dates'}
                          </span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
            {roadmap.totalMilestones === 0 ? (
              <p className="scout-roadmap-waiting">
                The month structure is ready. Exact dates will appear here as
                soon as the scheduled research imports them; unknown dates stay
                unknown.
              </p>
            ) : null}
          </section>

          <div className="priority-intelligence">
            <div className="scout-board-section-heading">
              <div>
                <span>What matters now</span>
                <h3>{urgentCount} verified items need closer attention</h3>
              </div>
              <small>
                Ranked by evidence, deadline, availability and change
              </small>
            </div>
            {visiblePriorities.length > 0 ? (
              <div className="scout-priority-grid">
                {visiblePriorities.map(({ finding, assessment }) => {
                  const AttentionIcon = attentionIcons[assessment.level];
                  const sourceUrl = safeExternalUrl(
                    finding.retailerOrOfficialUrl ?? finding.sourceUrl,
                  );
                  const evidenceUrl = safeExternalUrl(
                    finding.verificationEvidenceUrl ?? finding.sourceUrl,
                  );
                  const checkedActionUrl = checkedScoutActionUrl(
                    finding,
                    assessment,
                  );
                  const trustedAction = Boolean(
                    checkedActionUrl &&
                    !assessment.requiresEconomics &&
                    finding.actionType &&
                    finding.actionType !== 'none',
                  );
                  const primaryUrl = trustedAction
                    ? checkedActionUrl
                    : assessment.requiresEconomics && checkedActionUrl
                      ? checkedActionUrl
                      : (sourceUrl ?? evidenceUrl);
                  const activeDate = Boolean(assessment.nextRelevantAt);
                  return (
                    <article
                      className={cn(
                        'scout-priority-card',
                        `attention-${assessment.level}`,
                        `freshness-${assessment.freshness}`,
                        activeDate && 'has-active-date',
                      )}
                      key={finding.id}
                    >
                      <header>
                        <div className="scout-attention-label">
                          <AttentionIcon aria-hidden="true" />
                          <span>{assessment.label}</span>
                        </div>
                        <Badge variant="outline">
                          {evidenceLabel(
                            finding,
                            assessment.verificationCurrent,
                          )}
                        </Badge>
                      </header>
                      <p className="scout-priority-reason">
                        {assessment.reason}
                      </p>
                      <div className="scout-priority-title">
                        <small>
                          {finding.game === 'pokemon' ? 'Pokémon' : 'Riftbound'}{' '}
                          · {finding.updateType.replaceAll('_', ' ')}
                        </small>
                        <h4>{findingTitle(finding)}</h4>
                        <span>{sourceLabel(finding)}</span>
                      </div>
                      <p>{finding.summary}</p>
                      {assessment.actionState === 'closed' &&
                      assessment.nextRelevantAt ? (
                        <div className="scout-next-action is-closed">
                          <Clock3 aria-hidden="true" />
                          <div>
                            <span>Closed action</span>
                            <strong>
                              The prior action is no longer available. Monitor
                              the sourced event for the next change.
                            </strong>
                            <time dateTime={assessment.nextRelevantAt}>
                              Event {milestoneDate(assessment.nextRelevantAt)}
                            </time>
                          </div>
                        </div>
                      ) : finding.actionInstruction ? (
                        <div className="scout-next-action">
                          <ArrowUpRight aria-hidden="true" />
                          <div>
                            <span>{visibleActionLabel(assessment)}</span>
                            <strong>
                              {visibleActionInstruction(finding, assessment)}
                            </strong>
                            {assessment.actionState === 'upcoming' &&
                            finding.actionOpensAt ? (
                              <time dateTime={finding.actionOpensAt}>
                                Opens {milestoneDate(finding.actionOpensAt)}
                              </time>
                            ) : null}
                            {finding.actionDeadlineAt ? (
                              <time dateTime={finding.actionDeadlineAt}>
                                {assessment.sourceBacked &&
                                assessment.verificationCurrent &&
                                assessment.actionState === 'open'
                                  ? 'Deadline'
                                  : 'Reported deadline'}{' '}
                                {milestoneDate(finding.actionDeadlineAt)}
                              </time>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                      <div className="scout-economics-boundary">
                        <span>
                          {finding.price !== null && finding.currency
                            ? `Observed price ${money(finding.price, finding.currency)}`
                            : 'Observed price unknown'}
                        </span>
                        <small>
                          Economics not underwritten · not a profit claim
                        </small>
                      </div>
                      <footer>
                        <span>
                          Changed {dateTime(finding.materialChangedAt)} ·
                          rechecked {dateTime(finding.observedAt)}
                        </span>
                        <div>
                          {evidenceUrl && evidenceUrl !== primaryUrl ? (
                            <a
                              href={evidenceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Evidence <ExternalLink aria-hidden="true" />
                            </a>
                          ) : null}
                          {primaryUrl ? (
                            <a
                              className={cn(
                                trustedAction && 'scout-action-link',
                              )}
                              href={primaryUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {trustedAction
                                ? 'Open action'
                                : assessment.requiresEconomics
                                  ? 'Inspect listing'
                                  : !assessment.sourceBacked
                                    ? 'Verify source'
                                    : !assessment.verificationCurrent
                                      ? 'Reverify source'
                                      : 'Open source'}{' '}
                              · {externalHost(primaryUrl)}{' '}
                              <ArrowUpRight aria-hidden="true" />
                            </a>
                          ) : null}
                        </div>
                      </footer>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="scout-board-empty">
                <Route aria-hidden="true" />
                <div>
                  <h3>No sourced intelligence has been imported yet</h3>
                  <p>
                    The board will populate after the next successful scheduled
                    research run. No sample findings are shown.
                  </p>
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}

      <footer className="scout-intelligence-legend">
        <span>
          <i className="legend-critical" /> Act now
        </span>
        <span>
          <i className="legend-high" /> High priority
        </span>
        <span>
          <i className="legend-watch" /> Watch or verify
        </span>
        <span>
          Green remains reserved for production deals that pass the full
          economics gate.
        </span>
      </footer>
    </section>
  );
}
