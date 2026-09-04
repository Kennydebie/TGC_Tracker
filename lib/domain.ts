export type ConfidenceGrade = 'A' | 'B' | 'C' | 'D';
export type Liquidity =
  | 'Very liquid'
  | 'Liquid'
  | 'Moderate'
  | 'Illiquid'
  | 'Unknown';
export type DealStrategy = 'Quick flip' | 'Collection' | 'Long-term sealed';

export type DealInput = {
  itemPrice: number;
  inboundShipping: number;
  buyerFees: number;
  paymentFees: number;
  importCosts: number;
  travelCost: number;
  acquisitionLabor: number;
  expectedSalePrice: number;
  sellerFees: number;
  exitPaymentFees: number;
  outboundShipping: number;
  packaging: number;
  expectedReturnLoss: number;
  sellingLabor: number;
  liquidityHaircut: number;
  estimatedHours: number;
  expectedHoldingDays: number;
  requiredProfit: number;
};

export type DealEconomics = DealInput & {
  allInCost: number;
  conservativeNetExit: number;
  conservativeProfit: number;
  roi: number;
  profitPerHour: number;
  capitalVelocity: number;
  maximumItemPrice: number;
};

export type Deal = {
  id: string;
  title: string;
  canonicalProduct: string;
  game: 'Pokémon' | 'Riftbound';
  set: string;
  productType: string;
  source: string;
  location: string;
  language: string;
  condition: string;
  quantity: number;
  seller: string;
  sellerScore: number;
  listingAge: string;
  detectedMinutesAgo: number;
  matchConfidence: number;
  confidenceGrade: ConfidenceGrade;
  liquidity: Liquidity;
  soldCount30d: number | null;
  activeListings: number | null;
  medianDaysToSell: number | null;
  instantScore: number;
  holdScore: number;
  riskScore: number;
  status:
    | 'Hot Hunt'
    | 'Strong Value'
    | 'Speculative'
    | 'Likely Trap'
    | 'Rejected after costs';
  exitChannel: string;
  priceEvidence: string;
  risks: string[];
  catalysts: string[];
  tags: string[];
  tint: 'emerald' | 'violet' | 'amber' | 'crimson' | 'blue';
  tracked: boolean;
  economics: DealEconomics;
};

export type ReleaseEvent = {
  id: string;
  game: 'Pokémon' | 'Riftbound';
  name: string;
  product: string;
  releaseDate: string;
  daysAway: number;
  status: string;
  official: boolean;
  msrp: number;
  preorderRange: string;
  retailerCount: number;
  demand: 'High' | 'Medium' | 'Early';
  watched: boolean;
  source: string;
};

export type SourceStatus = {
  id: string;
  name: string;
  mode: 'Live' | 'Fixture' | 'Disabled';
  health: 'Healthy' | 'Delayed' | 'Credentials required' | 'Format change';
  lastScan: string;
  nextScan: string;
  records: number;
  access: string;
  note: string;
};

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateEconomics(input: DealInput): DealEconomics {
  const acquisitionCosts =
    input.inboundShipping +
    input.buyerFees +
    input.paymentFees +
    input.importCosts +
    input.travelCost +
    input.acquisitionLabor;
  const allInCost = input.itemPrice + acquisitionCosts;
  const conservativeNetExit =
    input.expectedSalePrice -
    input.sellerFees -
    input.exitPaymentFees -
    input.outboundShipping -
    input.packaging -
    input.expectedReturnLoss -
    input.sellingLabor -
    input.liquidityHaircut;
  const conservativeProfit = conservativeNetExit - allInCost;
  const roi = allInCost > 0 ? conservativeProfit / allInCost : 0;
  const profitPerHour =
    input.estimatedHours > 0 ? conservativeProfit / input.estimatedHours : 0;
  const capitalVelocity =
    input.expectedHoldingDays > 0 ? roi / input.expectedHoldingDays : 0;
  const maximumItemPrice =
    conservativeNetExit - input.requiredProfit - acquisitionCosts;

  return {
    ...input,
    allInCost: roundMoney(allInCost),
    conservativeNetExit: roundMoney(conservativeNetExit),
    conservativeProfit: roundMoney(conservativeProfit),
    roi,
    profitPerHour: roundMoney(profitPerHour),
    capitalVelocity,
    maximumItemPrice: roundMoney(maximumItemPrice),
  };
}

export function confidenceGrade(
  confidence: number,
  sources: number,
): ConfidenceGrade {
  if (confidence >= 92 && sources >= 3) return 'A';
  if (confidence >= 80 && sources >= 2) return 'B';
  if (confidence >= 60) return 'C';
  return 'D';
}

export function qualifiesForQuickFlip(deal: Deal): boolean {
  return (
    deal.matchConfidence >= 90 &&
    deal.economics.conservativeProfit >= 25 &&
    deal.economics.roi >= 0.2 &&
    deal.economics.profitPerHour >= 20 &&
    deal.economics.expectedHoldingDays <= 90 &&
    deal.riskScore < 60 &&
    deal.confidenceGrade !== 'D' &&
    deal.exitChannel.length > 0
  );
}

export function money(value: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function percent(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value);
}
