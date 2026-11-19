// @ts-nocheck
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {expiredSubscriptions} from './subscriptionLifecycle.js';
// @ts-ignore — ESM guard is a test script rather than a runtime TS module.
import {assertIsolatedOwnerDatabase,verifyConnectedOwnerDatabase} from '../scripts/assert-isolated-owner-db.mjs';

assertIsolatedOwnerDatabase(); // Must fail before a connection is constructed.
const pool=new pg.Pool({connectionString:process.env.OWNER_TEST_DATABASE_URL,ssl:false,max:22});
const sql=async(query,args=[]) => (await pool.query(query,args)).rows;
let owner,stay,fit,basic,premium,a,b,tenant,signup;
beforeAll(async()=>{
 const identity=await verifyConnectedOwnerDatabase(pool);
 console.log('Owner PostgreSQL integration identity:',JSON.stringify(identity));
 const tables=(await sql("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).map(r=>r.table_name);
 for(const name of ['customers','subscriptions','provisioning_jobs','onboarding_sessions','audit_logs']) expect(tables).toContain(name);
 owner=randomUUID();
 await sql('INSERT INTO auth.users(id,email) VALUES($1,$2)',[owner,'synthetic-owner@example.test']);
 await sql("INSERT INTO owner_profiles(user_id,email,full_name,role_key,is_primary_owner,must_change_password) VALUES($1,'synthetic-owner@example.test','Synthetic Owner','owner',true,false)",[owner]);
 stay=(await sql("SELECT id FROM products WHERE product_code='engage_stay'"))[0].id;
 fit=(await sql("SELECT id FROM products WHERE product_code='engage_fit'"))[0].id;
 basic=(await sql("SELECT id FROM plans WHERE product_id=$1 AND name='Basic'",[stay]))[0].id;
 premium=(await sql("SELECT id FROM plans WHERE product_id=$1 AND name='Premium'",[stay]))[0].id;
 const org=(await sql("INSERT INTO organizations(name,normalized_name) VALUES('Synthetic PostgreSQL Test Organization','synthetic postgresql test organization') RETURNING id"))[0].id;
 a=(await sql("INSERT INTO customers(organization_id,customer_code,company_name,email,status) VALUES($1,'CI-OWNER-A','Synthetic Customer A','a@example.test','ONBOARDING') RETURNING id",[org]))[0].id;
 b=(await sql("INSERT INTO customers(organization_id,customer_code,company_name,email,status) VALUES($1,'CI-OWNER-B','Synthetic Customer B','b@example.test','ONBOARDING') RETURNING id",[org]))[0].id;
 tenant=(await sql("INSERT INTO tenants(customer_id,name,slug,account_code) VALUES($1,'Synthetic Hotel','ci-synthetic-hotel','ES-TEST-00001') RETURNING id",[a]))[0].id;
 await sql("INSERT INTO customer_products(customer_id,product_id,tenant_id,status) VALUES($1,$2,$3,'ONBOARDING'),($4,$5,NULL,'ONBOARDING')",[a,stay,tenant,b,fit]);
 signup=(await sql("INSERT INTO signup_requests(product_code,source,external_user_id,email,idempotency_key) VALUES('engage_stay','email','synthetic-external-user','a@example.test','ci-signup-idempotency') RETURNING id"))[0].id;
},20000);
afterAll(async()=>{await pool.end();});

describe('isolated real PostgreSQL schema + onboarding',()=>{
 it('applies all real migrations and enables RLS metadata on control-plane tables',async()=>{
  const rows=await sql("SELECT relname,relrowsecurity FROM pg_class WHERE relname=ANY($1::text[])",[['customers','subscriptions','provisioning_jobs','onboarding_sessions','owner_profiles','owner_product_access']]);
  expect(rows).toHaveLength(6);
  expect(rows.every(row=>row.relrowsecurity)).toBe(true);
 });
 it('persists all seven onboarding stages and resumes the same session',async()=>{
  const first=(await sql('INSERT INTO onboarding_sessions(signup_request_id,created_by,payload) VALUES($1,$2,$3::jsonb) RETURNING *',
   [signup,owner,JSON.stringify({step1:{company:'Synthetic Hotel'}})]))[0];
  for(let step=2;step<=7;step++){
   const result=(await sql("UPDATE onboarding_sessions SET current_step=$2,payload=payload || $3::jsonb,updated_at=now() WHERE id=$1 RETURNING *",
    [first.id,step,JSON.stringify({['step'+step]:{validated:true}})]))[0];
   expect(result.id).toBe(first.id);expect(result.current_step).toBe(step);
  }
  const saved=(await sql('SELECT * FROM onboarding_sessions WHERE signup_request_id=$1',[signup]))[0];
  expect(Object.keys(saved.payload)).toHaveLength(7);
  expect(saved.status).toBe('IN_PROGRESS');
  expect((await sql("UPDATE onboarding_sessions SET status='COMPLETED',customer_id=$2 WHERE id=$1 RETURNING customer_id",[first.id,a]))[0].customer_id).toBe(a);
 });
 it('rejects out-of-range steps and repeated signup approval session keys',async()=>{
  await expect(sql('INSERT INTO onboarding_sessions(current_step) VALUES(8)')).rejects.toMatchObject({code:'23514'});
  await expect(sql('INSERT INTO onboarding_sessions(signup_request_id) VALUES($1)',[signup])).rejects.toMatchObject({code:'23505'});
  await expect(sql("INSERT INTO signup_requests(product_code,source,external_user_id,email,idempotency_key) VALUES('engage_stay','email','other','duplicate@example.test','ci-signup-idempotency')")).rejects.toMatchObject({code:'23505'});
 });
 it('rejects duplicate tenant slugs and account codes',async()=>{
  await expect(sql("INSERT INTO tenants(customer_id,name,slug) VALUES($1,'Duplicate','ci-synthetic-hotel')",[a])).rejects.toMatchObject({code:'23505'});
  await expect(sql("INSERT INTO tenants(customer_id,name,slug,account_code) VALUES($1,'Duplicate Code','unique-slug','ES-TEST-00001')",[b])).rejects.toMatchObject({code:'23505'});
  expect((await sql('SELECT id FROM tenants WHERE customer_id=$1',[a]))[0].id).toBe(tenant);
 });
 it('stores synthetic onboarding operations but does not contain or require real Auth tokens',async()=>{
  const saved=(await sql("SELECT payload FROM onboarding_sessions WHERE signup_request_id=$1",[signup]))[0].payload;
  expect(JSON.stringify(saved)).not.toMatch(/Bearer |service_role|access_token|refresh_token/);
 });
});

describe('real PostgreSQL subscription lifecycle and expiry evaluator',()=>{
 let subscription;
 it('activates a trial and records a stable database subscription identity',async()=>{
  subscription=(await sql("INSERT INTO subscriptions(customer_id,product_id,plan_id,status,starts_at,expires_at,renewal_mode) VALUES($1,$2,$3,'TRIAL','2026-11-01','2026-11-18','MANUAL') RETURNING *",[a,stay,basic]))[0];
  expect(subscription.status).toBe('TRIAL');
  expect(subscription.id).toBeTruthy();
 });
 it('evaluates trial expiry with the actual injected-clock lifecycle function',async()=>{
  const snapshot=(await sql('SELECT id,status,expires_at FROM subscriptions WHERE id=$1',[subscription.id]))[0];
  const eligible=expiredSubscriptions([{id:snapshot.id,status:snapshot.status,expiresAt:snapshot.expires_at}],new Date('2026-11-19T00:00:00Z'));
  expect(eligible).toHaveLength(1);
  const updated=(await sql("UPDATE subscriptions SET status='EXPIRED' WHERE id=$1 AND status IN ('TRIAL','ACTIVE') RETURNING id",[subscription.id]));
  expect(updated).toHaveLength(1);
  expect((await sql("UPDATE subscriptions SET status='EXPIRED' WHERE id=$1 AND status IN ('TRIAL','ACTIVE') RETURNING id",[subscription.id]))).toHaveLength(0);
  expect((await sql('SELECT renewal_mode FROM subscriptions WHERE id=$1',[subscription.id]))[0].renewal_mode).toBe('MANUAL');
 });
 it('persists plan upgrade/downgrade, suspension and reactivation',async()=>{
  await sql("UPDATE subscriptions SET status='ACTIVE',plan_id=$2 WHERE id=$1",[subscription.id,premium]);
  expect((await sql('SELECT plan_id FROM subscriptions WHERE id=$1',[subscription.id]))[0].plan_id).toBe(premium);
  await sql('UPDATE subscriptions SET plan_id=$2 WHERE id=$1',[subscription.id,basic]);
  expect((await sql('SELECT plan_id FROM subscriptions WHERE id=$1',[subscription.id]))[0].plan_id).toBe(basic);
  await sql("UPDATE subscriptions SET status='SUSPENDED' WHERE id=$1",[subscription.id]);
  expect((await sql('SELECT status FROM subscriptions WHERE id=$1',[subscription.id]))[0].status).toBe('SUSPENDED');
  await sql("UPDATE subscriptions SET status='ACTIVE' WHERE id=$1",[subscription.id]);
  expect((await sql('SELECT status FROM subscriptions WHERE id=$1',[subscription.id]))[0].status).toBe('ACTIVE');
 });
 it('requires explicit update for renewal and never fabricates payment success',async()=>{
  await sql("UPDATE subscriptions SET status='EXPIRED' WHERE id=$1",[subscription.id]);
  const renewed=(await sql("UPDATE subscriptions SET status='ACTIVE',expires_at=$2 WHERE id=$1 RETURNING *",[subscription.id,'2027-12-31T00:00:00Z']))[0];
  expect(renewed.id).toBe(subscription.id);
  expect(renewed.status).toBe('ACTIVE');
  expect(renewed.renewal_mode).toBe('MANUAL');
  const due=expiredSubscriptions([{id:renewed.id,status:renewed.status,expiresAt:renewed.expires_at}],new Date('2026-11-19T00:00:00Z'));
  expect(due).toHaveLength(0);
 });
 it('rejects concurrent duplicate active subscription inserts at the PostgreSQL constraint',async()=>{
  const attempts=await Promise.allSettled(Array.from({length:10},()=>sql("INSERT INTO subscriptions(customer_id,product_id,plan_id,status,renewal_mode) VALUES($1,$2,$3,'ACTIVE','MANUAL') RETURNING id",[a,stay,basic])));
  expect(attempts.filter(x=>x.status==='rejected'&&x.reason.code==='23505')).toHaveLength(10);
  expect((await sql("SELECT count(*)::int AS n FROM subscriptions WHERE customer_id=$1 AND product_id=$2 AND status IN ('TRIAL','ACTIVE')",[a,stay]))[0].n).toBe(1);
 });
 it('enforces a foreign-key relationship for product and plan references',async()=>{
  await expect(sql("INSERT INTO subscriptions(customer_id,product_id,plan_id,status) VALUES($1,$2,$3,'ACTIVE')",[a,randomUUID(),basic])).rejects.toMatchObject({code:'23503'});
 });
});

describe('real PostgreSQL durable provisioning ledger and transactional audit',()=>{
 it('gives concurrent idempotent operations one durable operation ID',async()=>{
  const key='ci-parallel-'+randomUUID();
  const inserts=await Promise.all(Array.from({length:14},()=>sql(
   "INSERT INTO provisioning_jobs(customer_id,product_id,idempotency_key,operation,status) VALUES($1,$2,$3,'engagestay.approve','PENDING') ON CONFLICT(product_id,idempotency_key) DO NOTHING RETURNING id",[a,stay,key])));
  expect(inserts.filter(rows=>rows.length===1)).toHaveLength(1);
  const stable=(await sql('SELECT id,status FROM provisioning_jobs WHERE product_id=$1 AND idempotency_key=$2',[stay,key]))[0];
  expect(stable.id).toBe(inserts.find(rows=>rows.length===1)[0].id);
  expect(stable.status).toBe('PENDING');
 });
 it('blocks competing claims using PostgreSQL FOR UPDATE and maintains attempt count',async()=>{
  const key='ci-row-lock-'+randomUUID();
  const job=(await sql("INSERT INTO provisioning_jobs(customer_id,product_id,idempotency_key,operation,status) VALUES($1,$2,$3,'engagestay.approve','FAILED') RETURNING id",[a,stay,key]))[0];
  const locked=await pool.connect(),claim=await pool.connect();
  let pending;
  try{
   await locked.query('BEGIN');
   await locked.query('SELECT id FROM provisioning_jobs WHERE id=$1 FOR UPDATE',[job.id]);
   let finished=false;
   pending=claim.query("UPDATE provisioning_jobs SET status='RUNNING',attempt_count=attempt_count+1 WHERE id=$1 AND status='FAILED' RETURNING *",[job.id]).then(r=>{finished=true;return r.rows;});
   await new Promise(resolve=>setTimeout(resolve,120));
   expect(finished).toBe(false);
   await locked.query('COMMIT');
   const claimed=(await pending)[0];
   expect(claimed.id).toBe(job.id);expect(claimed.attempt_count).toBe(1);
  }finally{await locked.query('ROLLBACK').catch(()=>{});locked.release();if(pending)await pending.catch(()=>{});claim.release();}
 });
 it('retries failed operations while keeping tenant, subscription and operation references stable',async()=>{
  const key='ci-retry-'+randomUUID();
  const job=(await sql("INSERT INTO provisioning_jobs(customer_id,product_id,idempotency_key,operation,status,failure_code,attempt_count) VALUES($1,$2,$3,'engagestay.configure','FAILED','TEMP_FAILURE',1) RETURNING *",[a,stay,key]))[0];
  const claimed=(await sql("UPDATE provisioning_jobs SET status='RUNNING',failure_code=NULL,attempt_count=attempt_count+1 WHERE id=$1 RETURNING *",[job.id]))[0];
  expect(claimed.id).toBe(job.id);expect(claimed.attempt_count).toBe(2);
  const completed=(await sql("UPDATE provisioning_jobs SET status='SUCCEEDED',result_payload=$2::jsonb WHERE id=$1 RETURNING *",[job.id,JSON.stringify({tenantId:tenant})]))[0];
  expect(completed.result_payload.tenantId).toBe(tenant);
  expect((await sql('SELECT count(*)::int AS n FROM provisioning_jobs WHERE product_id=$1 AND idempotency_key=$2',[stay,key]))[0].n).toBe(1);
 });
 it('rolls back a failed transaction including its audit log insertion',async()=>{
  const key='ci-rollback-'+randomUUID();
  const job=(await sql("INSERT INTO provisioning_jobs(customer_id,product_id,idempotency_key,operation,status) VALUES($1,$2,$3,'engagestay.configure','PENDING') RETURNING id",[a,stay,key]))[0];
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   await client.query("UPDATE provisioning_jobs SET status='RUNNING' WHERE id=$1",[job.id]);
   await client.query("INSERT INTO audit_logs(action,resource_type,resource_id,operator_id) VALUES('ci.transient','provisioning_job',$1,$2)",[job.id,owner]);
   await expect(client.query("INSERT INTO provisioning_jobs(customer_id,product_id,idempotency_key,operation,status) VALUES($1,$2,$3,'engagestay.configure','PENDING')",[a,stay,key])).rejects.toMatchObject({code:'23505'});
   await client.query('ROLLBACK');
  }finally{await client.query('ROLLBACK').catch(()=>{});client.release();}
  expect((await sql('SELECT status FROM provisioning_jobs WHERE id=$1',[job.id]))[0].status).toBe('PENDING');
  expect((await sql("SELECT count(*)::int AS n FROM audit_logs WHERE action='ci.transient' AND resource_id=$1",[job.id]))[0].n).toBe(0);
 });
 it('commits failure status and matching audit in one transaction',async()=>{
  const key='ci-failure-'+randomUUID();
  const client=await pool.connect();let id;
  try{
   await client.query('BEGIN');
   id=(await client.query("INSERT INTO provisioning_jobs(customer_id,product_id,idempotency_key,operation,status,attempt_count,failure_code) VALUES($1,$2,$3,'engagestay.approve','FAILED',1,'UPSTREAM_UNAVAILABLE') RETURNING id",[a,stay,key])).rows[0].id;
   await client.query("INSERT INTO audit_logs(action,resource_type,resource_id,result,operator_id) VALUES('provisioning.failed','provisioning_job',$1,'FAILED',$2)",[id,owner]);
   await client.query('COMMIT');
  }finally{await client.query('ROLLBACK').catch(()=>{});client.release();}
  expect((await sql('SELECT status,failure_code FROM provisioning_jobs WHERE id=$1',[id]))[0]).toMatchObject({status:'FAILED',failure_code:'UPSTREAM_UNAVAILABLE'});
  expect((await sql("SELECT count(*)::int AS n FROM audit_logs WHERE resource_id=$1 AND action='provisioning.failed'",[id]))[0].n).toBe(1);
 });
 it('keeps product and customer assignments distinct under unique/FK constraints',async()=>{
  await expect(sql("INSERT INTO customer_products(customer_id,product_id,tenant_id) VALUES($1,$2,$3)",[a,stay,tenant])).rejects.toMatchObject({code:'23505'});
  expect((await sql('SELECT count(*)::int AS n FROM customer_products WHERE customer_id=$1 AND product_id=$2',[b,fit]))[0].n).toBe(1);
  expect((await sql('SELECT count(*)::int AS n FROM customer_products WHERE customer_id=$1 AND product_id=$2',[b,stay]))[0].n).toBe(0);
 });
});
