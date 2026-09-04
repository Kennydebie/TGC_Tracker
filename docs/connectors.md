# Connector development

Implement `SourceConnector` from `lib/connectors/types.ts`.

Every connector declares capabilities and policy, validates configuration, provides a bounded health check, fetches raw records and normalises them into the shared offer shape. A connector must preserve external IDs and captured timestamps so scans are idempotent.

Required contract fixtures:

- success, empty result and pagination;
- expired credentials and rate limiting;
- malformed/changing responses;
- timeout and unavailable listing;
- duplicates, price changes and shipping changes.

Use fixed official endpoints or strict HTTPS host allowlists. Apply timeouts, bounded response sizes and schema validation. Never return credentials in errors. A source failure must create a health/review record without failing other connectors.
