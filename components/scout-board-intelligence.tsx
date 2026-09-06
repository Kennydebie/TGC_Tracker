'use client';

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
import { useCallback, useEffect, useMemo, useState } from 'react';

import { NativeNavigationLink } from '@/components/native-navigation-link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  ScoutResearchFinding,
  ScoutResearchImportStatus,
} from '@/lib/community';
import { money } from '@/lib/domain';
import {
  buildScoutActionTimeline,
  checkedScoutActionUrl,
  isScoutDateOnly,
  rankScoutFindings,
  type ScoutAttentionLevel,
  type ScoutFindingAssessment,
} from '@/lib/scout-priority';
import { cn } from '@/lib/utils';

type ScoutBoardResponse = {
  data: {
    findings: ScoutResearchFinding[];
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

export function ScoutBoardIntelligence({
  initialFindings,
  initialImportStatus,
  signInPath,
  userSignedIn,
}: {
  initialFindings: ScoutResearchFinding[];
  initialImportStatus: ScoutResearchImportStatus;
  signInPath: string;
  userSignedIn: boolean;
}) {
  const [findings, setFindings] = useState(initialFindings);
  const [importStatus, setImportStatus] = useState(initialImportStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());

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
  const timeline = useMemo(
    () => buildScoutActionTimeline(findings, clock).slice(0, 6),
    [clock, findings],
  );
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
    <section className="scout-intelligence" aria-labelledby="scout-now-heading">
      <header className="scout-intelligence-header">
        <div>
          <span className="panel-kicker">
            <Route aria-hidden="true" /> SCHEDULED MARKET INTELLIGENCE
          </span>
          <h2 id="scout-now-heading">What matters now</h2>
          <p>
            Verified deadlines and material changes rise first. Asking prices
            and hype never become profit by themselves.
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
          <div className="action-horizon">
            <div className="scout-board-section-heading">
              <div>
                <span>Action horizon</span>
                <h3>Releases, registrations and deadlines</h3>
              </div>
              <Badge variant="outline">Europe/Amsterdam</Badge>
            </div>
            {timeline.length > 0 ? (
              <ol className="scout-action-timeline">
                {timeline.map(({ finding, assessment }) => (
                  <li
                    className={cn(
                      'scout-timeline-item',
                      `attention-${assessment.level}`,
                    )}
                    key={finding.id}
                  >
                    <div className="scout-timeline-date">
                      <span>
                        {timelineLabel(assessment.nextRelevantKind, assessment)}
                      </span>
                      <time dateTime={assessment.nextRelevantAt ?? undefined}>
                        {assessment.nextRelevantAt
                          ? milestoneDate(assessment.nextRelevantAt)
                          : 'Date unknown'}
                      </time>
                    </div>
                    <div>
                      <strong>{findingTitle(finding)}</strong>
                      <p>{visibleActionInstruction(finding, assessment)}</p>
                    </div>
                    <Badge variant="outline">{assessment.label}</Badge>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="scout-board-empty">
                <CalendarClock aria-hidden="true" />
                <div>
                  <h3>No sourced dates have been imported yet</h3>
                  <p>
                    The next scheduled run can add exact release dates, signup
                    windows and deadlines. Unknown dates stay unknown.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="priority-intelligence">
            <div className="scout-board-section-heading">
              <div>
                <span>Priority intelligence</span>
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
