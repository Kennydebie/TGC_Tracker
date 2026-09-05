import { roundMoney } from './domain.ts';

export type PortfolioHolding = {
  name: string;
  qty: number;
  basis: number;
  liquidation: number;
  patient: number;
  days: number;
  status: 'Healthy' | 'Below basis' | 'Dead stock';
  game: 'Pokémon' | 'Riftbound' | 'Other';
  strategy: 'Quick flip' | 'Long-term sealed' | 'Singles';
};

export const DEMO_PORTFOLIO_HOLDINGS: PortfolioHolding[] = [
  {
    name: 'Prismatic Evolutions ETB',
    qty: 6,
    basis: 361.2,
    liquidation: 414,
    patient: 468,
    days: 41,
    status: 'Healthy',
    game: 'Pokémon',
    strategy: 'Quick flip',
  },
  {
    name: 'Riftbound Origins display',
    qty: 4,
    basis: 596,
    liquidation: 544,
    patient: 628,
    days: 67,
    status: 'Below basis',
    game: 'Riftbound',
    strategy: 'Long-term sealed',
  },
  {
    name: 'Scarlet & Violet—151 bundle',
    qty: 8,
    basis: 408,
    liquidation: 521.6,
    patient: 584,
    days: 83,
    status: 'Healthy',
    game: 'Pokémon',
    strategy: 'Quick flip',
  },
  {
    name: 'Mixed singles inventory',
    qty: 73,
    basis: 384,
    liquidation: 286,
    patient: 417,
    days: 119,
    status: 'Dead stock',
    game: 'Other',
    strategy: 'Singles',
  },
];

export type CompletedSaleFixture = {
  id: string;
  name: string;
  basis: number;
  grossProceeds: number;
  sellingCosts: number;
};

export const DEMO_COMPLETED_SALES: CompletedSaleFixture[] = [
  {
    id: 'sale-fixture-prismatic',
    name: 'Prismatic demo lot close',
    basis: 600,
    grossProceeds: 1_080,
    sellingCosts: 42.4,
  },
  {
    id: 'sale-fixture-riftbound',
    name: 'Riftbound demo lot close',
    basis: 300,
    grossProceeds: 295,
    sellingCosts: 20,
  },
];

export function completedSaleProfit(sale: CompletedSaleFixture) {
  return roundMoney(sale.grossProceeds - sale.sellingCosts - sale.basis);
}

export function summarizeDemoPortfolio(
  holdings: PortfolioHolding[] = DEMO_PORTFOLIO_HOLDINGS,
  completedSales: CompletedSaleFixture[] = DEMO_COMPLETED_SALES,
) {
  const sum = (field: 'basis' | 'liquidation' | 'patient') =>
    roundMoney(holdings.reduce((total, holding) => total + holding[field], 0));
  const cashInvested = sum('basis');
  const conservativeLiquidationValue = sum('liquidation');
  const patientSaleValue = sum('patient');
  return {
    cashInvested,
    conservativeLiquidationValue,
    patientSaleValue,
    unrealisedResult: roundMoney(conservativeLiquidationValue - cashInvested),
    realisedProfit: roundMoney(
      completedSales.reduce(
        (total, sale) => total + completedSaleProfit(sale),
        0,
      ),
    ),
    averageHoldingDays: Math.round(
      holdings.reduce((total, holding) => total + holding.days, 0) /
        Math.max(1, holdings.length),
    ),
    deadInventory: roundMoney(
      holdings
        .filter((holding) => holding.status === 'Dead stock')
        .reduce((total, holding) => total + holding.basis, 0),
    ),
  };
}

export function portfolioExposure(
  holdings: PortfolioHolding[],
  dimension: 'game' | 'strategy',
) {
  const total = holdings.reduce((sum, holding) => sum + holding.basis, 0);
  return Object.entries(
    holdings.reduce<Record<string, number>>((groups, holding) => {
      const key = holding[dimension];
      groups[key] = (groups[key] ?? 0) + holding.basis;
      return groups;
    }, {}),
  ).map(([label, amount]) => ({
    label,
    amount: roundMoney(amount),
    percentage: total > 0 ? Math.round((amount / total) * 100) : 0,
  }));
}
