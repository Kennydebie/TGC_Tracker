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

## Marktplaats public monitor

`MARKTPLAATS_ACCESS_MODE=public_monitor` uses only ordinary public search-result
URLs on `https://www.marktplaats.nl`. It performs sequential HTTP GET requests,
prefers the page's public semantic markup, keeps conditional-request metadata in
the worker cache, and normalises records into the same `NormalisedOffer` shape
used by API connectors.

The monitor has a hard 15-minute minimum interval, a 20-query ceiling, a
50-result ceiling and one active request. HTTP 403, HTTP 429, CAPTCHA, challenge,
unexpected login and suspicious parser-empty responses stop the run and pause
the source. It has no browser stealth, proxy rotation, credential storage,
account access, messaging, bidding, checkout or payment behavior.

`official_api` remains a future connector mode. Replacing the public connector
does not change downstream listings, history, matching, economics or alerts.
