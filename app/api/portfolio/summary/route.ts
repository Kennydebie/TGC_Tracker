export function GET() {
  return Response.json({
    mode: 'production',
    status: 'unavailable',
    data: null,
    message: 'No production portfolio summary is available yet.',
    semantics: {
      realisedProfit: 'Completed sales only',
      displayedMarketValue: 'Observed/modelled estimate, not realised',
      patientSaleValue: 'Modelled',
      conservativeLiquidationValue: 'Modelled cash-out after costs',
    },
  });
}
