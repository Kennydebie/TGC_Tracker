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

## ChatGPT scout MCP bridge

The separate Worker under `workers/scout-mcp-bridge` is an OAuth and delivery
boundary only. It has no schedule, model key, database, or generic proxy. Keep
the existing Sites application public and deploy this Worker under its own
Cloudflare service name.

For the first deploy, create a **new** Cloudflare Worker/Build project named
`tcg-scout-mcp-bridge`. Never attach this package to the existing `tgc-tracker`
connected Build (the Discord listener): Cloudflare Builds may override the name in
`wrangler.jsonc` with the connected service name and overwrite that Worker. Either
deploy directly with Wrangler from this package or create/select the dedicated
`tcg-scout-mcp-bridge` Build project first.

In that dedicated Cloudflare Builds project, use `workers/scout-mcp-bridge` as the
project root, `npm ci` as the build command, and `npm run deploy` as the deploy
command. Before the first deploy, create the bridge's dedicated OAuth KV namespace
and replace the placeholder namespace ID in `wrangler.jsonc`.

Confirm that the existing Site runtime has `COMMUNITY_ADMIN_EMAIL` set to the
exact email of the ChatGPT account that owns this Site. The owner credential
route deliberately returns `403` when that value is missing or the signed-in
email does not match.

Install the following values in the **new Worker's runtime Variables and
Secrets** (or with `wrangler secret put`), not in Cloudflare Builds variables.
Never put them in Git, URLs, task prompts, or browser storage:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `COOKIE_ENCRYPTION_KEY`
- `TCG_SCOUT_INTEGRATION_TOKEN`

Bind `OAUTH_KV` as a runtime KV binding on that same Worker. Create the last
secret through TCG Scout's authenticated owner credential route.
The Site stores only its SHA-256 verifier and binds it to the signed-in Sites
account plus the configured GitHub numeric subject. See
`docs/scout-mcp-bridge.md` for the complete first-deploy and rotation sequence.

From the repository root:

```sh
npm run scout:mcp:cloudflare:install
npm run scout:mcp:cloudflare:format:check
npm run scout:mcp:cloudflare:lint
npm run scout:mcp:cloudflare:typecheck
npm run scout:mcp:cloudflare:test
npm run scout:mcp:cloudflare:check
npm run scout:mcp:cloudflare:deploy
```

## Troubleshooting

- Node engine warning: use Node 22.13+.
- Missing Windows native binding: run `npm ci --include=optional` with the dev server stopped.
- D1 unavailable locally: expect explicit empty/unavailable states; Sites injects `DB` during deployed operation.
- Connector says credentials required: configure only the named server-side variables and run the source test endpoint.
- GitHub says connected but ChatGPT rejects the connector: inspect the bridge's
  redacted `tcg-scout-oauth` events. No grant means the GitHub callback failed;
  `invalid_grant` or `temporarily_unavailable` at `chatgpt_token_exchange`
  indicates Workers KV visibility or write-rate pressure. Never log or paste
  the authorization code, state, cookie, or token.
- Parser format change: leave the source paused, inspect Review Queue, update the isolated test contract, and only then re-enable.
