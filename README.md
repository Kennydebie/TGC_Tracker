# TCG Scout

TCG Scout is a dark-fantasy market-intelligence workspace for trading-card collectors and resellers. Its core is a conservative acquisition underwriter: it identifies a listing, calculates its complete cost, selects a credible exit, discounts the evidence for risk and liquidity, and only promotes opportunities that survive those checks.

The current repository is a functional Demo Mode MVP. It includes the complete responsive application shell and product routes, deterministic financial logic, fixture scanning, source-adapter contracts, D1 schema and migration, API routes, Shadow Mode, collection underwriting, portfolio semantics, a safe handoff extension, and automated unit/integration tests. Demo data is fictional and visibly isolated.

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

Open `http://localhost:3000`. Local Sites sign-in is supplied by the scaffold; Demo Mode does not require marketplace credentials.

If PowerShell resolves an older Node installation, put a Node 22+ binary first on `PATH` before running npm scripts.

## Exact commands

Web application:

```powershell
npm run dev
```

One fixture-backed worker scan with structured logs:

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

## Demo Mode

Demo Mode is on by default and requires no secrets. It includes:

- one strict quick-flip candidate;
- one cross-border opportunity;
- one apparent discount rejected after fees;
- one empty-box trap;
- one low-confidence mixed binder lot;
- official and unconfirmed release records with visibly different labels;
- source credential and parser-failure states;
- profitable, loss-making and dead-inventory portfolio examples;
- losing Shadow Mode outcomes that cannot be hidden.

The browser UI reads deterministic fixtures from `lib/fixtures.ts`. The same domain rules back typed APIs under `app/api`. The disposable SQL seed is `db/seed-demo.sql`; never apply it to a production database.

## Database

The D1/SQLite schema lives in `db/schema.ts`. The generated migration is under `drizzle/`. It covers users and settings, canonical products, sources and scan runs, listings, observed price evidence, valuations, deal scores, watchlists, deduplicated alerts, shadow trades, inventory lots, partial sales, review items and audit logs.

Generate a migration after a schema change:

```powershell
npm run db:generate
```

Sites owns the real D1 resource and injects the `DB` binding declared in `.openai/hosting.json`. Runtime code must not create or alter schema.

## Source status

| Source                  | Current implementation                         | Credentials                            | Important limitation                                          |
| ----------------------- | ---------------------------------------------- | -------------------------------------- | ------------------------------------------------------------- |
| Demo marketplace        | Working fixture connector                      | None                                   | Fictional and isolated                                        |
| eBay Browse             | Official API connector and response normalizer | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | Active listings only; no universal checkout; not called in CI |
| Cardmarket public files | Streaming price-guide parser and URL allowlist | Official download URLs                 | Daily reference data, not a live restock feed                 |
| Marktplaats             | Disabled setup state                           | Authorized OAuth credentials           | No unauthorized scraping fallback                             |
| TCGplayer               | Disabled registry entry                        | Existing developer key only            | The app does not depend on it                                 |
| Retailer adapters       | Fixture health states                          | Per-retailer allowlisted configuration | No CAPTCHA bypass or disguised scraping                       |

No external connector is genuinely live in a clean checkout because no credentials are committed. This is intentional and is reflected in the UI.

## API surface

- `GET /api/deals` and `GET /api/deals/:id`
- `POST /api/deals/:id/recheck`
- `POST /api/deals/:id/shadow-buy`
- `POST /api/deals/:id/prepare-cart`
- `POST /api/deals/:id/ignore`
- `GET /api/releases`
- `GET /api/sources` and `POST /api/sources/:id/test`
- `POST /api/scans/run`
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

The extension validates token shape, expiration, allowlisted domain, identity, quantity and expected price before opening a supported domain. The MVP deliberately stops before cart manipulation. It never places bids, accepts offers, submits an order or handles payment data.

## Architecture and operating guides

- [Architecture](docs/architecture.md)
- [Scoring and valuation](docs/scoring.md)
- [Source compliance](docs/source-compliance.md)
- [Connector development](docs/connectors.md)
- [Deployment and operations](docs/deployment.md)
- [Implementation status](docs/implementation-plan.md)

## Known limitations

- The product UI is fully interactive in Demo Mode, but durable write actions are not yet wired from every client control to D1.
- Marktplaats is intentionally disabled without authorized credentials.
- Cardmarket catalogue ingestion needs the real official file URLs and a scheduled deployment job.
- The collection scanner demonstrates the review and underwriting workflow; production OCR/image classification and R2 upload storage are not included.
- Forecast scenarios are interpretable fixture scenarios, not a trained forecasting service.
- The safe-handoff extension validates and opens an allowlisted domain but does not add products to a real cart.
- Live marketplace behavior and end-to-end browser tests require credentials and a deployed environment; CI never calls marketplaces.

The next highest-value step is to wire the existing D1 repository into watchlist, Shadow Mode and portfolio write APIs, then validate the eBay connector in a credentialed staging environment while collecting 30–60 days of Shadow Mode calibration data.
