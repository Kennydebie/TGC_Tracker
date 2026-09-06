import type { ScoutResearchFinding } from './community.ts';
import {
  assessScoutFinding,
  isScoutDateOnly,
  type ScoutAttentionLevel,
  type ScoutFindingAssessment,
} from './scout-priority.ts';

export type ScoutRoadmapMilestoneKind = 'opens' | 'deadline' | 'event';
export type ScoutRoadmapPrecision = 'date' | 'datetime';
export type ScoutRoadmapTemporalState =
  | 'future'
  | 'today'
  | 'past'
  | 'closed'
  | 'cancelled';
export type ScoutRoadmapProvenance =
  | 'checked_current'
  | 'checked_stale'
  | 'reported';

export type ScoutRoadmapMilestone = {
  id: string;
  at: string;
  dateKey: string;
  monthKey: string;
  precision: ScoutRoadmapPrecision;
  instant: number | null;
  kind: ScoutRoadmapMilestoneKind;
  temporalState: ScoutRoadmapTemporalState;
  provenance: ScoutRoadmapProvenance;
  attention: ScoutAttentionLevel;
  isPrimary: boolean;
  finding: ScoutResearchFinding;
  assessment: ScoutFindingAssessment;
};

export type ScoutRoadmapMonth = {
  key: string;
  year: number;
  monthIndex: number;
  isCurrent: boolean;
  todayPercent: number | null;
  milestones: ScoutRoadmapMilestone[];
};

export type ScoutRoadmap = {
  startMonthKey: string;
  endMonthKey: string;
  months: ScoutRoadmapMonth[];
  totalMilestones: number;
  omittedMilestones: number;
  rangeLimited: boolean;
};

const AMSTERDAM = 'Europe/Amsterdam';
const JULY_INDEX = 6;
const DECEMBER_INDEX = 11;
const MAX_ROADMAP_MONTHS = 84;
const KIND_ORDER: Record<ScoutRoadmapMilestoneKind, number> = {
  opens: 0,
  deadline: 1,
  event: 2,
};

type CalendarParts = {
  year: number;
  month: number;
  day: number;
};

function amsterdamParts(instant: number): CalendarParts | null {
  if (!Number.isFinite(instant)) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: AMSTERDAM,
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  if (!values.year || !values.month || !values.day) return null;
  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
}

function validDateOnly(value: string): CalendarParts | null {
  if (!isScoutDateOnly(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return { year, month, day };
}

function dateKey(parts: CalendarParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(
    parts.day,
  ).padStart(2, '0')}`;
}

function monthKey(parts: Pick<CalendarParts, 'year' | 'month'>): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
}

function monthOrdinal(year: number, monthIndex: number): number {
  return year * 12 + monthIndex;
}

function monthFromOrdinal(ordinal: number) {
  const year = Math.floor(ordinal / 12);
  const monthIndex = ordinal - year * 12;
  return { year, monthIndex };
}

function milestoneCalendar(value: string): {
  parts: CalendarParts;
  precision: ScoutRoadmapPrecision;
  instant: number | null;
} | null {
  const date = validDateOnly(value);
  if (date) return { parts: date, precision: 'date', instant: null };
  const instant = Date.parse(value);
  const parts = amsterdamParts(instant);
  return parts ? { parts, precision: 'datetime', instant } : null;
}

function isMilestonePast(
  precision: ScoutRoadmapPrecision,
  instant: number | null,
  milestoneDateKey: string,
  currentDateKey: string,
  now: number,
) {
  return precision === 'date'
    ? milestoneDateKey < currentDateKey
    : instant !== null && instant < now;
}

function milestoneTemporalState(
  finding: ScoutResearchFinding,
  kind: ScoutRoadmapMilestoneKind,
  precision: ScoutRoadmapPrecision,
  instant: number | null,
  milestoneDateKey: string,
  currentDateKey: string,
  now: number,
): ScoutRoadmapTemporalState {
  if (finding.lifecycleStatus === 'cancelled') return 'cancelled';
  const past = isMilestonePast(
    precision,
    instant,
    milestoneDateKey,
    currentDateKey,
    now,
  );
  if (
    kind !== 'event' &&
    (finding.lifecycleStatus === 'closed' || (kind === 'deadline' && past))
  )
    return 'closed';
  if (past) return 'past';
  if (milestoneDateKey === currentDateKey) return 'today';
  return 'future';
}

function milestoneProvenance(
  finding: ScoutResearchFinding,
  assessment: ScoutFindingAssessment,
): ScoutRoadmapProvenance {
  if (finding.verificationStatus === 'community_report') return 'reported';
  return assessment.verificationCurrent ? 'checked_current' : 'checked_stale';
}

function milestoneAttention(
  temporalState: ScoutRoadmapTemporalState,
  isPrimary: boolean,
  assessment: ScoutFindingAssessment,
): ScoutAttentionLevel {
  if (['past', 'closed', 'cancelled'].includes(temporalState)) return 'expired';
  if (isPrimary && assessment.level !== 'expired') return assessment.level;
  return 'info';
}

function milestoneSort(
  left: ScoutRoadmapMilestone,
  right: ScoutRoadmapMilestone,
) {
  const dateDifference = left.dateKey.localeCompare(right.dateKey);
  if (dateDifference) return dateDifference;
  if (left.precision === 'datetime' && right.precision === 'datetime') {
    const instantDifference = Number(left.instant) - Number(right.instant);
    if (instantDifference) return instantDifference;
  }
  if (left.precision !== right.precision)
    return left.precision === 'datetime' ? -1 : 1;
  const kindDifference = KIND_ORDER[left.kind] - KIND_ORDER[right.kind];
  return kindDifference || left.finding.id.localeCompare(right.finding.id);
}

export function buildScoutRoadmap(
  findings: ScoutResearchFinding[],
  now = Date.now(),
): ScoutRoadmap {
  const current = amsterdamParts(now) ?? { year: 1970, month: 1, day: 1 };
  const currentDateKey = dateKey(current);
  const currentMonthOrdinal = monthOrdinal(current.year, current.month - 1);
  const anchorYear =
    current.month >= JULY_INDEX + 1 ? current.year : current.year - 1;
  const startOrdinal = monthOrdinal(anchorYear, JULY_INDEX);
  const minimumEndOrdinal = Math.max(
    monthOrdinal(anchorYear, DECEMBER_INDEX),
    currentMonthOrdinal,
  );

  const milestones = findings.flatMap((finding) => {
    const assessment = assessScoutFinding(finding, now);
    const values: Array<[ScoutRoadmapMilestoneKind, string | null]> = [
      ['opens', finding.actionOpensAt],
      ['deadline', finding.actionDeadlineAt],
      ['event', finding.eventAt],
    ];
    return values.flatMap(([kind, at]) => {
      if (!at) return [];
      const calendar = milestoneCalendar(at);
      if (!calendar) return [];
      const milestoneDateKey = dateKey(calendar.parts);
      const milestoneMonthKey = monthKey(calendar.parts);
      const ordinal = monthOrdinal(
        calendar.parts.year,
        calendar.parts.month - 1,
      );
      if (ordinal < startOrdinal) return [];
      const temporalState = milestoneTemporalState(
        finding,
        kind,
        calendar.precision,
        calendar.instant,
        milestoneDateKey,
        currentDateKey,
        now,
      );
      const provenance = milestoneProvenance(finding, assessment);
      const isPrimary =
        assessment.nextRelevantKind === kind &&
        assessment.nextRelevantAt === at;
      return [
        {
          id: `${finding.id}:${kind}`,
          at,
          dateKey: milestoneDateKey,
          monthKey: milestoneMonthKey,
          precision: calendar.precision,
          instant: calendar.instant,
          kind,
          temporalState,
          provenance,
          attention: milestoneAttention(temporalState, isPrimary, assessment),
          isPrimary,
          finding,
          assessment,
        } satisfies ScoutRoadmapMilestone,
      ];
    });
  });

  const latestNonCancelledOrdinal = milestones.reduce((latest, milestone) => {
    if (milestone.temporalState === 'cancelled') return latest;
    const [year, month] = milestone.monthKey.split('-').map(Number);
    return Math.max(latest, monthOrdinal(year, month - 1));
  }, minimumEndOrdinal);
  const desiredEndOrdinal = Math.max(
    minimumEndOrdinal,
    latestNonCancelledOrdinal,
  );
  const endOrdinal = Math.min(
    desiredEndOrdinal,
    startOrdinal + MAX_ROADMAP_MONTHS - 1,
  );
  const rangeLimited = endOrdinal < desiredEndOrdinal;
  const visibleMilestones = milestones
    .filter((milestone) => {
      const [year, month] = milestone.monthKey.split('-').map(Number);
      return monthOrdinal(year, month - 1) <= endOrdinal;
    })
    .sort(milestoneSort);
  const milestoneGroups = new Map<string, ScoutRoadmapMilestone[]>();
  for (const milestone of visibleMilestones) {
    const group = milestoneGroups.get(milestone.monthKey) ?? [];
    group.push(milestone);
    milestoneGroups.set(milestone.monthKey, group);
  }

  const months: ScoutRoadmapMonth[] = [];
  for (let ordinal = startOrdinal; ordinal <= endOrdinal; ordinal += 1) {
    const { year, monthIndex } = monthFromOrdinal(ordinal);
    const key = monthKey({ year, month: monthIndex + 1 });
    const isCurrent = ordinal === currentMonthOrdinal;
    const daysInMonth = new Date(
      Date.UTC(year, monthIndex + 1, 0),
    ).getUTCDate();
    months.push({
      key,
      year,
      monthIndex,
      isCurrent,
      todayPercent: isCurrent
        ? Math.min(98, Math.max(2, ((current.day - 0.5) / daysInMonth) * 100))
        : null,
      milestones: milestoneGroups.get(key) ?? [],
    });
  }

  return {
    startMonthKey: months[0]?.key ?? `${anchorYear}-07`,
    endMonthKey: months.at(-1)?.key ?? `${anchorYear}-12`,
    months,
    totalMilestones: visibleMilestones.length,
    omittedMilestones: milestones.length - visibleMilestones.length,
    rangeLimited,
  };
}
