declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    MARKTPLAATS_ACCESS_MODE?: string;
    MARKTPLAATS_SCAN_INTERVAL_MINUTES?: string;
    MARKTPLAATS_SEARCH_QUERIES?: string;
  }
}
