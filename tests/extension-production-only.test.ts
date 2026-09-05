import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

void test('browser extension accepts production token envelopes only', async () => {
  const [popup, markup, manifest] = await Promise.all([
    readFile(new URL('../extension/popup.js', import.meta.url), 'utf8'),
    readFile(new URL('../extension/popup.html', import.meta.url), 'utf8'),
    readFile(new URL('../extension/manifest.json', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(popup, /demo\.invalid|\['demo',\s*'v1'\]/);
  assert.match(popup, /parts\[0\] !== 'v1'/);
  assert.doesNotMatch(popup, /innerHTML/);
  assert.doesNotMatch(markup, /demo\.invalid/);
  assert.doesNotMatch(manifest, /demo\.invalid/);
});
