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
3. Create one dedicated Cloudflare KV namespace for the OAuth provider's client
   registrations, authorization codes, grants, and tokens. Put its exact ID in
   the bridge `wrangler.jsonc` as `OAUTH_KV`. Consent and GitHub callback state
   stay in short-lived signed cookies and do not depend on KV replication. Do
   not reuse Discord state or the Site D1 database.
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

## Hourly Scout Board prompt

Use this prompt for the hourly `TCG Community Scout` scheduled task:

```text
Act as my hourly TCG Scout market-intelligence researcher for Pokémon, One Piece TCG and Riftbound, focused on opportunities relevant to a buyer in the Netherlands and wider EU.

At the start of every run, call get_scout_ingestion_state. Use its recent runs, source coverage, identifiers and material hashes to avoid duplicate work and to distinguish a retry from a new run.

Research broadly. Do not limit the run to Reddit. Check relevant:
- official publisher, organizer, tournament, registration and product pages;
- authorized distributors and NL/EU retailer pages;
- eBay, Amazon and Marktplaats marketplace listings;
- reputable TCG news and public web sources; and
- public Reddit, Discord, forum and social reports when they add timely evidence.

Look especially for time-sensitive registrations, exclusive products, releases, preorder windows, restocks, allocations, cancellations, reprints, material price or supply changes, competitive catalysts and credible warnings. Exclude generic chatter. Recheck and resubmit every still-actionable finding and future milestone from prior state when its source is checked, even when its facts are unchanged; this refreshes verification without making it look materially new.

Evidence rules:
- Add one unique sourceChecks entry for every concrete source actually checked, including inaccessible or failed sources. Its sourceIdentifier is a stable coverage key, such as retailer:dreamland-nl, marketplace:ebay-nl or reddit:r/riftboundtcg. Copy that exact same sourceIdentifier into every finding obtained from that checked source. Put the individual post, comment, listing or article ID in sourcePostOrCommentId and preserve its exact permalink in sourceUrl. For example, a DreamLand page check and its finding both use retailer:dreamland-nl; the page/product identifier and URL belong in sourcePostOrCommentId and sourceUrl. Broad trackedSources category labels are discovery hints, not proof that each member source was checked.
- Never invent a date, deadline, availability, stock quantity, shipping claim, price, source or verification. Use null or unknown when evidence is absent.
- Use publishedAt only for the source publication time. Use eventAt for the actual release or event, actionOpensAt for the opening of an actionable window, and actionDeadlineAt for a sourced closing deadline. Run, observation, publication and verification timestamps must include an offset. A milestone may be YYYY-MM-DD only when the source publishes a date without a time; never invent a time or offset.
- Use verificationStatus=official_checked only after checking an official source, retailer_checked only after checking the named retailer or marketplace page, and community_report for an unverified public report. Checked findings require the exact verificationEvidence URL and observation time.
- The price field is an observed acquisition or active asking price only. An active ask is not a completed sale, fair value or expected exit. Describe completed-sale evidence separately and explicitly in the summary with its evidence URL. Never turn an asking price, hype or scarcity claim into profit or ROI.

Action fields:
- Write a short factual headline and summary.
- Set actionType to register, preorder, buy, attend, verify or watch only when a concrete user action exists; otherwise use none.
- actionInstruction must say exactly what I should do next. actionUrl must be the direct HTTPS page for that action when available.
- For buy or preorder findings, instruct me to inspect the listing and underwrite completed-sale evidence, fees, shipping, profit and ROI before deciding. Never issue a purchase recommendation from scheduled research alone.
- Set lifecycleStatus to announced, registration_open, preorder_open, in_stock, closed, cancelled or unknown from current evidence.
- Surface high-upside possibilities through strong evidence, exact timing and a clear action—not invented profit. TCG Scout will rank the saved findings deterministically.

Safety rules:
- Never place a bid, submit an offer, add an item to a cart, register an account or event, check out, purchase or pay. Only provide evidence and a manual next step.
- Preserve the separation between community claims, active marketplace asks, completed-sale evidence and modelled conclusions.

For each new hourly run, create a fresh stable run.id such as hourly-scout:YYYY-MM-DDTHH-mmZ. Reuse a run ID only to retry the byte-equivalent logical payload after an uncertain response; otherwise use a new ID. Save no more than 25 findings and 20 source checks per call, prioritizing imminent active items for re-verification. Use an empty findings array only when nothing changed and no still-actionable or future-milestone record was rechecked; always keep source coverage honest.

Before saving, verify that every finding.sourceIdentifier exactly matches one sourceChecks entry whose status is checked. After research, call save_scout_findings once with the complete validated payload. Report the run status and inserted, updated, unchanged and rejected counts. If business validation rejects individual findings after accepted records were saved, correct the sourceIdentifier/sourceChecks mapping and use a new run ID containing only corrected rejected records. Reuse the original run ID only for a byte-equivalent retry after an uncertain or persistence-failed response. Never weaken provenance or invent missing facts.
```
