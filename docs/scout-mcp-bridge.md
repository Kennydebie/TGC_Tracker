# ChatGPT research bridge

## Boundary

The bridge connects the existing ChatGPT research task to Community Radar
without depending on Sites-native MCP:

```text
ChatGPT task -> OAuth-protected Cloudflare Worker /mcp
             -> fixed authenticated Site API routes
             -> existing account-scoped ingestion repository and D1
```

It exposes exactly two tools:

- `get_scout_ingestion_state` (`scout:read`), a bounded read of source coverage,
  recent imports and duplicate identifiers;
- `save_scout_findings` (`scout:write`), a validated bounded import through the
  existing persistence path.

The bridge cannot make arbitrary HTTP requests, query D1 directly, administer
the app, run research, or schedule itself.

## First deployment

1. Deploy the Site migration and API changes first. Keep the Site's existing
   URL and public audience. Confirm its runtime `COMMUNITY_ADMIN_EMAIL` exactly
   matches the signed-in Site owner's ChatGPT email; credential management is
   intentionally unavailable without that match.
2. While signed into the owner account, create a bridge credential at the
   owner-only credential API. Request only `scout:read` and `scout:write`, and
   bind it to the immutable GitHub subject configured in the Worker. The
   plaintext token is returned once; install it immediately as the Worker
   secret `TCG_SCOUT_INTEGRATION_TOKEN`.
3. Create one dedicated Cloudflare KV namespace for OAuth state and grants.
   Put its exact ID in the bridge `wrangler.jsonc` as `OAUTH_KV`. Do not reuse
   Discord state or the Site D1 database.
4. Create a GitHub OAuth App with these exact URLs:

   - Homepage: `https://tcg-scout-mcp-bridge.kennydebie1.workers.dev`
   - Callback: `https://tcg-scout-mcp-bridge.kennydebie1.workers.dev/callback`

5. Install its Client ID and Client Secret as `GITHUB_CLIENT_ID` and
   `GITHUB_CLIENT_SECRET`. Generate at least 32 random bytes for
   `COOKIE_ENCRYPTION_KEY` and install it as another Worker secret. Install all
   four values in the dedicated Worker's **runtime Variables and Secrets** (or
   with `wrangler secret put`), never as Cloudflare Builds variables. `OAUTH_KV`
   is likewise a runtime binding.
6. Create or select a **new** Cloudflare service named
   `tcg-scout-mcp-bridge`, then deploy from `workers/scout-mcp-bridge`. Do not
   reuse the existing `tgc-tracker` connected Build: its CI-provided service
   name can override `wrangler.jsonc` and overwrite the Discord listener. The
   exact remote MCP URL is
   `https://tcg-scout-mcp-bridge.kennydebie1.workers.dev/mcp`.
7. In ChatGPT developer mode, add that MCP URL and complete GitHub sign-in and
   consent for `scout:read` and `scout:write`.
8. Verify discovery, a state read, one genuinely sourced import, and an exact
   retry before editing the existing hourly task.

## Rotation and revocation

Create a successor Site credential, install and verify its Worker secret, and
only then revoke the predecessor. Revocation at the Site blocks downstream
access even if a Worker-issued OAuth access token is still valid. OAuth grants
are independently revocable in the bridge's OAuth provider.

## Scheduled task acceptance

An interactive save proves only the connection. Preserve the existing `TCG
Community Scout` cadence and research prompt, add the state/read and save steps,
then use its scheduled Run now path. Delivery is verified only when that run
finishes without a consent prompt and the saved record appears in Community
Radar. Restore the prior research-only prompt if scheduled connector policy
prevents unattended writes.
