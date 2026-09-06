import type { ScoutResearchFinding } from './community.ts';

export type ScoutAttentionLevel =
  | 'critical'
  | 'high'
  | 'watch'
  | 'info'
  | 'expired';

export type ScoutFindingAssessment = {
  level: ScoutAttentionLevel;
  score: number;
  label: string;
  reason: string;
  nextRelevantAt: string | null;
  nextRelevantKind: 'deadline' | 'opens' | 'event' | null;
  freshness: 'fresh' | 'recent' | 'aging' | 'stale';
  sourceBacked: boolean;
  verificationCurrent: boolean;
  actionState: 'none' | 'unknown' | 'upcoming' | 'open' | 'closed';
  requiresEconomics: boolean;
  economicsStatus: 'not_underwritten';
};

const DAY_MS = 86_400_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const LEVEL_ORDER: Record<ScoutAttentionLevel, number> = {
  critical: 5,
  high: 4,
  watch: 3,
  info: 2,
  expired: 1,
};

export function isScoutDateOnly(value: string | null): boolean {
  return Boolean(value && DATE_ONLY.test(value));
}

function safeHttps(value: string | null): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}

export function checkedScoutActionUrl(
  finding: ScoutResearchFinding,
  assessment: ScoutFindingAssessment,
): string | null {
  const action = safeHttps(finding.actionUrl);
  const evidence = safeHttps(
    finding.verificationEvidenceUrl ?? finding.sourceUrl,
  );
  if (
    !action ||
    !evidence ||
    !assessment.sourceBacked ||
    !assessment.verificationCurrent ||
    assessment.actionState !== 'open' ||
    !finding.actionType ||
    finding.actionType === 'none' ||
    action.hostname !== evidence.hostname
  )
    return null;
  return action.toString();
}

function time(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function amsterdamDate(now: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Amsterdam',
  }).formatToParts(new Date(now));
  const value = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

function milestoneDistance(value: string | null, now: number): number | null {
  if (!value) return null;
  if (isScoutDateOnly(value))
    return Date.parse(value) - Date.parse(amsterdamDate(now));
  const parsed = time(value);
  return parsed === null ? null : parsed - now;
}

function milestoneIsPast(value: string | null, now: number): boolean {
  if (!value) return false;
  if (isScoutDateOnly(value)) return value < amsterdamDate(now);
  const parsed = time(value);
  return parsed !== null && parsed < now;
}

function milestoneIsFutureOrToday(value: string | null, now: number): boolean {
  return Boolean(value) && !milestoneIsPast(value, now);
}

function actionable(finding: ScoutResearchFinding): boolean {
  return Boolean(
    finding.actionType &&
    finding.actionType !== 'none' &&
    finding.actionInstruction,
  );
}

function lifecycleConfirmsOpen(finding: ScoutResearchFinding): boolean {
  return Boolean(
    (finding.actionType === 'register' &&
      finding.lifecycleStatus === 'registration_open') ||
    (finding.actionType === 'preorder' &&
      finding.lifecycleStatus === 'preorder_open') ||
    (finding.actionType === 'buy' &&
      (finding.lifecycleStatus === 'in_stock' ||
        finding.availability === 'in_stock')) ||
    ['verify', 'watch'].includes(finding.actionType ?? ''),
  );
}

function findingActionState(
  finding: ScoutResearchFinding,
  now: number,
): ScoutFindingAssessment['actionState'] {
  if (!actionable(finding)) return 'none';
  if (
    ['closed', 'cancelled'].includes(finding.lifecycleStatus) ||
    milestoneIsPast(finding.actionDeadlineAt, now)
  )
    return 'closed';
  const opensDistance = milestoneDistance(finding.actionOpensAt, now);
  if (opensDistance !== null && opensDistance > 0) return 'upcoming';
  if (opensDistance !== null) {
    if (!isScoutDateOnly(finding.actionOpensAt)) return 'open';
    if (opensDistance === 0)
      return lifecycleConfirmsOpen(finding) ? 'open' : 'upcoming';
    return lifecycleConfirmsOpen(finding) ? 'open' : 'unknown';
  }
  if (lifecycleConfirmsOpen(finding)) return 'open';
  return 'unknown';
}

function nextRelevant(
  finding: ScoutResearchFinding,
  now: number,
  actionState: ScoutFindingAssessment['actionState'],
) {
  const actionCandidates =
    actionState === 'upcoming'
      ? [
          { value: finding.actionOpensAt, kind: 'opens' as const, order: 0 },
          {
            value: finding.actionDeadlineAt,
            kind: 'deadline' as const,
            order: 1,
          },
        ]
      : actionState === 'open'
        ? [
            {
              value: finding.actionDeadlineAt,
              kind: 'deadline' as const,
              order: 0,
            },
          ]
        : actionState === 'unknown'
          ? [
              {
                value: finding.actionDeadlineAt,
                kind: 'deadline' as const,
                order: 0,
              },
            ]
          : [];
  const candidates = [
    ...actionCandidates,
    { value: finding.eventAt, kind: 'event' as const, order: 2 },
  ]
    .map((candidate) => ({ ...candidate, at: time(candidate.value) }))
    .filter(
      (candidate): candidate is typeof candidate & { at: number } =>
        candidate.at !== null && milestoneIsFutureOrToday(candidate.value, now),
    )
    .sort((left, right) => left.at - right.at || left.order - right.order);
  const next = candidates[0];
  return next ? { at: next.value, kind: next.kind } : { at: null, kind: null };
}

export function assessScoutFinding(
  finding: ScoutResearchFinding,
  now = Date.now(),
): ScoutFindingAssessment {
  const deadlineDistance = milestoneDistance(finding.actionDeadlineAt, now);
  const opensDistance = milestoneDistance(finding.actionOpensAt, now);
  const eventDistance = milestoneDistance(finding.eventAt, now);
  const changedAt = time(finding.materialChangedAt) ?? time(finding.observedAt);
  const age = changedAt === null ? Number.POSITIVE_INFINITY : now - changedAt;
  const freshness: ScoutFindingAssessment['freshness'] =
    age <= DAY_MS
      ? 'fresh'
      : age <= 3 * DAY_MS
        ? 'recent'
        : age <= 7 * DAY_MS
          ? 'aging'
          : 'stale';
  const actionState = findingActionState(finding, now);
  const next = nextRelevant(finding, now, actionState);
  const eventUpcoming = milestoneIsFutureOrToday(finding.eventAt, now);
  const eventPassed = milestoneIsPast(finding.eventAt, now);
  const activeOffer =
    ['registration_open', 'preorder_open', 'in_stock'].includes(
      finding.lifecycleStatus,
    ) || ['in_stock', 'preorder'].includes(finding.availability);
  const lifecycleClosed = finding.lifecycleStatus === 'closed';
  const unavailable =
    finding.availability === 'sold_out' ||
    finding.shippingToNetherlands === 'unavailable';
  const sourceBacked = finding.verificationStatus !== 'community_report';
  const verifiedAt = time(finding.verificationObservedAt);
  const verificationCurrent = Boolean(
    sourceBacked &&
    verifiedAt !== null &&
    verifiedAt <= now + 10 * 60_000 &&
    now - verifiedAt <= 26 * 60 * 60_000,
  );
  const requiresEconomics = ['buy', 'preorder'].includes(
    finding.actionType ?? '',
  );
  const urgentWindowAction = ['register', 'attend'].includes(
    finding.actionType ?? '',
  );
  const common = {
    nextRelevantAt: next.at,
    nextRelevantKind: next.kind,
    freshness,
    sourceBacked,
    verificationCurrent,
    actionState,
    requiresEconomics,
    economicsStatus: 'not_underwritten' as const,
  };

  if (finding.lifecycleStatus === 'cancelled')
    return {
      ...common,
      level: 'expired',
      score: 0,
      label: 'Cancelled',
      reason: 'The sourced event or opportunity was cancelled.',
    };

  if ((lifecycleClosed || actionState === 'closed') && eventUpcoming)
    return {
      ...common,
      actionState: 'closed',
      level: 'watch',
      score: sourceBacked ? 24 : 12,
      label: 'Action closed',
      reason:
        'The recorded action window has closed, but the future event remains relevant.',
    };

  if (lifecycleClosed || actionState === 'closed')
    return {
      ...common,
      actionState: 'closed',
      level: 'expired',
      score: 0,
      label: lifecycleClosed ? 'Closed' : 'Deadline passed',
      reason: lifecycleClosed
        ? 'This opportunity is no longer active.'
        : 'The recorded action deadline has passed.',
    };

  if (eventPassed && next.at === null && !activeOffer)
    return {
      ...common,
      level: 'expired',
      score: 0,
      label: 'Event passed',
      reason: 'The recorded event date has passed with no active window.',
    };

  if (unavailable)
    return {
      ...common,
      level: 'info',
      score: 0,
      label:
        finding.availability === 'sold_out' ? 'Sold out' : 'Unavailable in NL',
      reason:
        finding.availability === 'sold_out'
          ? 'The sourced listing is currently sold out.'
          : 'The sourced offer is not available for delivery to the Netherlands.',
    };

  let score =
    finding.verificationStatus === 'official_checked'
      ? 24
      : finding.verificationStatus === 'retailer_checked'
        ? 18
        : 4;

  if (actionable(finding))
    score += ['register', 'preorder', 'buy', 'attend'].includes(
      finding.actionType ?? '',
    )
      ? requiresEconomics
        ? 4
        : 12
      : 4;

  if (
    ['deal', 'restock', 'preorder', 'release', 'reprint'].includes(
      finding.updateType,
    )
  )
    score += 8;
  else score += 2;

  if (deadlineDistance !== null && deadlineDistance >= 0) {
    if (deadlineDistance <= DAY_MS) score += 40;
    else if (deadlineDistance <= 7 * DAY_MS) score += 30;
    else if (deadlineDistance <= 30 * DAY_MS) score += 15;
    else score += 5;
  } else if (eventUpcoming && eventDistance !== null) {
    if (eventDistance <= 7 * DAY_MS) score += 15;
    else if (eventDistance <= 30 * DAY_MS) score += 10;
    else if (eventDistance <= 90 * DAY_MS) score += 4;
  }

  if (finding.availability === 'in_stock') score += 8;
  if (finding.availability === 'preorder') score += 6;
  if (finding.shippingToNetherlands === 'confirmed') score += 4;
  if (freshness === 'fresh') score += 8;
  else if (freshness === 'recent') score += 4;
  else if (freshness === 'aging') score += 1;

  let level: ScoutAttentionLevel = 'info';
  let label = 'Information';
  let reason = 'Useful market context; no immediate verified action.';
  if (requiresEconomics) {
    level = 'watch';
    label = 'Verify economics';
    reason =
      'This is acquisition evidence, not a purchase recommendation; underwrite completed-sale evidence and all costs first.';
  } else if (
    sourceBacked &&
    !verificationCurrent &&
    (score >= 25 || actionable(finding) || eventUpcoming)
  ) {
    level = 'watch';
    label = 'Reverify now';
    reason =
      'This was source-checked before, but the verification is too old for an urgent alert.';
  } else if (actionState === 'unknown') {
    level = 'watch';
    label = 'Opening unconfirmed';
    reason =
      'A deadline is reported, but the source does not confirm that the action window is open.';
  } else if (
    sourceBacked &&
    urgentWindowAction &&
    actionable(finding) &&
    actionState === 'open' &&
    deadlineDistance !== null &&
    deadlineDistance >= 0 &&
    !isScoutDateOnly(finding.actionDeadlineAt) &&
    deadlineDistance <= DAY_MS
  ) {
    level = 'critical';
    label = 'Act now';
    reason = 'A verified, open action deadline is less than 24 hours away.';
  } else if (
    sourceBacked &&
    urgentWindowAction &&
    actionable(finding) &&
    actionState === 'upcoming' &&
    opensDistance !== null &&
    opensDistance <= DAY_MS
  ) {
    level = 'high';
    label = isScoutDateOnly(finding.actionOpensAt)
      ? finding.actionOpensAt === amsterdamDate(now)
        ? 'Check opening today'
        : 'Check opening date'
      : 'Opens soon';
    reason = isScoutDateOnly(finding.actionOpensAt)
      ? finding.actionOpensAt === amsterdamDate(now)
        ? 'A verified action window is reported to open today; the exact time is not published.'
        : 'A verified action window has a reported opening date; the exact time is not published.'
      : 'A verified action window opens within 24 hours.';
  } else if (
    sourceBacked &&
    score >= 50 &&
    ((urgentWindowAction &&
      deadlineDistance !== null &&
      deadlineDistance >= 0) ||
      finding.availability === 'in_stock' ||
      finding.availability === 'preorder')
  ) {
    level = 'high';
    label = 'High priority';
    reason =
      urgentWindowAction &&
      deadlineDistance !== null &&
      deadlineDistance >= 0 &&
      deadlineDistance <= 7 * DAY_MS
        ? isScoutDateOnly(finding.actionDeadlineAt)
          ? 'A verified action is due within seven days; the exact time is not published.'
          : 'A verified action is due within seven days.'
        : 'A verified stock or preorder update is active; inspect it before deciding.';
  } else if (score >= 25 || actionable(finding) || eventUpcoming) {
    level = 'watch';
    label = sourceBacked ? 'Watch' : 'Verify first';
    reason = sourceBacked
      ? 'Keep this sourced event or action on the near-term watchlist.'
      : 'Community or public reporting needs direct verification before action.';
  }

  return {
    ...common,
    level,
    score: Math.max(0, Math.min(100, score)),
    label,
    reason,
  };
}

export function rankScoutFindings(
  findings: ScoutResearchFinding[],
  now = Date.now(),
) {
  return findings
    .map((finding) => ({
      finding,
      assessment: assessScoutFinding(finding, now),
    }))
    .sort((left, right) => {
      const levelDifference =
        LEVEL_ORDER[right.assessment.level] -
        LEVEL_ORDER[left.assessment.level];
      if (levelDifference) return levelDifference;
      const leftNext = time(left.assessment.nextRelevantAt);
      const rightNext = time(right.assessment.nextRelevantAt);
      if (leftNext !== rightNext)
        return (
          (leftNext ?? Number.POSITIVE_INFINITY) -
          (rightNext ?? Number.POSITIVE_INFINITY)
        );
      const materialDifference =
        (time(right.finding.materialChangedAt) ?? 0) -
        (time(left.finding.materialChangedAt) ?? 0);
      if (materialDifference) return materialDifference;
      return left.finding.id.localeCompare(right.finding.id);
    });
}

export function buildScoutActionTimeline(
  findings: ScoutResearchFinding[],
  now = Date.now(),
) {
  return rankScoutFindings(findings, now)
    .filter(
      (item) =>
        item.assessment.level !== 'expired' &&
        item.assessment.nextRelevantAt !== null,
    )
    .sort((left, right) => {
      const dateDifference =
        Number(time(left.assessment.nextRelevantAt)) -
        Number(time(right.assessment.nextRelevantAt));
      return dateDifference || left.finding.id.localeCompare(right.finding.id);
    });
}
