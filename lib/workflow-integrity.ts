import type { PriceHistoryPoint } from './amazon.ts';
import { roundMoney, type Deal, type ReleaseEvent } from './domain.ts';

export function normalizeIdentity(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function searchDealsByIdentity(
  records: Deal[],
  query: string,
  dealId?: string,
) {
  if (dealId) return records.filter((record) => record.id === dealId);
  const normalizedQuery = normalizeIdentity(query);
  if (!normalizedQuery) return records.slice(0, 4);
  const tokens = normalizedQuery.split(' ').filter(Boolean);
  return records.filter((record) => {
    const identity = normalizeIdentity(
      [
        record.id,
        record.canonicalProduct,
        record.title,
        record.game,
        record.set,
        record.productType,
        record.sourceListingId,
      ].join(' '),
    );
    return tokens.every((token) => identity.includes(token));
  });
}

export type LotOfferInput = {
  grossExit: number;
  laborHours: number;
  laborRate: number;
  liquidityHaircut: number;
  expectedLoss: number;
  sellingCosts: number;
  requiredProfit: number;
};

export type LotOfferResult =
  | {
      valid: true;
      collectionNet: number;
      laborCost: number;
      maximumOffer: number;
      errors: Record<string, never>;
    }
  | {
      valid: false;
      collectionNet: null;
      laborCost: null;
      maximumOffer: null;
      errors: Record<string, string>;
    };

export function calculateLotOffer(input: LotOfferInput): LotOfferResult {
  const errors: Record<string, string> = {};
  for (const [field, value] of Object.entries(input)) {
    if (!Number.isFinite(value)) errors[field] = 'Enter a finite number.';
    else if (value < 0) errors[field] = 'Value cannot be negative.';
  }
  if (Object.keys(errors).length)
    return {
      valid: false,
      collectionNet: null,
      laborCost: null,
      maximumOffer: null,
      errors,
    };

  const laborCost = input.laborHours * input.laborRate;
  const collectionNet =
    input.grossExit -
    laborCost -
    input.liquidityHaircut -
    input.expectedLoss -
    input.sellingCosts;
  return {
    valid: true,
    laborCost: roundMoney(laborCost),
    collectionNet: roundMoney(collectionNet),
    maximumOffer: roundMoney(Math.max(0, collectionNet - input.requiredProfit)),
    errors: {},
  };
}

export type AlertRuleDraft = {
  matchConfidence: number;
  minimumProfit: number;
  minimumRoi: number;
  minimumProfitPerHour: number;
  maximumHoldingDays: number;
  maximumRiskScore: number;
};

export function validateAlertRule(input: AlertRuleDraft) {
  const errors: Partial<Record<keyof AlertRuleDraft, string>> = {};
  const bounded = (
    key: keyof AlertRuleDraft,
    minimum: number,
    maximum: number,
    integer = false,
  ) => {
    const value = input[key];
    if (!Number.isFinite(value)) errors[key] = 'Enter a finite number.';
    else if (value < minimum || value > maximum)
      errors[key] = `Enter a value from ${minimum} to ${maximum}.`;
    else if (integer && !Number.isInteger(value))
      errors[key] = 'Enter a whole number.';
  };
  bounded('matchConfidence', 0, 100);
  bounded('minimumProfit', 0, 100_000);
  bounded('minimumRoi', 0, 5);
  bounded('minimumProfitPerHour', 0, 100_000);
  bounded('maximumHoldingDays', 1, 3_650, true);
  bounded('maximumRiskScore', 0, 100);
  return errors;
}

export type UserSettingsDraft = {
  localRadiusKm: number;
  laborRate: number;
  requiredRoi: number;
  requiredProfit: number;
};

export function validateUserSettings(input: UserSettingsDraft) {
  const errors: Partial<Record<keyof UserSettingsDraft, string>> = {};
  const check = (
    key: keyof UserSettingsDraft,
    minimum: number,
    maximum: number,
  ) => {
    const value = input[key];
    if (!Number.isFinite(value)) errors[key] = 'Enter a finite number.';
    else if (value < minimum || value > maximum)
      errors[key] = `Enter a value from ${minimum} to ${maximum}.`;
  };
  check('localRadiusKm', 1, 500);
  check('laborRate', 0, 500);
  check('requiredRoi', 0, 5);
  check('requiredProfit', 0, 100_000);
  return errors;
}

const HISTORY_RANGE_MS: Record<string, number> = {
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
  '90d': 90 * 86_400_000,
  '1y': 365 * 86_400_000,
};

export function filterHistoryPoints(
  points: PriceHistoryPoint[],
  range: string,
  now = Date.now(),
) {
  const windowMs = HISTORY_RANGE_MS[range] ?? HISTORY_RANGE_MS['90d'];
  return points.filter((point) => {
    const timestamp = Date.parse(point.at);
    return Number.isFinite(timestamp) && now - timestamp <= windowMs;
  });
}

export function sortReleasesChronologically(records: ReleaseEvent[]) {
  return [...records].sort(
    (left, right) =>
      Date.parse(left.releaseDate) - Date.parse(right.releaseDate),
  );
}

export function daysUntilRelease(releaseDate: string, now = Date.now()) {
  const release = Date.parse(`${releaseDate}T00:00:00Z`);
  if (!Number.isFinite(release)) return null;
  return Math.ceil((release - now) / 86_400_000);
}

export type PortfolioExportRow = {
  product: string;
  quantity: number;
  costBasis: number;
  cashOutNet: number | null;
  patientNet: number | null;
  status: string;
  dataMode: 'demo' | 'production';
};

export function csvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildPortfolioCsv(rows: PortfolioExportRow[]) {
  const header = [
    'Product',
    'Quantity',
    'Cost basis EUR',
    'Cash-out net EUR',
    'Patient net EUR',
    'Status',
    'Data mode',
  ];
  const body = rows.map((row) =>
    [
      row.product,
      row.quantity,
      row.costBasis.toFixed(2),
      row.cashOutNet === null ? '' : row.cashOutNet.toFixed(2),
      row.patientNet === null ? '' : row.patientNet.toFixed(2),
      row.status,
      row.dataMode,
    ]
      .map(csvCell)
      .join(','),
  );
  return [header.map(csvCell).join(','), ...body].join('\r\n');
}
