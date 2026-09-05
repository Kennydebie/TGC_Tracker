import type { z } from 'zod';

export class SafeHttpError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = 'SafeHttpError';
  }
}

export async function readBoundedBytes(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    const parsed = Number(declaredLength);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximumBytes) {
      throw new SafeHttpError('response_too_large', 502);
    }
  }

  if (!response.body) return new Uint8Array();

  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw new SafeHttpError('response_too_large', 502);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readBoundedJson<T>(
  response: Response,
  maximumBytes: number,
  schema: z.ZodType<T>,
): Promise<T> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw new SafeHttpError('invalid_response_content_type', 502);
  }

  const bytes = await readBoundedBytes(response, maximumBytes);
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes),
    );
  } catch {
    throw new SafeHttpError('invalid_response_json', 502);
  }

  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new SafeHttpError('invalid_response_schema', 502);
  }
  return parsed.data;
}

export async function readBoundedForm(
  request: Request,
  maximumBytes: number,
): Promise<URLSearchParams> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('application/x-www-form-urlencoded')) {
    throw new SafeHttpError('unsupported_content_type', 415);
  }

  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    const parsed = Number(declaredLength);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new SafeHttpError('invalid_content_length', 400);
    }
    if (parsed > maximumBytes)
      throw new SafeHttpError('request_too_large', 413);
  }

  const pseudoResponse = new Response(request.body);
  let body: Uint8Array;
  try {
    body = await readBoundedBytes(pseudoResponse, maximumBytes);
  } catch (error) {
    if (error instanceof SafeHttpError && error.code === 'response_too_large') {
      throw new SafeHttpError('request_too_large', 413);
    }
    throw error;
  }
  return new URLSearchParams(new TextDecoder().decode(body));
}
