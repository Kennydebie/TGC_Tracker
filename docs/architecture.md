# Architecture

TCG Scout uses a Vinext/Next-compatible App Router on Cloudflare Workers. React Server Components own identity-aware route entry; a client workspace provides high-density interactions. The Sites dispatcher provides sign-in headers, and D1 is the structured system of record.

## Request path

1. A page route resolves the requested workspace section.
2. `app/scout-page.tsx` reads the optional authenticated ChatGPT user server-side.
3. `components/scout-app.tsx` renders the responsive working surface.
4. Typed API routes call domain services and source adapters.
5. D1 stores product identity, evidence, model snapshots, user records and audit history.

## Ingestion path

`connector → raw record → normalised offer → product match → evidence snapshot → valuation → exit selection → score/risk → alert/review → shadow follow-up`

Connector failures are isolated. Raw active asks remain distinct from verified transactions. Low-confidence matches enter Review Queue and cannot emit Critical alerts.

## Storage ownership

- D1: relational state, source runs, listing snapshots, evidence, valuations, alerts, watchlists, shadow trades and accounting.
- R2: reserved for future lot/card image uploads and receipt binaries; not enabled in this MVP.
- Browser state: temporary filters and open-dialog input only; not authoritative user data.

## Worker model

The deployable web application is itself a Cloudflare Worker through `@openai/sites-vite-plugin`. `scripts/run-worker.mjs` runs configured production connectors and emits structured job logs; it does not substitute fixture results when credentials or sources are unavailable. Production scheduling should invoke the scan service from a Cloudflare Cron or queue consumer and persist each run in `scan_runs`.

## Security boundaries

Authentication is server-owned. Source secrets are environment values and never props or browser data. Connector endpoints are fixed or allowlisted. Cart intents are short-lived and domain-bound. No feature can submit final checkout or payment.
