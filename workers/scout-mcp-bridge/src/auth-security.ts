import { z } from 'zod';

import { AUTH_FLOW_TTL_SECONDS } from './constants';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const padded = value
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const decoded = Uint8Array.from(binary, (character) =>
    character.charCodeAt(0),
  );
  if (encodeBase64Url(decoded) !== value)
    throw new Error('Non-canonical base64url.');
  return decoded;
}

export function randomBase64Url(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signValue(
  value: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const payload = encodeBase64Url(encoder.encode(JSON.stringify(value)));
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      await importSigningKey(secret),
      encoder.encode(payload),
    ),
  );
  return `${payload}.${encodeBase64Url(signature)}`;
}

export async function verifySignedValue<T>(
  signedValue: string | undefined,
  secret: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  if (!signedValue || signedValue.length > 4_096) return null;
  const [payload, signature, extra] = signedValue.split('.');
  if (!payload || !signature || extra) return null;

  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await importSigningKey(secret),
      decodeBase64Url(signature),
      encoder.encode(payload),
    );
    if (!valid) return null;
    return schema.parse(JSON.parse(decoder.decode(decodeBase64Url(payload))));
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string): string | undefined {
  const cookies = request.headers.get('cookie');
  if (!cookies) return undefined;
  for (const part of cookies.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}

export function secureCookie(name: string, value: string): string {
  return `${name}=${value}; Path=/; Max-Age=${AUTH_FLOW_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearCookie(name: string): string {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export const signedFlowCookieSchema = z
  .object({
    kind: z.enum(['consent', 'github']),
    flowId: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    expiresAt: z.number().int().positive(),
  })
  .strict()
  .refine((value) => value.expiresAt >= Date.now(), 'Flow cookie expired.');

export type SignedFlowCookie = z.infer<typeof signedFlowCookieSchema>;
