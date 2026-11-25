import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
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
test('public signup delivers a confirmation link to the isolated Mailpit inbox', async () => {
  const inboxEmail = randomUUID()+'@example.com';
  const inbox = new URL(local.MAILPIT_URL || local.INBUCKET_URL || 'http://127.0.0.1:54324');
  assert.ok(['127.0.0.1','localhost'].includes(inbox.hostname));
  const signup = await call('/auth/v1/signup',{method:'POST',body:{email:inboxEmail,password}});
  assert.ok(signup.ok,'Public synthetic signup');
  const mailbox = path => fetch(new URL(path,inbox),{redirect:'error',signal:AbortSignal.timeout(5000)});
  let message;
  for (let attempt=0; attempt<20 && !message; attempt++) {
    const response = await mailbox('/api/v1/messages');
    assert.ok(response.ok,'Mailpit inbox API');
    message = (await response.json()).messages?.find(item => item.To?.some(recipient => recipient.Address===inboxEmail));
    if (!message) await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert.ok(message,'Synthetic signup email delivered');
  const mail = await (await mailbox('/api/v1/message/'+encodeURIComponent(message.ID))).json();
  const link = /https?:\/\/[^\s"<]+\/auth\/v1\/verify\?[^\s"<]+/.exec((mail.Text || '')+' '+(mail.HTML || ''));
  assert.ok(link,'Confirmation link present');
  const confirmation = new URL(link[0].replaceAll('&amp;','&'));
  assert.equal(confirmation.origin,new URL(local.API_URL).origin);
  const token = confirmation.searchParams.get('token');
  assert.ok(token,'Confirmation token present');
  const verified = await call('/auth/v1/verify',{method:'POST',body:{type:'signup',token_hash:token}});
  assert.ok(verified.ok,'Mail confirmation accepted');
  assert.ok((await call('/auth/v1/token?grant_type=password',{method:'POST',body:{email:inboxEmail,password}})).ok);
  const invalid = await call('/auth/v1/verify',{method:'POST',body:{type:'signup',token_hash:randomUUID()}});
  assert.ok([400,401,403,422].includes(invalid.status),'Invalid confirmation denied');
});
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
test('real Auth rejects an expired correctly signed local JWT and an invalid signature', async () => {
  assert.ok(local.JWT_SECRET && session?.access_token);
  const [header, payload] = session.access_token.split('.');
  const claims = JSON.parse(Buffer.from(payload,'base64url'));
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const make = (expiry, signingKey) => {
    const data = header+'.'+encode({...claims,exp:expiry});
    return data+'.'+createHmac('sha256',signingKey).update(data).digest('base64url');
  };
  assert.equal((await call('/auth/v1/user',{token:session.access_token})).status,200);
  for (const token of [make(claims.iat-3600,local.JWT_SECRET),make(claims.exp,randomUUID())]) {
    assert.ok([401,403].includes((await call('/auth/v1/user',{token})).status));
  }
});
test('real PostgREST RLS denies authenticated reads and mutations on operational tenant tables', async () => {
  const a = randomUUID(), b = randomUUID();
  sql(['-c',`insert into customers(id,customer_code,company_name,email)
     values ('${a}','CI-A','Synthetic A','a@example.test'), ('${b}','CI-B','Synthetic B','b@example.test');
     insert into tenants(customer_id,name,slug) values ('${a}','Synthetic A','ci-a'), ('${b}','Synthetic B','ci-b');`]);
  const path = '/rest/v1/tenants?customer_id=eq.'+b;
  const serviceRead = await call(path,{service:true});
  assert.equal(serviceRead.status,200);
  assert.equal((await serviceRead.json()).length,1);
  for (const token of [undefined,session.access_token]) {
    const read = await call(path,{token});
    if (read.ok) assert.deepEqual(await read.json(),[]);
    else assert.ok([401,403].includes(read.status));
    const change = await call(path,{token,method:'PATCH',body:{name:'Forbidden change'}});
    assert.ok([204,401,403].includes(change.status));
  }
  assert.equal((await (await call(path,{service:true})).json())[0].name,'Synthetic B');
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
