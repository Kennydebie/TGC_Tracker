export const BRIDGE_ORIGIN =
  'https://tcg-scout-mcp-bridge.kennydebie1.workers.dev' as const;
export const BRIDGE_HOSTNAME =
  'tcg-scout-mcp-bridge.kennydebie1.workers.dev' as const;
export const MCP_PATH = '/mcp' as const;
export const MCP_RESOURCE = `${BRIDGE_ORIGIN}${MCP_PATH}` as const;
export const GITHUB_CALLBACK_URL = `${BRIDGE_ORIGIN}/callback` as const;
export const GITHUB_ORIGIN = 'https://github.com' as const;

export const TCG_SCOUT_BASE_URL =
  'https://tcg-scout-arcane-market-hunter.xorqe.chatgpt.site' as const;
export const TCG_SCOUT_STATE_PATH =
  '/api/integrations/scout-mcp/state' as const;
export const TCG_SCOUT_FINDINGS_PATH =
  '/api/integrations/scout-mcp/findings' as const;

export const SCOUT_SCOPES = ['scout:read', 'scout:write'] as const;
export type ScoutScope = (typeof SCOUT_SCOPES)[number];

export const TOOL_NAMES = [
  'get_scout_ingestion_state',
  'save_scout_findings',
] as const;

export const DOWNSTREAM_TIMEOUT_MS = 10_000;
export const DOWNSTREAM_MAX_BODY_BYTES = 256 * 1024;
export const AUTH_MAX_BODY_BYTES = 8 * 1024;
export const GITHUB_MAX_BODY_BYTES = 32 * 1024;
export const AUTH_FLOW_TTL_SECONDS = 10 * 60;
export const AUTH_COOKIE_MAX_BYTES = 4_096;
export const OAUTH_GRANT_PROPAGATION_DELAY_MS = 1_500;
