# TCG Scout MCP bridge

This package is the dedicated, stateless OAuth-protected MCP bridge between
ChatGPT and the existing TCG Scout Site API. It is intentionally isolated from
the Discord Worker and from the root application build.

The planned canonical endpoint is
`https://tcg-scout-mcp-bridge.kennydebie1.workers.dev/mcp`. That URL becomes
live only after the first successful deployment of the separate Worker named
`tcg-scout-mcp-bridge` in the `kennydebie1.workers.dev` account.

## Security boundary

The MCP surface contains exactly two tools:

- `get_scout_ingestion_state`, requiring `scout:read`;
- `save_scout_findings`, requiring `scout:write`.

The Worker can call only these fixed Site routes:

- `GET /api/integrations/scout-mcp/state`;
- `POST /api/integrations/scout-mcp/findings`.

Outbound redirects are rejected, calls time out after 10 seconds, request and
response bodies are bounded, and the Site validates the findings again. The
Worker has no cron trigger, Durable Object, D1 binding, model binding, browsing
fallback, or purchasing capability. Application code emits no request URL,
authorization header, token, request body, or finding-content logs. Cloudflare
observability redacts query strings because OAuth codes and state appear there.

OAuth access is audience-pinned to the exact `/mcp` resource. Only S256 PKCE is
accepted. GitHub supplies identity only; the bridge requests no GitHub OAuth
scope and permits only numeric GitHub user ID `56995940`. Consent and GitHub
state use short-lived, size-bounded, HMAC-authenticated `__Host-` cookies, so a
browser crossing Cloudflare locations does not depend on KV replication. KV is
reserved for the OAuth provider's client registrations, authorization codes,
grants and tokens. The callback waits 1.5 seconds after code issuance so the
immediate ChatGPT token exchange does not rewrite the same grant key inside
Workers KV's one-write-per-key-per-second window.

## One-time provisioning

1. Create a dedicated KV namespace. From this directory:

   ```text
   npx wrangler kv namespace create OAUTH_KV --config wrangler.jsonc
   ```

   Replace `REPLACE_WITH_OAUTH_KV_NAMESPACE_ID` in `wrangler.jsonc` with the
   returned ID. Do not reuse the Discord Worker's bindings.

2. Create a GitHub OAuth App with these exact values:

   - Homepage URL:
     `https://tcg-scout-mcp-bridge.kennydebie1.workers.dev`
   - Authorization callback URL:
     `https://tcg-scout-mcp-bridge.kennydebie1.workers.dev/callback`

3. While signed in to TCG Scout as its configured owner, create an integration
   credential through `POST /api/integrations/scout-mcp/credentials`. Bind it
   to `github:56995940` and grant only `scout:read` and `scout:write`. The token
   is displayed once.

4. Install these as **runtime Worker secrets**, never source, client-side
   variables, GitHub Actions output, or Cloudflare Builds variables:

   ```text
   npx wrangler secret put GITHUB_CLIENT_ID --config wrangler.jsonc
   npx wrangler secret put GITHUB_CLIENT_SECRET --config wrangler.jsonc
   npx wrangler secret put COOKIE_ENCRYPTION_KEY --config wrangler.jsonc
   npx wrangler secret put TCG_SCOUT_INTEGRATION_TOKEN --config wrangler.jsonc
   ```

   `COOKIE_ENCRYPTION_KEY` must be at least 32 cryptographically random bytes,
   encoded as unpadded base64url. The integration token is the one-time
   plaintext value created in step 3.

5. Create/select a separate Cloudflare Worker or Builds project whose exact
   name is `tcg-scout-mcp-bridge`, root directory is
   `workers/scout-mcp-bridge`, build command is `npm ci && npm run check`, and
   deploy command is `npm run deploy`. Do not connect this package to the
   existing `tgc-tracker` Worker because Cloudflare Builds may override the
   configured Worker name.

6. In ChatGPT developer mode, add the canonical `/mcp` URL. The owner must
   complete GitHub sign-in and consent once when installing or reconnecting the
   connector. The OAuth provider can then issue refreshable bridge tokens; the
   upstream GitHub token is never stored in the grant.

## Local verification

Node.js 22.13.0 or newer is required. Dependencies are exact-pinned, including
`@cloudflare/workers-oauth-provider@0.10.3` and its compatible MCP stack.

```text
npm ci
npm run check
```

`npm run deploy:dry-run` verifies the bundle locally even while the KV ID is a
placeholder. A real deployment is intentionally blocked until that placeholder
has been replaced. `.dev.vars.example` lists secret names only; never commit a
populated `.dev.vars` file.

## Cost and platform notes

This design can fit within Cloudflare's free plans at low traffic, but it is not
cost-free by contract. OAuth registration, codes, grants, and tokens use KV
reads and writes, and every MCP call uses Worker requests and CPU. Review the
current [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
and [Workers KV pricing](https://developers.cloudflare.com/kv/platform/pricing/)
before production use. No paid Durable Objects or D1 resources are introduced
by this package.

Implementation references:

- [Cloudflare remote MCP server guide](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/)
- [Cloudflare MCP authorization guide](https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/)
- [Cloudflare MCP server security guide](https://developers.cloudflare.com/agents/model-context-protocol/guides/securing-mcp-server/)
- [Workers OAuth Provider](https://github.com/cloudflare/workers-oauth-provider)
- [GitHub OAuth App authorization](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
