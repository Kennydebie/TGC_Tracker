# Scoring and valuation

TCG Scout separates four outputs:

- conservative acquisition economics;
- Instant Deal Score (0–100);
- Long-Term Hold Score (0–100);
- Risk Score (0–100, higher is worse).

It also reports evidence Confidence A–D. A D-grade match is capped below 50 and can never produce a Critical alert.

## Economics

`all-in cost = item + inbound shipping + buyer/payment fees + import costs + travel + acquisition labour`

`conservative net exit = supported sale price − selling/payment fees − outbound shipping − packaging − expected returns − selling labour − liquidity haircut`

`profit = conservative net exit − all-in cost`

`ROI = profit / all-in cost`

`maximum item price = conservative net exit − required profit − non-item acquisition costs`

The UI always shows each component. Unknown costs lower confidence rather than silently becoming zero.

## Evidence

Verified/authorized sold evidence receives more weight than active asking prices. The initial target outputs are a weighted lower percentile for liquidation, robust weighted median for fair value and upper percentile for optimistic value. Values are withheld when minimum evidence is not met.

## Initial quick-flip gate

- match confidence at least 90%;
- conservative net profit at least €25;
- conservative ROI at least 20%;
- expected profit per hour at least €20;
- sale expected within 90 days;
- Confidence A or B;
- no severe identity, counterfeit, condition or quantity flag;
- a named exit market and sufficient comparable evidence.

These are shadow-test hypotheses, not guarantees.
