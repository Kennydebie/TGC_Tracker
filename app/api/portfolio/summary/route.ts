import { portfolio } from '@/lib/fixtures';

export function GET() {
  return Response.json({
    mode: 'demo',
    data: portfolio,
    semantics: {
      realisedProfit: 'Completed sales only',
      displayedMarketValue: 'Observed/modelled estimate, not realised',
      patientSaleValue: 'Modelled',
      conservativeLiquidationValue: 'Modelled cash-out after costs',
    },
  });
}
