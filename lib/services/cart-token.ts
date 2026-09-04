const allowedDomains = new Set([
  'demo.invalid',
  'www.ebay.nl',
  'www.cardmarket.com',
]);

type CartIntent = {
  domain: string;
  dealId: string;
  expectedTitle: string;
  expectedPrice: number;
  priceTolerance: number;
  quantity: number;
  expiresAt: number;
  nonce: string;
  demo: boolean;
};

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export async function createCartToken(
  intent: Omit<CartIntent, 'expiresAt' | 'nonce' | 'demo'>,
  secret?: string,
): Promise<{ token: string; intent: CartIntent }> {
  if (!allowedDomains.has(intent.domain))
    throw new Error('Domain is not allowlisted');
  if (
    !Number.isFinite(intent.expectedPrice) ||
    intent.expectedPrice <= 0 ||
    intent.quantity < 1
  )
    throw new Error('Invalid cart intent');
  const payload: CartIntent = {
    ...intent,
    expiresAt: Date.now() + 5 * 60_000,
    nonce: crypto.randomUUID(),
    demo: !secret,
  };
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const payloadPart = base64Url(encoded);
  if (!secret)
    return { token: `demo.${payloadPart}.unsigned`, intent: payload };
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payloadPart),
  );
  return {
    token: `v1.${payloadPart}.${base64Url(new Uint8Array(signature))}`,
    intent: payload,
  };
}
