import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { clusterCommunitySignals } from '../../lib/community.ts';
import {
  DiscordConnector,
  DiscordGatewayService,
  type DiscordConfig,
  type DiscordMessagePayload,
} from '../../lib/connectors/discord.ts';
import { discordSetup } from '../../lib/services/discord-connection.ts';
import {
  RedditConnector,
  RedditConnectorError,
} from '../../lib/connectors/reddit.ts';

const redditFixtures = new URL('../fixtures/reddit/', import.meta.url);
const discordFixtures = new URL('../fixtures/discord/', import.meta.url);

async function fixture(directory: URL, name: string) {
  return JSON.parse(await readFile(new URL(name, directory), 'utf8')) as Record<
    string,
    unknown
  >;
}

function json(body: unknown, status = 200, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

function requestUrl(input: RequestInfo | URL) {
  if (input instanceof URL) return input;
  if (typeof input === 'string') return new URL(input);
  return new URL(input.url);
}

async function redditConnector(
  apiResponse: (url: URL, call: number) => Promise<Response> | Response,
) {
  const auth = await fixture(redditFixtures, 'auth-success.json');
  let apiCalls = 0;
  const connector = new RedditConnector({
    clientId: 'fixture-client',
    clientSecret: 'fixture-secret',
    userAgent: 'web:tcg-scout:test-suite:v1',
    communities: ['FixtureTCG'],
    authorSalt: 'fixture-salt',
    fetchImpl: async (input) => {
      const url = requestUrl(input);
      if (url.hostname === 'www.reddit.com') return json(auth);
      apiCalls += 1;
      return apiResponse(url, apiCalls);
    },
  });
  return connector;
}

async function discordMessages() {
  return (await fixture(discordFixtures, 'messages.json')) as Record<
    string,
    DiscordMessagePayload
  >;
}

function discordConnector(overrides: DiscordConfig = {}) {
  return new DiscordConnector({
    botToken: 'fixture.bot.token',
    applicationId: '500000000000000001',
    guildAllowlist: ['800000000000000001'],
    channelAllowlist: ['700000000000000001'],
    authorSalt: 'fixture-salt',
    ...overrides,
  });
}

void test('Reddit OAuth health succeeds through the official token endpoint', async () => {
  const connector = await redditConnector(() =>
    json({ data: { children: [] } }),
  );
  const health = await connector.healthCheck();
  assert.equal(health.ok, true);
  assert.equal(health.status, 'connected');
  assert.equal(connector.getPolicy().htmlScrapingFallback, false);
});

void test('Reddit OAuth failure is classified without retrying HTML', async () => {
  const failure = await fixture(redditFixtures, 'auth-failure.json');
  const connector = new RedditConnector({
    clientId: 'bad-client',
    clientSecret: 'bad-secret',
    userAgent: 'web:tcg-scout:test-suite:v1',
    communities: ['FixtureTCG'],
    fetchImpl: async () => json(failure, 401),
  });
  const health = await connector.healthCheck();
  assert.equal(health.ok, false);
  assert.equal(health.status, 'authentication_failed');
});

void test('Reddit rate limits expose a typed retry window', async () => {
  const connector = await redditConnector(() =>
    json({ message: 'Too Many Requests' }, 429, { 'retry-after': '7' }),
  );
  await assert.rejects(
    connector.scanNewPosts(),
    (error: unknown) =>
      error instanceof RedditConnectorError &&
      error.classification === 'rate_limited' &&
      error.retryAfterMs === 7_000,
  );
});

void test('Reddit pagination fetches new posts incrementally', async () => {
  const pageOne = await fixture(redditFixtures, 'listing-page-1.json');
  const pageTwo = await fixture(redditFixtures, 'listing-page-2.json');
  const connector = await redditConnector((url) =>
    json(url.searchParams.has('after') ? pageTwo : pageOne, 200, {
      'x-ratelimit-remaining': '97',
      'x-ratelimit-reset': '32',
    }),
  );
  const result = await connector.scanNewPosts();
  assert.equal(result.requests, 2);
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0]?.externalId, 't3_post-new-1');
  assert.equal(result.rateLimitRemaining, 97);
  assert.equal(result.cursors.FixtureTCG?.newestCreatedUtc, 1788530700);
});

void test('Reddit cursor stops at already-seen content', async () => {
  const pageOne = await fixture(redditFixtures, 'listing-page-1.json');
  const connector = await redditConnector(() => json(pageOne));
  const result = await connector.scanNewPosts({
    FixtureTCG: { after: null, newestCreatedUtc: 1788530700 },
  });
  assert.equal(result.records.length, 0);
  assert.equal(result.requests, 1);
});

void test('Reddit comments ignore deleted and removed bodies', async () => {
  const comments = await fixture(redditFixtures, 'comments.json');
  const connector = await redditConnector(() => json(comments));
  const result = await connector.scanNewComments();
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0]?.externalId, 't1_comment-new-1');
});

void test('Reddit listing deduplicates repeated external IDs', async () => {
  const pageOne = await fixture(redditFixtures, 'listing-page-1.json');
  const duplicated = structuredClone(pageOne);
  const children = (duplicated.data as { children: unknown[] }).children;
  children.push(structuredClone(children[0]));
  (duplicated.data as { after: string | null }).after = null;
  const connector = await redditConnector(() => json(duplicated));
  const result = await connector.scanNewPosts();
  assert.equal(result.records.length, 1);
});

void test('Discord accepts only explicitly allowed guild and channel messages', async () => {
  const messages = await discordMessages();
  const connector = discordConnector();
  assert.equal(
    connector.normaliseMessage(messages.allowedGuild!).accepted,
    true,
  );
  assert.deepEqual(connector.normaliseMessage(messages.blockedGuild!), {
    accepted: false,
    reason: 'guild_not_allowed',
  });
  assert.deepEqual(connector.normaliseMessage(messages.blockedChannel!), {
    accepted: false,
    reason: 'channel_not_allowed',
  });
});

void test('Discord reports unavailable message-content permission honestly', async () => {
  const messages = await discordMessages();
  assert.deepEqual(
    discordConnector().normaliseMessage(messages.contentUnavailable!),
    { accepted: false, reason: 'message_content_unavailable' },
  );
});

void test('Discord filters irrelevant messages before classification', async () => {
  const messages = await discordMessages();
  assert.deepEqual(discordConnector().normaliseMessage(messages.irrelevant!), {
    accepted: false,
    reason: 'irrelevant',
  });
});

void test('Discord price and restock mentions normalise deterministically', async () => {
  const messages = await discordMessages();
  const connector = discordConnector();
  const accepted = connector.normaliseMessage(messages.allowedGuild!);
  assert.equal(accepted.accepted, true);
  assert.ok(accepted.accepted);
  const signal = await connector.normalise(accepted.record);
  assert.ok(signal);
  assert.equal(signal.signalType, 'RESTOCK_REPORT');
  assert.equal(signal.price, 109);
  assert.equal(signal.marketplace, 'Amazon DE');
  assert.equal(signal.verificationStatus, 'unverified');
});

void test('duplicate Discord messages remain one clustered signal', async () => {
  const messages = await discordMessages();
  const connector = discordConnector();
  const accepted = connector.normaliseMessage(messages.allowedGuild!);
  assert.ok(accepted.accepted);
  const first = await connector.normalise(accepted.record);
  const duplicate = await connector.normalise(accepted.record);
  assert.ok(first && duplicate);
  assert.equal(
    clusterCommunitySignals([first, duplicate])[0]?.signals.length,
    1,
  );
});

void test('Discord health rejects user-token shaped credentials', () => {
  const connector = discordConnector({ botToken: 'mfa.user-token' });
  const validation = connector.validateConfig();
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(' '), /official bot token/);
});

void test('Discord health uses the official bot REST identity endpoint', async () => {
  const requested: Array<{ url: URL; redirect: RequestRedirect | undefined }> =
    [];
  const connector = discordConnector({
    fetchImpl: async (input, init) => {
      requested.push({ url: requestUrl(input), redirect: init?.redirect });
      return json({ id: '500000000000000001', bot: true });
    },
  });
  const health = await connector.healthCheck();
  assert.equal(health.ok, true);
  assert.equal(requested[0]?.url.pathname, '/api/v10/users/@me');
  assert.equal(requested[0]?.redirect, 'manual');
});

void test('Discord setup probes use Cloudflare-supported manual redirects', async (context) => {
  const redirects: Array<RequestRedirect | undefined> = [];
  context.mock.method(
    globalThis,
    'fetch',
    async (input: string | URL | Request, init?: RequestInit) => {
      redirects.push(init?.redirect);
      const url = requestUrl(input);
      if (url.pathname.endsWith('/applications/@me'))
        return json({ id: '500000000000000001', flags: 1 << 18 });
      if (url.pathname.endsWith('/messages')) return json([]);
      return json({ guild_id: '800000000000000001', name: 'deals' });
    },
  );
  const db = {
    prepare() {
      const statement = {
        bind() {
          return statement;
        },
        async all() {
          return { success: true, results: [], meta: { changes: 0 } };
        },
        async first() {
          return null;
        },
      };
      return statement;
    },
  } as unknown as D1Database;
  await discordSetup(
    db,
    {
      DISCORD_BOT_TOKEN: 'fixture.bot.token',
      DISCORD_APPLICATION_ID: '500000000000000001',
      DISCORD_GUILD_ALLOWLIST: '800000000000000001',
      DISCORD_CHANNEL_ALLOWLIST: '700000000000000001',
      COMMUNITY_INGEST_SECRET: 'fixture-ingestion-secret',
      COMMUNITY_AUTHOR_HASH_SALT: 'fixture-author-salt',
      COMMUNITY_ADMIN_EMAIL: 'owner@example.test',
    } as Cloudflare.Env,
    true,
  );
  assert.deepEqual(redirects, ['manual', 'manual', 'manual']);
});

void test('Discord Gateway disconnect is surfaced to service health', async () => {
  class FakeSocket extends EventTarget {
    readyState: number = WebSocket.OPEN;
    send() {}
    close() {}
  }
  const socket = new FakeSocket();
  const statuses: string[] = [];
  let redirect: RequestRedirect | undefined;
  const connector = discordConnector({
    fetchImpl: async (_input, init) => {
      redirect = init?.redirect;
      return json({ url: 'wss://gateway.discord.test' });
    },
    webSocketFactory: () => socket as unknown as WebSocket,
  });
  const service = new DiscordGatewayService(connector, {
    onMessage: () => undefined,
    onStatus: (status) => statuses.push(status),
  });
  await service.start();
  assert.equal(redirect, 'manual');
  socket.dispatchEvent(new Event('close'));
  assert.deepEqual(statuses, ['disconnected']);
  service.stop();
});

void test('Discord waits for READY and resumes after a missed heartbeat ACK', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  context.mock.method(Math, 'random', () => 0);
  class Socket extends EventTarget {
    readyState: number = WebSocket.OPEN;
    sent: Array<{ op: number; d: Record<string, unknown> }> = [];
    send(raw: string) {
      this.sent.push(JSON.parse(raw));
    }
    close(code = 1000) {
      this.readyState = WebSocket.CLOSED;
      this.dispatchEvent(Object.assign(new Event('close'), { code }));
    }
    emit(payload: unknown) {
      this.dispatchEvent(
        new MessageEvent('message', { data: JSON.stringify(payload) }),
      );
    }
  }
  const sockets: Socket[] = [],
    statuses: string[] = [];
  const connector = discordConnector({
    fetchImpl: async () => json({ url: 'wss://gateway.discord.test' }),
    webSocketFactory: () => {
      const socket = new Socket();
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
  });
  const service = new DiscordGatewayService(connector, {
    onMessage: () => undefined,
    onStatus: (status) => statuses.push(status),
  });
  try {
    await service.start();
    const socket = sockets[0]!;
    socket.dispatchEvent(new Event('open'));
    assert.equal(statuses.includes('connected'), false);
    socket.emit({ op: 10, d: { heartbeat_interval: 1000 } });
    assert.equal(socket.sent[0]?.op, 2);
    assert.equal(socket.sent[0]?.d.intents, 33281);
    socket.emit({
      op: 0,
      t: 'READY',
      s: 4,
      d: {
        session_id: 'test-session',
        resume_gateway_url: 'wss://gateway.discord.test',
      },
    });
    assert.equal(statuses.at(-1), 'connected');
    context.mock.timers.tick(0);
    context.mock.timers.tick(1000);
    assert.equal(statuses.at(-1), 'disconnected');
    context.mock.timers.tick(2000);
    await Promise.resolve();
    const resumed = sockets[1]!;
    assert.ok(resumed);
    resumed.emit({ op: 10, d: { heartbeat_interval: 1000 } });
    assert.equal(resumed.sent[0]?.op, 6);
    assert.equal(resumed.sent[0]?.d.session_id, 'test-session');
    assert.equal(resumed.sent[0]?.d.seq, 4);
  } finally {
    service.stop();
  }
});
