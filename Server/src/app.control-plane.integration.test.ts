import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';

/**
 * This adapter replaces only Supabase's HTTP boundary.  The application,
 * Express routes, authentication middleware, validation and authorization
 * all run unchanged against synthetic state.  It is deliberately not a
 * PostgreSQL integration test.
 */
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'http://owner-control-plane.invalid';
process.env.SUPABASE_ANON_KEY = 'synthetic-anon-key';
process.env.SUPABASE_SECRET_KEY = 'synthetic-server-key';
process.env.ENGAGE_STAY_API_ORIGIN = 'http://managed-workspace.invalid';
process.env.ENGAGE_OWNER_SERVICE_TOKEN = 'synthetic-service-token-for-tests-only';
delete process.env.DATABASE_URL;

const stayProduct = '11111111-1111-4111-8111-111111111111';
const fitProduct = '22222222-2222-4222-8222-222222222222';
const customerId = '33333333-3333-4333-8333-333333333333';
const basicPlan = '44444444-4444-4444-8444-444444444444';
const premiumPlan = '55555555-5555-4555-8555-555555555555';
const synthetic = {
  customers: [{ id: customerId, customer_code: 'ES-TR-000101-26', company_name: 'Synthetic Stay', legal_name: 'Synthetic Stay Pvt Ltd', display_name: 'Synthetic Stay', email: 'synthetic@example.test', phone: null, industry: 'Hospitality', status: 'ONBOARDING', account_owner: 'Test Owner', created_at: '2026-11-19T00:00:00.000Z', city: 'Bengaluru', country: 'India' }],
  subscriptions: [] as Array<Record<string, unknown>>,
  entitlements: [] as Array<Record<string, unknown>>,
  audits: [] as Array<Record<string, unknown>>,
};
const products = [
  { id: stayProduct, product_code: 'engage_stay', name: 'Engage Stay', description: '', version: 'test', status: 'ACTIVE', category: 'Hospitality', commercial_status: 'AVAILABLE', adapter_status: 'HEALTHY' },
  { id: fitProduct, product_code: 'engage_fit', name: 'Engage Fit', description: '', version: 'test', status: 'ACTIVE', category: 'Fitness', commercial_status: 'AVAILABLE', adapter_status: 'HEALTHY' },
];
const plans = [{ id: basicPlan, product_id: stayProduct, status: 'ACTIVE', name: 'Basic' }, { id: premiumPlan, product_id: stayProduct, status: 'ACTIVE', name: 'Premium' }];
const originalFetch = globalThis.fetch;
let entitlementSyncFails = false;
const ok = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const body = (init?: RequestInit) => init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};

vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  // Calls to the real loopback API are never intercepted.
  if (url.hostname === '127.0.0.1') return originalFetch(input, init);
  if (url.hostname === 'managed-workspace.invalid') return entitlementSyncFails
    ? new Response(JSON.stringify({ error: 'UNAVAILABLE' }), { status: 503, headers: { 'content-type': 'application/json' } })
    : ok({ synchronized: true });
  if (url.hostname !== 'owner-control-plane.invalid') return new Response('', { status: 502 });
  const path = url.pathname;
  if (path === '/auth/v1/user') {
    const token = String((init?.headers as Record<string, string>)?.authorization || '').replace('Bearer ', '');
    if (token === 'owner-token') return ok({ id: 'owner-id', email: 'owner@example.test' });
    if (token === 'stay-operator-token') return ok({ id: 'stay-operator-id', email: 'stay.operator@example.test' });
    return new Response('', { status: 401 });
  }
  const query = url.searchParams;
  const table = path.replace('/rest/v1/', '');
  if (table === 'owner_profiles') {
    const id = query.get('user_id') || '';
    return ok(id.includes('stay-operator') ? [{ user_id: 'stay-operator-id', email: 'stay.operator@example.test', full_name: 'Stay Operator', role_key: 'operations', is_active: true, is_primary_owner: false, must_change_password: false }] : [{ user_id: 'owner-id', email: 'owner@example.test', full_name: 'Owner', role_key: 'owner', is_active: true, is_primary_owner: true, must_change_password: false }]);
  }
  if (table === 'owner_role_permissions') return ok([{ permission_key: 'customer.view' }, { permission_key: 'customer.create' }, { permission_key: 'customer.update' }, { permission_key: 'product.view' }, { permission_key: 'subscription.view' }, { permission_key: 'subscription.manage' }, { permission_key: 'entitlement.view' }, { permission_key: 'entitlement.manage' }]);
  if (table === 'owner_product_access') return ok([{ products: { product_code: 'engage_stay' } }]);
  if (table === 'products') {
    if (query.get('product_code')?.includes('engage_fit')) return ok(products.filter(item => item.id === fitProduct));
    if (query.get('product_code')?.includes('engage_stay')) return ok(products.filter(item => item.id === stayProduct));
    if (query.get('id')?.includes(fitProduct)) return ok(products.filter(item => item.id === fitProduct));
    if (query.get('id')?.includes(stayProduct)) return ok(products.filter(item => item.id === stayProduct));
    return ok(products);
  }
  if (table === 'product_modules' || table === 'product_features') return ok([]);
  if (table === 'customers') {
    if (init?.method === 'PATCH') return ok([Object.assign(synthetic.customers[0], body(init))]);
    const id = query.get('id'); return ok(id ? synthetic.customers.filter(item => item.id === id.replace('eq.', '')) : synthetic.customers);
  }
  if (table === 'customer_products') return ok(query.get('product_id')?.includes(stayProduct) || init?.method === 'PATCH' ? [{ customer_id: customerId, product_id: stayProduct, status: 'ACTIVE' }] : []);
  if (table === 'plans') {
    const id = query.get('id'); return ok(id ? plans.filter(item => item.id === id.replace('eq.', '')) : plans);
  }
  if (table === 'subscriptions') {
    const id = query.get('id')?.replace('eq.', '');
    if (init?.method === 'POST') {
      const row = { id: `sub-${synthetic.subscriptions.length + 1}`, ...body(init) };
      synthetic.subscriptions.push(row); return ok([row], 201);
    }
    if (init?.method === 'PATCH') {
      const row = synthetic.subscriptions.find(item => item.id === id); if (!row) return ok([]);
      Object.assign(row, body(init)); return ok([row]);
    }
    let rows = synthetic.subscriptions;
    if (id) rows = rows.filter(item => item.id === id);
    if (query.get('status')?.includes('TRIAL')) rows = rows.filter(item => item.status === 'TRIAL' || item.status === 'ACTIVE');
    return ok(rows);
  }
  if (table === 'entitlement_overrides') {
    if (init?.method === 'POST') { const row = { id: `ent-${synthetic.entitlements.length + 1}`, ...body(init) }; synthetic.entitlements.push(row); return ok([row], 201); }
    return ok(synthetic.entitlements);
  }
  if (table === 'audit_logs') { synthetic.audits.push(body(init)); return ok([], 201); }
  return ok([]);
});

let server: Server; let base = '';
async function request(path: string, token = 'owner-token', init: RequestInit = {}) {
  return originalFetch(base + path, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) } });
}

beforeAll(async () => {
  const { app } = await import('./app.js');
  server = await new Promise<Server>(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  const address = server.address(); base = `http://127.0.0.1:${typeof address === 'object' && address?.port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); vi.unstubAllGlobals(); });

describe('isolated Owner control-plane API harness', () => {
  it('activates a trial, rejects duplicate activation, changes plan and preserves customer identity', async () => {
    const create = await request('/api/subscriptions?productCode=engage_stay', 'owner-token', { method: 'POST', body: JSON.stringify({ customerId, planId: basicPlan, status: 'TRIAL', startsAt: '2026-11-19T00:00:00.000Z', expiresAt: '2026-12-19T00:00:00.000Z' }) });
    expect(create.status).toBe(201); const trial = await create.json() as { id: string };
    const duplicate = await request('/api/subscriptions?productCode=engage_stay', 'owner-token', { method: 'POST', body: JSON.stringify({ customerId, planId: basicPlan, status: 'TRIAL' }) });
    expect(duplicate.status).toBe(409);
    const changed = await request(`/api/subscriptions/${trial.id}?productCode=engage_stay`, 'owner-token', { method: 'PATCH', body: JSON.stringify({ action: 'CHANGE_PLAN', planId: premiumPlan }) });
    expect(changed.status).toBe(200); expect((await changed.json()).plan_id).toBe(premiumPlan);
    expect(synthetic.customers[0].id).toBe(customerId);
  });

  it('suspends, reactivates and validates invalid subscription changes', async () => {
    const id = String(synthetic.subscriptions[0]?.id);
    const suspended = await request(`/api/subscriptions/${id}?productCode=engage_stay`, 'owner-token', { method: 'PATCH', body: JSON.stringify({ action: 'SUSPEND' }) });
    expect(suspended.status).toBe(200); expect((await suspended.json()).status).toBe('SUSPENDED');
    const reactivated = await request(`/api/subscriptions/${id}?productCode=engage_stay`, 'owner-token', { method: 'PATCH', body: JSON.stringify({ action: 'REACTIVATE' }) });
    expect(reactivated.status).toBe(200); expect((await reactivated.json()).status).toBe('ACTIVE');
    const invalid = await request(`/api/subscriptions/${id}?productCode=engage_stay`, 'owner-token', { method: 'PATCH', body: JSON.stringify({ action: 'CHANGE_PLAN' }) });
    expect(invalid.status).toBe(400);
  });

  it('renews an expired term without replacing the customer or subscription identity', async () => {
    const id = String(synthetic.subscriptions[0]?.id);
    Object.assign(synthetic.subscriptions[0], { status: 'EXPIRED', expires_at: '2026-11-18T00:00:00.000Z' });
    const renewed = await request(`/api/subscriptions/${id}?productCode=engage_stay`, 'owner-token', {
      method: 'PATCH', body: JSON.stringify({ action: 'RENEW', expiresAt: '2026-12-19T00:00:00.000Z' }),
    });
    expect(renewed.status).toBe(200);
    const row = await renewed.json() as { id: string; status: string; expires_at: string };
    expect(row).toMatchObject({ id, status: 'ACTIVE', expires_at: '2026-12-19T00:00:00.000Z' });
    expect(synthetic.customers[0].id).toBe(customerId);
  });

  it('rejects cross-product access using the actual employee product assignment', async () => {
    const denied = await request('/api/subscriptions?productCode=engage_fit', 'stay-operator-token');
    expect(denied.status).toBe(403); expect((await denied.json()).error).toBe('PRODUCT_ACCESS_DENIED');
  });

  it('synchronizes an entitlement through the external boundary and reports sync failures', async () => {
    const successful = await request(`/api/customers/${customerId}/entitlements?productCode=engage_stay`, 'owner-token', {
      method: 'POST', body: JSON.stringify({ productId: stayProduct, entitlementKey: 'max_users', value: 25, reason: 'Synthetic plan verification' }),
    });
    expect(successful.status).toBe(201);
    entitlementSyncFails = true;
    const failed = await request(`/api/customers/${customerId}/entitlements?productCode=engage_stay`, 'owner-token', {
      method: 'POST', body: JSON.stringify({ productId: stayProduct, entitlementKey: 'storage_gb', value: 100, reason: 'Synthetic retry verification' }),
    });
    expect(failed.status).toBe(502);
    expect((await failed.json()).error).toBe('ENTITLEMENT_SAVED_SYNC_FAILED');
    entitlementSyncFails = false;
  });
});
