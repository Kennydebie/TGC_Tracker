# Deployment and operations

## Sites / Cloudflare

The repository is scaffolded for OpenAI Sites and Cloudflare Workers. `.openai/hosting.json` declares the logical D1 binding `DB`; the hosting control plane provisions and injects the real database identifier.

Before publishing:

1. configure secrets in the hosting environment, never in Git;
2. run the migration in `drizzle/`;
3. keep Demo Mode and production records in separate databases;
4. run all validation commands from the README;
5. verify `/api/health` and `/api/readiness`;
6. verify missing-credential states before enabling a connector.

## Troubleshooting

- Node engine warning: use Node 22.13+.
- Missing Windows native binding: run `npm ci --include=optional` with the dev server stopped.
- D1 unavailable locally: use Demo Mode; Sites injects `DB` during deployed operation.
- Connector says credentials required: configure only the named server-side variables and run the source test endpoint.
- Parser format change: leave the source paused, inspect Review Queue, update the fixture contract, and only then re-enable.
