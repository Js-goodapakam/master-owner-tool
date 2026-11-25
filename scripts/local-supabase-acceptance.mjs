import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

// Read configuration from the freshly initialized CLI workdir, never an app env file.
const local = JSON.parse(execFileSync('supabase', ['status','-o','json'], {encoding:'utf8',stdio:['ignore','pipe','pipe']}));
for (const value of [local.API_URL,local.DB_URL]) {
  const url = new URL(value);
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname), 'Loopback Supabase required');
}
assert.ok(local.ANON_KEY && local.SERVICE_ROLE_KEY);
const sql = (args) => execFileSync('psql', [local.DB_URL,'-X','-v','ON_ERROR_STOP=1',...args], {stdio:['ignore','pipe','pipe']});
const call = (path, { token, service = false, method = 'GET', body, raw = false } = {}) => {
  const key = service ? local.SERVICE_ROLE_KEY : local.ANON_KEY;
  return fetch(new URL(path,local.API_URL), {method, redirect:'error',signal:AbortSignal.timeout(15000),
    headers:{apikey:key,Authorization:'Bearer '+(token || key),'Content-Type':raw?'application/pdf':'application/json'},
    body:body === undefined ? undefined : raw ? body : JSON.stringify(body)});
};
const owner = process.argv[2];
assert.ok(owner,'Supply the absolute Owner checkout path');
const { readdirSync } = await import('node:fs');
const { join } = await import('node:path');
const directory = join(owner,'Database','migrations');
for (const file of readdirSync(directory).filter(n=>/^\d+_.*\.sql$/.test(n)).sort()) {
  try { sql(['-f',join(directory,file)]); }
  catch { throw new Error('Local migration failed: '+file); }
}
const email = randomUUID()+'@example.com';
const password = randomUUID();
let session;
test('real GoTrue verifies signup token, logs in and rotates refresh token', async () => {
  const link = await call('/auth/v1/admin/generate_link',{method:'POST',service:true,body:{type:'signup',email,password}});
  assert.ok(link.ok,'Generate local signup confirmation');
  const result = await link.json();
  const verified = await call('/auth/v1/verify',{method:'POST',body:{type:'signup',token_hash:result.hashed_token}});
  assert.ok(verified.ok,'Confirm synthetic signup');
  const login = await call('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
  assert.ok(login.ok,'Password login');
  const initial = await login.json();
  const refresh = await call('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:initial.refresh_token}});
  assert.ok(refresh.ok,'Rotate refresh token');
  session = await refresh.json();
  assert.equal(session.user.id,result.id);
  assert.ok([401,403].includes((await call('/auth/v1/user',{token:'invalid'})).status),'Invalid token is denied');
});
test('real PostgREST denies unprivileged billing records and permits service access', async () => {
  assert.ok(session?.access_token);
  const path = '/rest/v1/payment_transactions?select=id&limit=1';
  for (const token of [undefined,session.access_token]) {
    const result = await call(path,{token});
    assert.ok([401,403].includes(result.status),'Private billing grants deny reads');
  }
  assert.equal((await call(path,{service:true})).status,200);
});
test('real private Storage permits service round-trip and denies anonymous/authenticated access', async () => {
  assert.ok(session?.access_token);
  const object = 'private-customer-documents/'+randomUUID()+'.pdf';
  const path = '/storage/v1/object/'+object;
  const download = '/storage/v1/object/authenticated/'+object;
  const content = '%PDF-1.4\nsynthetic local acceptance';
  assert.ok((await call(path,{method:'POST',service:true,body:content,raw:true})).ok,'Private upload');
  assert.equal(await (await call(download,{service:true})).text(),content);
  for (const token of [undefined,session.access_token]) {
    assert.ok(!(await call(download,{token})).ok,'Private retrieval denied');
    assert.ok(!(await call(path,{method:'DELETE',token})).ok,'Private deletion denied');
  }
  assert.equal(await (await call(download,{service:true})).text(),content);
  assert.ok((await call('/auth/v1/logout?scope=local',{method:'POST',token:session.access_token})).ok);
  assert.ok(!(await call('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}})).ok);
});
