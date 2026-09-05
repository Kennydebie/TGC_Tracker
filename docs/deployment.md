# Deployment and operations

## Sites / Cloudflare

The repository is scaffolded for OpenAI Sites and Cloudflare Workers. `.openai/hosting.json` declares the logical D1 binding `DB`; the hosting control plane provisions and injects the real database identifier.

Before publishing:

1. configure secrets in the hosting environment, never in Git;
2. run the migration in `drizzle/`;
3. confirm `0007_remove_non_production_records.sql` has removed legacy demo and fixture rows from an existing database;
4. run all validation commands from the README;
5. verify `/api/health` and `/api/readiness`;
6. verify missing-credential states before enabling a connector.

## Discord Gateway Worker

The always-on Discord listener is a separate Cloudflare Worker package under
`workers/discord-gateway`. In Cloudflare Builds, use that directory as the
project root, run `npm ci` as the build command, and use `npm run deploy` as
the deploy command. This ensures the committed listener `wrangler.jsonc` and
its pinned lockfile are used instead of the repository-root Vite application.

From the repository root, the equivalent commands are:

```sh
npm run community:discord:cloudflare:install
npm run community:discord:cloudflare:check
npm run community:discord:cloudflare:deploy
```

## Troubleshooting

- Node engine warning: use Node 22.13+.
- Missing Windows native binding: run `npm ci --include=optional` with the dev server stopped.
- D1 unavailable locally: expect explicit empty/unavailable states; Sites injects `DB` during deployed operation.
- Connector says credentials required: configure only the named server-side variables and run the source test endpoint.
- Parser format change: leave the source paused, inspect Review Queue, update the isolated test contract, and only then re-enable.
