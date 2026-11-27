import { expect, test, vi } from 'vitest';
import { verifyChannexCredential } from './otaVerification.js';

test('verifies only the selected fixed provider origin and does not follow redirects', async () => {
  const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 302 }));
  const result = await verifyChannexCredential('staging', 'synthetic-key', send);
  expect(result.success).toBe(false);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith('https://staging.channex.io/api/v1/properties',
    expect.objectContaining({ redirect: 'manual', signal: expect.any(AbortSignal) }));
});

test('distinguishes denied credentials, retryable errors and timeouts without exposing provider data', async () => {
  const send = vi.fn<typeof fetch>();
  send.mockResolvedValueOnce(new Response('private payload', { status: 403 }))
    .mockResolvedValueOnce(new Response('private payload', { status: 429 }))
    .mockRejectedValueOnce(new Error('synthetic-key'));
  expect((await verifyChannexCredential('staging', 'synthetic-key', send)).lastError).toMatch(/rejected/);
  expect((await verifyChannexCredential('staging', 'synthetic-key', send)).lastError).toMatch(/Retry/);
  expect((await verifyChannexCredential('staging', 'synthetic-key', send)).lastError).not.toMatch(/synthetic-key/);
});
