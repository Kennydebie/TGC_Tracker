import {
  McpServer,
  type AuthInfo,
  type McpRequestContext,
  type CallToolResult,
} from '@modelcontextprotocol/server';
import type { TokenSummary } from '@cloudflare/workers-oauth-provider';
import { createMcpHandler, getMcpAuthContext } from 'agents/mcp/server';
import { z } from 'zod';

import {
  BRIDGE_ORIGIN,
  BRIDGE_HOSTNAME,
  MCP_PATH,
  MCP_RESOURCE,
  SCOUT_SCOPES,
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

type ResolvedMcpAuthorization = {
  authInfo: AuthInfo;
  authProps: AuthProps;
};

type UnwrapAccessToken = (
  token: string,
) => Promise<TokenSummary<unknown> | null>;

type ServerDependencies = {
  fetchImplementation?: FetchImplementation;
  authProps?: unknown;
};

class ToolAuthorizationError extends Error {
  constructor(
    readonly error: 'invalid_token' | 'insufficient_scope',
    readonly requiredScope: ScoutScope,
  ) {
    super('tool_authorization_failed');
    this.name = 'ToolAuthorizationError';
  }
}

function oauthSecurity(scope: ScoutScope): Array<Record<string, unknown>> {
  return [{ type: 'oauth2', scopes: [scope] }];
}

function authorizationChallenge(
  error: 'invalid_token' | 'insufficient_scope',
  requiredScopes: readonly ScoutScope[],
): string {
  const metadataUrl = `${BRIDGE_ORIGIN}/.well-known/oauth-protected-resource${MCP_PATH}`;
  return `Bearer resource_metadata="${metadataUrl}", error="${error}", error_description="Reconnect TCG Community Scout to continue.", scope="${requiredScopes.join(' ')}"`;
}

function errorResult(message: string, challenge?: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
    ...(challenge ? { _meta: { 'mcp/www_authenticate': [challenge] } } : {}),
  };
}

function authorizeTool(
  requestContext: McpRequestContext,
  authPropsValue: unknown,
  requiredScope: ScoutScope,
  allowedGithubUserId: string,
): AuthProps {
  if (
    !requestContext.authInfo ||
    requestContext.authInfo.resource?.href !== MCP_RESOURCE
  ) {
    throw new ToolAuthorizationError('invalid_token', requiredScope);
  }
  if (!requestContext.authInfo.scopes.includes(requiredScope)) {
    throw new ToolAuthorizationError('insufficient_scope', requiredScope);
  }
  const parsedProps = authPropsSchema.safeParse(authPropsValue);
  if (!parsedProps.success) {
    throw new ToolAuthorizationError('invalid_token', requiredScope);
  }
  const props = parsedProps.data;
  if (
    props.githubUserId !== allowedGithubUserId ||
    props.subject !== `github:${allowedGithubUserId}`
  ) {
    throw new ToolAuthorizationError('invalid_token', requiredScope);
  }
  return props;
}

function toolFailure(
  error: unknown,
  operation: 'read' | 'write',
): CallToolResult {
  if (error instanceof ToolAuthorizationError) {
    return errorResult(
      'This tool call is not authorized for this TCG Scout account.',
      authorizationChallenge(error.error, [error.requiredScope]),
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

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization || authorization.length > 4_096) return null;
  return /^Bearer ([^\s]+)$/i.exec(authorization)?.[1] ?? null;
}

function hasExactAudience(audience: string | string[] | undefined): boolean {
  if (!audience) return false;
  return (Array.isArray(audience) ? audience : [audience]).includes(
    MCP_RESOURCE,
  );
}

export async function resolveMcpAuthorization(
  request: Request,
  unwrapAccessToken: UnwrapAccessToken,
  nowSeconds = Math.floor(Date.now() / 1_000),
): Promise<ResolvedMcpAuthorization | null> {
  const token = bearerToken(request);
  if (!token) return null;

  const summary = await unwrapAccessToken(token);
  if (
    !summary ||
    summary.expiresAt <= nowSeconds ||
    !hasExactAudience(summary.audience) ||
    typeof summary.grant.clientId !== 'string' ||
    summary.grant.clientId.length === 0 ||
    !Array.isArray(summary.scope) ||
    !summary.scope.every((scope) => typeof scope === 'string')
  ) {
    return null;
  }

  const parsedProps = authPropsSchema.safeParse(summary.grant.props);
  if (
    !parsedProps.success ||
    summary.userId !== `github-${parsedProps.data.githubUserId}`
  ) {
    return null;
  }

  return {
    authProps: parsedProps.data,
    authInfo: {
      token,
      clientId: summary.grant.clientId,
      scopes: [...summary.scope],
      expiresAt: summary.expiresAt,
      resource: new URL(MCP_RESOURCE),
      extra: { props: parsedProps.data },
    },
  };
}

function unauthorizedResponse(): Response {
  const challenge = authorizationChallenge('invalid_token', SCOUT_SCOPES);
  return Response.json(
    {
      error: 'invalid_token',
      error_description: 'Reconnect TCG Community Scout to continue.',
    },
    {
      status: 401,
      headers: {
        'cache-control': 'no-store',
        'www-authenticate': challenge,
      },
    },
  );
}

export function createScoutMcpServer(
  env: BridgeEnv,
  requestContext: McpRequestContext,
  dependencies: ServerDependencies = {},
): McpServer {
  const server = new McpServer(
    { name: 'tcg-scout-community-radar', version: '1.1.0' },
    {
      instructions:
        'Call get_scout_ingestion_state before save_scout_findings. Research broadly across relevant official, retailer, marketplace, news and community sources for Pokémon, One Piece TCG and Riftbound. Every finding.sourceIdentifier must exactly copy a sourceIdentifier from the same run whose status is checked; place the exact post, comment, listing or article ID in sourcePostOrCommentId and the permalink in sourceUrl. Preserve unknown facts and original provenance, use stable retry-safe run IDs, record dates or exact times only as published, never treat asking prices as profit, ROI, or a purchase recommendation, and report the returned import counts. Retry only corrected rejected records with a new run ID.',
    },
  );
  const authProps = dependencies.authProps ?? getMcpAuthContext()?.props;
  const fetchImplementation = dependencies.fetchImplementation ?? fetch;

  server.registerTool(
    TOOL_NAMES[0],
    {
      title: 'Get TCG Scout ingestion state',
      description:
        "Return only this authorized account's recent scheduled-research imports, broad source coverage, material hashes, and run outcomes. Call before research or import to avoid duplicates and coverage gaps.",
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
        'Validate and save up to 25 source-backed Pokémon, One Piece TCG or Riftbound market-intelligence findings with retry-safe source coverage for this authorized account. Every finding must copy sourceIdentifier exactly from its checked run.sourceChecks entry; keep the individual post, listing or article ID in sourcePostOrCommentId and its permalink in sourceUrl. Include exact release/event dates and action deadlines when sourced; preserve unknown values and provenance.',
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
  async fetch(request, unsafeEnv) {
    let env: BridgeEnv;
    try {
      env = parseBridgeEnv(unsafeEnv);
    } catch {
      return new Response('Service configuration is incomplete.', {
        status: 503,
      });
    }

    let authorization: ResolvedMcpAuthorization | null;
    try {
      // OAuthProvider validates the request before dispatch but currently passes
      // only identity props to stateless handlers. Recreate the standard MCP
      // AuthInfo from its documented token summary so scope checks stay intact.
      authorization = await resolveMcpAuthorization(request, (token) =>
        unsafeEnv.OAUTH_PROVIDER.unwrapToken<unknown>(token),
      );
    } catch {
      console.error(
        JSON.stringify({
          component: 'tcg-scout-oauth',
          event: 'mcp_auth_context_resolution_failed',
        }),
      );
      return new Response('Authentication validation is unavailable.', {
        status: 503,
        headers: { 'cache-control': 'no-store' },
      });
    }
    if (!authorization) return unauthorizedResponse();

    const handler = createMcpHandler(
      (requestContext) =>
        createScoutMcpServer(env, requestContext, {
          authProps: authorization.authProps,
        }),
      {
        route: MCP_PATH,
        legacy: 'stateless',
        responseMode: 'json',
        corsOptions: false,
        authContext: { props: authorization.authProps },
        allowedHostnames: [BRIDGE_HOSTNAME],
        allowedOriginHostnames: [
          BRIDGE_HOSTNAME,
          'chatgpt.com',
          'chat.openai.com',
          'platform.openai.com',
        ],
      },
    );
    return handler.fetch(request, { authInfo: authorization.authInfo });
  },
};
