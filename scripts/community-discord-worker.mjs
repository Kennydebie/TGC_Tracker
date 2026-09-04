import {
  DiscordConnector,
  DiscordGatewayService,
} from '../lib/connectors/discord.ts';

const splitCsv = (value) => [
  ...new Set(
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  ),
];

const ingestUrl = process.env.DISCORD_INGEST_URL?.trim();
const ingestSecret = process.env.COMMUNITY_INGEST_SECRET?.trim();
if (!ingestUrl || !ingestSecret) {
  console.error(
    JSON.stringify({
      service: 'community-discord',
      status: 'configuration_required',
      detail: 'DISCORD_INGEST_URL and COMMUNITY_INGEST_SECRET are required.',
    }),
  );
  process.exit(1);
}

const endpoint = new URL(ingestUrl);
if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) {
  console.error(
    JSON.stringify({
      service: 'community-discord',
      status: 'invalid_ingest_url',
    }),
  );
  process.exit(1);
}

const connector = new DiscordConnector({
  botToken: process.env.DISCORD_BOT_TOKEN,
  applicationId: process.env.DISCORD_APPLICATION_ID,
  guildAllowlist: splitCsv(process.env.DISCORD_GUILD_ALLOWLIST),
  channelAllowlist: splitCsv(process.env.DISCORD_CHANNEL_ALLOWLIST),
  authorSalt: process.env.COMMUNITY_AUTHOR_HASH_SALT,
  rawRetentionHours: Number(process.env.COMMUNITY_RAW_RETENTION_HOURS ?? 24),
});

const validation = connector.validateConfig();
if (!validation.valid) {
  console.error(
    JSON.stringify({
      service: 'community-discord',
      status: 'configuration_required',
      errors: validation.errors,
    }),
  );
  process.exit(1);
}

const gateway = new DiscordGatewayService(connector, {
  async onMessage(message) {
    const filtered = connector.normaliseMessage(message);
    if (!filtered.accepted && filtered.reason !== 'message_content_unavailable')
      return;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${ingestSecret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(message),
      redirect: 'error',
    });
    if (!response.ok) {
      console.error(
        JSON.stringify({
          service: 'community-discord',
          status: 'ingest_failed',
          httpStatus: response.status,
        }),
      );
    }
  },
  onStatus(status, detail) {
    console.log(
      JSON.stringify({
        service: 'community-discord',
        status,
        detail,
      }),
    );
  },
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    gateway.stop();
    process.exit(0);
  });
}

await gateway.start();
