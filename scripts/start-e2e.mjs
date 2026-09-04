import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

const wrangler = 'node_modules/wrangler/bin/wrangler.js';
const statePath = await mkdtemp(join(tmpdir(), 'tcg-scout-e2e-'));
const environment = {
  ...process.env,
  TCG_SCOUT_E2E_STATE_PATH: statePath,
  WRANGLER_WRITE_LOGS: 'false',
  WRANGLER_LOG_PATH: join(statePath, 'wrangler-logs'),
  MINIFLARE_REGISTRY_PATH: join(statePath, 'miniflare-registry'),
  XDG_CONFIG_HOME: statePath,
};
const migrate = spawnSync(
  process.execPath,
  [
    wrangler,
    'd1',
    'migrations',
    'apply',
    'site-creator-d1',
    '--local',
    '--config',
    'wrangler.local.jsonc',
    '--persist-to',
    statePath,
  ],
  { env: environment, stdio: 'inherit' },
);

if (migrate.status !== 0) process.exit(migrate.status ?? 1);

const server = spawn(
  process.execPath,
  ['node_modules/vinext/dist/cli.js', 'dev', '--port', '4173'],
  { env: environment, stdio: 'inherit' },
);

const cleanup = () => rmSync(statePath, { recursive: true, force: true });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.kill(signal);
    cleanup();
    process.exit(0);
  });
}

server.on('exit', (code) => {
  cleanup();
  process.exit(code ?? 0);
});
