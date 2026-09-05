# Implementation status

## Complete in this MVP

- responsive Arcane Market Hunter design system and original crest;
- all primary product workspaces and routes;
- conservative acquisition/exit economics and confidence gates;
- multilingual quantity and misleading-title checks;
- official eBay and Keepa connectors, conservative Marktplaats monitor, Cardmarket streaming parser and disabled source states;
- source, deal, release, scan, shadow, portfolio, review, health and cart-handoff APIs;
- normalized D1 schema, indexes, migrations and production-only cleanup;
- structured credentialed scan worker with no runtime fixture fallback;
- safe Manifest V3 handoff extension;
- WebMCP read/track tools where the browser supports the proposal;
- automated unit and integration tests with fixtures isolated under `tests/fixtures/`.

## Next production increments

1. Credentialed staging validation for eBay Browse and Keepa.
2. Scheduled Cardmarket official-file ingestion with checksum/idempotency.
3. Production monitoring and parser-change alerts for the bounded Marktplaats public monitor.
4. R2 upload pipeline and production card/lot extraction with human review.
5. Shadow Mode follow-up jobs and calibration dashboard from real observations.
6. End-to-end browser/security suites in deployment CI.
