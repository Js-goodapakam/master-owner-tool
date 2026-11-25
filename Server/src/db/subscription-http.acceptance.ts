import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
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
const operator = randomUUID();
const operatorToken = randomUUID();
const tenant = randomUUID();
const session = randomBytes(32).toString('hex');
const servers: Server[] = [];
const workers = new Set<ChildProcess>();
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
  process.env.RAZORPAY_WEBHOOK_SECRET = randomUUID();
  process.env.RAZORPAY_KEY_ID = 'rzp_test_fixture';
  process.env.RAZORPAY_KEY_SECRET = randomUUID();
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
    if (url.origin === 'https://api.razorpay.com') {
      assert.equal(url.pathname, '/v1/payments/pay_http');
      return Response.json({ id:'pay_http', order_id:'order_http', amount:10000, currency:'INR', status:'captured' });
    }
    if (url.hostname !== 'owner-db-fixture.invalid') return originalFetch(input, init);
    if (url.pathname === '/auth/v1/user') {
      return new Headers(init?.headers).get('authorization') === 'Bearer '+operatorToken
        ? Response.json({id:operator,email:'billing@example.test'}) : new Response(null,{status:401});
    }
    if (url.pathname.endsWith('/owner_profiles')) return Response.json((await owner.query('select * from owner_profiles where user_id=$1',[operator])).rows);
    if (url.pathname.endsWith('/owner_role_permissions')) return Response.json([{permission_key:'billing.manage'}]);
    if (url.pathname.endsWith('/products')) return Response.json((await owner.query('select * from products')).rows);
    if (url.pathname.endsWith('/product_modules') || url.pathname.endsWith('/product_features')) return Response.json([]);
    if (url.pathname.endsWith('/customer_products')) return Response.json((await owner.query('select * from customer_products where customer_id=$1 and product_id=$2',
      [url.searchParams.get('customer_id')?.slice(3),url.searchParams.get('product_id')?.slice(3)])).rows);
    if (url.pathname.endsWith('/subscription_sync_outbox') && !init?.method) return Response.json((await owner.query(
      'select revision::text,tenant_id,state from subscription_sync_outbox where customer_id=$1 and product_id=$2 order by revision desc limit 1',
      [url.searchParams.get('customer_id')?.slice(3),url.searchParams.get('product_id')?.slice(3)])).rows);
    if (url.pathname.endsWith('/rpc/requeue_stale_subscription')) {
      const a=JSON.parse(String(init?.body));
      return Response.json((await owner.query('select requeue_stale_subscription($1,$2,$3,$4,$5,$6) as ok',
        [a.p_revision,a.p_customer,a.p_product,a.p_tenant,a.p_remote,a.p_actor])).rows[0].ok);
    }
    if (url.pathname.endsWith('/payment_transactions')) {
      return Response.json((await owner.query('select * from payment_transactions where provider_order_id=$1',
        [url.searchParams.get('provider_order_id')?.slice(3)])).rows);
    }
    if (url.pathname.endsWith('/rpc/activate_verified_checkout')) {
      const args = JSON.parse(String(init?.body));
      return Response.json((await owner.query('select activate_verified_checkout($1,$2,$3,$4) as id',
        [args.p_order,args.p_payment,args.p_amount,args.p_currency])).rows[0].id);
    }
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
  let crashBeforeAck: (() => void) | undefined;
  const dataFixture = await listen(createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      if (req.method === 'PATCH' && crashBeforeAck) {
        crashBeforeAck();
        crashBeforeAck = undefined;
        return; // The child is killed with its acknowledgment still outstanding.
      }
      const response = await globalThis.fetch('https://owner-db-fixture.invalid' + req.url, {
        method: req.method, body: chunks.length ? Buffer.concat(chunks).toString() : undefined,
      });
      res.writeHead(response.status, { 'content-type':'application/json' }).end(await response.text());
    } catch { res.writeHead(500).end(); }
  }));
  const startWorker = async (target: string) => {
    const child = fork(fileURLToPath(new URL('./subscription-worker.fixture.ts', import.meta.url)), [], {
      execArgv: ['--import','tsx'],
      env: { ...process.env, SUPABASE_URL:dataFixture, ENGAGE_STAY_API_ORIGIN:target },
    });
    workers.add(child);
    const port = await Promise.race([
      once(child,'message').then(([port]) => port),
      once(child,'exit').then(([code]) => { throw new Error('Worker exited during startup: ' + code); }),
    ]);
    return {
      deliver: () => originalFetch('http://127.0.0.1:' + port + '/internal/subscriptions/deliver', {
        method:'POST',headers:{Authorization:'Bearer '+secret},signal:AbortSignal.timeout(15000),
      }),
      stop: async () => {
        const exited = once(child,'exit');
        child.kill();
        await exited;
        workers.delete(child);
      },
    };
  };
  const { rows: [plan] } = await owner.query(`select p.id,p.product_id from plans p join products r on r.id=p.product_id
    where r.product_code='engage_stay' and p.name='Basic'`);
  await owner.query("insert into customers(id,customer_code,company_name,email) values($1,'HTTP-CI','Synthetic HTTP','http@example.test')", [customer]);
  await owner.query('insert into auth.users(id) values($1)',[operator]);
  await owner.query("insert into owner_profiles(user_id,email,full_name,role_key,must_change_password) values($1,'billing@example.test','Synthetic Billing','owner',false)",[operator]);
  await owner.query("insert into tenants(id,customer_id,name,slug) values($1,$2,'Synthetic','http-ci')", [tenant, customer]);
  await owner.query('insert into customer_products(customer_id,product_id,tenant_id) values($1,$2,$3)', [customer, plan.product_id, tenant]);
  await stay.query("insert into property(id,name,code) values(9001,'Synthetic HTTP','http-ci')");
  await stay.query(`insert into "user"(id,"propertyId",name,email,role) values(9001,9001,'Synthetic','http@example.test','ADMIN')`);
  await stay.query("insert into engagestay_managed_workspace(property_id,customer_id,status,plan) values(9001,$1,'suspended','basic')", [customer]);
  await stay.query("insert into friday_sessions(token_hash,user_id,expires_at) values($1,9001,now()+interval '1 hour')", [createHash('sha256').update(session).digest('hex')]);
  await owner.query(`insert into payment_transactions(customer_id,product_id,plan_id,provider,provider_order_id,amount_minor,currency,status,idempotency_key,metadata)
    values($1,$2,$3,'RAZORPAY','order_http',10000,'INR','CREATED','http-ci','{"priceId":"fixture","billingPeriod":"MONTHLY"}')`, [customer,plan.product_id,plan.id]);
  const payload = JSON.stringify({ event:'payment.captured', payload:{ payment:{ entity:{ id:'pay_http', order_id:'order_http' } } } });
  const signature = createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(payload).digest('hex');
  const capture = () => originalFetch(ownerOrigin + '/webhooks/razorpay', { method:'POST', body:payload,
    headers:{ 'content-type':'application/json', 'x-razorpay-signature':signature } });
  const captured = await capture();
  assert.equal(captured.status, 200);
  const { subscriptionId: id } = await captured.json();
  assert.equal((await (await capture()).json()).subscriptionId, id);
  assert.equal((await owner.query('select count(*)::int as count from subscription_sync_outbox')).rows[0].count, 1);
  const deliver = () => originalFetch(ownerOrigin + '/internal/subscriptions/deliver', { method:'POST',headers:{Authorization:'Bearer '+secret} });
  const access = () => originalFetch(stayOrigin + '/api/auth/session', { headers:{Cookie:'friday_session='+session} });
  assert.equal((await access()).status, 403);
  assert.equal((await originalFetch(ownerOrigin + '/internal/subscriptions/deliver', { method:'POST' })).status, 401);
  const offline = await startWorker('http://127.0.0.1:1');
  assert.deepEqual(await (await offline.deliver()).json(), { outcome:'PENDING' });
  const failed = (await owner.query('select attempts,last_error,next_attempt_at>now() as backed_off from subscription_sync_outbox')).rows[0];
  assert.deepEqual(failed, { attempts:1,last_error:'transport',backed_off:true });
  assert.deepEqual(await (await deliver()).json(), { outcome:'idle' });
  await offline.stop();
  const firstWorker = await startWorker(stayOrigin);
  const secondWorker = await startWorker(stayOrigin);
  await owner.query("update subscription_sync_outbox set next_attempt_at=now()-interval '1 second'");
  const ackIntercepted = new Promise<void>(resolve => { crashBeforeAck = resolve; });
  const interrupted = firstWorker.deliver().then(() => false, () => true);
  await Promise.race([ackIntercepted, interrupted.then(() => { throw new Error('Worker did not reach acknowledgment'); })]);
  assert.equal((await access()).status, 200);
  assert.deepEqual(await (await secondWorker.deliver()).json(), { outcome:'idle' });
  await firstWorker.stop();
  assert.equal(await interrupted, true);
  await owner.query("update subscription_sync_outbox set next_attempt_at=now()-interval '1 second'");
  const recovered = await Promise.all([secondWorker.deliver(), deliver()].map(async result => (await (await result).json()).outcome));
  assert.deepEqual(recovered.sort(), ['DELIVERED','idle']);
  await secondWorker.stop();
  assert.deepEqual((await owner.query('select attempts,state from subscription_sync_outbox')).rows, [{attempts:3,state:'DELIVERED'}]);
  const compare = (requestedTenant: string, bearer: string) => originalFetch(stayOrigin + '/api/internal/managed-workspaces/' + customer, {
    method:'POST', headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},
    body:JSON.stringify({action:'subscription_revision',productCode:'engage_stay',tenantId:requestedTenant}),
  });
  assert.equal((await compare(tenant, randomUUID())).status, 401);
  assert.equal((await compare(randomUUID(), secret)).status, 409);
  const deliveredRevision = (await owner.query('select revision::text from subscription_sync_outbox')).rows[0].revision;
  assert.deepEqual(await (await compare(tenant, secret)).json(), {revision:deliveredRevision});
  await stay.query("update engagestay_managed_workspace set subscription_revision=0,status='suspended' where property_id=9001");
  const reconcile = (id = customer, token = operatorToken) => originalFetch(ownerOrigin + '/api/billing/customers/' + id + '/reconcile-subscription?productCode=engage_stay',
    {method:'POST',headers:{Authorization:'Bearer '+token}});
  assert.equal((await reconcile(customer,randomUUID())).status,401);
  assert.equal((await reconcile(randomUUID())).status,404);
  assert.deepEqual(await (await reconcile()).json(),{outcome:'requeued'});
  assert.deepEqual(await (await deliver()).json(),{outcome:'DELIVERED'});
  assert.deepEqual(await (await compare(tenant,secret)).json(),{revision:deliveredRevision});
  assert.deepEqual(await (await reconcile()).json(),{outcome:'current'});
  assert.equal((await originalFetch(ownerOrigin + '/api/billing/subscription-delivery/' + deliveredRevision + '/recover?productCode=engage_stay', {method:'POST'})).status, 401);
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
  for (const child of workers) child.kill();
  globalThis.fetch = originalFetch;
  await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  await Promise.all([owner.end(), stay.end(), closeStayDatabase?.()]);
  process.exitCode ??= 0;
}
