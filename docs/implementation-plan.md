# Implementation status

## Complete in this MVP

- responsive Arcane Market Hunter design system and original crest;
- all primary product workspaces and routes;
- conservative acquisition/exit economics and confidence gates;
- multilingual quantity and misleading-title checks;
- fixture connector, official eBay connector, Cardmarket streaming parser and disabled source states;
- source, deal, release, scan, shadow, portfolio, review, health and cart-handoff APIs;
- normalized D1 schema, indexes, migration and isolated demo seed;
- structured fixture worker;
- safe Manifest V3 handoff extension;
- WebMCP read/track tools where the browser supports the proposal;
- automated unit and integration tests.

## Next production increments

1. D1 repositories and server actions for every write control.
2. Credentialed staging validation for eBay Browse.
3. Scheduled Cardmarket official-file ingestion with checksum/idempotency.
4. Authorized Marktplaats implementation after credentials are available.
5. R2 upload pipeline and production card/lot extraction with human review.
6. Shadow Mode follow-up jobs and calibration dashboard from real observations.
7. End-to-end browser/security suites in deployment CI.
