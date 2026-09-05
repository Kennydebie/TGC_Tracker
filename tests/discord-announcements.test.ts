import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compactDiscordMessage,
  DiscordConnector,
  type DiscordMessagePayload,
} from '../lib/connectors/discord.ts';

const receiver = new DiscordConnector({
  guildAllowlist: ['800000000000000001'],
  channelAllowlist: ['700000000000000001'],
});

function announcement(): DiscordMessagePayload {
  return {
    id: '900000000000000001',
    guild_id: '800000000000000001',
    channel_id: '700000000000000001',
    timestamp: '2026-09-05T13:01:00Z',
    flags: 2,
    webhook_id: '600000000000000001',
    author: { id: '600000000000000001', bot: true },
    message_reference: {
      type: 0,
      guild_id: '800000000000000002',
      channel_id: '700000000000000002',
      message_id: '900000000000000002',
    },
    embeds: [
      {
        title: 'Riftbound release news',
        description: 'New booster restock at €109',
      },
    ],
  };
}

void test('followed announcements survive the Gateway-to-app relay and remain unverified evidence', async () => {
  const input = announcement();
  assert.ok(receiver.normaliseMessage(input).accepted);
  const transported = JSON.parse(JSON.stringify(compactDiscordMessage(input)));
  const received = receiver.normaliseMessage(transported);
  assert.ok(received.accepted);
  const signal = await receiver.normalise(received.record);
  assert.ok(signal);
  assert.equal(signal.verificationStatus, 'unverified');
  assert.equal(signal.officialReference, false);
  assert.equal(signal.price, 109);
});

void test('ordinary bots, webhooks, published originals, and manual forwards stay excluded', () => {
  for (const flags of [undefined, 0, 1, 4, 16384]) {
    const message = { ...announcement(), flags };
    assert.deepEqual(receiver.normaliseMessage(message), {
      accepted: false,
      reason: 'bot_message_ignored',
    });
  }
  assert.equal(
    receiver.normaliseMessage({
      ...announcement(),
      flags: undefined,
      author: { bot: false },
    }).accepted,
    false,
  );
  assert.equal(
    receiver.normaliseMessage({
      ...announcement(),
      message_reference: { ...announcement().message_reference, type: 1 },
    }).accepted,
    false,
  );
});

void test('a crosspost flag without a valid original message reference is rejected', () => {
  for (const reference of [
    undefined,
    {},
    {
      guild_id: 'bad',
      channel_id: '700000000000000002',
      message_id: '900000000000000002',
    },
  ]) {
    assert.equal(
      receiver.normaliseMessage({
        ...announcement(),
        message_reference: reference,
      }).accepted,
      false,
    );
  }
});

void test('Channel Following never bypasses destination allowlists or DM exclusion', () => {
  assert.deepEqual(
    receiver.normaliseMessage({
      ...announcement(),
      guild_id: '800000000000000099',
    }),
    {
      accepted: false,
      reason: 'guild_not_allowed',
    },
  );
  assert.deepEqual(
    receiver.normaliseMessage({
      ...announcement(),
      channel_id: '700000000000000099',
    }),
    {
      accepted: false,
      reason: 'channel_not_allowed',
    },
  );
  assert.deepEqual(
    receiver.normaliseMessage({ ...announcement(), guild_id: undefined }),
    {
      accepted: false,
      reason: 'direct_message_ignored',
    },
  );
});
