declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    MARKTPLAATS_ACCESS_MODE?: string;
    MARKTPLAATS_SCAN_INTERVAL_MINUTES?: string;
    MARKTPLAATS_SEARCH_QUERIES?: string;
    KEEPA_API_KEY?: string;
    KEEPA_SCAN_INTERVAL_MINUTES?: string;
    KEEPA_DISCOVERY_INTERVAL_MINUTES?: string;
    AMAZON_DEFAULT_MARKETPLACE?: string;
    AMAZON_MARKETS?: string;
  }
}
