import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { authenticate, authorize } from './auth.js';
import { createLocalDemoSession, isLocalDemoEnabled, isLoopbackRequest } from './localAuth.js';
import {
  addAudit,
  audit,
  customers,
  plans,
  products,
  signupRequests,
  ownerUsers,
  ids,
} from './store.js';
import {
  MockDeploymentProvider,
  MockInfrastructureProvider,
} from './providers.js';

export const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = process.env.CORS_ORIGIN?.split(',') || [
        'http://localhost:5173',
        'http://localhost:5174',
      ];

      callback(null, !origin || allowed.includes(origin));
    },
  }),
);

app.use(express.json({ limit: '12mb' }));

// Supabase privileged operations are server-only. Never expose these keys to the browser.
const roleKeys: Record<string, string> = {
  Owner: 'owner',
  'Super Admin': 'super_admin',
  Admin: 'admin',
  Operations: 'operations',
  Support: 'support',
  Finance: 'finance',
  'Infrastructure Admin': 'infrastructure_admin',
  Viewer: 'viewer',
};
const roleNames = Object.fromEntries(Object.entries(roleKeys).map(([name, key]) => [key, name]));

function supabaseAdminKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}
function supabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && supabaseAdminKey());
}
function hasOwnerServiceAuthorization(req: express.Request): boolean {
  const token = process.env.ENGAGE_OWNER_SERVICE_TOKEN;
  const supplied = req.get('authorization') || '';
  if (!token || token.length < 32) return false;
  return timingSafeEqual(
    createHash('sha256').update(supplied).digest(),
    createHash('sha256').update(`Bearer ${token}`).digest(),
  );
}
async function supabaseAdmin(path: string, init: RequestInit = {}) {
  const base = process.env.SUPABASE_URL;
  const key = supabaseAdminKey();
  if (!base || !key) throw new Error('Missing SUPABASE_URL or server-only SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY.');
  return fetch(`${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
}
async function ownerProfileById(userId: string) {
  const response = await supabaseAdmin(`/rest/v1/owner_profiles?select=user_id,email,full_name,role_key,must_change_password,is_primary_owner,is_active,created_at&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
  if (!response.ok) throw new Error(`Could not read employee profile (${response.status}).`);
  const rows = await response.json() as Array<Record<string, any>>;
  return rows[0] || null;
}

type RegistryProductRow = {
  id: string;
  product_code: string;
  name: string;
  description: string | null;
  version: string | null;
  status: string;
  category: string | null;
  commercial_status: string;
  adapter_status: string;
};

type RegistryModuleRow = {
  product_id: string;
  name: string;
  status: string;
  implementation_state: string;
};

type RegistryFeatureRow = {
  product_id: string;
  name: string;
  status: string;
  implementation_state: string;
};

/**
 * The product registry is platform data. In a connected environment it must
 * come from Supabase; the in-memory data may only be used by the explicitly
 * local demo configuration.
 */
async function loadProductRegistry() {
  if (!supabaseConfigured()) return products;

  const [productResponse, moduleResponse, featureResponse] = await Promise.all([
    supabaseAdmin('rest/v1/products?select=id,product_code,name,description,version,status,category,commercial_status,adapter_status&order=name'),
    supabaseAdmin('rest/v1/product_modules?select=product_id,name,status,implementation_state&order=name'),
    supabaseAdmin('rest/v1/product_features?select=product_id,name,status,implementation_state&order=name'),
  ]);

  if (!productResponse.ok || !moduleResponse.ok || !featureResponse.ok) {
    throw new Error('Could not load the platform product registry.');
  }

  const registryProducts = await productResponse.json() as RegistryProductRow[];
  const registryModules = await moduleResponse.json() as RegistryModuleRow[];
  const registryFeatures = await featureResponse.json() as RegistryFeatureRow[];

  return registryProducts.map((product) => ({
    id: product.id,
    code: product.product_code,
    name: product.name,
    description: product.description || '',
    version: product.version || 'unreleased',
    // A product is only operational when the adapter has been verified. This
    // prevents the UI from overstating the state of a planned application.
    status: product.adapter_status === 'HEALTHY' ? product.status : product.adapter_status,
    commercialStatus: product.commercial_status,
    category: product.category,
    modules: registryModules
      .filter((module) => module.product_id === product.id)
      .map((module) => `${module.name} (${module.status.toLowerCase()})`),
    features: registryFeatures
      .filter((feature) => feature.product_id === product.id)
      .map((feature) => `${feature.name} (${feature.status.toLowerCase()})`),
  }));
}

async function allowedProductCodes(actor: Express.Request['actor']): Promise<string[] | null> {
  if (!actor || actor.roleKey === 'owner' || actor.roleKey === 'super_admin') return null;
  if (!supabaseConfigured()) return [];
  const response = await supabaseAdmin(`rest/v1/owner_product_access?select=products(product_code)&owner_user_id=eq.${encodeURIComponent(actor.id)}&is_active=eq.true`);
  if (!response.ok) throw new Error('Could not load product access.');
  return (await response.json() as Array<{ products?: { product_code?: string } }>).map(row => row.products?.product_code).filter((code): code is string => Boolean(code));
}
async function requireProductAccess(req: express.Request, response: express.Response, code: string): Promise<boolean> {
  const allowed = await allowedProductCodes(req.actor);
  if (allowed === null || allowed.includes(code)) return true;
  response.status(403).json({ error: 'PRODUCT_ACCESS_DENIED', message: 'You are not authorized to access this application.' });
  return false;
}
function can(req: express.Request, permission: string): boolean {
  return Boolean((req as any).actor?.permissions?.includes(permission));
}

type CustomerDatabaseRow = {
  id: string;
  customer_code: string;
  company_name: string;
  legal_name: string | null;
  display_name: string | null;
  email: string;
  phone: string | null;
  industry: string | null;
  status: string;
  account_owner: string | null;
  created_at: string;
  city: string | null;
  country: string | null;
};

function toCustomer(row: CustomerDatabaseRow) {
  return {
    id: row.id,
    customerId: row.customer_code,
    companyName: row.display_name || row.company_name,
    legalName: row.legal_name || row.company_name,
    email: row.email,
    phone: row.phone || undefined,
    industry: row.industry || 'Other',
    status: row.status,
    accountOwner: row.account_owner || 'Unassigned',
    createdAt: row.created_at,
    city: row.city || undefined,
    country: row.country || undefined,
  };
}

async function loadCustomers() {
  if (!supabaseConfigured()) return customers;
  const response = await supabaseAdmin(
    'rest/v1/customers?select=id,customer_code,company_name,legal_name,display_name,email,phone,industry,status,account_owner,created_at,city,country&order=created_at.desc',
  );
  if (!response.ok) throw new Error('Could not load the customer registry.');
  return (await response.json() as CustomerDatabaseRow[]).map(toCustomer);
}

async function loadCustomer(customerId: string) {
  if (!supabaseConfigured()) return customers.find((customer) => customer.id === customerId) || null;
  const response = await supabaseAdmin(
    `rest/v1/customers?select=id,customer_code,company_name,legal_name,display_name,email,phone,industry,status,account_owner,created_at,city,country&id=eq.${encodeURIComponent(customerId)}&limit=1`,
  );
  if (!response.ok) throw new Error('Could not load the customer record.');
  const rows = await response.json() as CustomerDatabaseRow[];
  return rows[0] ? toCustomer(rows[0]) : null;
}

async function recordPlatformAudit(
  req: express.Request,
  action: string,
  resourceType: string,
  resourceId: string,
  beforeValue?: unknown,
  afterValue?: unknown,
) {
  if (!supabaseConfigured()) {
    addAudit(action, resourceType, resourceId, beforeValue, afterValue);
    return;
  }
  const operatorId = (req as any).actor?.id;
  const response = await supabaseAdmin('/rest/v1/audit_logs', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      operator_id: operatorId && operatorId !== 'demo-user' ? operatorId : null,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      before_value: beforeValue || null,
      after_value: afterValue || null,
      correlation_id: randomUUID(),
      result: 'SUCCESS',
    }),
  });
  if (!response.ok) throw new Error('The requested operation succeeded but its audit record could not be written.');
}

app.get('/health', (_q, r) =>
  r.json({
    status: 'ok',
    mode: process.env.DATABASE_URL ? 'database' : 'demo',
  }),
);

// This exposes configuration state only; credentials are never returned to the
// browser. It lets the control plane show an honest integration status rather
// than claiming that EngageStay is connected when no service connection exists.
app.get('/api/public/integration-status', async (_q, r) => {
  const origin = process.env.ENGAGE_STAY_API_ORIGIN;
  const token = process.env.ENGAGE_OWNER_SERVICE_TOKEN;
  if (!origin || !token) {
    return r.json({ configured: false, reachable: false, message: 'EngageStay service URL and shared token are required.' });
  }
  try {
    const response = await fetch(new URL('/api/health', origin), { signal: AbortSignal.timeout(5000) });
    return r.json({
      configured: true,
      reachable: response.ok,
      origin: new URL(origin).origin,
      message: response.ok ? 'EngageStay service is reachable.' : `EngageStay health check returned ${response.status}.`,
    });
  } catch {
    return r.json({ configured: true, reachable: false, origin: new URL(origin).origin, message: 'EngageStay service could not be reached.' });
  }
});

app.post('/api/auth/login', async (q, r) => {
  if (isLocalDemoEnabled()) {
    if (!isLoopbackRequest(q)) {
      return r.status(403).json({ error: 'LOCAL_ONLY' });
    }

    const { email, password } = q.body || {};

    if (typeof email !== 'string' || typeof password !== 'string') {
      return r.status(400).json({
        error: 'VALIDATION',
        message: 'Email and password are required.'
      });
    }

    const session = createLocalDemoSession(q, email, password);

    if (!session) {
      return r.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid local credentials.'
      });
    }

    return r.status(200).json(session);
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return r.status(501).json({ error: 'AUTH_NOT_CONFIGURED', message: 'Set Supabase Auth environment variables; local demo uses X-Demo-Role.' });
  }
  const { email, password } = q.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return r.status(400).json({ error: 'VALIDATION', message: 'Email and password are required.' });
  }
  const response = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json() as Record<string, any>;
  if (!response.ok) return r.status(response.status).json(payload);

  // Return the password-change flag so the client can route the employee to the change-password screen.
  if (supabaseConfigured() && payload.user?.id) {
    try {
      const profile = await ownerProfileById(String(payload.user.id));
      payload.must_change_password = Boolean(profile?.must_change_password);
    } catch (error) {
      console.error('Could not load password-change status after login:', error);
      return r.status(503).json({ error: 'PROFILE_LOOKUP_FAILED', message: 'Signed in, but Friday Owner profile status could not be checked.' });
    }
  }
  return r.status(200).json(payload);
});

// This endpoint is intentionally registered before the password-change gate.
// It updates the password through the user's own Supabase session, then clears the server-side flag.
app.post('/api/auth/change-password', authenticate, async (q, r) => {
  const actor = (q as any).actor;
  const token = q.header('authorization')?.replace(/^Bearer\s+/i, '');
  const password = q.body?.password;
  if (!token || !actor?.id || typeof password !== 'string' || password.length < 8) {
    return r.status(400).json({ error: 'VALIDATION', message: 'A valid session and a new password of at least 8 characters are required.' });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !supabaseConfigured()) {
    return r.status(503).json({ error: 'AUTH_NOT_CONFIGURED', message: 'Supabase Auth admin configuration is missing.' });
  }
  const updatePassword = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
    method: 'PUT',
    headers: { apikey: process.env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!updatePassword.ok) {
    const detail = await updatePassword.json().catch(() => ({}));
    return r.status(updatePassword.status).json({ error: 'PASSWORD_UPDATE_FAILED', detail });
  }
  const profileUpdate = await supabaseAdmin(`/rest/v1/owner_profiles?user_id=eq.${encodeURIComponent(String(actor.id))}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ must_change_password: false, last_password_change_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  });
  if (!profileUpdate.ok) {
    console.error('Password changed but profile flag could not be cleared:', await profileUpdate.text());
    return r.status(503).json({ error: 'PASSWORD_CHANGED_FLAG_UPDATE_FAILED', message: 'Password was updated, but the account status could not be updated. Contact the administrator before continuing.' });
  }
  return r.json({ success: true, must_change_password: false, message: 'Password changed successfully.' });
});

app.use('/api', authenticate);

// Employees using a temporary password may only call the password-change endpoint.
app.use('/api', (q, r, next) => {
  const actor = (q as any).actor;
  if (actor?.mustChangePassword && q.path !== '/auth/change-password') {
    return r.status(403).json({ error: 'PASSWORD_CHANGE_REQUIRED', must_change_password: true, message: 'Change your temporary password before using Friday Owner.' });
  }
  return next();
});

// Return the authenticated Owner identity for consistent account controls across workspaces.
app.get('/api/auth/me', async (q, r) => {
  const actor = (q as any).actor;
  if (!actor) return r.status(401).json({ error: 'UNAUTHENTICATED' });
  if (!supabaseConfigured()) {
    return r.json({ name: 'Demo Owner', email: '', role: actor.role || 'Owner' });
  }
  try {
    const profile = await ownerProfileById(String(actor.id));
    if (!profile) return r.status(403).json({ error: 'OWNER_PROFILE_REQUIRED' });
    return r.json({
      name: String(profile.full_name || profile.email || 'Owner'),
      email: String(profile.email || ''),
      role: actor.role || 'Owner',
    });
  } catch (error) {
    console.error('Owner profile lookup failed:', error);
    return r.status(503).json({ error: 'PROFILE_UNAVAILABLE', message: 'Account details are temporarily unavailable.' });
  }
});

const customerSchema = z.object({
  companyName: z.string().min(2),
  legalName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  industry: z.enum(['Hospitality', 'Real Estate', 'Fitness', 'Sales']),
  accountOwner: z.string().min(2),
  city: z.string().optional(),
  country: z.string().optional(),
});
const customerUpdateSchema = customerSchema.partial().extend({
  status: z.enum(['PROSPECT', 'ONBOARDING', 'KYC', 'TRIAL', 'ACTIVE', 'UPGRADE', 'DOWNGRADE', 'RENEWAL', 'SUSPENDED', 'CANCELLED', 'ARCHIVED']).optional(),
});

app.get('/api/dashboard', authorize('customer.view'), async (_q, r) => {
  const [customerRows, registry] = await Promise.all([loadCustomers(), loadProductRegistry()]);
  const growth = customerRows
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((customer, index) => ({
      period: customer.createdAt.slice(0, 7),
      label: new Date(`${customer.createdAt.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short' }),
      newCustomers: 1,
      totalCustomers: index + 1,
    }));

  r.json({
    metrics: [
      ['Total Customers', customerRows.length],
      [
        'Active Customers',
        customerRows.filter((x) => x.status === 'ACTIVE').length,
      ],
      ['Active Tenants', 'Not yet measured'],
      ['Registered Products', registry.length],
      ['Active Subscriptions', 'Not yet measured'],
      ['Platform Users', 'Not yet measured'],
      ['Hosting Nodes', 'Not monitored'],
      ['Ongoing Deployments', 'Not monitored'],
      ['System Health', 'Not monitored'],
    ],
    activity: supabaseConfigured() ? [] : audit.slice(0, 5),
    onboarding: customerRows.filter((x) =>
      ['ONBOARDING', 'KYC', 'TRIAL'].includes(x.status),
    ),
    subscriptions: {
      active: 'Not yet measured', trial: 'Not yet measured', expiring: 'Not yet measured', suspended: 'Not yet measured', cancelled: 'Not yet measured',
    },
    health: { api: 'Not monitored', database: 'Not monitored', infrastructure: 'Not monitored', deployment: 'Not monitored' },
    customerGrowth: growth,
    productAdoption: registry.map((product) => ({
      product: product.name,
      customers: 'Not yet measured',
      modules: product.modules.length,
    })),
    deployments: [],
    renewals: [],
  });
});

// Product-specific Owner command center. All joins and filtering happen on the authenticated API.
app.get('/api/dashboard/overview', authorize('customer.view'), async (q, r) => {
  const code = String(q.query.productCode || '');
  if (!/^(engage_stay|engage_fit|engage_realty|engage_crm)$/.test(code)) return r.status(400).json({ error: 'INVALID_PRODUCT' });
  if (!await requireProductAccess(q, r, code)) return;
  if (!supabaseConfigured()) return r.status(503).json({ error: 'DATABASE_REQUIRED' });
  try {
    const rows = async <T>(path: string): Promise<T[]> => {
      const response = await supabaseAdmin(path);
      if (!response.ok) throw new Error('Dashboard source unavailable: ' + response.status);
      return await response.json() as T[];
    };
    const product = (await rows<{id:string;product_code:string;name:string}>(
      'rest/v1/products?select=id,product_code,name&product_code=eq.' + encodeURIComponent(code) + '&limit=1'
    ))[0];
    if (!product) return r.status(404).json({ error: 'PRODUCT_NOT_FOUND' });
    const productId = encodeURIComponent(product.id);
    const showSignups = can(q, 'customer.create');
    const showSubscriptions = can(q, 'subscription.view');
    const showAudit = can(q, 'audit.view');

    type Signup = { id:string;organization_name:string|null;display_name:string|null;email:string;status:string;occurred_at:string;requested_lifecycle:string };
    type Session = { id:string;signup_request_id:string|null;customer_id:string|null;status:string;current_step:number;updated_at:string };
    type Subscription = { id:string;customer_id:string;status:string;expires_at:string|null;plans?:{name:string}|null };
    type Job = { id:string;customer_id:string;status:string;operation:string;failure_code:string|null;updated_at:string };
    type Environment = { environment:string;status:string;last_checked_at:string|null };
    type Deployment = { id:string;status:string;environment:string;version:string|null;completed_at:string|null };
    type Audit = { id:string;action:string;resource_id:string;resource_type:string;created_at:string };

    const [assignments, allCustomers, signups, subscriptions, sessions, jobs, environments, deployments, activity] = await Promise.all([
      rows<{customer_id:string;status:string}>('rest/v1/customer_products?select=customer_id,status&product_id=eq.' + productId),
      loadCustomers(),
      showSignups ? rows<Signup>('rest/v1/signup_requests?select=id,organization_name,display_name,email,status,occurred_at,requested_lifecycle&product_code=eq.' + encodeURIComponent(code) + '&order=occurred_at.desc') : Promise.resolve([] as Signup[]),
      showSubscriptions ? rows<Subscription>('rest/v1/subscriptions?select=id,customer_id,status,expires_at,plans(name)&product_id=eq.' + productId + '&order=created_at.desc') : Promise.resolve([] as Subscription[]),
      showSignups ? rows<Session>('rest/v1/onboarding_sessions?select=id,signup_request_id,customer_id,status,current_step,updated_at&status=eq.IN_PROGRESS') : Promise.resolve([] as Session[]),
      rows<Job>('rest/v1/provisioning_jobs?select=id,customer_id,status,operation,failure_code,updated_at&product_id=eq.' + productId + '&order=updated_at.desc&limit=100'),
      rows<Environment>('rest/v1/product_environments?select=environment,status,last_checked_at&product_id=eq.' + productId),
      rows<Deployment>('rest/v1/deployments?select=id,status,environment,version,completed_at&product_id=eq.' + productId + '&order=started_at.desc&limit=10'),
      showAudit ? rows<Audit>('rest/v1/audit_logs?select=id,action,resource_id,resource_type,created_at&product_id=eq.' + productId + '&order=created_at.desc&limit=12') : Promise.resolve([] as Audit[]),
    ]);
    const customerIds = new Set(assignments.map(row => row.customer_id));
    const signupIds = new Set(signups.map(row => row.id));
    return r.json({
      product: { code: product.product_code, name: product.name }, fetchedAt: new Date().toISOString(),
      visibility: { signups: showSignups, subscriptions: showSubscriptions, audit: showAudit },
      customers: allCustomers.filter(c => customerIds.has(c.id)).map(c => ({
        id: c.id, name: c.companyName, status: c.status, createdAt: c.createdAt,
      })),
      signups: signups.filter(x => ['NEW','IN_REVIEW'].includes(x.status)).map(x => ({
        id: x.id, name: x.organization_name || x.display_name || x.email, status: x.status,
        email: x.email, requestedLifecycle: x.requested_lifecycle, createdAt: x.occurred_at,
      })),
      onboarding: sessions.filter(x =>
        Boolean((x.signup_request_id && signupIds.has(x.signup_request_id)) ||
          (x.customer_id && customerIds.has(x.customer_id)))
      ).map(x => ({
        id: x.id, signupRequestId: x.signup_request_id, customerId: x.customer_id,
        status: x.status, step: x.current_step, updatedAt: x.updated_at,
      })),
      subscriptions: subscriptions.map(x => ({
        id: x.id, customerId: x.customer_id, status: x.status,
        plan: x.plans?.name || 'Custom', expiresAt: x.expires_at,
      })),
      provisioning: jobs.map(x => ({
        id: x.id, customerId: x.customer_id, status: x.status, operation: x.operation,
        failureCode: x.failure_code, updatedAt: x.updated_at,
      })),
      operations: environments.map(x => ({
        environment: x.environment, status: x.status, checkedAt: x.last_checked_at,
      })),
      deployments: deployments.map(x => ({
        id: x.id, status: x.status, environment: x.environment, version: x.version, completedAt: x.completed_at,
      })),
      activity: activity.map(x => ({
        id: x.id, action: x.action, resourceId: x.resource_id, resourceType: x.resource_type, createdAt: x.created_at,
      })),
      billing: { connected: false, mrr: null },
    });
  } catch (error) {
    console.error('Owner Dashboard data query failed:', error);
    return r.status(502).json({ error: 'DASHBOARD_UNAVAILABLE', message: 'Dashboard data could not be loaded. Please retry.' });
  }
});

app.get('/api/customers', authorize('customer.view'), (_q, r) => {
  void loadCustomers()
    .then((items) => r.json(items))
    .catch((error) => {
      console.error('Customer registry query failed:', error);
      if (!r.headersSent) r.status(502).json({ error: 'CUSTOMER_REGISTRY_UNAVAILABLE' });
    });
});

const productSignupSchema = z.object({
  source: z.enum(['email', 'google', 'microsoft']),
  externalUserId: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(254),
  displayName: z.string().trim().max(160).optional(),
  organizationName: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(32).optional(),
  requestedLifecycle: z.enum(['TRIAL', 'LIVE']).default('TRIAL'),
  occurredAt: z.string().datetime().optional(),
});

app.post('/api/integrations/engagestay/signup', async (q, r) => {
  if (!hasOwnerServiceAuthorization(q)) return r.status(401).json({ error: 'SERVICE_AUTH_REQUIRED' });
  if (!supabaseConfigured()) return r.status(503).json({ error: 'SIGNUP_INTAKE_NOT_CONFIGURED' });
  const parsed = productSignupSchema.safeParse(q.body);
  if (!parsed.success) return r.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  const idempotencyKey = q.get('idempotency-key') || '';
  if (!/^[A-Za-z0-9:_-]{8,128}$/.test(idempotencyKey)) return r.status(400).json({ error: 'IDEMPOTENCY_KEY_REQUIRED' });
  try {
    const input = parsed.data;
    const payload = {
      product_code: 'engage_stay', source: input.source, external_user_id: input.externalUserId,
      email: input.email.toLowerCase(), display_name: input.displayName || null,
      organization_name: input.organizationName || null, phone: input.phone || null,
      requested_lifecycle: input.requestedLifecycle, occurred_at: input.occurredAt || new Date().toISOString(),
      idempotency_key: idempotencyKey,
    };
    const inserted = await supabaseAdmin('/rest/v1/signup_requests', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(payload),
    });
    if (!inserted.ok) return r.status(502).json({ error: 'SIGNUP_INTAKE_WRITE_FAILED' });
    let row: { id: string } | undefined = (await inserted.json() as Array<{ id: string }>)[0];
    if (!row) {
      const existing = await supabaseAdmin(`rest/v1/signup_requests?select=id&product_code=eq.engage_stay&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&limit=1`);
      row = existing.ok ? (await existing.json() as Array<{ id: string }>)[0] : undefined;
    }
    if (!row) return r.status(502).json({ error: 'SIGNUP_INTAKE_LOOKUP_FAILED' });
    await recordPlatformAudit(q, 'signup_request.received', 'signup_request', row.id, undefined, { product: 'engage_stay', source: input.source, email: input.email.toLowerCase() });
    return r.status(202).json({ id: row.id, accepted: true });
  } catch (error) {
    console.error('EngageStay signup intake failed:', error);
    return r.status(500).json({ error: 'SIGNUP_INTAKE_FAILED' });
  }
});

app.get('/api/signup-requests', authorize('customer.create'), (_q, r) => {
  if (!supabaseConfigured()) return r.json(signupRequests);
  void supabaseAdmin('rest/v1/signup_requests?select=id,organization_name,display_name,email,phone,source,requested_lifecycle,occurred_at&status=in.(NEW,IN_REVIEW)&order=occurred_at.desc')
    .then(async (response) => {
      if (!response.ok) throw new Error('Signup queue query failed.');
      const rows = await response.json() as Array<Record<string, string | null>>;
      r.json(rows.map((row) => ({ id: row.id, name: row.organization_name || row.display_name || row.email, email: row.email, mobile: row.phone || '', signupDate: row.occurred_at, source: row.source, requestedLifecycle: row.requested_lifecycle })));
    })
    .catch(() => { if (!r.headersSent) r.status(502).json({ error: 'SIGNUP_QUEUE_UNAVAILABLE' }); });
});

app.delete('/api/signup-requests/:id', authorize('customer.create'), (q, r) => {
  const signupRequestId = String(q.params.id);
  if (supabaseConfigured()) {
    return void supabaseAdmin(`rest/v1/signup_requests?id=eq.${encodeURIComponent(signupRequestId)}`, { method: 'PATCH', body: JSON.stringify({ status: 'DISMISSED', updated_at: new Date().toISOString() }) })
      .then(async (response) => {
        if (!response.ok) return r.status(502).json({ error: 'SIGNUP_REQUEST_UPDATE_FAILED' });
        await recordPlatformAudit(q, 'signup_request.dismissed', 'signup_request', signupRequestId);
        return r.status(204).send();
      })
      .catch(() => { if (!r.headersSent) r.status(500).json({ error: 'SIGNUP_REQUEST_UPDATE_FAILED' }); });
  }
  const index = signupRequests.findIndex((item) => item.id === signupRequestId);
  if (index < 0) return r.status(404).json({ error: 'NOT_FOUND', message: 'Signup request not found.' });
  const [removed] = signupRequests.splice(index, 1);
  addAudit('signup_request.deleted', 'signup_request', removed.id, removed, undefined);
  return r.status(204).send();
});

app.post('/api/customers', authorize('customer.create'), (q, r) => {
  const parsed = customerSchema.safeParse(q.body);

  if (!parsed.success) {
    return r.status(400).json({
      error: 'VALIDATION',
      details: parsed.error.flatten(),
    });
  }

  if (!supabaseConfigured()) {
    const item = {
    id: ids(),
    customerId: `FRI-${1000 + customers.length + 1}`,
    status: 'ONBOARDING' as const,
    createdAt: new Date().toISOString(),
    ...parsed.data,
    };

    customers.unshift(item);

    void recordPlatformAudit(q, 'customer.created', 'customer', item.id, undefined, item);
    return r.status(201).json(item);
  }

  void (async () => {
    const normalizedName = parsed.data.legalName.trim().replace(/\s+/g, ' ').toLowerCase();
    const existing = await supabaseAdmin(`rest/v1/organizations?select=id&normalized_name=eq.${encodeURIComponent(normalizedName)}&limit=1`);
    if (!existing.ok) throw new Error('Could not validate the organization registry.');
    if ((await existing.json() as Array<{ id: string }>).length) {
      return r.status(409).json({ error: 'DUPLICATE_ORGANIZATION', message: 'An organization with this legal name already exists. Add products through the existing customer record.' });
    }

    const organizationResponse = await supabaseAdmin('/rest/v1/organizations', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ name: parsed.data.legalName.trim(), normalized_name: normalizedName }),
    });
    if (!organizationResponse.ok) throw new Error('Could not create the organization.');
    const organization = (await organizationResponse.json() as Array<{ id: string }>)[0];
    if (!organization?.id) throw new Error('Organization creation did not return an identifier.');

    const customerCode = `EH-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const customerResponse = await supabaseAdmin('/rest/v1/customers', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        organization_id: organization.id,
        customer_code: customerCode,
        company_name: parsed.data.companyName.trim(),
        legal_name: parsed.data.legalName.trim(),
        display_name: parsed.data.companyName.trim(),
        email: parsed.data.email.trim().toLowerCase(),
        phone: parsed.data.phone || null,
        industry: parsed.data.industry,
        account_owner: parsed.data.accountOwner.trim(),
        city: parsed.data.city || null,
        country: parsed.data.country || null,
        status: 'ONBOARDING',
        updated_by: (q as any).actor?.id || null,
      }),
    });
    if (!customerResponse.ok) {
      await supabaseAdmin(`rest/v1/organizations?id=eq.${encodeURIComponent(organization.id)}`, { method: 'DELETE' });
      throw new Error('Could not create the customer record.');
    }
    const row = (await customerResponse.json() as CustomerDatabaseRow[])[0];
    const item = toCustomer(row);
    const requestedProduct = typeof q.body?.product === 'string' ? q.body.product.trim().toLowerCase().replace(/\s+/g, '_') : '';
    const productCode = requestedProduct === 'engage_stay' || requestedProduct === 'engage_fit' || requestedProduct === 'engage_realty' || requestedProduct === 'engage_crm' ? requestedProduct : null;
    if (productCode) {
      const productResponse = await supabaseAdmin(`rest/v1/products?select=id&product_code=eq.${encodeURIComponent(productCode)}&limit=1`);
      const product = productResponse.ok ? (await productResponse.json() as Array<{ id: string }>)[0] : null;
      if (product) {
        const tenantName = typeof q.body?.tenantName === 'string' ? q.body.tenantName.trim() : '';
        const tenantSlug = typeof q.body?.tenantId === 'string' ? q.body.tenantId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') : '';
        let tenantId: string | null = null;
        if (tenantName && tenantSlug) {
          const tenantResponse = await supabaseAdmin('/rest/v1/tenants', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ customer_id: item.id, name: tenantName, slug: tenantSlug, status: 'ONBOARDING' }) });
          if (!tenantResponse.ok) throw new Error('Could not create the requested tenant.');
          tenantId = (await tenantResponse.json() as Array<{ id: string }>)[0]?.id || null;
        }
        const assignment = await supabaseAdmin('/rest/v1/customer_products', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ customer_id: item.id, product_id: product.id, tenant_id: tenantId, status: 'ONBOARDING' }) });
        if (!assignment.ok) throw new Error('Could not assign the selected product.');
        const adminEmail = typeof q.body?.adminEmail === 'string' ? q.body.adminEmail.trim().toLowerCase() : '';
        const adminName = typeof q.body?.adminName === 'string' ? q.body.adminName.trim() : '';
        if (adminEmail && adminName) {
          const admin = await supabaseAdmin('/rest/v1/users', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ id: randomUUID(), customer_id: item.id, email: adminEmail, name: adminName, status: 'INVITED' }) });
          if (!admin.ok) throw new Error('Could not create the initial administrator invitation.');
        }
        const config = { environment: q.body?.environment, deployment: q.body?.deployment, appUrl: q.body?.appUrl, modules: Array.isArray(q.body?.modules) ? q.body.modules : [], notes: q.body?.notes || null, trialStart: q.body?.trialStart || null, trialEnd: q.body?.trialEnd || null };
        const configResponse = await supabaseAdmin('/rest/v1/customer_configurations', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ customer_id: item.id, product_id: product.id, config_key: 'onboarding', config_value: config, scope: 'TENANT', environment: q.body?.environment === 'Live' ? 'PRODUCTION' : 'TRIAL', updated_by: (q as any).actor?.id || null }) });
        if (!configResponse.ok) throw new Error('Could not persist onboarding configuration.');
      }
    }
    const signupRequestId = typeof q.body?.signupRequestId === 'string' ? q.body.signupRequestId : null;
    if (signupRequestId && /^[0-9a-f-]{36}$/i.test(signupRequestId)) {
      await Promise.all([
        supabaseAdmin(`rest/v1/signup_requests?id=eq.${encodeURIComponent(signupRequestId)}`, { method: 'PATCH', body: JSON.stringify({ status: 'CONVERTED', updated_at: new Date().toISOString() }) }),
        supabaseAdmin(`rest/v1/onboarding_sessions?signup_request_id=eq.${encodeURIComponent(signupRequestId)}`, { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED', customer_id: item.id, current_step: 7, updated_at: new Date().toISOString() }) }),
      ]);
    }
    await recordPlatformAudit(q, 'customer.created', 'customer', item.id, undefined, item);
    return r.status(201).json(item);
  })().catch((error) => {
    console.error('Customer creation failed:', error);
    if (!r.headersSent) r.status(500).json({ error: 'CUSTOMER_CREATE_FAILED', message: 'The customer could not be created.' });
  });
});

app.get('/api/customers/:id', authorize('customer.view'), (q, r) => {
  void loadCustomer(String(q.params.id)).then(async (c) => {
  if (!c) return r.status(404).json({ error: 'NOT_FOUND' });
  if (supabaseConfigured()) {
    const [productResponse, subscriptionResponse, userResponse, configurationResponse, activityResponse] = await Promise.all([
      supabaseAdmin(`rest/v1/customer_products?select=status,products(id,name,version,status,product_modules(name,status,implementation_state))&customer_id=eq.${encodeURIComponent(c.id)}`),
      supabaseAdmin(`rest/v1/subscriptions?select=id,product_id,plan_id,status,starts_at,expires_at,renewal_mode,plans(name),products(name)&customer_id=eq.${encodeURIComponent(c.id)}&order=created_at.desc&limit=1`),
      supabaseAdmin(`rest/v1/users?select=id,name,email,status,last_login_at&customer_id=eq.${encodeURIComponent(c.id)}&order=created_at.asc`),
      supabaseAdmin(`rest/v1/customer_configurations?select=config_key,config_value,scope,environment,updated_at&customer_id=eq.${encodeURIComponent(c.id)}&order=updated_at.desc`),
      supabaseAdmin(`rest/v1/audit_logs?select=id,operator_id,action,resource_type,resource_id,created_at,result&resource_id=eq.${encodeURIComponent(c.id)}&order=created_at.desc&limit=100`),
    ]);
    if (![productResponse, subscriptionResponse, userResponse, configurationResponse, activityResponse].every((response) => response.ok)) return r.status(502).json({ error: 'CUSTOMER_360_UNAVAILABLE' });
    const productRows = await productResponse.json() as Array<{ status: string; products: any }>;
    const subscriptionRow = (await subscriptionResponse.json() as Array<any>)[0];
    const users = await userResponse.json() as Array<any>;
    const configurations = await configurationResponse.json() as Array<any>;
    const activity = await activityResponse.json() as Array<any>;
    return r.json({
      customer: c,
      products: productRows.map((row) => ({ ...row.products, assignmentStatus: row.status, modules: (row.products?.product_modules || []).map((module: any) => `${module.name} (${String(module.status).toLowerCase()})`) })),
      users: users.map((user) => ({ name: user.name || user.email, email: user.email, role: 'Managed by Engage Stay', status: user.status, lastLogin: user.last_login_at || 'Never' })),
      subscription: subscriptionRow ? { id: subscriptionRow.id, productId: subscriptionRow.product_id, planId: subscriptionRow.plan_id, plan: subscriptionRow.plans?.name || 'Custom', product: subscriptionRow.products?.name || 'Unknown product', status: subscriptionRow.status, startDate: subscriptionRow.starts_at || '—', expiryDate: subscriptionRow.expires_at || 'No expiry', renewal: subscriptionRow.renewal_mode || 'MANUAL' } : { plan: 'Not assigned', status: 'ONBOARDING', startDate: '—', expiryDate: '—', renewal: '—' },
      configuration: configurations.map((item) => ({ key: item.config_key, value: JSON.stringify(item.config_value), scope: item.scope, environment: item.environment, status: 'Applied', updatedBy: 'System', updatedDate: item.updated_at })),
      infrastructure: [],
      activity: activity.map((item) => ({ id: item.id, actor: item.operator_id || 'System', action: item.action, resourceType: item.resource_type, resourceId: item.resource_id, timestamp: item.created_at, result: item.result })),
    });
  }
  r.json({
    customer: c,
    products: supabaseConfigured() ? await (async () => { const x = await supabaseAdmin(`rest/v1/customer_products?select=products(id,name,version,status)&customer_id=eq.${encodeURIComponent(c.id)}`); return x.ok ? (await x.json() as Array<{ products: unknown }>).map((row) => row.products).filter(Boolean) : []; })() : [products[1]],
    users: [],
    subscription: null,
    configuration: [],
    infrastructure: [],
    activity: supabaseConfigured() ? [] : audit.filter((a) => a.resourceId === c.id),
  });
  }).catch((error) => {
    console.error('Customer detail query failed:', error);
    if (!r.headersSent) r.status(502).json({ error: 'CUSTOMER_REGISTRY_UNAVAILABLE' });
  });
});

app.patch('/api/customers/:id', authorize('customer.update'), (q, r) => {
  if (supabaseConfigured()) {
    const parsed = customerUpdateSchema.safeParse(q.body);
    if (!parsed.success) return r.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
    return void (async () => {
      const existing = await loadCustomer(String(q.params.id));
      if (!existing) return r.status(404).json({ error: 'NOT_FOUND' });
      const input = parsed.data;
      const update: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: (q as any).actor?.id || null };
      if (input.companyName !== undefined) { update.company_name = input.companyName.trim(); update.display_name = input.companyName.trim(); }
      if (input.legalName !== undefined) update.legal_name = input.legalName.trim();
      if (input.email !== undefined) update.email = input.email.trim().toLowerCase();
      if (input.phone !== undefined) update.phone = input.phone || null;
      if (input.industry !== undefined) update.industry = input.industry;
      if (input.accountOwner !== undefined) update.account_owner = input.accountOwner.trim();
      if (input.city !== undefined) update.city = input.city || null;
      if (input.country !== undefined) update.country = input.country || null;
      if (input.status !== undefined) update.status = input.status;
      const response = await supabaseAdmin(`rest/v1/customers?id=eq.${encodeURIComponent(String(q.params.id))}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(update),
      });
      if (!response.ok) throw new Error('Could not update the customer record.');
      const row = (await response.json() as CustomerDatabaseRow[])[0];
      const result = toCustomer(row);
      await recordPlatformAudit(q, 'customer.updated', 'customer', result.id, existing, result);
      return r.json(result);
    })().catch((error) => {
      console.error('Customer update failed:', error);
      if (!r.headersSent) r.status(500).json({ error: 'CUSTOMER_UPDATE_FAILED' });
    });
  }
  const c = customers.find((x) => x.id === q.params.id);

  if (!c) {
    return r.status(404).json({ error: 'NOT_FOUND' });
  }

  const before = { ...c };

  Object.assign(c, q.body);

  addAudit(
    'customer.updated',
    'customer',
    c.id,
    before,
    c,
  );

  r.json(c);
});

app.post('/api/onboarding', authorize('customer.create'), (q, r) => {
  const step = z
    .number()
    .int()
    .min(1)
    .max(11)
    .parse(q.body.step);

  if (supabaseConfigured()) return void (async () => {
    const signupRequestId = typeof q.body.signupRequestId === 'string' && /^[0-9a-f-]{36}$/i.test(q.body.signupRequestId) ? q.body.signupRequestId : null;
    const payload = q.body.data && typeof q.body.data === 'object' ? q.body.data : {};
    const existing = signupRequestId ? await supabaseAdmin(`rest/v1/onboarding_sessions?select=id&signup_request_id=eq.${encodeURIComponent(signupRequestId)}&limit=1`) : null;
    if (existing && !existing.ok) throw new Error('Could not read onboarding session.');
    const prior = existing ? (await existing.json() as Array<{ id: string }>)[0] : null;
    const response = prior
      ? await supabaseAdmin(`rest/v1/onboarding_sessions?id=eq.${encodeURIComponent(prior.id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ current_step: step, payload, updated_at: new Date().toISOString() }) })
      : await supabaseAdmin('/rest/v1/onboarding_sessions', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ signup_request_id: signupRequestId, current_step: step, payload, created_by: (q as any).actor?.id || null }) });
    if (!response.ok) throw new Error('Could not save onboarding step.');
    const session = (await response.json() as Array<{ id: string; current_step: number }>)[0];
    await recordPlatformAudit(q, 'onboarding.step_saved', 'onboarding_session', session.id, undefined, { step });
    return r.json({ sessionId: session.id, step: session.current_step });
  })().catch((error) => { console.error('Onboarding step save failed:', error); if (!r.headersSent) r.status(500).json({ error: 'ONBOARDING_SAVE_FAILED' }); });

  const existing =
    q.body.customerId &&
    customers.find((c) => c.id === q.body.customerId);

  if (existing) {
    Object.assign(existing, q.body.data || {});

    addAudit(
      'onboarding.step_saved',
      'customer',
      existing.id,
      undefined,
      { step },
    );

    return r.json({
      customer: existing,
      step,
    });
  }

  const p = customerSchema.safeParse(q.body.data);

  if (!p.success) {
    return r.status(400).json({
      error: 'VALIDATION',
      details: p.error.flatten(),
    });
  }

  const item = {
    id: ids(),
    customerId: `FRI-${1000 + customers.length + 1}`,
    status: 'ONBOARDING' as const,
    createdAt: new Date().toISOString(),
    ...p.data,
  };

  customers.unshift(item);

  addAudit(
    'onboarding.started',
    'customer',
    item.id,
    undefined,
    { step },
  );

  r.status(201).json({
    customer: item,
    step,
  });
});

app.get('/api/onboarding/signup/:signupRequestId', authorize('customer.create'), async (q, r) => {
  if (!supabaseConfigured()) return r.json(null);
  const id = String(q.params.signupRequestId);
  const response = await supabaseAdmin(`rest/v1/onboarding_sessions?select=id,current_step,payload,status&signup_request_id=eq.${encodeURIComponent(id)}&status=eq.IN_PROGRESS&limit=1`);
  if (!response.ok) return r.status(502).json({ error: 'ONBOARDING_SESSION_UNAVAILABLE' });
  return r.json((await response.json() as Array<any>)[0] || null);
});

app.post('/api/customers/:id/engagestay', authorize('customer.update'), async (q, r) => {
  const customer = await loadCustomer(String(q.params.id));
  if (!customer) return r.status(404).json({ error: 'NOT_FOUND' });
  const action = q.body?.action;
  if (!['approve', 'configure', 'suspend', 'reactivate'].includes(action)) {
    return r.status(400).json({ error: 'Invalid lifecycle action.' });
  }
  const origin = process.env.ENGAGE_STAY_API_ORIGIN;
  const token = process.env.ENGAGE_OWNER_SERVICE_TOKEN;
  if (!origin || !token) return r.status(503).json({ error: 'EngageStay integration is not configured.' });
  const requestedKey = q.header('idempotency-key');
  const idempotencyKey = requestedKey && /^[A-Za-z0-9._:-]{8,128}$/.test(requestedKey)
    ? requestedKey
    : `owner-${randomUUID()}`;
  let jobId: string | null = null;
  let correlationId: string = randomUUID();
  if (supabaseConfigured()) {
    const productResponse = await supabaseAdmin('rest/v1/products?select=id&product_code=eq.engage_stay&limit=1');
    if (!productResponse.ok) return r.status(502).json({ error: 'PRODUCT_REGISTRY_UNAVAILABLE' });
    const product = (await productResponse.json() as Array<{ id: string }>)[0];
    if (!product) return r.status(503).json({ error: 'ENGAGESTAY_NOT_REGISTERED' });
    const existingResponse = await supabaseAdmin(`rest/v1/provisioning_jobs?select=id,status,result_payload,correlation_id&product_id=eq.${encodeURIComponent(product.id)}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&limit=1`);
    if (!existingResponse.ok) return r.status(502).json({ error: 'PROVISIONING_STATE_UNAVAILABLE' });
    const existing = (await existingResponse.json() as Array<{ id: string; status: string; result_payload: unknown; correlation_id: string }>)[0];
    if (existing?.status === 'SUCCEEDED') return r.json({ ...(existing.result_payload as object || {}), idempotentReplay: true, correlationId: existing.correlation_id });
    if (existing?.status === 'RUNNING' || existing?.status === 'PENDING') return r.status(409).json({ error: 'OPERATION_IN_PROGRESS', correlationId: existing.correlation_id });
    if (existing) {
      jobId = existing.id;
      correlationId = existing.correlation_id;
      await supabaseAdmin(`rest/v1/provisioning_jobs?id=eq.${encodeURIComponent(jobId)}`, { method: 'PATCH', body: JSON.stringify({ status: 'RUNNING', attempt_count: 1, updated_at: new Date().toISOString(), failure_code: null, failure_detail: null }) });
    } else {
      const createJob = await supabaseAdmin('/rest/v1/provisioning_jobs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ customer_id: customer.id, product_id: product.id, idempotency_key: idempotencyKey, operation: `engagestay.${action}`, status: 'RUNNING', request_payload: { action }, attempt_count: 1, correlation_id: correlationId, created_by: (q as any).actor?.id || null }) });
      if (!createJob.ok) return r.status(502).json({ error: 'PROVISIONING_JOB_CREATE_FAILED' });
      jobId = (await createJob.json() as Array<{ id: string }>)[0]?.id || null;
    }
  }
  try {
    const result = await fetch(new URL('/api/internal/managed-workspaces/' + encodeURIComponent(customer.id), origin), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'X-Correlation-ID': correlationId, 'Idempotency-Key': idempotencyKey },
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        action, name: customer.companyName, city: customer.city, email: customer.email,
        adminName: q.body.adminName, password: q.body.password,
        plan: q.body.plan, modules: q.body.modules,
      }),
    });
    const workspace = await result.json();
    if (!result.ok) {
      if (jobId) await supabaseAdmin(`rest/v1/provisioning_jobs?id=eq.${encodeURIComponent(jobId)}`, { method: 'PATCH', body: JSON.stringify({ status: 'FAILED', failure_code: workspace.error || 'ENGAGESTAY_REJECTED', failure_detail: workspace.message || null, updated_at: new Date().toISOString() }) });
      return r.status(result.status).json({ error: workspace.error || 'EngageStay rejected the action.', correlationId });
    }
    if (jobId) await supabaseAdmin(`rest/v1/provisioning_jobs?id=eq.${encodeURIComponent(jobId)}`, { method: 'PATCH', body: JSON.stringify({ status: 'SUCCEEDED', result_payload: workspace, updated_at: new Date().toISOString() }) });
    await recordPlatformAudit(q, 'engagestay.' + action, 'customer', customer.id, undefined, workspace);
    return r.json({ ...workspace, correlationId, idempotencyKey });
  } catch {
    if (jobId) await supabaseAdmin(`rest/v1/provisioning_jobs?id=eq.${encodeURIComponent(jobId)}`, { method: 'PATCH', body: JSON.stringify({ status: 'FAILED', failure_code: 'ENGAGESTAY_UNREACHABLE', failure_detail: 'The EngageStay API could not be reached.', updated_at: new Date().toISOString() }) });
    return r.status(502).json({ error: 'Unable to reach EngageStay. Check the workspace before retrying.' });
  }
});

app.get('/api/customers/:id/provisioning-jobs', authorize('customer.view'), async (q, r) => {
  if (!supabaseConfigured()) return r.json([]);
  const customer = await loadCustomer(String(q.params.id));
  if (!customer) return r.status(404).json({ error: 'NOT_FOUND' });
  const response = await supabaseAdmin(`rest/v1/provisioning_jobs?select=id,operation,status,attempt_count,correlation_id,failure_code,failure_detail,created_at,updated_at&customer_id=eq.${encodeURIComponent(customer.id)}&order=created_at.desc&limit=20`);
  if (!response.ok) return r.status(502).json({ error: 'PROVISIONING_JOBS_UNAVAILABLE' });
  return r.json(await response.json());
});

// Minimal product summary for the application picker. Keep detailed registry reads in /api/products.
app.get('/api/products/selector', authorize('product.view'), async (q, r) => {
  try {
    const allowed = await allowedProductCodes((q as any).actor);
    if (!supabaseConfigured()) {
      // Preserve the existing local-demo response without assuming the demo model has product codes.
      return r.json(allowed === null ? products : []);
    }

    const response = await supabaseAdmin('rest/v1/products?select=id,product_code,name,description,status,adapter_status,commercial_status&order=name');
    if (!response.ok) throw new Error('Product summary query failed.');
    const rows = await response.json() as RegistryProductRow[];
    const visible = allowed === null ? rows : rows.filter(product => allowed.includes(product.product_code));
    return r.json(visible.map(product => ({
      id: product.id, code: product.product_code, name: product.name,
      description: product.description || '',
      status: product.adapter_status === 'HEALTHY' ? product.status : product.adapter_status,
      commercialStatus: product.commercial_status,
    })));
  } catch (error) {
    console.error('Application selector product query failed:', error);
    if (!r.headersSent) r.status(502).json({
      error: 'PRODUCT_SELECTOR_UNAVAILABLE',
      message: 'Applications could not be loaded. Please try again.',
    });
  }
});

app.get('/api/products', authorize('product.view'), (q, r) => {
  void loadProductRegistry()
    .then(async (registry) => { const allowed = await allowedProductCodes((q as any).actor); r.json(allowed === null ? registry : registry.filter(product => allowed.includes((product as any).code))); })
    .catch((error) => {
      console.error('Product registry query failed:', error);
      if (!r.headersSent) {
        r.status(502).json({
          error: 'PRODUCT_REGISTRY_UNAVAILABLE',
          message: 'The platform product registry could not be loaded.',
        });
      }
    });
});

app.get('/api/products/:code/context', authorize('product.view'), async (q, r) => {
  const code = String(q.params.code);
  if (!/^(engage_stay|engage_fit|engage_realty|engage_crm)$/.test(code)) return r.status(404).json({ error: 'PRODUCT_NOT_FOUND' });
  if (!await requireProductAccess(q, r, code)) return;
  const registry = await loadProductRegistry(); const product = registry.find(item => (item as any).code === code);
  if (!product) return r.status(404).json({ error: 'PRODUCT_NOT_FOUND' });
  const environments = supabaseConfigured() ? await supabaseAdmin(`rest/v1/product_environments?select=name,status&product_id=eq.${encodeURIComponent(product.id)}&order=name`).then(async response => response.ok ? await response.json() as Array<{ name: string; status: string }> : []) : [];
  return r.json({ product, environments });
});

app.get('/api/plans', authorize('subscription.view'), (_q, r) => {
  if (!supabaseConfigured()) return r.json(plans);
  void supabaseAdmin('rest/v1/plans?select=id,name,status,user_limit,storage_gb,api_limit,products(name,product_code)&order=name')
    .then(async (response) => {
      if (!response.ok) throw new Error('Plan catalogue query failed.');
      const rows = await response.json() as Array<Record<string, any>>;
      r.json(rows.map((row) => ({ id: row.id, name: row.name, status: row.status, product: row.products?.name || 'Unknown product', productCode: row.products?.product_code, userLimit: row.user_limit, storageGb: row.storage_gb, apiLimit: row.api_limit })));
    })
    .catch(() => { if (!r.headersSent) r.status(502).json({ error: 'PLAN_CATALOGUE_UNAVAILABLE' }); });
});

app.get('/api/subscriptions', authorize('subscription.view'), (_q, r) => {
  if (!supabaseConfigured()) return r.json(customers.map((c, i) => ({ id: `s${i + 1}`, customer: c.companyName, product: 'Friday AI Desk', plan: i === 1 ? 'Premium' : 'Enterprise', status: c.status === 'TRIAL' ? 'Trial' : 'Active', expiryDate: '2027-09-19' })));
  void supabaseAdmin('rest/v1/subscriptions?select=id,status,starts_at,expires_at,customers(company_name,display_name),products(name),plans(name)&order=created_at.desc')
    .then(async (response) => {
      if (!response.ok) throw new Error('Subscription query failed.');
      const rows = await response.json() as Array<Record<string, any>>;
      r.json(rows.map((row) => ({ id: row.id, customer: row.customers?.display_name || row.customers?.company_name || 'Unknown customer', product: row.products?.name || 'Unknown product', plan: row.plans?.name || 'Custom', status: row.status, expiryDate: row.expires_at || 'No expiry' })));
    })
    .catch(() => { if (!r.headersSent) r.status(502).json({ error: 'SUBSCRIPTION_REGISTRY_UNAVAILABLE' }); });
});

const subscriptionActivationSchema = z.object({
  customerId: z.string().uuid(),
  planId: z.string().uuid(),
  status: z.enum(['TRIAL', 'ACTIVE']),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  renewalMode: z.enum(['MANUAL', 'AUTO_RENEW']).default('MANUAL'),
}).refine((value) => !value.expiresAt || !value.startsAt || new Date(value.expiresAt) > new Date(value.startsAt), { message: 'Expiry must be after start.' });

app.post('/api/subscriptions', authorize('subscription.manage'), async (q, r) => {
  const parsed = subscriptionActivationSchema.safeParse(q.body);
  if (!parsed.success) return r.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  if (!supabaseConfigured()) return r.status(501).json({ error: 'DATABASE_REQUIRED', message: 'Subscription activation is unavailable outside a configured control plane.' });
  const input = parsed.data;
  try {
    const [customer, plan] = await Promise.all([
      supabaseAdmin(`rest/v1/customers?select=id& id=eq.${encodeURIComponent(input.customerId)}&limit=1`.replace('& ', '&')),
      supabaseAdmin(`rest/v1/plans?select=id,product_id,status& id=eq.${encodeURIComponent(input.planId)}&limit=1`.replace('& ', '&')),
    ]);
    if (!customer.ok || !plan.ok) return r.status(502).json({ error: 'SUBSCRIPTION_VALIDATION_UNAVAILABLE' });
    if (!(await customer.json() as unknown[]).length) return r.status(404).json({ error: 'CUSTOMER_NOT_FOUND' });
    const planRow = (await plan.json() as Array<{ id: string; product_id: string; status: string }>)[0];
    if (!planRow || planRow.status !== 'ACTIVE') return r.status(400).json({ error: 'PLAN_NOT_AVAILABLE' });
    const existing = await supabaseAdmin(`rest/v1/subscriptions?select=id&customer_id=eq.${encodeURIComponent(input.customerId)}&product_id=eq.${encodeURIComponent(planRow.product_id)}&status=in.(TRIAL,ACTIVE)&limit=1`);
    if (!existing.ok) return r.status(502).json({ error: 'SUBSCRIPTION_LOOKUP_FAILED' });
    if ((await existing.json() as unknown[]).length) return r.status(409).json({ error: 'ACTIVE_SUBSCRIPTION_EXISTS', message: 'End or change the existing subscription before activating another.' });
    const startsAt = input.startsAt || new Date().toISOString();
    const created = await supabaseAdmin('/rest/v1/subscriptions', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ customer_id: input.customerId, product_id: planRow.product_id, plan_id: planRow.id, status: input.status, starts_at: startsAt, expires_at: input.expiresAt || null, renewal_mode: input.renewalMode }) });
    if (!created.ok) return r.status(502).json({ error: 'SUBSCRIPTION_CREATE_FAILED' });
    const row = (await created.json() as Array<{ id: string }>)[0];
    await Promise.all([
      supabaseAdmin(`rest/v1/customers?id=eq.${encodeURIComponent(input.customerId)}`, { method: 'PATCH', body: JSON.stringify({ status: input.status, activated_at: startsAt, updated_at: new Date().toISOString(), updated_by: (q as any).actor?.id || null }) }),
      supabaseAdmin(`rest/v1/customer_products?customer_id=eq.${encodeURIComponent(input.customerId)}&product_id=eq.${encodeURIComponent(planRow.product_id)}`, { method: 'PATCH', body: JSON.stringify({ status: input.status }) }),
    ]);
    await recordPlatformAudit(q, 'subscription.activated', 'subscription', row.id, undefined, { customerId: input.customerId, planId: input.planId, status: input.status, expiresAt: input.expiresAt || null });
    return r.status(201).json({ id: row.id, status: input.status, startsAt, expiresAt: input.expiresAt || null });
  } catch (error) {
    console.error('Subscription activation failed:', error);
    return r.status(500).json({ error: 'SUBSCRIPTION_ACTIVATION_FAILED' });
  }
});

const subscriptionChangeSchema = z.object({
  action: z.enum(['CHANGE_PLAN', 'SET_EXPIRY', 'SUSPEND', 'REACTIVATE']),
  planId: z.string().uuid().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
}).superRefine((value, context) => {
  if (value.action === 'CHANGE_PLAN' && !value.planId) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Plan is required.' });
  if (value.action === 'SET_EXPIRY' && value.expiresAt === undefined) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Expiry is required.' });
});

app.patch('/api/subscriptions/:id', authorize('subscription.manage'), async (q, r) => {
  if (!supabaseConfigured()) return r.status(501).json({ error: 'DATABASE_REQUIRED' });
  const parsed = subscriptionChangeSchema.safeParse(q.body);
  if (!parsed.success) return r.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  const input = parsed.data;
  try {
    const source = await supabaseAdmin(`rest/v1/subscriptions?select=id,customer_id,product_id,plan_id,status,expires_at& id=eq.${encodeURIComponent(String(q.params.id))}&limit=1`.replace('& ', '&'));
    if (!source.ok) return r.status(502).json({ error: 'SUBSCRIPTION_LOOKUP_FAILED' });
    const existing = (await source.json() as Array<any>)[0];
    if (!existing) return r.status(404).json({ error: 'SUBSCRIPTION_NOT_FOUND' });
    const update: Record<string, unknown> = {};
    let customerStatus: 'ACTIVE' | 'SUSPENDED' | undefined;
    if (input.action === 'CHANGE_PLAN') {
      const plan = await supabaseAdmin(`rest/v1/plans?select=id,product_id,status& id=eq.${encodeURIComponent(input.planId!)}&limit=1`.replace('& ', '&'));
      const planRow = plan.ok ? (await plan.json() as Array<any>)[0] : null;
      if (!planRow || planRow.product_id !== existing.product_id || planRow.status !== 'ACTIVE') return r.status(400).json({ error: 'INVALID_PLAN_CHANGE' });
      update.plan_id = planRow.id;
    }
    if (input.action === 'SET_EXPIRY') update.expires_at = input.expiresAt;
    if (input.action === 'SUSPEND') { update.status = 'SUSPENDED'; customerStatus = 'SUSPENDED'; }
    if (input.action === 'REACTIVATE') { update.status = 'ACTIVE'; customerStatus = 'ACTIVE'; }
    const changed = await supabaseAdmin(`rest/v1/subscriptions?id=eq.${encodeURIComponent(existing.id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(update) });
    if (!changed.ok) return r.status(502).json({ error: 'SUBSCRIPTION_UPDATE_FAILED' });
    if (customerStatus) await Promise.all([
      supabaseAdmin(`rest/v1/customers?id=eq.${encodeURIComponent(existing.customer_id)}`, { method: 'PATCH', body: JSON.stringify({ status: customerStatus, updated_at: new Date().toISOString(), updated_by: (q as any).actor?.id || null }) }),
      supabaseAdmin(`rest/v1/customer_products?customer_id=eq.${encodeURIComponent(existing.customer_id)}&product_id=eq.${encodeURIComponent(existing.product_id)}`, { method: 'PATCH', body: JSON.stringify({ status: customerStatus }) }),
    ]);
    const row = (await changed.json() as Array<any>)[0];
    await recordPlatformAudit(q, `subscription.${input.action.toLowerCase()}`, 'subscription', existing.id, existing, row);
    return r.json(row);
  } catch (error) { console.error('Subscription change failed:', error); return r.status(500).json({ error: 'SUBSCRIPTION_CHANGE_FAILED' }); }
});

const entitlementOverrideSchema = z.object({
  productId: z.string().uuid(),
  entitlementKey: z.string().trim().min(2).max(120),
  value: z.union([z.boolean(), z.number(), z.string(), z.record(z.unknown())]),
  reason: z.string().trim().min(3).max(500),
  expiresAt: z.string().datetime().nullable().optional(),
});

app.get('/api/customers/:id/entitlements', authorize('entitlement.view'), async (q, r) => {
  if (!supabaseConfigured()) return r.json([]);
  const response = await supabaseAdmin(`rest/v1/entitlement_overrides?select=id,product_id,entitlement_key,value,starts_at,expires_at,reason,created_at&customer_id=eq.${encodeURIComponent(String(q.params.id))}&order=created_at.desc`);
  if (!response.ok) return r.status(502).json({ error: 'ENTITLEMENTS_UNAVAILABLE' });
  return r.json(await response.json());
});

app.post('/api/customers/:id/entitlements', authorize('entitlement.manage'), async (q, r) => {
  if (!supabaseConfigured()) return r.status(501).json({ error: 'DATABASE_REQUIRED' });
  const parsed = entitlementOverrideSchema.safeParse(q.body);
  if (!parsed.success) return r.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  const customer = await loadCustomer(String(q.params.id));
  if (!customer) return r.status(404).json({ error: 'CUSTOMER_NOT_FOUND' });
  const input = parsed.data;
  const response = await supabaseAdmin('/rest/v1/entitlement_overrides', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ customer_id: customer.id, product_id: input.productId, entitlement_key: input.entitlementKey, value: input.value, reason: input.reason, expires_at: input.expiresAt || null, created_by: (q as any).actor?.id || null, approved_by: (q as any).actor?.id || null }) });
  if (!response.ok) return r.status(502).json({ error: 'ENTITLEMENT_CREATE_FAILED' });
  const row = (await response.json() as Array<any>)[0];
  const product = await supabaseAdmin(`rest/v1/products?select=product_code& id=eq.${encodeURIComponent(input.productId)}&limit=1`.replace('& ', '&'));
  const productCode = product.ok ? (await product.json() as Array<{ product_code: string }>)[0]?.product_code : undefined;
  if (productCode === 'engage_stay') {
    const origin = process.env.ENGAGE_STAY_API_ORIGIN;
    const token = process.env.ENGAGE_OWNER_SERVICE_TOKEN;
    if (!origin || !token) return r.status(503).json({ error: 'ENTITLEMENT_SAVED_SYNC_NOT_CONFIGURED', message: 'The override was saved, but Engage Stay synchronization is not configured.' });
    const all = await supabaseAdmin(`rest/v1/entitlement_overrides?select=entitlement_key,value,expires_at&customer_id=eq.${encodeURIComponent(customer.id)}&product_id=eq.${encodeURIComponent(input.productId)}&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(new Date().toISOString())})`);
    if (!all.ok) return r.status(502).json({ error: 'ENTITLEMENT_SAVED_SYNC_LOOKUP_FAILED' });
    const effective = Object.fromEntries((await all.json() as Array<any>).map((item) => [item.entitlement_key, { value: item.value, expiresAt: item.expires_at || null }]));
    const sync = await fetch(new URL(`/api/internal/managed-workspaces/${encodeURIComponent(customer.id)}`, origin), { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync_entitlements', entitlements: effective }), signal: AbortSignal.timeout(10000) });
    if (!sync.ok) return r.status(502).json({ error: 'ENTITLEMENT_SAVED_SYNC_FAILED', message: 'The override was saved but Engage Stay rejected the synchronization.' });
  }
  await recordPlatformAudit(q, 'entitlement.override_created', 'entitlement_override', row.id, undefined, { customerId: customer.id, entitlementKey: input.entitlementKey, expiresAt: input.expiresAt || null });
  return r.status(201).json(row);
});

const customerDocumentSchema = z.object({
  category: z.enum(['KYC', 'GST', 'PAN', 'INCORPORATION', 'ADDRESS', 'CONTRACT', 'OTHER']),
  name: z.string().trim().min(1).max(180), contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  dataBase64: z.string().min(4), replacesId: z.string().uuid().optional(),
});
app.get('/api/customers/:id/documents', authorize('customer.view'), async (q, r) => {
  const customer = await loadCustomer(String(q.params.id)); if (!customer) return r.status(404).json({ error: 'NOT_FOUND' });
  const response = await supabaseAdmin(`rest/v1/customer_documents?select=id,category,original_name,content_type,size_bytes,version,status,created_at,uploaded_by,replaces_id&customer_id=eq.${encodeURIComponent(customer.id)}&status=eq.ACTIVE&order=created_at.desc`);
  if (!response.ok) return r.status(502).json({ error: 'DOCUMENTS_UNAVAILABLE' }); return r.json(await response.json());
});
app.post('/api/customers/:id/documents', authorize('customer.update'), async (q, r) => {
  const parsed = customerDocumentSchema.safeParse(q.body); if (!parsed.success) return r.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  const customer = await loadCustomer(String(q.params.id)); if (!customer) return r.status(404).json({ error: 'NOT_FOUND' });
  const input = parsed.data; const bytes = Buffer.from(input.dataBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) return r.status(400).json({ error: 'INVALID_DOCUMENT_SIZE' });
  const safeName = input.name.replace(/[^A-Za-z0-9._-]/g, '_'); const path = `${customer.id}/${randomUUID()}-${safeName}`;
  const upload = await supabaseAdmin(`/storage/v1/object/private-customer-documents/${encodeURIComponent(path)}`, { method: 'POST', headers: { 'Content-Type': input.contentType, 'x-upsert': 'false' }, body: bytes });
  if (!upload.ok) return r.status(502).json({ error: 'DOCUMENT_UPLOAD_FAILED' });
  const created = await supabaseAdmin('/rest/v1/customer_documents', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ customer_id: customer.id, category: input.category, original_name: input.name, storage_path: path, content_type: input.contentType, size_bytes: bytes.length, replaces_id: input.replacesId || null, uploaded_by: (q as any).actor?.id || null }) });
  if (!created.ok) return r.status(502).json({ error: 'DOCUMENT_RECORD_FAILED' }); const row = (await created.json() as Array<any>)[0];
  if (input.replacesId) await supabaseAdmin(`rest/v1/customer_documents?id=eq.${encodeURIComponent(input.replacesId)}&customer_id=eq.${encodeURIComponent(customer.id)}`, { method: 'PATCH', body: JSON.stringify({ status: 'REPLACED' }) });
  await recordPlatformAudit(q, 'customer_document.uploaded', 'customer_document', row.id, undefined, { customerId: customer.id, category: input.category, size: bytes.length }); return r.status(201).json(row);
});
app.get('/api/customers/:id/documents/:documentId/download', authorize('customer.view'), async (q, r) => {
  const customerId = String(q.params.id); const documentId = String(q.params.documentId);
  const found = await supabaseAdmin(`rest/v1/customer_documents?select=id,storage_path,original_name,content_type&customer_id=eq.${encodeURIComponent(customerId)}&id=eq.${encodeURIComponent(documentId)}&status=eq.ACTIVE&limit=1`);
  const doc = found.ok ? (await found.json() as Array<any>)[0] : null; if (!doc) return r.status(404).json({ error: 'DOCUMENT_NOT_FOUND' });
  const file = await supabaseAdmin(`/storage/v1/object/private-customer-documents/${encodeURIComponent(doc.storage_path)}`); if (!file.ok) return r.status(502).json({ error: 'DOCUMENT_STORAGE_UNAVAILABLE' });
  r.setHeader('Content-Type', doc.content_type); r.setHeader('Content-Disposition', `attachment; filename="${doc.original_name.replace(/[\"\\]/g, '_')}"`); r.setHeader('Cache-Control', 'private, no-store'); return r.send(Buffer.from(await file.arrayBuffer()));
});
app.delete('/api/customers/:id/documents/:documentId', authorize('customer.update'), async (q, r) => {
  const customerId = String(q.params.id); const documentId = String(q.params.documentId); const found = await supabaseAdmin(`rest/v1/customer_documents?select=id,storage_path&customer_id=eq.${encodeURIComponent(customerId)}&id=eq.${encodeURIComponent(documentId)}&status=eq.ACTIVE&limit=1`);
  const doc = found.ok ? (await found.json() as Array<any>)[0] : null; if (!doc) return r.status(404).json({ error: 'DOCUMENT_NOT_FOUND' });
  const removed = await supabaseAdmin(`/storage/v1/object/private-customer-documents/${encodeURIComponent(doc.storage_path)}`, { method: 'DELETE' }); if (!removed.ok) return r.status(502).json({ error: 'DOCUMENT_DELETE_FAILED' });
  await supabaseAdmin(`rest/v1/customer_documents?id=eq.${encodeURIComponent(documentId)}`, { method: 'PATCH', body: JSON.stringify({ status: 'DELETED', deleted_at: new Date().toISOString() }) }); await recordPlatformAudit(q, 'customer_document.deleted', 'customer_document', documentId, { customerId }, undefined); return r.status(204).send();
});

app.get(
  '/api/infrastructure',
  authorize('infrastructure.view'),
  async (_q, r) => {
    if (supabaseConfigured()) return r.json([]);
    return r.json(await new MockInfrastructureProvider().list());
  },
);

app.get(
  '/api/deployments',
  authorize('deployment.view'),
  (_q, r) => {
    if (supabaseConfigured()) return r.json([]);
    return r.json([
      {
        id: 'dep-1',
        application: 'Friday AI Desk',
        customer: 'Demo Hospitality',
        environment: 'PRODUCTION',
        version: '2.1.0',
        status: 'Success',
        started: '2026-10-05 15:20',
        completed: '2026-10-05 15:24',
        triggeredBy: 'Infrastructure Admin',
        mock: true,
      },
    ]);
  },
);

app.post(
  '/api/deployments',
  authorize('deployment.manage'),
  async (q, r) => {
    if (supabaseConfigured()) {
      return r.status(501).json({
        error: 'DEPLOYMENT_PROVIDER_NOT_CONNECTED',
        message: 'Deployment mutation is unavailable until a verified provider adapter is configured.',
      });
    }
    const x = await new MockDeploymentProvider().deploy(q.body);

    addAudit(
      'deployment.triggered',
      'deployment',
      x.id,
      undefined,
      q.body,
    );

    r.status(202).json({
      ...x,
      mock: true,
      message:
        'Mock deployment queued; no server action was performed.',
    });
  },
);

const configuration = [
  {
    id: 'cfg1',
    key: 'feature.ai_reply',
    value: 'enabled',
    scope: 'Customer',
    environment: 'PRODUCTION',
    status: 'Active',
    updatedBy: 'Ananya Rao',
    updatedDate: '2026-10-04',
  },
];

app.get(
  '/api/configuration',
  authorize('configuration.view'),
  (_q, r) => {
    if (supabaseConfigured()) return r.json([]);
    return r.json(configuration);
  },
);

app.patch(
  '/api/configuration/:id',
  authorize('configuration.manage'),
  (q, r) => {
    const c = configuration.find((x) => x.id === q.params.id);

    if (!c) {
      return r.status(404).json({ error: 'NOT_FOUND' });
    }

    const before = { ...c };

    Object.assign(c, q.body, {
      updatedBy: q.actor?.role,
      updatedDate: new Date().toISOString(),
    });

    addAudit(
      'configuration.changed',
      'configuration',
      c.id,
      before,
      c,
    );

    r.json(c);
  },
);

app.get('/api/audit-logs', authorize('audit.view'), (_q, r) => {
  if (!supabaseConfigured()) return r.json(audit);
  void supabaseAdmin('rest/v1/audit_logs?select=id,operator_id,action,resource_type,resource_id,before_value,after_value,created_at,result,correlation_id&order=created_at.desc&limit=200')
    .then(async (response) => {
      if (!response.ok) throw new Error('Audit query failed.');
      const rows = await response.json() as Array<Record<string, unknown>>;
      r.json(rows.map((row) => ({
        id: row.id,
        actor: row.operator_id || 'System',
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        before: row.before_value || undefined,
        after: row.after_value || undefined,
        timestamp: row.created_at,
        result: row.result,
        correlationId: row.correlation_id,
      })));
    })
    .catch((error) => {
      console.error('Audit log query failed:', error);
      if (!r.headersSent) r.status(502).json({ error: 'AUDIT_LOG_UNAVAILABLE' });
    });
});

// Owner-facing operational inventories. These are explicit control-plane records,
// not direct access to a customer's application data.
app.get('/api/integrations', authorize('configuration.view'), async (_q, r) => {
  const origin = process.env.ENGAGE_STAY_API_ORIGIN;
  const token = process.env.ENGAGE_OWNER_SERVICE_TOKEN;
  let engageStayStatus = 'Not configured';
  let lastSync = '—';
  if (origin && token) {
    try {
      const response = await fetch(new URL('/api/health', origin), { signal: AbortSignal.timeout(5000) });
      engageStayStatus = response.ok ? 'Connected' : 'Action required';
      lastSync = new Date().toISOString();
    } catch { engageStayStatus = 'Unavailable'; }
  }
  const records = [
  { id: 'int-engagestay', integration: 'EngageStay workspace control', provider: 'EngageStay', scope: 'Friday Owner', status: engageStayStatus, lastSync },
  ];
  r.json(supabaseConfigured() ? records : [...records,
    { id: 'int-1', integration: 'WhatsApp Business', provider: 'Meta', scope: 'Friday Communication', status: 'Connected', lastSync: '2026-10-11 10:35' },
    { id: 'int-2', integration: 'CRM sync', provider: 'Friday AI CRM', scope: 'Friday AI Desk', status: 'Connected', lastSync: '2026-10-11 10:28' },
    { id: 'int-3', integration: 'Email delivery', provider: 'SendGrid', scope: 'Platform', status: 'Action required', lastSync: '2026-10-10 18:02' },
  ]);
});

app.get('/api/monitoring', authorize('infrastructure.view'), (_q, r) => {
  if (supabaseConfigured()) return r.json([]);
  return r.json([
  { id: 'mon-1', service: 'Owner API', environment: 'Production', status: 'Operational', uptime: '99.99%', checkedAt: new Date().toISOString() },
  { id: 'mon-2', service: 'Customer web app', environment: 'Production', status: 'Operational', uptime: '99.95%', checkedAt: new Date().toISOString() },
  { id: 'mon-3', service: 'Background workers', environment: 'Production', status: 'Operational', uptime: '99.98%', checkedAt: new Date().toISOString() },
  ]);
});

app.get('/api/backups', authorize('infrastructure.view'), (_q, r) => {
  if (supabaseConfigured()) return r.json([]);
  return r.json([
  { id: 'bak-1', resource: 'Owner PostgreSQL', schedule: 'Daily 02:00 IST', lastBackup: '2026-10-11 02:00', status: 'Completed', retention: '30 days' },
  { id: 'bak-2', resource: 'Customer assets', schedule: 'Daily 03:00 IST', lastBackup: '2026-10-11 03:00', status: 'Completed', retention: '30 days' },
  ]);
});

app.get('/api/users-access', (q, r, next) => {
  if (!can(q, 'users.view')) return r.status(403).json({ error: 'FORBIDDEN', message: 'Permission required: users.view' });
  if (!supabaseConfigured()) {
    if (process.env.NODE_ENV === 'production') return r.status(503).json({ error: 'SUPABASE_NOT_CONFIGURED', message: 'Owner user directory requires Supabase Auth configuration.' });
    return r.json(ownerUsers); // local demo only
  }
  void (async () => {
    const response = await supabaseAdmin('/rest/v1/owner_profiles?select=user_id,email,full_name,role_key,is_active,is_primary_owner,must_change_password,created_at&order=created_at.desc');
    if (!response.ok) return r.status(502).json({ error: 'PROFILE_QUERY_FAILED', message: await response.text() });
    const rows = await response.json() as Array<Record<string, any>>;
    return r.json(rows.map((row) => ({
      id: row.user_id, name: row.full_name, email: row.email,
      role: roleNames[row.role_key] || row.role_key,
      status: row.is_active ? (row.must_change_password ? 'Password Change Required' : 'Active') : 'Disabled',
      lastLogin: 'Managed by Supabase Auth', isPrimaryOwner: row.is_primary_owner,
    })));
  })().catch((error) => { console.error(error); if (!r.headersSent) r.status(500).json({ error: 'USER_LIST_FAILED' }); });
});

const ownerUserSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  role: z.enum(['Owner', 'Super Admin', 'Admin', 'Operations', 'Support', 'Finance', 'Infrastructure Admin', 'Viewer']),
});

app.post('/api/users-access', async (q, r) => {
  if (!can(q, 'users.create')) return r.status(403).json({ error: 'FORBIDDEN', message: 'Permission required: users.create' });
  const parsed = ownerUserSchema.safeParse(q.body);
  if (!parsed.success) return r.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  const actor = (q as any).actor;
  const roleKey = roleKeys[parsed.data.role];
  if (!roleKey) return r.status(400).json({ error: 'INVALID_ROLE' });
  // Owner identities are never created through the ordinary employee form. Primary Owner is bootstrapped from env.
  if (roleKey === 'owner') return r.status(403).json({ error: 'OWNER_ROLE_RESERVED', message: 'The Owner role is reserved for the configured primary Owner.' });
  if (roleKey === 'super_admin' && actor?.roleKey !== 'owner' && actor?.role !== 'Owner') {
    return r.status(403).json({ error: 'PRIVILEGED_ROLE_REQUIRES_OWNER', message: 'Only the primary Owner may assign Super Admin.' });
  }

  if (!supabaseConfigured()) {
    if (process.env.NODE_ENV === 'production') return r.status(503).json({ error: 'SUPABASE_NOT_CONFIGURED', message: 'User creation requires configured Supabase Auth; no employee was created.' });
    // Preserve local demo behavior for explicitly non-production development only.
    const user = { id: ids(), ...parsed.data, status: 'Invitation pending', lastLogin: 'Never' };
    ownerUsers.unshift(user);
    addAudit('owner_user.created_demo', 'owner_user', user.id, undefined, user);
    return r.status(201).json({ ...user, persistence: 'in-memory-demo-only' });
  }

  try {
    const duplicate = await supabaseAdmin(`/rest/v1/owner_profiles?select=user_id&email=eq.${encodeURIComponent(parsed.data.email.toLowerCase())}&limit=1`);
    if (!duplicate.ok) return r.status(502).json({ error: 'PROFILE_QUERY_FAILED', message: await duplicate.text() });
    if ((await duplicate.json() as unknown[]).length) return r.status(409).json({ error: 'DUPLICATE', message: 'An employee with this email already exists.' });

    const inviteRedirect = process.env.OWNER_INVITE_REDIRECT_URL;
    if (!inviteRedirect) {
      return r.status(503).json({
        error: 'INVITATION_NOT_CONFIGURED',
        message: 'Employee invitations are unavailable until OWNER_INVITE_REDIRECT_URL is configured on the server.',
      });
    }

    let redirectTo: URL;
    try {
      redirectTo = new URL(inviteRedirect);
    } catch {
      return r.status(503).json({
        error: 'INVITATION_NOT_CONFIGURED',
        message: 'OWNER_INVITE_REDIRECT_URL is not a valid URL.',
      });
    }

    if (redirectTo.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && redirectTo.hostname === 'localhost')) {
      return r.status(503).json({ error: 'INVITATION_NOT_CONFIGURED', message: 'Owner invitation redirect must use HTTPS.' });
    }

    // Do not create an employee with a shared or server-generated password.
    // Supabase sends a one-time invite link through its configured email flow.
    // GoTrue accepts redirect_to as an invite ENDPOINT query parameter, not a JSON property.
    const createAuth = await supabaseAdmin('/auth/v1/invite?redirect_to=' + encodeURIComponent(redirectTo.toString()), {
      method: 'POST',
      body: JSON.stringify({
        email: parsed.data.email.toLowerCase(),
        data: {
          full_name: parsed.data.name,
          account_type: 'internal_employee',
        },
      }),
    });
    const authPayload = await createAuth.json().catch(() => ({})) as Record<string, any>;
    if (!createAuth.ok) {
      const duplicateMessage = String(authPayload.msg || authPayload.message || authPayload.error_description || '').toLowerCase();
      if (createAuth.status === 422 || duplicateMessage.includes('already')) return r.status(409).json({ error: 'AUTH_USER_EXISTS', message: 'This email is already registered in Supabase Auth. Check with the Owner before adding it as a staff account.' });
      console.error('Supabase Owner invite rejected:', createAuth.status, String(authPayload.code || authPayload.error_code || authPayload.msg || authPayload.message || 'unknown'));
      return r.status(502).json({ error: 'INVITATION_FAILED', message: 'Supabase could not send the invitation. Check email delivery settings and try again.' });
    }
    const authUser = authPayload.user || authPayload;
    if (!authUser.id) return r.status(502).json({ error: 'AUTH_USER_ID_MISSING', message: 'Supabase Auth did not return the new user ID.' });

    const profile = {
      user_id: authUser.id, email: parsed.data.email.toLowerCase(), full_name: parsed.data.name,
      role_key: roleKey, account_type: 'internal_employee', must_change_password: true,
      is_primary_owner: false, is_active: true,
    };
    const profileInsert = await supabaseAdmin('/rest/v1/owner_profiles', {
      method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(profile),
    });
    if (!profileInsert.ok) {
      // Compensate to avoid leaving an Auth account without its Friday Owner profile.
      const rollback = await supabaseAdmin(`/auth/v1/admin/users/${encodeURIComponent(authUser.id)}`, { method: 'DELETE' });
      console.error('Profile insert failed; attempted Auth-user rollback:', await profileInsert.text(), 'rollback status:', rollback.status);
      return r.status(502).json({ error: 'PROFILE_CREATE_FAILED', message: rollback.ok
        ? 'Supabase Auth accepted the invite, but the employee profile could not be saved. The Auth user was rolled back. Retry after reviewing server logs.'
        : 'Invitation was accepted, but employee provisioning is incomplete. Contact an Owner administrator; do not retry until the account is reconciled.' });
    }
    const result = {
      id: authUser.id, name: parsed.data.name, email: parsed.data.email.toLowerCase(), role: parsed.data.role,
      status: 'Invitation pending', lastLogin: 'Never', isPrimaryOwner: false,
      must_change_password: true,
    };
    // Make the action auditable in persistent storage, never in the demo-only store.
    // The Auth user and profile are already created; do not claim an invitation failed merely
    // because audit storage becomes temporarily unavailable.
    let auditRecorded = true;
    try {
      await recordPlatformAudit(q, 'owner_user.invited', 'owner_user', authUser.id, undefined,
        { email: result.email, role: result.role, status: result.status });
    } catch (auditError) {
      auditRecorded = false;
      console.error('Owner invite succeeded but audit failed:', auditError);
    }
    return r.status(201).json({ ...result, auditRecorded });
  } catch (error) {
    console.error('Employee creation failed:', error);
    return r.status(500).json({ error: 'EMPLOYEE_CREATE_FAILED', message: 'Could not create the employee. Check server configuration and logs.' });
  }
});

app.delete('/api/users-access/:id', async (q, r) => {
  if (!can(q, 'users.delete')) return r.status(403).json({ error: 'FORBIDDEN', message: 'Permission required: users.delete' });
  if (!supabaseConfigured()) {
    const index = ownerUsers.findIndex((user) => user.id === q.params.id);
    if (index < 0) return r.status(404).json({ error: 'NOT_FOUND', message: 'User not found.' });
    const target = ownerUsers[index];
    if (target.role === 'Owner' || (target as any).isPrimaryOwner === true) return r.status(403).json({ error: 'PRIMARY_OWNER_PROTECTED', message: 'Owner accounts cannot be deleted.' });
    const [removed] = ownerUsers.splice(index, 1);
    addAudit('owner_user.deleted_demo', 'owner_user', removed.id, removed, undefined);
    return r.json({ success: true, userId: removed.id, persistence: 'in-memory-demo-only', sessionsRevoked: false });
  }
  try {
    const response = await supabaseAdmin(`/rest/v1/owner_profiles?select=user_id,email,full_name,role_key,is_primary_owner,is_active&user_id=eq.${encodeURIComponent(q.params.id)}&limit=1`);
    if (!response.ok) return r.status(502).json({ error: 'PROFILE_QUERY_FAILED' });
    const rows = await response.json() as Array<Record<string, any>>;
    const target = rows[0];
    if (!target) return r.status(404).json({ error: 'NOT_FOUND', message: 'Employee not found.' });
    if (target.is_primary_owner || target.role_key === 'owner') return r.status(403).json({ error: 'PRIMARY_OWNER_PROTECTED', message: 'Owner accounts cannot be deleted.' });
    // FK is ON DELETE RESTRICT, so remove the profile first and restore it if Auth deletion fails.
    const deleteProfile = await supabaseAdmin(`/rest/v1/owner_profiles?user_id=eq.${encodeURIComponent(target.user_id)}`, { method: 'DELETE' });
    if (!deleteProfile.ok) return r.status(502).json({ error: 'PROFILE_DELETE_FAILED' });
    const deleteAuth = await supabaseAdmin(`/auth/v1/admin/users/${encodeURIComponent(target.user_id)}`, { method: 'DELETE' });
    if (!deleteAuth.ok) {
      const restore = await supabaseAdmin('/rest/v1/owner_profiles', { method: 'POST', body: JSON.stringify(target) });
      console.error('Auth deletion failed; profile restore status:', restore.status);
      return r.status(502).json({ error: 'AUTH_USER_DELETE_FAILED', message: 'Auth account deletion failed; profile restoration was attempted.' });
    }
    addAudit('owner_user.deleted', 'owner_user', target.user_id, target, undefined);
    return r.json({ success: true, userId: target.user_id, sessionsRevoked: true });
  } catch (error) {
    console.error('Employee deletion failed:', error);
    return r.status(500).json({ error: 'EMPLOYEE_DELETE_FAILED' });
  }
});

app.get('/api/owner-settings', authorize('configuration.view'), (_q, r) => {
  if (supabaseConfigured()) return r.json([]);
  return r.json([
  { id: 'set-1', setting: 'Default trial duration', value: '14 days', scope: 'New onboarding', updatedBy: 'Jaya Sankara' },
  { id: 'set-2', setting: 'Customer invite expiry', value: '72 hours', scope: 'Access', updatedBy: 'Jaya Sankara' },
  { id: 'set-3', setting: 'Audit retention', value: '365 days', scope: 'Compliance', updatedBy: 'Jaya Sankara' },
  ]);
});

app.use(
  (
    err: unknown,
    _q: express.Request,
    r: express.Response,
    _n: express.NextFunction,
  ) => {
    console.error(err);

    r.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Unexpected server error',
    });
  },
);

// Vercel / Node server default export
export default app;
