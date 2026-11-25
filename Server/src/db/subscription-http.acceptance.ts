import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { Server } from 'node:http';
import pg from 'pg';

const ownerUrl = process.env.DATABASE_URL;
const stayUrl = process.env.ENGAGE_TEST_DATABASE_URL;
const stayDirectory = resolve(process.env.STAY_CHECKOUT || 'engage-stay');
const require = createRequire(resolve(stayDirectory, 'server.js'));
require('./scripts/assert-isolated-test-db').assertIsolatedTestDatabase();
for (const [value, database] of [[ownerUrl, 'owner_test'], [stayUrl, 'engage_stay_test']]) {
  const parsed = new URL(value || '');
  assert.equal(parsed.protocol, 'postgresql:');
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.pathname, '/' + database);
}
const owner = new pg.Pool({ connectionString: ownerUrl });
const stay = new pg.Pool({ connectionString: stayUrl });
const originalFetch = globalThis.fetch;
const secret = randomBytes(32).toString('hex');
const customer = randomUUID();
const tenant = randomUUID();
const session = randomBytes(32).toString('hex');
const servers: Server[] = [];
let closeStayDatabase: (() => Promise<void>) | undefined;
const listen = async (app: { listen: Function }) => {
  const server = await new Promise<Server>(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  servers.push(server);
  return 'http://127.0.0.1:' + (server.address() as {port:number}).port;
};
try {
  process.env.NODE_ENV = 'test';
  process.env.ENGAGE_OWNER_SERVICE_TOKEN = secret;
  process.env.SUPABASE_URL = 'https://owner-db-fixture.invalid';
  process.env.SUPABASE_ANON_KEY = randomUUID();
  process.env.SUPABASE_SECRET_KEY = randomUUID();
  process.env.DATABASE_URL = stayUrl;
  const stayApp = require('./server.js');
  closeStayDatabase = require('./src/db').closeDatabase;
  const stayOrigin = await listen(stayApp);
  process.env.DATABASE_URL = ownerUrl;
  process.env.ENGAGE_STAY_API_ORIGIN = stayOrigin;
  const { app } = await import('../app.js');
  let ownerOrigin = await listen(app);

  // Adapt the hosted Data API boundary to disposable PostgreSQL. The worker's
  // request to the actual Stay server always uses real loopback HTTP.
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname !== 'owner-db-fixture.invalid') return originalFetch(input, init);
    if (url.pathname.endsWith('/rpc/claim_stay_subscription_delivery')) {
      return Response.json((await owner.query('select * from claim_stay_subscription_delivery()')).rows);
    }
    if (url.pathname.endsWith('/subscription_sync_outbox') && init?.method === 'PATCH') {
      const args = JSON.parse(String(init.body));
      const revision = url.searchParams.get('revision')?.slice(3);
      const attempt = url.searchParams.get('attempts')?.slice(3);
      return Response.json((await owner.query(
        `update subscription_sync_outbox set state=$3,last_error=$4,delivered_at=$5,next_attempt_at=$6
         where revision=$1 and attempts=$2 and state='PENDING' returning revision`,
        [revision, attempt, args.state, args.last_error, args.delivered_at, args.next_attempt_at],
      )).rows);
    }
    throw new Error('Unexpected fixture Data API request');
  };
  const { rows: [plan] } = await owner.query(`select p.id,p.product_id from plans p join products r on r.id=p.product_id
    where r.product_code='engage_stay' and p.name='Basic'`);
  await owner.query("insert into customers(id,customer_code,company_name,email) values($1,'HTTP-CI','Synthetic HTTP','http@example.test')", [customer]);
  await owner.query("insert into tenants(id,customer_id,name,slug) values($1,$2,'Synthetic','http-ci')", [tenant, customer]);
  await owner.query('insert into customer_products(customer_id,product_id,tenant_id) values($1,$2,$3)', [customer, plan.product_id, tenant]);
  await stay.query("insert into property(id,name,code) values(9001,'Synthetic HTTP','http-ci')");
  await stay.query(`insert into "user"(id,"propertyId",name,email,role) values(9001,9001,'Synthetic','http@example.test','ADMIN')`);
  await stay.query("insert into engagestay_managed_workspace(property_id,customer_id,status,plan) values(9001,$1,'suspended','basic')", [customer]);
  await stay.query("insert into friday_sessions(token_hash,user_id,expires_at) values($1,9001,now()+interval '1 hour')", [createHash('sha256').update(session).digest('hex')]);
  await owner.query(`insert into payment_transactions(customer_id,product_id,plan_id,provider,provider_order_id,amount_minor,currency,status,idempotency_key,metadata)
    values($1,$2,$3,'RAZORPAY','order_http',10000,'INR','CREATED','http-ci','{"priceId":"fixture","billingPeriod":"MONTHLY"}')`, [customer,plan.product_id,plan.id]);
  const { rows: [{ id }] } = await owner.query("select activate_verified_checkout('order_http','pay_http',10000,'INR') as id");
  const deliver = () => originalFetch(ownerOrigin + '/internal/subscriptions/deliver', { method:'POST',headers:{Authorization:'Bearer '+secret} });
  const access = () => originalFetch(stayOrigin + '/api/auth/session', { headers:{Cookie:'friday_session='+session} });
  assert.equal((await access()).status, 403);
  assert.equal((await originalFetch(ownerOrigin + '/internal/subscriptions/deliver', { method:'POST' })).status, 401);
  process.env.ENGAGE_STAY_API_ORIGIN = 'http://127.0.0.1:1';
  assert.deepEqual(await (await deliver()).json(), { outcome:'PENDING' });
  const failed = (await owner.query('select attempts,last_error,next_attempt_at>now() as backed_off from subscription_sync_outbox')).rows[0];
  assert.deepEqual(failed, { attempts:1,last_error:'transport',backed_off:true });
  assert.deepEqual(await (await deliver()).json(), { outcome:'idle' });
  const oldListener = servers.pop()!;
  await new Promise<void>(resolve => oldListener.close(() => resolve()));
  ownerOrigin = await listen(app);
  process.env.ENGAGE_STAY_API_ORIGIN = stayOrigin;
  await owner.query("update subscription_sync_outbox set next_attempt_at=now()-interval '1 second'");
  assert.deepEqual(await (await deliver()).json(), { outcome:'DELIVERED' });
  assert.equal((await access()).status, 200);
  assert.equal((await stay.query('select owner_tenant_id from engagestay_managed_workspace where property_id=9001')).rows[0].owner_tenant_id, tenant);
  await owner.query("update subscriptions set status='SUSPENDED' where id=$1", [id]);
  assert.deepEqual(await (await deliver()).json(), { outcome:'DELIVERED' });
  assert.equal((await access()).status, 403);
  await owner.query("update subscriptions set status='ACTIVE' where id=$1", [id]);
  assert.deepEqual(await (await deliver()).json(), { outcome:'DELIVERED' });
  assert.equal((await access()).status, 200);
  await owner.query("update subscriptions set expires_at=now()-interval '1 second' where id=$1", [id]);
  assert.deepEqual(await (await deliver()).json(), { outcome:'DELIVERED' });
  assert.equal((await access()).status, 403);
  console.log('Cross-service HTTP acceptance passed (activation, suspension, reactivation, expiry).');
} finally {
  globalThis.fetch = originalFetch;
  await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  await Promise.all([owner.end(), stay.end(), closeStayDatabase?.()]);
  process.exitCode ??= 0;
}
