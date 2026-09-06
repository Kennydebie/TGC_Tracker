import {
  DOWNSTREAM_MAX_BODY_BYTES,
  DOWNSTREAM_TIMEOUT_MS,
  TCG_SCOUT_FINDINGS_PATH,
  TCG_SCOUT_STATE_PATH,
} from './constants';
import type { BridgeEnv } from './env';
import { readBoundedJson, SafeHttpError } from './http';
import {
  saveEnvelopeSchema,
  stateEnvelopeSchema,
  type GetStateInput,
  type IngestionState,
  type SaveFindingsInput,
  type SaveFindingsOutput,
} from './schemas';

export type FetchImplementation = typeof fetch;

export class DownstreamError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = 'DownstreamError';
  }
}

function authorizationHeaders(env: BridgeEnv, githubUserId: string): Headers {
  return new Headers({
    accept: 'application/json',
    authorization: `Bearer ${env.TCG_SCOUT_INTEGRATION_TOKEN}`,
    'x-tcg-scout-oauth-subject': `github:${githubUserId}`,
  });
}

async function safeFetch(
  fetchImplementation: FetchImplementation,
  input: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchImplementation(input, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(DOWNSTREAM_TIMEOUT_MS),
    });
  } catch {
    throw new DownstreamError('downstream_unavailable', 502);
  }
}

function mapStatus(status: number): DownstreamError {
  if (status === 401 || status === 403) {
    return new DownstreamError('downstream_authentication_failed', 502);
  }
  if (status === 413) return new DownstreamError('payload_too_large', 413);
  if (status === 429)
    return new DownstreamError('downstream_rate_limited', 503);
  return new DownstreamError('downstream_request_failed', 502);
}

function mapReadError(error: unknown): never {
  if (error instanceof DownstreamError) throw error;
  if (error instanceof SafeHttpError) {
    throw new DownstreamError(error.code, error.status);
  }
  throw new DownstreamError('downstream_invalid_response', 502);
}

export async function getScoutIngestionState(
  env: BridgeEnv,
  githubUserId: string,
  input: GetStateInput,
  fetchImplementation: FetchImplementation = fetch,
): Promise<IngestionState> {
  const url = new URL(TCG_SCOUT_STATE_PATH, env.TCG_SCOUT_BASE_URL);
  url.searchParams.set('recentRunLimit', String(input.recentRunLimit));
  url.searchParams.set('recentFindingLimit', String(input.recentFindingLimit));

  const response = await safeFetch(fetchImplementation, url.href, {
    method: 'GET',
    headers: authorizationHeaders(env, githubUserId),
  });
  if (response.status !== 200) throw mapStatus(response.status);

  try {
    return (
      await readBoundedJson(
        response,
        DOWNSTREAM_MAX_BODY_BYTES,
        stateEnvelopeSchema,
      )
    ).data;
  } catch (error) {
    return mapReadError(error);
  }
}

export async function saveScoutFindings(
  env: BridgeEnv,
  githubUserId: string,
  input: SaveFindingsInput,
  fetchImplementation: FetchImplementation = fetch,
): Promise<SaveFindingsOutput> {
  const body = JSON.stringify(input);
  if (new TextEncoder().encode(body).byteLength > DOWNSTREAM_MAX_BODY_BYTES) {
    throw new DownstreamError('payload_too_large', 413);
  }

  const headers = authorizationHeaders(env, githubUserId);
  headers.set('content-type', 'application/json');
  const response = await safeFetch(
    fetchImplementation,
    new URL(TCG_SCOUT_FINDINGS_PATH, env.TCG_SCOUT_BASE_URL).href,
    { method: 'POST', headers, body },
  );
  if (response.status !== 200 && response.status !== 409) {
    throw mapStatus(response.status);
  }

  try {
    return (
      await readBoundedJson(
        response,
        DOWNSTREAM_MAX_BODY_BYTES,
        saveEnvelopeSchema,
      )
    ).data;
  } catch (error) {
    return mapReadError(error);
  }
}
