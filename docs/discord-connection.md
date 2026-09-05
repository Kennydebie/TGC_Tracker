# Connecting TCG Scout to Discord

Status: the integration and container are implemented; a real bot token, server installation and always-on worker host are still required. Tests with fixtures do not establish a live Discord connection.

## Owner setup

1. Sign in to TCG Scout with the owner's ChatGPT account. Community → Connect Discord contains the setup and diagnostics.
2. Create TCG Scout in https://discord.com/developers/applications. Enable Guild Install and Message Content Intent on the Bot page. Keep the bot token secret.
3. Configure these production runtime values in the Sites secret manager (never in source, browser storage or chat):

| Setting                    | Location                         | Purpose                                                                                |
| -------------------------- | -------------------------------- | -------------------------------------------------------------------------------------- |
| DISCORD_BOT_TOKEN          | App and worker, secret           | Official Discord bot credential                                                        |
| DISCORD_APPLICATION_ID     | App                              | Bot application ID                                                                     |
| COMMUNITY_INGEST_SECRET    | App and worker, identical secret | Protects worker configuration, heartbeat and message ingestion                         |
| COMMUNITY_AUTHOR_HASH_SALT | App, secret                      | Stable author pseudonymisation                                                         |
| COMMUNITY_ADMIN_EMAIL      | App                              | Exact verified ChatGPT email of the owner                                              |
| DISCORD_INGEST_URL         | Worker                           | https://tcg-scout-arcane-market-hunter.xorqe.chatgpt.site/api/community/discord/events |

Use independently generated random values of at least 32 bytes for the ingestion secret and author salt. Keep the salt stable once live signals exist. Deploy the saved app version after changing runtime values.

4. Use the invite link in Connect Discord. Installation requires Manage Server permission. Requested permissions are View Channels and Read Message History (66560). No sending or administration permission is requested. For a server you do not administer, ask its administrator to install the bot; your membership alone is insufficient.
5. Enable Discord Developer Mode, copy the server and channel IDs, and save each channel in the app. The worker fetches saved channel selections every 30 seconds. Optional existing DISCORD_GUILD_ALLOWLIST / DISCORD_CHANNEL_ALLOWLIST app settings remain supported; remove an environment entry as well if revoking an environment-allowed source.
6. On an always-on Docker host, place the worker's three settings above in an ignored `.env.discord`, then run:

```sh
docker compose -f docker-compose.discord.yml up -d --build
docker compose -f docker-compose.discord.yml logs --tail=50 discord-worker
```

The named state volume retains pending messages across restarts, with maximum 24-hour raw retention and a 2,000-event queue cap. Run one worker replica. No port needs exposing. The ordinary Sites web Worker cannot run this Node Gateway listener permanently; deploying the web app does not start this container. No paid host is provisioned by these files.

7. Click Check connection. It checks the app token/application pairing, Message Content flags, each selected channel's server and actual history access, and a worker heartbeat fresher than two minutes. REST access does not prove the worker is running.
8. Verify a real TCG message in an allowed channel, without mentioning the bot, or wait for a relevant published announcement from a followed channel. Confirm a real signal and updated last-ingestion time. Synthetic tests must be clearly identified and excluded from real deal records. Check an unselected channel stays excluded. Stop the worker and verify the app reports offline within two minutes.

## Boundaries and recovery

- Discord Channel Following announcements are accepted in explicitly selected destination servers and channels. The listener preserves Discord's `IS_CROSSPOST` flag and original message reference, and the app rechecks them. A plain bot message, incoming webhook, reply, or manual forward does not qualify for this exception. Ordinary automated restock-bot feeds and DMs remain excluded.
- New channel selections grant only read ingestion, never bot installation or permissions. The app rechecks guild/channel pairs on every event.
- After correcting a 4014 intent error or 4004 authentication error, restart the worker with `docker compose -f docker-compose.discord.yml restart discord-worker`. The app’s Check connection button cannot restart the worker.
- Discord Gateway READY/RESUMED establish connection. Heartbeat ACK failures trigger reconnect/resume with backoff. Fatal authentication/intent errors stop reconnect loops.
- Pending HTTP deliveries survive worker restarts and retry network failures/rate limits. Malformed oversized messages are rejected. Events can still be missed during a long outage or an invalidated Discord session; no history backfill is implemented. The queue is bounded, not a promise of lossless delivery.
- The worker stores only fields needed for classification. Public app visitors receive labeled demo data. Only the configured owner can read production Community Radar and edit shared sources.
- Community reports remain unverified evidence until official market verification supports them; they never trigger purchases.

Verified locally: full unit/integration suites, D1-schema SQLite persistence with foreign keys, retry idempotency, sequential mention accumulation, streamed payload limits, owner authorization, stale health and Gateway resume. A real Discord end-to-end test requires the credentials and installed server bot above.

Official references: https://docs.discord.com/developers/events/gateway, https://docs.discord.com/developers/resources/application, https://docs.discord.com/developers/topics/oauth2, https://docs.discord.com/developers/topics/permissions.
