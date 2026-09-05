import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { z } from 'zod';

import { TCG_SCOUT_BASE_URL } from './constants';

const integrationToken =
  /^tcs_int_[A-Za-z0-9_-]{20,64}\.[A-Za-z0-9_-]{43,128}$/;
const base64UrlSecret = /^[A-Za-z0-9_-]{43,256}$/;

const bridgeEnvSchema = z
  .object({
    OAUTH_KV: z.custom<KVNamespace>(
      (value) =>
        typeof value === 'object' &&
        value !== null &&
        'get' in value &&
        'put' in value,
      'OAUTH_KV is not configured.',
    ),
    TCG_SCOUT_BASE_URL: z.literal(TCG_SCOUT_BASE_URL),
    ALLOWED_GITHUB_USER_ID: z.literal('56995940'),
    GITHUB_CLIENT_ID: z
      .string()
      .min(8)
      .max(200)
      .regex(/^[A-Za-z0-9_-]+$/),
    GITHUB_CLIENT_SECRET: z.string().min(20).max(500).regex(/^\S+$/),
    COOKIE_ENCRYPTION_KEY: z.string().regex(base64UrlSecret),
    TCG_SCOUT_INTEGRATION_TOKEN: z.string().regex(integrationToken),
  })
  .passthrough();

export type BridgeSecrets = {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  COOKIE_ENCRYPTION_KEY: string;
  TCG_SCOUT_INTEGRATION_TOKEN: string;
};

export type BridgeEnv = Env & BridgeSecrets;
export type BridgeAuthEnv = BridgeEnv & { OAUTH_PROVIDER: OAuthHelpers };

export function parseBridgeEnv(env: BridgeEnv): BridgeEnv {
  return bridgeEnvSchema.parse(env);
}
