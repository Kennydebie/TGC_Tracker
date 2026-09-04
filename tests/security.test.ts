import assert from 'node:assert/strict';
import test from 'node:test';

import { rejectCrossSiteMutation, safeRelativePath } from '../lib/security.ts';

void test('blocks cross-site writes while permitting same-origin requests', () => {
  const bad = new Request('https://scout.example/api/scans/run', {
    method: 'POST',
    headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
  });
  const good = new Request('https://scout.example/api/scans/run', {
    method: 'POST',
    headers: {
      origin: 'https://scout.example',
      'sec-fetch-site': 'same-origin',
    },
  });
  assert.equal(rejectCrossSiteMutation(bad)?.status, 403);
  assert.equal(rejectCrossSiteMutation(good), null);
});

void test('rejects unsafe redirect shapes', () => {
  assert.equal(safeRelativePath('/deals?sort=score'), '/deals?sort=score');
  assert.equal(safeRelativePath('//evil.example/path'), '/');
  assert.equal(safeRelativePath('https://evil.example/path'), '/');
});
