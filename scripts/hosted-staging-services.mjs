import assert from 'node:assert/strict';
import { checkHostedStaging } from './check-hosted-staging.mjs';

const env = process.env;
checkHostedStaging(env);
assert.equal(env.ENGAGE_STAGING_ACCEPTANCE, '1', 'Staging opt-in required');
const send = (origin, path, options = {}) => fetch(new URL(path, origin), {
  ...options, redirect: 'manual', signal: AbortSignal.timeout(15000),
});
const json = data => JSON.stringify(data);

for (const app of ['OWNER', 'STAY']) {
  const prefix = 'STAGING_' + app;
  const origin = env[prefix + '_SUPABASE_URL'];
  const key = env[prefix + '_SUPABASE_PUBLISHABLE_KEY'] || '';
  if (!key.startsWith('sb_publishable_')) {
    try { assert.equal(JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role, 'anon'); }
    catch { throw new Error(prefix + ' requires a publishable or legacy anon key'); }
  }
  const email = env[prefix + '_SYNTHETIC_EMAIL'];
  const password = env[prefix + '_SYNTHETIC_PASSWORD'];
  assert.ok(email && password, prefix + ' synthetic verified identity is required');
  const headers = { apikey:key, 'content-type':'application/json' };
  const login = await send(origin, '/auth/v1/token?grant_type=password', {
    method:'POST', headers, body:json({email,password}),
  });
  assert.equal(login.status, 200, app + ' password login');
  const initial = await login.json();
  assert.ok(initial.refresh_token && initial.access_token, app + ' session response');
  const refresh = await send(origin, '/auth/v1/token?grant_type=refresh_token', {
    method:'POST', headers, body:json({refresh_token:initial.refresh_token}),
  });
  assert.equal(refresh.status, 200, app + ' session refresh');
  const session = await refresh.json();
  const authenticated = { ...headers, Authorization:'Bearer '+session.access_token };
  try {
    const user = await send(origin, '/auth/v1/user', {headers:authenticated});
    assert.equal(user.status, 200, app + ' authenticated user');
    assert.ok((await user.json()).email_confirmed_at, app + ' synthetic email confirmed');
    const table = app === 'OWNER' ? 'payment_transactions' : 'engagestay_managed_workspace';
    const protectedRows = await send(origin, '/rest/v1/'+table+'?select=*&limit=1', {headers:authenticated});
    if (protectedRows.ok) assert.deepEqual(await protectedRows.json(), [], app + ' private table must return no rows');
    else assert.ok([401,403].includes(protectedRows.status), app + ' private table status '+protectedRows.status);
    if (app === 'OWNER') {
      const path = env.STAGING_OWNER_PRIVATE_FIXTURE_PATH || '';
      assert.match(path, /^[a-zA-Z0-9/_-]+\.[a-zA-Z0-9]+$/, 'Private synthetic object path required');
      const storage = await send(origin, '/storage/v1/object/authenticated/private-customer-documents/'+path, {headers:authenticated});
      assert.ok([400,401,403,404].includes(storage.status), 'Direct private Storage access must be denied');
    }
    console.log(app + ' hosted Auth and authenticated access checks passed');
  } finally {
    const logout = await send(origin, '/auth/v1/logout?scope=local', {method:'POST',headers:authenticated});
    assert.ok(logout.ok, app + ' logout');
  }
  const revoked = await send(origin, '/auth/v1/token?grant_type=refresh_token', {
    method:'POST', headers, body:json({refresh_token:session.refresh_token}),
  });
  assert.ok([400,401,403].includes(revoked.status), app + ' refresh after logout must fail');
}

for (const [provider, expectedHost] of [['google','accounts.google.com'],['microsoft','login.microsoftonline.com']]) {
  const path = '/api/auth/social/'+provider;
  const start = await send(env.STAGING_STAY_BACKEND_ORIGIN, path);
  assert.equal(start.status, 302, provider + ' OAuth start');
  const location = new URL(start.headers.get('location'));
  assert.equal(location.hostname, expectedHost, provider + ' OAuth provider origin');
  assert.ok(location.searchParams.get('state'), provider + ' OAuth state');
  const publicOrigin = env.STAGING_STAY_PUBLIC_API_ORIGIN || env.STAGING_STAY_BACKEND_ORIGIN;
  assert.equal(location.searchParams.get('redirect_uri'), new URL(path+'/callback', publicOrigin).href);
  const invalid = await send(env.STAGING_STAY_BACKEND_ORIGIN, path+'/callback?state=invalid&code=invalid');
  assert.equal(invalid.status, 400, provider + ' invalid callback state');
  console.log(provider + ' hosted OAuth redirect and invalid-state checks passed');
}

// Use an order already paid by an operator using Razorpay Test Mode.
const paymentId = env.STAGING_RAZORPAY_TEST_PAYMENT_ID || '';
const orderId = env.STAGING_RAZORPAY_TEST_ORDER_ID || '';
assert.match(paymentId, /^pay_[a-zA-Z0-9]+$/);
assert.match(orderId, /^order_[a-zA-Z0-9]+$/);
assert.ok(env.RAZORPAY_KEY_SECRET, 'Razorpay Test Mode secret required');
const amount = Number(env.STAGING_RAZORPAY_TEST_AMOUNT_MINOR);
assert.ok(Number.isSafeInteger(amount) && amount > 0);
const gatewayHeaders = { Authorization:'Basic '+Buffer.from(env.RAZORPAY_KEY_ID+':'+env.RAZORPAY_KEY_SECRET).toString('base64') };
for (const [kind, id] of [['orders',orderId],['payments',paymentId]]) {
  const response = await send('https://api.razorpay.com', '/v1/'+kind+'/'+id, {headers:gatewayHeaders});
  assert.equal(response.status, 200, 'Razorpay Test Mode '+kind);
  const record = await response.json();
  assert.equal(record.id,id);
  assert.equal(record.amount,amount);
  assert.equal(record.currency,'INR');
  assert.equal(record.status,kind === 'orders' ? 'paid' : 'captured');
  if (kind === 'payments') assert.equal(record.order_id,orderId);
}
console.log('Razorpay Test Mode order and captured payment match the staging fixture');
