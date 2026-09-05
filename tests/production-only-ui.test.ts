import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { emptyCommunityDashboard } from '../lib/community.ts';

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(target);
      return /\.(?:ts|tsx)$/.test(entry.name) ? [target] : [];
    }),
  );
  return nested.flat();
}

void test('public app source does not import or render fixture datasets', async () => {
  const files = [
    ...(await sourceFiles(path.resolve('app'))),
    ...(await sourceFiles(path.resolve('components'))),
  ];
  const forbidden = [
    /from\s+['"][^'"]*fixtures(?:-amazon|-community)?(?:\.ts)?['"]/i,
    /FICTIONAL FIXTURE DATA/i,
    /Fixture event \d/i,
    /demo\.invalid/i,
    /Card Corner EU|Cardzolder88|Isolated Demo Marketplace|Fictional .*Community/i,
    /demo-badge/i,
  ];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const pattern of forbidden)
      assert.doesNotMatch(source, pattern, path.relative(process.cwd(), file));
  }
});

void test('fictional datasets live only under test fixtures', async () => {
  const removedRuntimeFiles = [
    'lib/fixtures.ts',
    'lib/fixtures-amazon.ts',
    'lib/fixtures-community.ts',
    'lib/connectors/fixtures.ts',
    'db/seed-demo.sql',
  ];
  await Promise.all(
    removedRuntimeFiles.map(async (file) => {
      await assert.rejects(readFile(path.resolve(file), 'utf8'));
    }),
  );
  assert.match(
    await readFile(
      path.resolve('drizzle/0007_remove_non_production_records.sql'),
      'utf8',
    ),
    /DELETE FROM listings[\s\S]*demo_record/,
  );
  const identityCleanup = await readFile(
    path.resolve('drizzle/0008_correct_legacy_product_identity.sql'),
    'utf8',
  );
  assert.match(identityCleanup, /Prismatic Evolutions Elite Trainer Box['"],/);
  assert.doesNotMatch(identityCleanup, /Elite Trainer Box\s*[×x]\s*2/i);
});

void test('owner credential UI uses the fixed Community Scout binding', async () => {
  const source = await readFile(
    path.resolve('components/scout-integration-credentials.tsx'),
    'utf8',
  );
  assert.match(source, /const CHATGPT_OAUTH_SUBJECT = 'github:56995940';/);
  assert.match(
    source,
    /const CHATGPT_SCOPES = \['scout:read', 'scout:write'\] as const;/,
  );
  assert.match(source, /oauthSubject: CHATGPT_OAUTH_SUBJECT/);
  assert.match(source, /scopes: \[\.\.\.CHATGPT_SCOPES\]/);
  assert.match(source, /method: 'POST'/);
  assert.match(source, /method: 'DELETE'/);
});

void test('one-time integration token is memory-only and owner-gated', async () => {
  const [source, radar, route] = await Promise.all([
    readFile(
      path.resolve('components/scout-integration-credentials.tsx'),
      'utf8',
    ),
    readFile(path.resolve('components/community-radar.tsx'), 'utf8'),
    readFile(path.resolve('app/api/community/route.ts'), 'utf8'),
  ]);
  assert.doesNotMatch(
    source,
    /localStorage|sessionStorage|URLSearchParams|console\.(?:log|info|debug|warn)/,
  );
  assert.match(source, /navigator\.clipboard\.writeText\(oneTimeToken\)/);
  assert.match(source, /value=\{oneTimeToken\}/);
  assert.ok(
    (source.match(/setOneTimeToken\(null\)/g) ?? []).length >= 2,
    'token must be cleared both when the dialog closes and when dismissed',
  );
  assert.match(source, /cannot be shown again/i);
  assert.match(source, /if \(!nextOpen && creating\)/);
  assert.match(source, /showCloseButton=\{!creating\}/);
  assert.match(
    radar,
    /dashboard\.admin \? <ScoutIntegrationCredentials \/> : null/,
  );
  assert.equal(emptyCommunityDashboard().admin, false);
  assert.match(
    route,
    /const admin = isCommunityAdmin\(request, env\.COMMUNITY_ADMIN_EMAIL\)/,
  );
  assert.match(route, /data\.admin = true/);
});
