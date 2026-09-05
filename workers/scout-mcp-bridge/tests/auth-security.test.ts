import { describe, expect, it } from 'vitest';

import {
  signValue,
  signedFlowCookieSchema,
  verifySignedValue,
} from '../src/auth-security';
import { readBoundedForm } from '../src/http';
import type { SafeHttpError } from '../src/http';

const secret = 'A'.repeat(43);

describe('signed authorization cookies', () => {
  it('accepts an intact, unexpired cookie and rejects tampering', async () => {
    const payload = {
      kind: 'consent',
      flowId: 'B'.repeat(43),
      nonce: 'C'.repeat(43),
      expiresAt: Date.now() + 60_000,
    };
    const signed = await signValue(payload, secret);

    await expect(
      verifySignedValue(signed, secret, signedFlowCookieSchema),
    ).resolves.toEqual(payload);
    await expect(
      verifySignedValue(
        `${signed.slice(0, -1)}x`,
        secret,
        signedFlowCookieSchema,
      ),
    ).resolves.toBeNull();
  });

  it('rejects expired cookies', async () => {
    const signed = await signValue(
      {
        kind: 'github',
        flowId: 'B'.repeat(43),
        nonce: 'C'.repeat(43),
        expiresAt: Date.now() - 1,
      },
      secret,
    );
    await expect(
      verifySignedValue(signed, secret, signedFlowCookieSchema),
    ).resolves.toBeNull();
  });
});

describe('bounded form parsing', () => {
  it('parses form input within the limit', async () => {
    const request = new Request('https://example.test/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'decision=approve&csrf=value',
    });
    const result = await readBoundedForm(request, 100);
    expect(result.get('decision')).toBe('approve');
  });

  it('rejects oversized form bodies', async () => {
    const request = new Request('https://example.test/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `value=${'x'.repeat(101)}`,
    });
    await expect(readBoundedForm(request, 100)).rejects.toEqual(
      expect.objectContaining<Partial<SafeHttpError>>({
        code: 'request_too_large',
      }),
    );
  });
});
