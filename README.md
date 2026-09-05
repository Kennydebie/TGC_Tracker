# TCG Scout

TCG Scout is a dark-fantasy market-intelligence workspace for trading-card collectors and resellers. Its core is a conservative acquisition underwriter: it identifies a listing, calculates its complete cost, selects a credible exit, discounts the evidence for risk and liquidity, and only promotes opportunities that survive those checks.

The application now runs in production-only mode. User-facing pages and APIs read production D1 records or authorized live sources and show an explicit empty or unavailable state when evidence is missing. No runtime fixture connector, fictional listing fallback or demo seed is used. Deterministic fixtures remain under `tests/fixtures/` solely for automated tests and are never loaded by the deployed application.

## Prerequisites

- Node.js 22.13 or newer (Node 24 is used in the bundled Codex runtime)
- npm 10+
- A modern Chromium, Firefox or Safari browser
- Optional: Docker Desktop
- Optional for deployment: Cloudflare/Sites access with a D1 binding named `DB`

## Local setup

```powershell
git clone https://github.com/Kennydebie/TGC_Tracker.git
Set-Location TGC_Tracker
Copy-Item .env.example .env.local
npm ci --include=optional
npm run db:generate
npm run dev
```

Open `http://localhost:3000`. Local Sites sign-in is supplied by the scaffold. A clean checkout starts with honest empty states until its D1 binding and relevant marketplace credentials are configured.

If PowerShell resolves an older Node installation, put a Node 22+ binary first on `PATH` before running npm scripts.

## Exact commands

Web application:

```powershell
npm run dev
```

One credentialed eBay worker scan with structured logs:

```powershell
npm run worker
```

Build the Manifest V3 safe-handoff extension:

```powershell
npm run extension:build
```

Validation:

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
```

Production Worker preview after a build:

```powershell
npm run start
```

## Production-only data policy

- Runtime pages and APIs return only records marked as production.
- Active listing asks, completed-sale evidence and modelled values remain separate. Missing completed-sale or exit evidence is shown as unavailable rather than converted into fictional profit or ROI.
- A clean database does not receive seeded listings, alerts, releases, holdings, watch events, scanner results or community signals.
- Deterministic test records live only in `tests/fixtures/` and are injected explicitly by tests.
- `drizzle/0007_remove_non_production_records.sql` removes legacy demo and fixture records from an existing D1 database while preserving production records.
- Marketplace credentials and signing secrets belong in server-side deployment secrets; none are committed or exposed to browser code.

## Database

The D1/SQLite schema lives in `db/schema.ts`. The generated migration is under `drizzle/`. It covers users and settings, canonical products, sources and scan runs, listings, observed price evidence, valuations, deal scores, watchlists, deduplicated alerts, shadow trades, inventory lots, partial sales, review items and audit logs.

Generate a migration after a schema change:

```powershell
npm run db:generate
```

Sites owns the real D1 resource and injects the `DB` binding declared in `.openai/hosting.json`. Runtime code must not create or alter schema.

## Source status

| Source                  | Current implementation                               | Credentials                            | Important limitation                                                |
| ----------------------- | ---------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| eBay Browse             | Official API connector and response normalizer       | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | Active asks only; no completed-sales feed or automated checkout     |
| Amazon                  | Official Keepa API integration                       | `KEEPA_API_KEY`                        | Requires paid Keepa access and server-side scheduled ingestion      |
| Marktplaats             | Conservative public search-page monitor              | Public-monitor settings                | Stops on CAPTCHA, HTTP 403/429 or unexpected page changes           |
| Cardmarket public files | Streaming catalogue/price-guide parser and allowlist | Official download URLs                 | Daily reference data, not a live restock feed                       |
| Reddit                  | Official OAuth API integration                       | Reddit OAuth credentials               | Only explicitly configured communities are ingested                 |
| Discord                 | Official bot and allowlisted channel listener        | Bot and ingestion secrets              | Requires the separate Docker or Cloudflare listener to stay running |
| Retailer adapters       | Disabled until an authorized adapter is configured   | Allowlisted configuration              | No CAPTCHA bypass, disguised scraping or unauthorized API fallback  |

No connector credentials are committed. Missing configuration is reported in the UI instead of being replaced with generated records.

## API surface

- `GET /api/deals` and `GET /api/deals/:id`
- `POST /api/deals/:id/recheck`
- `POST /api/deals/:id/shadow-buy`
- `POST /api/deals/:id/prepare-cart`
- `POST /api/deals/:id/ignore`
- `GET /api/watchlist` and `PUT`/`DELETE /api/watchlist/:id`
- `GET` and `PUT /api/alert-rules`
- `POST /api/purchases` and `POST /api/sales`
- `GET /api/releases`
- `GET /api/sources` and `POST /api/sources/:id/test`
- `POST /api/scans/run`
- `GET /api/amazon` plus Amazon watch and Shadow Mode actions
- `GET /api/community` plus authorized Reddit and Discord ingestion routes
- Owner-only integration credential management under `/api/integrations/scout-mcp/credentials`
- Narrow bridge endpoints at `/api/integrations/scout-mcp/state` and `/api/integrations/scout-mcp/findings`
- `GET` and `POST /api/ebay/marketplace-account-deletion`
- `GET /api/shadow`
- `GET /api/portfolio/summary`
- `GET /api/review` and `POST /api/review/:id/resolve`
- `GET /api/health` and `GET /api/readiness`

## eBay Production keyset compliance

Production deployments expose an eBay Marketplace Account Deletion callback at
`/api/ebay/marketplace-account-deletion`. Configure these server-side values in
the deployment environment; never place them in browser code or commit them:

- `EBAY_MARKETPLACE_DELETION_ENDPOINT`: the exact public HTTPS callback URL
  entered in eBay's developer portal;
- `EBAY_MARKETPLACE_DELETION_VERIFICATION_TOKEN`: a private 32–80 character
  token using letters, numbers, underscores or hyphens;
- `EBAY_MARKETPLACE_DELETION_HMAC_SECRET`: a separate private secret used to
  create irreversible suppression fingerprints.

The endpoint answers eBay's challenge, verifies notification signatures over
the exact received bytes, deletes seller-linked source records and derived
listing data, and retains keyed suppression fingerprints so later scans cannot
reintroduce a deleted identity. It never stores the notification's raw personal
identifiers in its compliance receipt.

## Browser extension

`npm run extension:build` writes unpacked files to `dist-extension/`. In Chrome/Edge, open the extensions page, enable Developer mode, and load that directory.

The extension accepts only the production `v1` signed-token envelope, then validates token shape, expiration, allowlisted domain, identity, quantity and expected price before opening a supported domain. Legacy unsigned demo tokens and fictional domains are rejected. The extension deliberately stops before cart manipulation. It never places bids, accepts offers, submits an order or handles payment data.

## Architecture and operating guides

- [Architecture](docs/architecture.md)
- [Scoring and valuation](docs/scoring.md)
- [Source compliance](docs/source-compliance.md)
- [Connector development](docs/connectors.md)
- [Deployment and operations](docs/deployment.md)
- [Implementation status](docs/implementation-plan.md)

## Known limitations

- A new or unconfigured deployment is intentionally sparse: no example opportunities, holdings, signals or outcomes are generated.
- eBay Browse provides active asks, not completed-sale evidence. Profit and ROI remain unavailable until supported exit evidence exists.
- The Marktplaats public monitor pauses on access challenges or unexpected markup and never attempts to bypass them.
- Cardmarket catalogue ingestion needs the real official file URLs and a scheduled deployment job.
- Production OCR/image classification and R2 upload storage are not included.
- Forecast values are not produced without a supported model and traceable inputs.
- The safe-handoff extension is built and production-token-only, but the web app keeps cart preparation unavailable until a production marketplace flow is implemented.
- Live marketplace behavior and end-to-end browser tests require credentials and a deployed environment; CI never calls marketplaces.

The next highest-value step is to accumulate traceable production observations and completed-sale evidence, then calibrate Shadow Mode against real outcomes before expanding automated recommendations.

Discord setup, server permissions, and the Cloudflare/Docker listener options:
[Connection guide](docs/discord-connection.md).

The authenticated bridge used by ChatGPT research tasks is documented in
[Cloudflare MCP bridge operations](docs/scout-mcp-bridge.md).
