# Discord Gateway Worker

This directory is an isolated Cloudflare Worker package. Its exact Wrangler
and Workers Types versions intentionally differ from the website's Vite/Sites
toolchain, so Cloudflare Builds must install and deploy from this directory.

Use these Cloudflare Builds settings:

- Root directory: `workers/discord-gateway`
- Build command: `npm ci`
- Deploy command: `npm run deploy`
- Non-production deploy command: `npm run check`

Running bare `npx wrangler deploy` from the repository root is unsupported: it
does not select this configuration and can trigger Vite framework detection.
The root convenience commands delegate to this package after
`npm run community:discord:cloudflare:install`.

Store `DISCORD_BOT_TOKEN`, `COMMUNITY_INGEST_SECRET`, and
`DISCORD_INGEST_URL` as Cloudflare Worker secrets. Never add their values to
this package or its Wrangler configuration.
