import assert from 'node:assert/strict';
import { checkHostedStaging } from './check-hosted-staging.mjs';

const env = process.env;
checkHostedStaging(env);
assert.equal(env.ENGAGE_STAGING_ACCEPTANCE, '1', 'Explicit staging acceptance opt-in required');

async function request(origin, path, init = {}) {
  return fetch(new URL(path, origin), { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) });
}

const probes = [
  ['Owner health', env.STAGING_OWNER_BACKEND_ORIGIN, '/api/health', 200],
  ['Stay health', env.STAGING_STAY_BACKEND_ORIGIN, '/api/health', 200],
  ['Anonymous Owner API denial', env.STAGING_OWNER_BACKEND_ORIGIN, '/api/products?productCode=engage_stay', 401],
  ['Anonymous Stay session denial', env.STAGING_STAY_BACKEND_ORIGIN, '/api/auth/session', 401],
  ['Anonymous delivery-worker denial', env.STAGING_OWNER_BACKEND_ORIGIN, '/internal/subscriptions/deliver', 401, 'POST'],
];
for (const [name, origin, path, expected, method] of probes) {
  const response = await request(origin, path, { method });
  assert.equal(response.status, expected, name);
  console.log(name + ' passed');
}
for (const app of ['OWNER', 'STAY']) {
  const prefix = 'STAGING_' + app;
  const key = env[prefix + '_SUPABASE_PUBLISHABLE_KEY'];
  assert.ok(key && (key.startsWith('sb_publishable_') || key.split('.').length === 3), prefix + ' requires a publishable key');
  if (key.split('.').length === 3) {
    assert.equal(JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role, 'anon', 'Legacy key must have anon role');
  }
  const headers = { apikey: key };
  const settings = await request(env[prefix + '_SUPABASE_URL'], '/auth/v1/settings', { headers });
  assert.equal(settings.status, 200, app + ' Auth settings availability');
  const table = app === 'OWNER' ? 'payment_transactions' : 'engagestay_managed_workspace';
  const read = await request(env[prefix + '_SUPABASE_URL'], '/rest/v1/' + table + '?select=*&limit=1', { headers });
  if (read.ok) assert.deepEqual(await read.json(), [], app + ' anonymous read must return no rows');
  else assert.ok([401,403].includes(read.status), app + ' private table exposure requires review (HTTP ' + read.status + ')');
  console.log(app + ' Auth availability and anonymous read check passed');
}
