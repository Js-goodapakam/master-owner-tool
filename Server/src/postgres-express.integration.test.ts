// @ts-nocheck — test-only PostgREST *compatibility* adapter, not Supabase.
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
// @ts-ignore — test-only JS modules intentionally have no declaration files.
import {assertIsolatedOwnerDatabase,verifyConnectedOwnerDatabase} from '../scripts/assert-isolated-owner-db.mjs';
// @ts-ignore — test-only SQL-backed REST compatibility subset.
import {createPgRestCompatibility} from '../scripts/postgres-rest-compat.mjs';
assertIsolatedOwnerDatabase();
const pool=new pg.Pool({connectionString:process.env.OWNER_TEST_DATABASE_URL,ssl:false,max:12});
const realFetch=globalThis.fetch;
const actors=new Map();
const sql=async(query,args=[]) => (await pool.query(query,args)).rows;
let server,base,ownerId,operatorId,viewerId,stayId,fitId,basicId,premiumId,customerId,otherCustomerId;
let externalShouldFail=false,externalCalls=0;
const req=async(path,token='owner-token',method='GET',data=undefined,headers={})=>
  realFetch(base+path,{method,headers:{authorization:token?'Bearer '+token:'','content-type':'application/json',...headers},body:data===undefined?undefined:JSON.stringify(data)});
beforeAll(async()=>{
 await verifyConnectedOwnerDatabase(pool); // Verify actual DB before synthetic HTTP fixtures.
 ownerId=randomUUID();operatorId=randomUUID();viewerId=randomUUID();
 for(const [id,role] of [[ownerId,'owner'],[operatorId,'operations'],[viewerId,'viewer']]){
  const email='ci-'+id+'@example.test';
  await sql('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id,email]);
  await sql("INSERT INTO owner_profiles(user_id,email,full_name,role_key,is_primary_owner,must_change_password) VALUES($1,$2,'Synthetic Employee',$3,false,false)",[id,email,role]);
 }
 stayId=(await sql("SELECT id FROM products WHERE product_code='engage_stay'"))[0].id;
 fitId=(await sql("SELECT id FROM products WHERE product_code='engage_fit'"))[0].id;
 basicId=(await sql("SELECT id FROM plans WHERE product_id=$1 AND name='Basic'",[stayId]))[0].id;
 premiumId=(await sql("SELECT id FROM plans WHERE product_id=$1 AND name='Premium'",[stayId]))[0].id;
 await sql("INSERT INTO owner_product_access(owner_user_id,product_id,granted_by) VALUES($1,$2,$3),($4,$2,$3)",[operatorId,stayId,ownerId,viewerId]);
 customerId=(await sql("INSERT INTO customers(customer_code,company_name,email,status) VALUES($1,'Synthetic API Hotel','api-a@example.test','ONBOARDING') RETURNING id",['CI-HTTP-'+randomUUID()]))[0].id;
 otherCustomerId=(await sql("INSERT INTO customers(customer_code,company_name,email,status) VALUES($1,'Synthetic Other Product','api-b@example.test','ONBOARDING') RETURNING id",['CI-OTHER-'+randomUUID()]))[0].id;
 await sql("INSERT INTO customer_products(customer_id,product_id,status) VALUES($1,$2,'ONBOARDING'),($3,$4,'ONBOARDING')",[customerId,stayId,otherCustomerId,fitId]);
 actors.set('owner-token',ownerId);actors.set('operator-token',operatorId);actors.set('viewer-token',viewerId);
 process.env.SUPABASE_URL='http://owner-pg-compat.invalid';
 process.env.SUPABASE_ANON_KEY='synthetic-compat-only';
 process.env.SUPABASE_SECRET_KEY='synthetic-compat-only';
 process.env.ENGAGE_STAY_API_ORIGIN='http://managed-workspace.invalid';
 process.env.ENGAGE_OWNER_SERVICE_TOKEN='synthetic-test-service-token-is-32-characters-long';
 vi.stubGlobal('fetch',createPgRestCompatibility(pool,actors,realFetch,()=>{
  externalCalls++;
  return new Response(JSON.stringify(externalShouldFail?{error:'SYNTHETIC_UPSTREAM_FAILURE'}:{status:'synthetic_external_ack'}),{
   status:externalShouldFail?503:200,headers:{'content-type':'application/json'}
  });
 }));
 const {app}=await import('./app.js');
 server=await new Promise(resolve=>{const opened=app.listen(0,'127.0.0.1',()=>resolve(opened));});
 base='http://127.0.0.1:'+server.address().port;
},20000);
afterAll(async()=>{
 if(server)await new Promise(resolve=>server.close(resolve));
 vi.unstubAllGlobals();
 for(const name of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SECRET_KEY','ENGAGE_STAY_API_ORIGIN','ENGAGE_OWNER_SERVICE_TOKEN'])delete process.env[name];
 await pool.end();
});

describe('Express + PostgreSQL-backed HTTP boundary (NOT real PostgREST)',()=>{
 it('denies missing or forged authentication and an invalid product context',async()=>{
  expect((await req('/api/subscriptions?productCode=engage_stay','forged')).status).toBe(401);
  expect((await realFetch(base+'/api/subscriptions?productCode=engage_stay')).status).toBe(401);
  const context=await req('/api/subscriptions?productCode=unknown');
  expect(context.status).toBe(400);
  expect((await context.json()).error).toBe('PRODUCT_CONTEXT_REQUIRED');
 });
 it('denies employee cross-product operations and unauthorized subscription management',async()=>{
  const denied=await req('/api/subscriptions?productCode=engage_fit','operator-token');
  expect(denied.status).toBe(403);
  expect((await denied.json()).error).toBe('PRODUCT_ACCESS_DENIED');
  const view=await req('/api/subscriptions?productCode=engage_stay','operator-token');
  expect(view.status).toBe(200);
  const mutation=await req('/api/subscriptions?productCode=engage_stay','viewer-token','POST',
   {customerId,planId:basicId,status:'TRIAL'});
  expect(mutation.status).toBe(403);
 });
 it('rejects a customer not assigned to the requested product',async()=>{
  const denied=await req('/api/customers/'+otherCustomerId+'/entitlements?productCode=engage_stay');
  expect(denied.status).toBe(404);
 });
 it('denies deactivated employee profiles',async()=>{
  await sql('UPDATE owner_profiles SET is_active=false WHERE user_id=$1',[viewerId]);
  try{
   const denied=await req('/api/subscriptions?productCode=engage_stay','viewer-token');
   expect(denied.status).toBe(403);
   expect((await denied.json()).error).toBe('ACCOUNT_DISABLED');
  }finally{await sql('UPDATE owner_profiles SET is_active=true WHERE user_id=$1',[viewerId]);}
 });
 it('persists seven connected onboarding saves using real Express handler',async()=>{
  const ids=[];
  for(let step=1;step<=7;step++){
   const res=await req('/api/onboarding','owner-token','POST',{step,data:{environment:'Trial',phase:step}});
   expect(res.status).toBe(200);
   const json=await res.json();
   ids.push(json.sessionId);
   const saved=(await sql('SELECT current_step,payload FROM onboarding_sessions WHERE id=$1',[json.sessionId]))[0];
   expect(saved.current_step).toBe(step);expect(saved.payload.phase).toBe(step);
  }
  expect(new Set(ids).size).toBe(7); // No signup ID: API creates a separate session per call.
  expect((await req('/api/onboarding','owner-token','POST',{step:12,data:{}})).status).toBe(400);
 });
 it('activates a trial through Express and rejects duplicate active subscription writes',async()=>{
  const create=await req('/api/subscriptions?productCode=engage_stay','owner-token','POST',
   {customerId,planId:basicId,status:'TRIAL',startsAt:'2026-11-01T00:00:00.000Z',expiresAt:'2026-11-18T00:00:00.000Z'});
  expect(create.status).toBe(201);
  const row=await create.json();
  expect((await sql('SELECT status FROM subscriptions WHERE id=$1',[row.id]))[0].status).toBe('TRIAL');
  const duplicate=await req('/api/subscriptions?productCode=engage_stay','owner-token','POST',
   {customerId,planId:basicId,status:'TRIAL'});
  expect(duplicate.status).toBe(409);
 });
 it('executes the real service-token expiry worker, updates DB and avoids double expiry',async()=>{
  const token=process.env.ENGAGE_OWNER_SERVICE_TOKEN;
  const worker=()=>req('/api/internal/subscriptions/evaluate-expiry',token,'POST');
  const first=await worker();expect(first.status).toBe(200);
  expect((await first.json()).expired).toBe(1);
  const second=await worker();expect(second.status).toBe(200);
  expect((await second.json()).expired).toBe(0);
  expect((await sql('SELECT status FROM customers WHERE id=$1',[customerId]))[0].status).toBe('SUSPENDED');
  expect((await sql("SELECT status FROM subscriptions WHERE customer_id=$1 AND product_id=$2",[customerId,stayId]))[0].status).toBe('EXPIRED');
  expect((await req('/api/internal/subscriptions/evaluate-expiry','bad-token','POST')).status).toBe(401);
 });
 it('handles plan change, suspension, reactivation and explicit renewal with persistent IDs',async()=>{
  const active=(await sql('SELECT id FROM subscriptions WHERE customer_id=$1',[customerId]))[0].id;
  const path='/api/subscriptions/'+active+'?productCode=engage_stay';
  expect((await req(path,'owner-token','PATCH',{action:'CHANGE_PLAN',planId:premiumId})).status).toBe(200);
  expect((await req(path,'owner-token','PATCH',{action:'SUSPEND'})).status).toBe(200);
  expect((await req(path,'owner-token','PATCH',{action:'REACTIVATE'})).status).toBe(200);
  expect((await req(path,'owner-token','PATCH',{action:'RENEW',expiresAt:'2027-12-31T00:00:00.000Z'})).status).toBe(200);
  const saved=(await sql('SELECT id,plan_id,status,renewal_mode FROM subscriptions WHERE id=$1',[active]))[0];
  expect(saved).toMatchObject({id:active,plan_id:premiumId,status:'ACTIVE',renewal_mode:'MANUAL'});
  expect((await req(path,'owner-token','PATCH',{action:'CHANGE_PLAN'})).status).toBe(400);
 });
 it('writes an entitlement into PostgreSQL and rejects a mismatched product context',async()=>{
  const path='/api/customers/'+customerId+'/entitlements?productCode=engage_stay';
  expect((await req(path,'owner-token','POST',{productId:fitId,entitlementKey:'max_users',value:4,reason:'Wrong product'})).status).toBe(400);
  const created=await req(path,'owner-token','POST',{productId:stayId,entitlementKey:'max_users',value:25,reason:'Synthetic test approval'});
  expect(created.status).toBe(201);
  expect((await sql("SELECT value FROM entitlement_overrides WHERE customer_id=$1 AND product_id=$2 AND entitlement_key='max_users'",[customerId,stayId]))[0].value).toBe(25);
 });
 it('uses the durable ledger for replay-safe provisioning and audit consistency',async()=>{
  const key='ci-http-provision-'+randomUUID();
  const path='/api/customers/'+customerId+'/engagestay?productCode=engage_stay';
  const payload={action:'configure',plan:'basic',modules:['operations']};
  const call=()=>req(path,'owner-token','POST',payload,{'idempotency-key':key});
  const first=await call();expect(first.status).toBe(200);
  const countAfterFirst=externalCalls;
  const replay=await call();expect(replay.status).toBe(200);
  expect(externalCalls).toBe(countAfterFirst);
  expect((await replay.json()).idempotentReplay).toBe(true);
  const job=(await sql('SELECT * FROM provisioning_jobs WHERE product_id=$1 AND idempotency_key=$2',[stayId,key]))[0];
  expect(job.status).toBe('SUCCEEDED');
  expect(job.attempt_count).toBe(1);
  expect((await sql("SELECT count(*)::int AS n FROM audit_logs WHERE action='engagestay.configure' AND resource_id=$1",[customerId]))[0].n).toBeGreaterThan(0);
 });
 it('persists upstream failure, retries safely, and increments durable attempt count',async()=>{
  const key='ci-http-retry-'+randomUUID();
  const path='/api/customers/'+customerId+'/engagestay?productCode=engage_stay';
  const invoke=()=>req(path,'owner-token','POST',{action:'configure',plan:'basic'},{'idempotency-key':key});
  externalShouldFail=true;
  const error=await invoke();
  expect(error.status).toBe(503);
  const failed=(await sql('SELECT * FROM provisioning_jobs WHERE product_id=$1 AND idempotency_key=$2',[stayId,key]))[0];
  expect(failed.status).toBe('FAILED');
  expect(failed.attempt_count).toBe(1);
  externalShouldFail=false;
  const recovered=await invoke();
  expect(recovered.status).toBe(200);
  const saved=(await sql('SELECT * FROM provisioning_jobs WHERE id=$1',[failed.id]))[0];
  expect(saved.status).toBe('SUCCEEDED');
  expect(saved.attempt_count).toBe(2);
  expect(saved.id).toBe(failed.id);
  expect((await sql('SELECT count(*)::int AS n FROM provisioning_jobs WHERE product_id=$1 AND idempotency_key=$2',[stayId,key]))[0].n).toBe(1);
 });

});
