import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

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
});
