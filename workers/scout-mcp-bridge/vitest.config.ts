import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const workerShimPath = fileURLToPath(
  new URL('./tests/cloudflare-workers.ts', import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: { 'cloudflare:workers': workerShimPath },
  },
  ssr: {
    noExternal: ['@cloudflare/workers-oauth-provider'],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    server: {
      deps: {
        inline: ['@cloudflare/workers-oauth-provider'],
      },
    },
  },
});
