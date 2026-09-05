import {
  McpServer,
  type McpRequestContext,
  type CallToolResult,
} from '@modelcontextprotocol/server';
import { createMcpHandler, getMcpAuthContext } from 'agents/mcp/server';
import { z } from 'zod';

import {
  BRIDGE_HOSTNAME,
  MCP_PATH,
  MCP_RESOURCE,
  TOOL_NAMES,
  type ScoutScope,
} from './constants';
import {
  DownstreamError,
  getScoutIngestionState,
  saveScoutFindings,
  type FetchImplementation,
} from './downstream';
import { parseBridgeEnv, type BridgeAuthEnv, type BridgeEnv } from './env';
import {
  getStateInputSchema,
  ingestionStateOutputSchema,
  saveFindingsInputSchema,
  saveFindingsOutputSchema,
} from './schemas';

const authPropsSchema = z
  .object({
    provider: z.literal('github'),
    subject: z.string().regex(/^github:[1-9][0-9]*$/),
    githubUserId: z.string().regex(/^[1-9][0-9]*$/),
    githubLogin: z.string().min(1).max(100),
  })
  .strict();

type AuthProps = z.infer<typeof authPropsSchema>;

type ServerDependencies = {
  fetchImplementation?: FetchImplementation;
  authProps?: unknown;
};

class ToolAuthorizationError extends Error {
  constructor() {
    super('tool_authorization_failed');
    this.name = 'ToolAuthorizationError';
  }
}

function oauthSecurity(scope: ScoutScope): Array<Record<string, unknown>> {
  return [{ type: 'oauth2', scopes: [scope] }];
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function authorizeTool(
  requestContext: McpRequestContext,
  authPropsValue: unknown,
  requiredScope: ScoutScope,
  allowedGithubUserId: string,
): AuthProps {
  if (
    !requestContext.authInfo ||
    requestContext.authInfo.resource?.href !== MCP_RESOURCE ||
    !requestContext.authInfo.scopes.includes(requiredScope)
  ) {
    throw new ToolAuthorizationError();
  }
  const props = authPropsSchema.parse(authPropsValue);
  if (
    props.githubUserId !== allowedGithubUserId ||
    props.subject !== `github:${allowedGithubUserId}`
  ) {
    throw new ToolAuthorizationError();
  }
  return props;
}

function toolFailure(
  error: unknown,
  operation: 'read' | 'write',
): CallToolResult {
  if (error instanceof ToolAuthorizationError || error instanceof z.ZodError) {
    return errorResult(
      'This tool call is not authorized for this TCG Scout account.',
    );
  }
  if (error instanceof DownstreamError) {
    if (error.code === 'payload_too_large') {
      return errorResult(
        'The findings batch is too large. Send a smaller batch.',
      );
    }
    if (error.code === 'downstream_rate_limited') {
      return errorResult('TCG Scout is temporarily rate limited. Retry later.');
    }
  }
  return errorResult(
    operation === 'read'
      ? 'TCG Scout could not read ingestion state. Try again later.'
      : 'TCG Scout could not save this import. Check ingestion state before retrying.',
  );
}

export function createScoutMcpServer(
  env: BridgeEnv,
  requestContext: McpRequestContext,
  dependencies: ServerDependencies = {},
): McpServer {
  const server = new McpServer(
    { name: 'tcg-scout-community-radar', version: '1.0.0' },
    {
      instructions:
        'Call get_scout_ingestion_state before save_scout_findings. Preserve unknown facts and original provenance, use stable retry-safe run IDs, and report the returned import counts.',
    },
  );
  const authProps = dependencies.authProps ?? getMcpAuthContext()?.props;
  const fetchImplementation = dependencies.fetchImplementation ?? fetch;

  server.registerTool(
    TOOL_NAMES[0],
    {
      title: 'Get TCG Scout ingestion state',
      description:
        "Return only this authorized account's recent web-research imports, source coverage, material hashes, and run outcomes. Call before research or import to avoid duplicates and coverage gaps.",
      inputSchema: getStateInputSchema,
      outputSchema: ingestionStateOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: { securitySchemes: oauthSecurity('scout:read') },
    },
    async (input) => {
      try {
        const identity = authorizeTool(
          requestContext,
          authProps,
          'scout:read',
          env.ALLOWED_GITHUB_USER_ID,
        );
        const state = await getScoutIngestionState(
          env,
          identity.githubUserId,
          input,
          fetchImplementation,
        );
        return {
          content: [
            { type: 'text', text: 'TCG Scout ingestion state returned.' },
          ],
          structuredContent: state,
        };
      } catch (error) {
        return toolFailure(error, 'read');
      }
    },
  );

  server.registerTool(
    TOOL_NAMES[1],
    {
      title: 'Save TCG Scout findings',
      description:
        'Validate and save up to 25 Pokémon or Riftbound web-research findings with retry-safe source coverage for this authorized account. Preserve unknown values and provenance.',
      inputSchema: saveFindingsInputSchema,
      outputSchema: saveFindingsOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: { securitySchemes: oauthSecurity('scout:write') },
    },
    async (input) => {
      try {
        const identity = authorizeTool(
          requestContext,
          authProps,
          'scout:write',
          env.ALLOWED_GITHUB_USER_ID,
        );
        const result = await saveScoutFindings(
          env,
          identity.githubUserId,
          input,
          fetchImplementation,
        );
        return {
          content: [
            {
              type: 'text',
              text: `Import processed: ${result.inserted} inserted, ${result.updated} updated, ${result.unchanged} unchanged, ${result.rejected} rejected.`,
            },
          ],
          structuredContent: result,
          ...(result.status === 'failed' ? { isError: true } : {}),
        };
      } catch (error) {
        return toolFailure(error, 'write');
      }
    },
  );

  return server;
}

type RequiredFetchHandler<Environment> = {
  fetch: NonNullable<ExportedHandler<Environment>['fetch']>;
};

export const mcpApiHandler: RequiredFetchHandler<BridgeAuthEnv> = {
  async fetch(request, unsafeEnv, context) {
    let env: BridgeEnv;
    try {
      env = parseBridgeEnv(unsafeEnv);
    } catch {
      return new Response('Service configuration is incomplete.', {
        status: 503,
      });
    }

    const handler = createMcpHandler(
      (requestContext) => createScoutMcpServer(env, requestContext),
      {
        route: MCP_PATH,
        legacy: 'stateless',
        responseMode: 'json',
        corsOptions: false,
        allowedHostnames: [BRIDGE_HOSTNAME],
        allowedOriginHostnames: [
          BRIDGE_HOSTNAME,
          'chatgpt.com',
          'chat.openai.com',
          'platform.openai.com',
        ],
      },
    );
    return handler(request, env, context);
  },
};
