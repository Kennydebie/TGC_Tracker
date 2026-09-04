# Source compliance

TCG Scout only supports official APIs, public downloadable files, licensed feeds, explicitly allowlisted retailer integrations and user-provided fixture/manual data.

It must never bypass authentication, CAPTCHA, rate limits, robots restrictions or marketplace terms. There is no disguised browser scraping fallback.

- eBay: Browse API only for active listing detection in this MVP. Active asks are never sold evidence. Order/checkout is not assumed.
- Marktplaats: authorized API configuration only. Without credentials, show setup state, saved-search links and manual import.
- Cardmarket: public catalogue/price-guide downloads. Preserve source timestamp and freshness; this is daily reference data.
- TCGplayer: optional for existing credential holders only.
- Retailers: product feeds/APIs first, then explicitly allowed page adapters with strict host allowlists, timeouts, redirect limits, response-size limits and format-change isolation.

Page-monitor targets must resolve to public addresses. Private, loopback, link-local and metadata IP ranges are prohibited. Secrets, tokens, payment data and full addresses must never enter logs.
