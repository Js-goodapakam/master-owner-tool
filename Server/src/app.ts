import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { authenticate, authorize } from './auth.js';
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

app.use(express.json());

// Supabase privileged operations are server-only. Never expose these keys to the browser.
const employeeTemporaryPassword = 'friday@123';
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
function can(req: express.Request, permission: string): boolean {
  return Boolean((req as any).actor?.permissions?.includes(permission));
}

app.get('/health', (_q, r) =>
  r.json({
    status: 'ok',
    mode: process.env.DATABASE_URL ? 'database' : 'demo',
  }),
);

app.post('/api/auth/login', async (q, r) => {
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

app.get('/api/dashboard', authorize('customer.view'), async (_q, r) => {
  const provider = new MockInfrastructureProvider();
  const infrastructure = await provider.list() as Array<{ status?: string }>;
  const subscriptionRows = customers.map((customer, index) => ({
    customer: customer.companyName,
    product: 'Friday AI Desk',
    plan: index === 1 ? 'Premium' : 'Enterprise',
    status: customer.status === 'TRIAL' ? 'Trial' : 'Active',
    expiryDate: '2027-09-19',
  }));
  const growth = customers
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
      ['Total Customers', customers.length],
      [
        'Active Customers',
        customers.filter((x) => x.status === 'ACTIVE').length,
      ],
      ['Active Tenants', customers.filter((x) => ['ACTIVE', 'TRIAL'].includes(x.status)).length],
      ['Active Products', products.length],
      ['Active Subscriptions', subscriptionRows.filter((x) => x.status === 'Active').length],
      ['Total Users', 38],
      ['Hosting Nodes', infrastructure.length],
      ['Ongoing Deployments', 0],
      ['System Health', 'Healthy'],
    ],
    activity: audit.slice(0, 5),
    onboarding: customers.filter((x) =>
      ['ONBOARDING', 'KYC', 'TRIAL'].includes(x.status),
    ),
    subscriptions: {
      active: subscriptionRows.filter((x) => x.status === 'Active').length,
      trial: subscriptionRows.filter((x) => x.status === 'Trial').length,
      expiring: 0,
      suspended: 0,
      cancelled: 0,
    },
    health: await provider.health(),
    customerGrowth: growth,
    productAdoption: products.map((product, index) => ({
      product: product.name,
      customers: Math.max(0, customers.length - index),
      modules: product.modules.length,
    })),
    deployments: [
      { id: 'dep-1', application: 'Friday AI Desk', customer: 'Demo Hospitality', environment: 'PRODUCTION', version: '2.1.0', status: 'Success', completed: '2026-10-05T15:24:00Z' },
    ],
    renewals: subscriptionRows.slice(0, 3),
  });
});

app.get('/api/customers', authorize('customer.view'), (_q, r) =>
  r.json(customers),
);

app.get('/api/signup-requests', authorize('customer.create'), (_q, r) =>
  r.json(signupRequests),
);

app.delete('/api/signup-requests/:id', authorize('customer.create'), (q, r) => {
  const index = signupRequests.findIndex((item) => item.id === q.params.id);
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

  const item = {
    id: ids(),
    customerId: `FRI-${1000 + customers.length + 1}`,
    status: 'ONBOARDING' as const,
    createdAt: new Date().toISOString(),
    ...parsed.data,
  };

  customers.unshift(item);

  addAudit(
    'customer.created',
    'customer',
    item.id,
    undefined,
    item,
  );

  r.status(201).json(item);
});

app.get('/api/customers/:id', authorize('customer.view'), (q, r) => {
  const c = customers.find((x) => x.id === q.params.id);

  if (!c) {
    return r.status(404).json({ error: 'NOT_FOUND' });
  }

  r.json({
    customer: c,
    products: [products[1]],
    users: [
      {
        name: 'Priya Menon',
        role: 'Property Admin',
        status: 'Active',
        lastLogin: 'Today, 10:42',
      },
    ],
    subscription: {
      plan: 'Premium',
      status: c.status === 'TRIAL' ? 'Trial' : 'Active',
      startDate: '2026-09-20',
      expiryDate: '2027-09-19',
      renewal: 'Auto',
    },
    configuration: [
      {
        key: 'branding.primaryColor',
        value: '#2798e8',
        scope: 'Customer',
        environment: 'PRODUCTION',
        status: 'Active',
        updatedBy: 'Ananya Rao',
        updatedDate: '2026-10-04',
      },
    ],
    infrastructure: [
      {
        server: 'Friday Production Node 01',
        environment: 'PRODUCTION',
        status: 'Healthy',
        services: 'API, Worker',
      },
    ],
    activity: audit.filter((a) => a.resourceId === c.id),
  });
});

app.patch('/api/customers/:id', authorize('customer.update'), (q, r) => {
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

app.get('/api/products', authorize('product.view'), (_q, r) =>
  r.json(products),
);

app.get('/api/plans', authorize('subscription.view'), (_q, r) =>
  r.json(plans),
);

app.get(
  '/api/subscriptions',
  authorize('subscription.view'),
  (_q, r) =>
    r.json(
      customers.map((c, i) => ({
        id: `s${i + 1}`,
        customer: c.companyName,
        product: 'Friday AI Desk',
        plan: i === 1 ? 'Premium' : 'Enterprise',
        status: c.status === 'TRIAL' ? 'Trial' : 'Active',
        expiryDate: '2027-09-19',
      })),
    ),
);

app.post(
  '/api/subscriptions',
  authorize('subscription.manage'),
  (q, r) => {
    addAudit(
      'subscription.activated',
      'subscription',
      ids(),
      undefined,
      q.body,
    );

    r.status(201).json({
      status: 'Active',
      ...q.body,
    });
  },
);

app.get(
  '/api/infrastructure',
  authorize('infrastructure.view'),
  async (_q, r) =>
    r.json(await new MockInfrastructureProvider().list()),
);

app.get(
  '/api/deployments',
  authorize('deployment.view'),
  (_q, r) =>
    r.json([
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
    ]),
);

app.post(
  '/api/deployments',
  authorize('deployment.manage'),
  async (q, r) => {
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
  (_q, r) => r.json(configuration),
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

app.get(
  '/api/audit-logs',
  authorize('audit.view'),
  (_q, r) => r.json(audit),
);

// Owner-facing operational inventories. These are explicit control-plane records,
// not direct access to a customer's application data.
app.get('/api/integrations', authorize('configuration.view'), (_q, r) => r.json([
  { id: 'int-1', integration: 'WhatsApp Business', provider: 'Meta', scope: 'Friday Communication', status: 'Connected', lastSync: '2026-10-11 10:35' },
  { id: 'int-2', integration: 'CRM sync', provider: 'Friday AI CRM', scope: 'Friday AI Desk', status: 'Connected', lastSync: '2026-10-11 10:28' },
  { id: 'int-3', integration: 'Email delivery', provider: 'SendGrid', scope: 'Platform', status: 'Action required', lastSync: '2026-10-10 18:02' },
]));

app.get('/api/monitoring', authorize('infrastructure.view'), (_q, r) => r.json([
  { id: 'mon-1', service: 'Owner API', environment: 'Production', status: 'Operational', uptime: '99.99%', checkedAt: new Date().toISOString() },
  { id: 'mon-2', service: 'Customer web app', environment: 'Production', status: 'Operational', uptime: '99.95%', checkedAt: new Date().toISOString() },
  { id: 'mon-3', service: 'Background workers', environment: 'Production', status: 'Operational', uptime: '99.98%', checkedAt: new Date().toISOString() },
]));

app.get('/api/backups', authorize('infrastructure.view'), (_q, r) => r.json([
  { id: 'bak-1', resource: 'Owner PostgreSQL', schedule: 'Daily 02:00 IST', lastBackup: '2026-10-11 02:00', status: 'Completed', retention: '30 days' },
  { id: 'bak-2', resource: 'Customer assets', schedule: 'Daily 03:00 IST', lastBackup: '2026-10-11 03:00', status: 'Completed', retention: '30 days' },
]));

app.get('/api/users-access', (q, r, next) => {
  if (!can(q, 'users.view')) return r.status(403).json({ error: 'FORBIDDEN', message: 'Permission required: users.view' });
  if (!supabaseConfigured()) return r.json(ownerUsers); // local demo only
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
    // Preserve local demo behavior when Supabase credentials are not configured.
    const user = { id: ids(), ...parsed.data, status: 'Invitation pending', lastLogin: 'Never' };
    ownerUsers.unshift(user);
    addAudit('owner_user.created_demo', 'owner_user', user.id, undefined, user);
    return r.status(201).json({ ...user, persistence: 'in-memory-demo-only' });
  }

  try {
    const duplicate = await supabaseAdmin(`/rest/v1/owner_profiles?select=user_id&email=eq.${encodeURIComponent(parsed.data.email.toLowerCase())}&limit=1`);
    if (!duplicate.ok) return r.status(502).json({ error: 'PROFILE_QUERY_FAILED', message: await duplicate.text() });
    if ((await duplicate.json() as unknown[]).length) return r.status(409).json({ error: 'DUPLICATE', message: 'An employee with this email already exists.' });

    const createAuth = await supabaseAdmin('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: parsed.data.email.toLowerCase(), password: employeeTemporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: parsed.data.name, account_type: 'internal_employee', must_change_password: true },
      }),
    });
    const authPayload = await createAuth.json().catch(() => ({})) as Record<string, any>;
    if (!createAuth.ok) {
      const duplicateMessage = String(authPayload.msg || authPayload.message || authPayload.error_description || '').toLowerCase();
      if (createAuth.status === 422 || duplicateMessage.includes('already')) return r.status(409).json({ error: 'AUTH_USER_EXISTS', message: 'This email already belongs to a Supabase Auth user. Verify that it is not a customer account before provisioning it for Friday Owner.' });
      return r.status(502).json({ error: 'AUTH_USER_CREATE_FAILED', detail: authPayload });
    }
    const authUser = authPayload.user || authPayload;
    if (!authUser.id) return r.status(502).json({ error: 'AUTH_USER_ID_MISSING', message: 'Supabase Auth did not return the new user ID.' });

    const profile = {
      user_id: authUser.id, email: parsed.data.email.toLowerCase(), full_name: parsed.data.name,
      role_key: roleKey, account_type: 'internal_employee', must_change_password: true,
      is_primary_owner: false, is_active: true, created_by: actor?.id && actor.id !== 'demo-user' ? actor.id : null,
    };
    const profileInsert = await supabaseAdmin('/rest/v1/owner_profiles', {
      method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(profile),
    });
    if (!profileInsert.ok) {
      // Compensate to avoid leaving an Auth account without its Friday Owner profile.
      const rollback = await supabaseAdmin(`/auth/v1/admin/users/${encodeURIComponent(authUser.id)}`, { method: 'DELETE' });
      console.error('Profile insert failed; attempted Auth-user rollback:', await profileInsert.text(), 'rollback status:', rollback.status);
      return r.status(502).json({ error: 'PROFILE_CREATE_FAILED', message: 'Employee profile could not be saved; the Auth account creation was rolled back where possible.' });
    }
    const result = {
      id: authUser.id, name: parsed.data.name, email: parsed.data.email.toLowerCase(), role: parsed.data.role,
      status: 'Password Change Required', lastLogin: 'Never', isPrimaryOwner: false,
      must_change_password: true,
    };
    addAudit('owner_user.created', 'owner_user', authUser.id, undefined, { ...result, temporaryPassword: '[not logged]' });
    return r.status(201).json(result);
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

app.get('/api/owner-settings', authorize('configuration.view'), (_q, r) => r.json([
  { id: 'set-1', setting: 'Default trial duration', value: '14 days', scope: 'New onboarding', updatedBy: 'Jaya Sankara' },
  { id: 'set-2', setting: 'Customer invite expiry', value: '72 hours', scope: 'Access', updatedBy: 'Jaya Sankara' },
  { id: 'set-3', setting: 'Audit retention', value: '365 days', scope: 'Compliance', updatedBy: 'Jaya Sankara' },
]));

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
