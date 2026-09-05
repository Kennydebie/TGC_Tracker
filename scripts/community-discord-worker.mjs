import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  compactDiscordMessage,
  DiscordConnector,
  DiscordGatewayService,
} from '../lib/connectors/discord.ts';

const endpoint = new URL(
  process.env.DISCORD_INGEST_URL ?? 'https://invalid.local',
);
const secret = process.env.COMMUNITY_INGEST_SECRET?.trim();
if (
  !secret ||
  !process.env.DISCORD_BOT_TOKEN ||
  !process.env.DISCORD_INGEST_URL ||
  endpoint.protocol !== 'https:' ||
  endpoint.username ||
  endpoint.password
) {
  console.error(
    'Set DISCORD_BOT_TOKEN, COMMUNITY_INGEST_SECRET and an HTTPS DISCORD_INGEST_URL.',
  );
  process.exit(1);
}
const directory = resolve(process.env.DISCORD_STATE_DIR ?? '.discord-state');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const statePath = join(directory, 'pending.json');
let pending = [];
try {
  pending = JSON.parse(readFileSync(statePath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') {
    console.error(
      'Cannot read pending delivery queue; repair the state volume before starting.',
    );
    process.exit(1);
  }
}
if (!Array.isArray(pending)) throw new Error('Invalid pending delivery queue.');
const retentionMs =
  Math.max(
    1,
    Math.min(24, Number(process.env.COMMUNITY_RAW_RETENTION_HOURS) || 24),
  ) * 3_600_000;
const persist = () => {
  writeFileSync(`${statePath}.tmp`, JSON.stringify(pending), { mode: 0o600 });
  renameSync(`${statePath}.tmp`, statePath);
};
const request = (method, body) =>
  fetch(endpoint, {
    method,
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
    },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
let status = 'connecting',
  deliveryFailure = false,
  flushing = false,
  stopping = false;
const connector = new DiscordConnector({
  botToken: process.env.DISCORD_BOT_TOKEN,
});
const syncConfig = async () => {
  const response = await request('GET');
  if (!response.ok)
    throw new Error(`App configuration returned HTTP ${response.status}.`);
  const { data } = await response.json();
  if (
    !data?.applicationId ||
    !Array.isArray(data.guildAllowlist) ||
    !Array.isArray(data.channelAllowlist)
  )
    throw new Error('Invalid app configuration.');
  connector.config.applicationId = data.applicationId;
  connector.guildAllowlist.splice(
    0,
    connector.guildAllowlist.length,
    ...data.guildAllowlist,
  );
  connector.channelAllowlist.splice(
    0,
    connector.channelAllowlist.length,
    ...data.channelAllowlist,
  );
};
const heartbeat = async () => {
  const response = await request('POST', {
    kind: 'heartbeat',
    status: deliveryFailure ? 'delivery_error' : status,
  });
  if (!response.ok)
    throw new Error(`Listener heartbeat returned HTTP ${response.status}.`);
};
let retryAfter = 0;
const flush = async () => {
  if (flushing || stopping || Date.now() < retryAfter) return;
  flushing = true;
  try {
    pending = pending.filter(
      (item) => item.queuedAt > Date.now() - retentionMs,
    );
    persist();
    while (pending.length && !stopping) {
      const response = await request('POST', pending[0].message);
      if ([400, 413].includes(response.status)) {
        console.error(
          `Rejected malformed Discord event (HTTP ${response.status}); removing it so later events can proceed.`,
        );
        pending.shift();
        persist();
        continue;
      }
      if (!response.ok) {
        deliveryFailure = true;
        const retry = Number(response.headers.get('retry-after'));
        retryAfter =
          Date.now() +
          Math.max(
            5_000,
            Number.isFinite(retry) ? Math.min(retry * 1_000, 300_000) : 5_000,
          );
        console.error(
          `Discord delivery failed: HTTP ${response.status}; event retained for retry.`,
        );
        break;
      }
      const result = await response.json();
      if (
        !result.accepted &&
        ![
          'source_not_allowed',
          'irrelevant',
          'bot_message_ignored',
          'channel_not_allowed',
          'guild_not_allowed',
          'direct_message_ignored',
          'message_content_unavailable',
          'invalid_payload',
        ].includes(result.reason)
      ) {
        deliveryFailure = true;
        console.error(
          'Discord delivery is not configured; event retained for retry.',
        );
        break;
      }
      pending.shift();
      persist();
      deliveryFailure = false;
    }
  } catch {
    deliveryFailure = true;
    console.error('App delivery unavailable; queued events will retry.');
  } finally {
    flushing = false;
  }
};
const gateway = new DiscordGatewayService(connector, {
  onMessage(message) {
    const result = connector.normaliseMessage(message);
    if (!result.accepted && result.reason !== 'message_content_unavailable')
      return;
    if (pending.some((item) => item.message.id === message.id)) return;
    if (pending.length >= 2_000) {
      deliveryFailure = true;
      throw new Error('Delivery queue full.');
    }
    const compact = compactDiscordMessage(message);
    pending.push({ queuedAt: Date.now(), message: compact });
    persist();
    void flush();
  },
  onStatus(next) {
    status = next;
    void heartbeat().catch(() =>
      console.error('Listener heartbeat could not reach app.'),
    );
  },
});
try {
  await syncConfig();
  await heartbeat();
  await gateway.start();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const syncTimer = setInterval(() => {
  void syncConfig()
    .then(heartbeat)
    .catch(() => console.error('Cannot sync Discord configuration with app.'));
}, 30_000);
const flushTimer = setInterval(() => void flush(), 5_000);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stopping = true;
    clearInterval(syncTimer);
    clearInterval(flushTimer);
    gateway.stop();
    persist();
    process.exit(0);
  });
