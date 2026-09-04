# Source compliance

TCG Scout supports official APIs, public downloadable files, licensed feeds,
ordinary public search pages with explicit stop-on-block controls, explicitly
allowlisted retailer integrations and user-provided fixture/manual data.

It must never bypass authentication, CAPTCHA, rate limits, robots restrictions or marketplace terms. There is no disguised browser scraping fallback.

- eBay: Browse API only for active listing detection in this MVP. Active asks are never sold evidence. Order/checkout is not assumed.
- Marktplaats: the current `public_monitor` checks normal public result pages at
  most every 15 minutes, sequentially and without credentials. It stops on
  CAPTCHA, challenge, HTTP 403, HTTP 429 or parser anomalies and never accesses
  accounts, messages, payment pages, private APIs or individual listing pages.
  A future `official_api` connector can replace it behind the same normalized
  offer contract.
- Cardmarket: public catalogue/price-guide downloads. Preserve source timestamp and freshness; this is daily reference data.
- TCGplayer: optional for existing credential holders only.
- Retailers: product feeds/APIs first, then explicitly allowed page adapters with strict host allowlists, timeouts, redirect limits, response-size limits and format-change isolation.

Page-monitor targets must resolve to public addresses. Private, loopback, link-local and metadata IP ranges are prohibited. Secrets, tokens, payment data and full addresses must never enter logs.
