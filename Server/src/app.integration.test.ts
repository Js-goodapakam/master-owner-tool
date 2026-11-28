import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';

// This suite is intentionally in-process and loopback-only. It exercises the
// real Express routes with the API's local store, never a Supabase connection.
process.env.NODE_ENV = 'development';
process.env.FRIDAY_ENV = 'DEV';
process.env.LOCAL_DEMO_EMAIL = 'owner.integration@example.test';
process.env.LOCAL_DEMO_PASSWORD = 'integration-only-password';
delete process.env.DATABASE_URL; delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY; delete process.env.SUPABASE_SECRET_KEY;

let server: Server; let base = ''; let token = '';
async function request(path: string, init: RequestInit = {}) {
  return fetch(base + path, { ...init, headers: { authorization: token ? `Bearer ${token}` : '', 'content-type': 'application/json', ...(init.headers || {}) } });
}
beforeAll(async () => {
  const { app } = await import('./app.js');
  server = await new Promise<Server>(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  const address = server.address(); base = `http://127.0.0.1:${typeof address === 'object' && address?.port}`;
  const login = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: process.env.LOCAL_DEMO_EMAIL, password: process.env.LOCAL_DEMO_PASSWORD }) });
  token = (await login.json()).access_token;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

describe('isolated Owner API onboarding harness', () => {
  it('serves the public health endpoint under the deployment API prefix', async () => {
    for (const path of ['/api/health', '/health']) {
      const response = await fetch(base + path);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'ok', mode: 'demo' });
    }
  });
  const syntheticCustomer = {
    companyName: 'Synthetic Hotel',
    legalName: 'Synthetic Hotel Private Limited',
    email: 'onboarding.integration@example.test',
    phone: '+919999999999',
    industry: 'Hospitality',
    accountOwner: 'Integration Owner',
    city: 'Bengaluru',
    country: 'India',
  };

  it('denies unauthenticated onboarding writes', async () => {
    const response = await fetch(base + '/api/onboarding', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ step: 1, data: {} }) });
    expect(response.status).toBe(401);
  });
  it('rejects an invalid product context before returning product data', async () => {
    const response = await request('/api/products/not-a-product/context');
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe('PRODUCT_NOT_FOUND');
  });
  it('persists all seven onboarding steps through the real route handler', async () => {
    const started = await request('/api/onboarding', {
      method: 'POST',
      body: JSON.stringify({ step: 1, data: syntheticCustomer }),
    });
    expect(started.status).toBe(201);
    const first = await started.json() as { customer: { id: string; email: string }; step: number };
    expect(first.step).toBe(1);
    expect(first.customer.email).toBe(syntheticCustomer.email);

    // Steps two through seven resume the same saved onboarding customer. This
    // uses the actual Express handler and local repository, not mocked routes.
    for (let step = 2; step <= 7; step++) {
      const response = await request('/api/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          step,
          customerId: first.customer.id,
          data: { environment: step === 2 ? 'Trial' : undefined, currentStep: step },
        }),
      });
      expect(response.status).toBe(200);
      const resumed = await response.json() as { customer: { id: string }; step: number };
      expect(resumed.step).toBe(step);
      expect(resumed.customer.id).toBe(first.customer.id);
    }
  });
  it('rejects invalid onboarding steps', async () => {
    const response = await request('/api/onboarding', { method: 'POST', body: JSON.stringify({ step: 12, data: syntheticCustomer }) });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('VALIDATION');
  });
  it('rejects an incomplete customer and duplicate customer registration', async () => {
    const incomplete = await request('/api/onboarding', {
      method: 'POST', body: JSON.stringify({ step: 1, data: { companyName: 'Missing required fields' } }),
    });
    expect(incomplete.status).toBe(400);

    const customer = { ...syntheticCustomer, email: 'duplicate.integration@example.test' };
    const first = await request('/api/onboarding', {
      method: 'POST', body: JSON.stringify({ step: 1, data: customer }),
    });
    expect(first.status).toBe(201);
    const duplicate = await request('/api/onboarding', {
      method: 'POST', body: JSON.stringify({ step: 1, data: customer }),
    });
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).error).toBe('DUPLICATE_CUSTOMER');
  });
});
