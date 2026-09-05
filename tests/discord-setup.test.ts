import assert from 'node:assert/strict';
import test from 'node:test';
import {
  discordInviteUrl,
  isCommunityAdmin,
  readDiscordBody,
  sameSecret,
  workerConnection,
} from '../lib/discord-setup.ts';

void test('Discord secrets and real community data require the configured owner', () => {
  const request = new Request('https://scout.test', {
    headers: {
      'oai-authenticated-user-id': 'owner',
      'oai-authenticated-user-email': 'kenny@example.test',
    },
  });
  assert.equal(isCommunityAdmin(request), false);
  assert.equal(isCommunityAdmin(request, 'other@example.test'), false);
  assert.equal(isCommunityAdmin(request, 'kenny@example.test'), true);
  assert.equal(
    isCommunityAdmin(new Request('https://scout.test'), 'kenny@example.test'),
    false,
  );
});
void test('invite requests only guild installation with read permissions', () => {
  assert.equal(discordInviteUrl('javascript:bad'), null);
  const url = new URL(discordInviteUrl('123456789012345678')!);
  assert.equal(url.origin, 'https://discord.com');
  assert.equal(url.searchParams.get('scope'), 'bot');
  assert.equal(url.searchParams.get('permissions'), '66560');
});
void test('missing and stale heartbeats never count as a connected bot', () => {
  assert.equal(workerConnection(null, true).status, 'worker_required');
  assert.equal(
    workerConnection({ status: 'connected', updated_at: 10 }, true, 130_010)
      .connected,
    false,
  );
  assert.equal(
    workerConnection({ status: 'disconnected', updated_at: 10 }, true, 20)
      .connected,
    false,
  );
  assert.equal(
    workerConnection({ status: 'connected', updated_at: 10 }, true, 20)
      .connected,
    true,
  );
});
void test('ingestion compares secrets and limits streamed bodies even without content-length', async () => {
  assert.equal(await sameSecret('abc', 'abc'), true);
  assert.equal(await sameSecret('abc', 'abd'), false);
  await assert.rejects(
    readDiscordBody(
      new Request('https://scout.test', {
        method: 'POST',
        body: JSON.stringify({ content: 'x'.repeat(32768) }),
      }),
    ),
    /too large/,
  );
  await assert.rejects(
    readDiscordBody(
      new Request('https://scout.test', { method: 'POST', body: 'null' }),
    ),
    /Invalid JSON/,
  );
});
