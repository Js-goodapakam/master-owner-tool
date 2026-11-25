import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
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
let confirmedCustomer;
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
  const signedIn = await call('/auth/v1/token?grant_type=password',{method:'POST',body:{email:inboxEmail,password}});
  assert.ok(signedIn.ok);
  confirmedCustomer = await signedIn.json();
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
test('real GoTrue denies a confirmation token after its local issuance time expires', async () => {
  const expiredEmail=randomUUID()+'@example.com';
  const link=await call('/auth/v1/admin/generate_link',{method:'POST',service:true,body:{type:'signup',email:expiredEmail,password}});
  assert.ok(link.ok);
  const {id,hashed_token}=await link.json();
  assert.match(id,/^[0-9a-f-]{36}$/);
  sql(['-c',`update auth.users set confirmation_sent_at=now()-interval '7 days' where id='${id}'`]);
  const expired=await call('/auth/v1/verify',{method:'POST',body:{type:'signup',token_hash:hashed_token}});
  assert.ok([400,401,403,422].includes(expired.status));
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
test('real local Supabase identity reaches Owner onboarding and the assigned Stay property', async () => {
  assert.ok(confirmedCustomer?.access_token);
  const stayRoot = process.argv[3];
  assert.ok(stayRoot,'Pinned Stay checkout required');
  // Minimal PMS schema for the disposable fixture; application SQL runs unchanged.
  sql(['-c',`create table property(id integer generated always as identity primary key,name text not null,code text unique,
    city text,country text,timezone text,"createdAt" timestamptz,"updatedAt" timestamptz);
    create table "user"(id integer generated always as identity primary key,"propertyId" integer references property(id),
    name text,email text unique,role text,"isActive" boolean,"createdAt" timestamptz,"updatedAt" timestamptz);`]);
  for (const name of ['auth.sql','property-access.sql','managed-workspace.sql','sample-workspaces.sql']) {
    sql(['-f',join(stayRoot,'sql',name)]);
  }
  const operatorEmail = randomUUID()+'@example.com';
  const operatorCreated = await call('/auth/v1/admin/users',{method:'POST',service:true,body:{email:operatorEmail,password,email_confirm:true}});
  assert.ok(operatorCreated.ok,'Create synthetic billing operator');
  const operator = await operatorCreated.json();
  assert.match(operator.id,/^[0-9a-f-]{36}$/);
  sql(['-c',`insert into owner_profiles(user_id,email,full_name,role_key,must_change_password)
    values ('${operator.id}','${operatorEmail}','CI Owner','owner',false);
    insert into users(id,email,name) values ('${operator.id}','${operatorEmail}','CI Owner')`]);
  const login = await call('/auth/v1/token?grant_type=password',{method:'POST',body:{email:operatorEmail,password}});
  assert.ok(login.ok);
  const {access_token:operatorToken} = await login.json();
  const db = new URL(local.DB_URL);
  db.searchParams.set('sslmode','disable');
  const shared = randomUUID()+randomUUID();
  Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:db.href,SUPABASE_URL:local.API_URL,
    SUPABASE_ANON_KEY:local.ANON_KEY,SUPABASE_PUBLISHABLE_KEY:local.ANON_KEY,SUPABASE_SECRET_KEY:local.SERVICE_ROLE_KEY,
    ENGAGE_OWNER_SERVICE_TOKEN:shared,ENGAGE_LOCAL_SUPABASE_ACCEPTANCE:'1'});
  delete process.env.FRIDAY_LOCAL_DEV;
  const require = createRequire(join(stayRoot,'server.js'));
  const stay = require('./server.js');
  const servers = [];
  const listen = async app => {
    const server = await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
    servers.push(server);
    return 'http://127.0.0.1:'+server.address().port;
  };
  const request = async (origin,path,status,{token,body,headers,method}={}) => {
    const response=await fetch(origin+path,{method:method || (body===undefined?'GET':'POST'),redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},
      body:body===undefined?undefined:JSON.stringify(body)});
    assert.equal(response.status,status,path);
    return response;
  };
  try {
    const stayOrigin=await listen(stay);
    process.env.ENGAGE_STAY_API_ORIGIN=stayOrigin;
    const {app}=await import('../Server/src/app.ts');
    const ownerOrigin=await listen(app);
    const customerEmail=confirmedCustomer.user.email;
    const uuid=confirmedCustomer.user.id;
    const {id:signupRequestId}=await (await request(ownerOrigin,'/api/integrations/engagestay/signup',202,{
      token:shared,headers:{'Idempotency-Key':uuid},body:{source:'email',externalUserId:uuid,email:customerEmail,requestedLifecycle:'TRIAL'},
    })).json();
    const scope='?productCode=engage_stay';
    let sessionId;
    for (let step=1; step<=7; step++) {
      const saved=await (await request(ownerOrigin,'/api/onboarding'+scope,200,{token:operatorToken,
        body:{signupRequestId,step,data:{environment:'Trial',marker:step}}})).json();
      sessionId ??= saved.sessionId;
      assert.equal(saved.sessionId,sessionId);
      assert.equal(saved.step,step);
    }
    const resumed=await (await request(ownerOrigin,'/api/onboarding/signup/'+signupRequestId+scope,200,{token:operatorToken})).json();
    assert.equal(resumed.current_step,7);
    assert.equal(resumed.payload.marker,7);
    const created=await (await request(ownerOrigin,'/api/customers'+scope,201,{token:operatorToken,body:{
      signupRequestId,product:'engage_stay',companyName:'Local CI Hotel',legalName:'Local CI Hotel',email:customerEmail,
      city:'Bengaluru',industry:'Hospitality',accountOwner:'CI Owner',tenantName:'Local CI Tenant',
    }})).json();
    const provisionPath='/api/customers/'+created.id+'/engagestay'+scope;
    const operation={token:operatorToken,headers:{'Idempotency-Key':'local-ci-provision'},body:{action:'approve',adminName:'CI Admin',plan:'basic',modules:['operations']}};
    const property=await (await request(ownerOrigin,provisionPath,200,operation)).json();
    const duplicate=await (await request(ownerOrigin,provisionPath,200,operation)).json();
    assert.equal(duplicate.idempotentReplay,true);
    assert.equal(duplicate.property_id,property.property_id);
    const identity=sql(['-Atc',`select auth_user_id from friday_auth_identity where property_id=${Number(property.property_id)}`]).toString().trim();
    assert.equal(identity,uuid);
    const pms=await request(stayOrigin,'/api/auth/supabase/session',200,{body:{},token:confirmedCustomer.access_token});
    const cookie=pms.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);
    await request(stayOrigin,'/api/properties/'+property.property_id+'/workspace',200,{headers:{Cookie:cookie}});
    const unrelated=sql(['-qAtc',`with p as (insert into property(name,code) values ('Unrelated','CI-UNRELATED') returning id),
      w as (insert into engagestay_managed_workspace(property_id,customer_id,status,plan,modules)
      select id,gen_random_uuid(),'active','basic',array['operations'] from p returning property_id)
      insert into engagestay_workspace_state(property_id) select property_id from w returning property_id`]).toString().trim();
    await request(stayOrigin,'/api/properties/'+unrelated,403,{headers:{Cookie:cookie}});
    await request(stayOrigin,'/api/properties/'+unrelated+'/workspace',403,{method:'PUT',headers:{Cookie:cookie,'x-friday-property-id':unrelated},body:{state:{}}});
    await request(ownerOrigin,provisionPath,200,{token:operatorToken,headers:{'Idempotency-Key':'local-ci-suspend'},body:{action:'suspend'}});
    await request(stayOrigin,'/api/auth/session',403,{headers:{Cookie:cookie}});
  } finally {
    await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));
    await require('./src/db').closeDatabase();
  }
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
