import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

import type { RequestUser } from '../server/user.ts';
import { createScoutMcpServer, type ScoutMcpService } from './scout-server.ts';

const DEFAULT_MAX_BODY_BYTES = 256 * 1_024;

class PayloadTooLarge extends Error {}

export interface ScoutMcpHandlerOptions {
  authenticate(
    request: Request,
  ): RequestUser | null | Promise<RequestUser | null>;
  createService(user: RequestUser): ScoutMcpService | Promise<ScoutMcpService>;
  maxBodyBytes?: number;
  resourceMetadataUrl: string;
  reportError?: (error: unknown, tool: string, userId: string) => void;
}

function unauthorized(resourceMetadataUrl: string) {
  return Response.json(
    {
      error: 'authentication_required',
      message: 'Connect TCG Scout with ChatGPT to continue.',
    },
    {
      status: 401,
      headers: {
        'www-authenticate': `Bearer resource_metadata="${resourceMetadataUrl}"`,
        'cache-control': 'private, no-store',
      },
    },
  );
}

function protocolError(status: number, code: number, message: string) {
  return Response.json(
    { jsonrpc: '2.0', id: null, error: { code, message } },
    { status, headers: { 'cache-control': 'private, no-store' } },
  );
}

async function boundedJson(request: Request, limit: number): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit)
    throw new PayloadTooLarge();
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError('Missing JSON body.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new PayloadTooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function noStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'private, no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Security boundary: oai-authenticated-user-* headers are trusted only after
 * Sites dispatch strips caller-provided copies and injects authenticated MCP
 * identity. Keep the `mcp` hosting capability enabled and do not deploy this
 * route directly behind a pass-through proxy.
 */
export function createScoutMcpHandler(options: ScoutMcpHandlerOptions) {
  return async function handleScoutMcp(request: Request): Promise<Response> {
    let user: RequestUser | null = null;
    try {
      user = await options.authenticate(request);
      if (!user) return unauthorized(options.resourceMetadataUrl);
      if (request.method !== 'POST') {
        const response = protocolError(
          405,
          -32_000,
          'Method not allowed. Use POST for stateless Streamable HTTP.',
        );
        response.headers.set('allow', 'POST');
        return response;
      }
      let parsedBody: unknown;
      try {
        parsedBody = await boundedJson(
          request,
          options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
        );
      } catch (error) {
        return error instanceof PayloadTooLarge
          ? protocolError(413, -32_000, 'Payload too large.')
          : protocolError(400, -32_700, 'Parse error.');
      }
      const service = await options.createService(user);
      const server = createScoutMcpServer({
        user,
        service,
        reportError: options.reportError,
      });
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      let response: Response;
      try {
        await server.connect(transport);
        response = await transport.handleRequest(request, { parsedBody });
      } finally {
        try {
          await server.close();
        } catch (error) {
          try {
            options.reportError?.(error, 'mcp_transport_close', user.id);
          } catch {
            // Error reporting must never replace a valid MCP response.
          }
        }
      }
      return noStore(response);
    } catch (error) {
      try {
        options.reportError?.(error, 'mcp_transport', user?.id ?? 'unknown');
      } catch {
        // Keep reporting failures out of the protocol response.
      }
      return protocolError(500, -32_603, 'Internal error.');
    }
  };
}
