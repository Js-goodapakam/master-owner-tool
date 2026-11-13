import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import Login from './Login';
import InviteActivation, { type OwnerInvitation } from './InviteActivation';
import logo from './assets/friday-f-logo.png';

import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Hotel,
  CreditCard,
  DatabaseBackup,
  FileClock,
  LayoutDashboard,
  LogOut,
  Package,
  PlugZap,
  Rocket,
  Search,
  Server,
  Settings,
  Settings2,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';

import { api } from './api';

import {
  Badge,
  Button,
  Card,
  ErrorState,
  Input,
  Loading,
  Select,
  Table,
} from './components';

import './styles.css';
import './auth.css';
import './UsersAccess.css';
import './application-selector.css';
import './OwnerModules.css';

import Dashboard from './Dashboard';
import NewOnboarding from './NewOnboarding';


/* =========================================================
   FRIDAY OWNER NAVIGATION
========================================================= */

const nav = [
  {
    name: 'Home',
    icon: LayoutDashboard,
  },
  {
    name: 'New Onboarding',
    icon: UserPlus,
  },
  {
    name: 'Customers',
    icon: Users,
  },
  {
    name: 'Products & Plans',
    icon: Package,
  },
  {
    name: 'Subscriptions',
    icon: CreditCard,
  },
  {
    name: 'Infrastructure',
    icon: Server,
  },
  {
    name: 'Deployments',
    icon: Rocket,
  },
  {
    name: 'Customer Settings',
    icon: Settings2,
  },
  {
    name: 'Connected Integrations',
    icon: PlugZap,
  },
  {
    name: 'Live Monitoring',
    icon: Activity,
  },
  {
    name: 'Backup & Restore',
    icon: DatabaseBackup,
  },
  {
    name: 'Users & Access',
    icon: ShieldCheck,
  },
  {
    name: 'Audit Logs',
    icon: FileClock,
  },
  {
    name: 'Owner Settings',
    icon: Settings,
  },
];


const ownerModuleDescriptions: Record<string, { title: string; description: string }> = {
  'Customer Onboarding': { title: 'Customer onboarding', description: 'Review incoming registrations and configure customer workspaces through the seven-step journey.' },
  'Customers': { title: 'Customer management', description: 'Manage customer profiles, subscriptions, documents, access, and tenant lifecycle.' },
  'Products': { title: 'Products & plans', description: 'Review registered products, connected services and available commercial plans.' },
  'Subscriptions': { title: 'Subscription management', description: 'Track subscriptions, renewals, customer lifecycle states and expiry schedules.' },
  'Infrastructure': { title: 'Infrastructure', description: 'Review registered infrastructure providers, environments and recorded capacity.' },
  'Deployments': { title: 'Deployments', description: 'Inspect deployment records, versions and release status across environments.' },
  'Configuration': { title: 'Customer settings', description: 'Inspect and manage the stored configuration of customer application environments.' },
  'Connected Integrations': { title: 'Connected integrations', description: 'Review integration connections, providers and synchronization records.' },
  'Live Monitoring': { title: 'Live monitoring', description: 'View monitoring records and service availability reported by connected providers.' },
  'Backup & Restore': { title: 'Backup & restore', description: 'Review available backup schedules, retention and recovery records.' },
  'Users & Access': { title: 'Users & access', description: 'Manage internal Owner Console accounts and role-based access.' },
  'Audit Logs': { title: 'Audit logs', description: 'Trace important administrative and customer lifecycle changes.' },
  'Owner Settings': { title: 'Owner settings', description: 'Review platform-wide settings and administrative preferences.' },
};

/* =========================================================
   CUSTOMERS
========================================================= */

function Customers({
  open,
}: {
  open: (id: string) => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api<any[]>('/customers')
      .then((result) => { if (active) setRows(result); })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load customers.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <Card title="Customers">
      {loading ? <Loading /> : error ? <ErrorState message={error} /> : null}
      <Table
        headers={[
          'Customer',
          'ID',
          'Industry',
          'Status',
          'Owner',
          '',
        ]}
      >
        {rows.map((x) => (
          <tr key={x.id}>
            <td>
              {x.companyName}
              <small>{x.email}</small>
            </td>

            <td>{x.customerId}</td>

            <td>{x.industry}</td>

            <td>
              <Badge>{x.status}</Badge>
            </td>

            <td>{x.accountOwner}</td>

            <td>
              <Button onClick={() => open(x.id)}>
                View Customer
              </Button>
            </td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}


/* =========================================================
   CUSTOMER ONBOARDING
========================================================= */

function Onboarding() {
  const [step, setStep] = useState(1);
  const [id, setId] = useState('');

  const [form, setForm] = useState<any>({
    companyName: '',
    legalName: '',
    email: '',
    industry: 'Hospitality',
    accountOwner: '',
  });

  const steps = [
    'Customer Details',
    'Business Details',
    'KYC / Documents',
    'Product Selection',
    'Plan Selection',
    'Create Customer Account',
    'Product Configuration',
    'Customer Administrator',
    'Hosting Setup',
    'Review',
    'Activate',
  ];

  const save = async () => {
    try {
      const r: any = await api('/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          step,
          customerId: id || undefined,
          data: form,
        }),
      });

      setId(r.customer.id);

      if (step < 11) {
        setStep(step + 1);
      } else {
        alert('Customer activated for review workflow.');
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <Card>
      <div className="wizard-head">
        <div>
          <h2>New Customer Request</h2>

          <p>
            Review the signup details and prepare the account for trial activation.
            Only steps supported by the connected service can be saved.
          </p>
        </div>

        <Badge>
          Step {step} / 11
        </Badge>
      </div>

      <div className="progress">
        {steps.map((x, i) => (
          <span
            className={
              i < step
                ? 'done'
                : i === step - 1
                ? 'current'
                : ''
            }
            key={x}
            title={x}
          />
        ))}
      </div>

      <h3>{steps[step - 1]}</h3>

      {step === 1 ? (
        <div className="form">

          <Input
            placeholder="Company or Business Name *"
            value={form.companyName}
            onChange={(e) =>
              setForm({
                ...form,
                companyName: e.target.value,
              })
            }
          />

          <Input
            placeholder="Registered Business Name (if applicable)"
            value={form.legalName}
            onChange={(e) =>
              setForm({
                ...form,
                legalName: e.target.value,
              })
            }
          />

          <Input
            placeholder="Customer Administrator Email Address *"
            value={form.email}
            onChange={(e) =>
              setForm({
                ...form,
                email: e.target.value,
              })
            }
          />

          <Select
            value={form.industry}
            onChange={(e: any) =>
              setForm({
                ...form,
                industry: e.target.value,
              })
            }
          >
            {[
              'Hospitality',
              'Real Estate',
              'Fitness',
              'Sales',
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </Select>

          <Input
            placeholder="Engagehubs team member handling this request"
            value={form.accountOwner}
            onChange={(e) =>
              setForm({
                ...form,
                accountOwner: e.target.value,
              })
            }
          />

        </div>
      ) : (
        <div className="step-placeholder">
          Configure {steps[step - 1]}. This MVP persists
          the customer record progressively; product, KYC,
          tenant and configuration adapters are modelled
          in the control-plane schema.
        </div>
      )}

      <div className="actions">

        <Button
          disabled={step === 1}
          onClick={() => setStep(step - 1)}
        >
          Back
        </Button>

        <Button onClick={save}>
          {step === 11
            ? 'Activate'
            : 'Save & continue'}
        </Button>

      </div>
    </Card>
  );
}


/* =========================================================
   CUSTOMER 360
========================================================= */

function EngageStayControls({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [workspace, setWorkspace] = useState<{ property_id: number; status: string; plan: string; modules: string[] }>();
  const [jobs, setJobs] = useState<Array<{ id: string; operation: string; status: string; attempt_count: number; failure_code?: string; failure_detail?: string }>>([]);
  const loadJobs = () => api<typeof jobs>(`/customers/${encodeURIComponent(id)}/provisioning-jobs`).then(setJobs).catch(() => setJobs([]));
  useEffect(() => { void loadJobs(); }, [id]);

  return <Card title="EngageStay workspace">
    {workspace && <p role="status">Property {workspace.property_id} · {workspace.status} · {workspace.plan} · {workspace.modules.join(', ')}</p>}
    {error && <p role="alert">{error}</p>}
    <form onSubmit={async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const fields = new FormData(form);
      const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
      if (!action || busy) return;
      setBusy(true);
      setError('');
      try {
        setWorkspace(await api<NonNullable<typeof workspace>>(`/customers/${encodeURIComponent(id)}/engagestay`, {
          method: 'POST',
          headers: { 'Idempotency-Key': `workspace-${id}-${action}-${Date.now()}` },
          body: JSON.stringify({
            action, adminName: fields.get('adminName'),
            password: action === 'approve' ? fields.get('password') : undefined,
            plan: fields.get('plan'),
            modules: String(fields.get('modules') || '').split(',').map(value => value.trim()).filter(Boolean),
          }),
        }));
        await loadJobs();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'EngageStay could not complete the request.');
      } finally {
        const password = form.elements.namedItem('password') as HTMLInputElement;
        password.value = '';
        setBusy(false);
      }
    }}>
      <fieldset disabled={busy}>
        <legend>Workspace setup and access</legend>
        <label>Administrator name <input name="adminName" autoComplete="off" /></label>
        <label>Initial password <input name="password" type="password" autoComplete="new-password" /></label>
        <label>Plan <input name="plan" /></label>
        <label>Modules (comma-separated) <input name="modules" /></label>
        <button type="submit" value="approve">Approve and provision</button>
        <button type="submit" value="configure">Save access</button>
        <button type="submit" value="suspend">Suspend</button>
        <button type="submit" value="reactivate">Reactivate</button>
      </fieldset>
    </form>
    <h4>Provisioning history</h4>
    {jobs.length === 0 ? <p>No provisioning attempts recorded.</p> : <Table headers={['Operation', 'Status', 'Attempts', 'Error']}>
      {jobs.map(job => <tr key={job.id}><td>{job.operation}</td><td><Badge>{job.status}</Badge></td><td>{job.attempt_count}</td><td>{job.failure_code ? `${job.failure_code}${job.failure_detail ? ` — ${job.failure_detail}` : ''}` : '—'}</td></tr>)}
    </Table>}
  </Card>;
}

function CustomerDocuments({ id }: { id: string }) {
  const [docs, setDocs] = useState<any[]>([]); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const load = () => api<any[]>(`/customers/${encodeURIComponent(id)}/documents`).then(setDocs).catch(e => setMessage(e.message));
  useEffect(() => { void load(); }, [id]);
  const upload = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const file = form.get('file') as File; if (!file) return; setBusy(true); setMessage(''); try { const dataBase64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); }); await api(`/customers/${encodeURIComponent(id)}/documents`, { method: 'POST', body: JSON.stringify({ category: form.get('category'), name: file.name, contentType: file.type, dataBase64 }) }); event.currentTarget.reset(); await load(); setMessage('Document uploaded.'); } catch (e) { setMessage(e instanceof Error ? e.message : 'Upload failed.'); } finally { setBusy(false); } };
  const download = async (doc: any) => { setBusy(true); try { const token = localStorage.getItem('friday-access-token'); const response = await fetch(`/api/customers/${encodeURIComponent(id)}/documents/${encodeURIComponent(doc.id)}/download`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); if (!response.ok) throw Error('Download failed.'); const blob = await response.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = doc.original_name; a.click(); URL.revokeObjectURL(url); } catch (e) { setMessage(e instanceof Error ? e.message : 'Download failed.'); } finally { setBusy(false); } };
  return <Card title="Customer documents" subtitle="Private KYC and business records. Access is authorized per customer."><form className="owner-user-form" onSubmit={upload}><Select name="category" defaultValue="KYC"><option>KYC</option><option>GST</option><option>PAN</option><option>INCORPORATION</option><option>ADDRESS</option><option>CONTRACT</option><option>OTHER</option></Select><input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required /><Button type="submit" disabled={busy}>{busy ? 'Working…' : 'Upload'}</Button></form>{message && <p role="status">{message}</p>}<Table headers={['Name','Category','Size','Version','Uploaded','Actions']}>{docs.map(doc => <tr key={doc.id}><td>{doc.original_name}</td><td>{doc.category}</td><td>{Math.ceil(doc.size_bytes / 1024)} KB</td><td>{doc.version}</td><td>{new Date(doc.created_at).toLocaleString()}</td><td><Button type="button" disabled={busy} onClick={() => void download(doc)}>Download</Button></td></tr>)}</Table></Card>;
}

function CustomerProfile({ customer, onSaved }: { customer: any; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ companyName: customer.companyName || '', legalName: customer.legalName || '', email: customer.email || '', phone: customer.phone || '', industry: customer.industry || 'Other', accountOwner: customer.accountOwner || '', city: customer.city || '', country: customer.country || '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => setForm({ companyName: customer.companyName || '', legalName: customer.legalName || '', email: customer.email || '', phone: customer.phone || '', industry: customer.industry || 'Other', accountOwner: customer.accountOwner || '', city: customer.city || '', country: customer.country || '' }), [customer]);
  return <Card title="Customer profile" subtitle="Platform account information. Changes are recorded in audit history.">
    <form className="owner-user-form" onSubmit={async (event) => { event.preventDefault(); setSaving(true); setMessage(''); try { await api(`/customers/${encodeURIComponent(customer.id)}`, { method: 'PATCH', body: JSON.stringify(form) }); await onSaved(); setMessage('Saved.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save customer profile.'); } finally { setSaving(false); } }}>
      <Input required placeholder="Display name" value={form.companyName} onChange={(event) => setForm({ ...form, companyName: event.target.value })} />
      <Input required placeholder="Legal business name" value={form.legalName} onChange={(event) => setForm({ ...form, legalName: event.target.value })} />
      <Input required type="email" placeholder="Primary email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
      <Input placeholder="Phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
      <Input placeholder="Industry" value={form.industry} onChange={(event) => setForm({ ...form, industry: event.target.value })} />
      <Input placeholder="Account owner" value={form.accountOwner} onChange={(event) => setForm({ ...form, accountOwner: event.target.value })} />
      <Input placeholder="City" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
      <Input placeholder="Country" value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} />
      <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</Button>
    </form>
    {message && <p className="owner-user-message" role="status">{message}</p>}
  </Card>;
}

function CustomerCommercial({ customer, detail, onSaved }: { customer: any; detail: any; onSaved: () => Promise<void> }) {
  const [plans, setPlans] = useState<any[]>([]); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const subscription = detail.subscription;
  useEffect(() => { void api<any[]>('/plans').then(setPlans).catch(() => setPlans([])); }, []);
  const run = async (path: string, body: unknown) => { setBusy(true); setMessage(''); try { await api(path, { method: path.includes('/subscriptions/') ? 'PATCH' : 'POST', body: JSON.stringify(body) }); await onSaved(); setMessage('Saved.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Commercial action failed.'); } finally { setBusy(false); } };
  const productPlans = plans.filter((plan) => !subscription.product || plan.product === subscription.product);
  return <>
    <Card title="Subscription lifecycle" subtitle="Activate a trial or live subscription and manage its lifecycle.">
      <form className="owner-user-form" onSubmit={(event) => { event.preventDefault(); const fields = new FormData(event.currentTarget); void run('/subscriptions', { customerId: customer.id, planId: fields.get('planId'), status: fields.get('status'), expiresAt: fields.get('expiresAt') ? new Date(String(fields.get('expiresAt'))).toISOString() : undefined, renewalMode: fields.get('renewalMode') }); }}>
        <Select name="planId" required defaultValue=""><option value="" disabled>Select plan</option>{productPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.product}</option>)}</Select>
        <Select name="status" defaultValue="TRIAL"><option value="TRIAL">Trial</option><option value="ACTIVE">Live</option></Select>
        <Input name="expiresAt" type="datetime-local" aria-label="Subscription expiry" />
        <Select name="renewalMode" defaultValue="MANUAL"><option value="MANUAL">Manual renewal</option><option value="AUTO_RENEW">Auto renew</option></Select>
        <Button type="submit" disabled={busy || subscription.id}>Activate subscription</Button>
      </form>
      {subscription.id && <div className="owner-user-form"><Select value={subscription.planId || ''} onChange={(event: ChangeEvent<HTMLSelectElement>) => void run(`/subscriptions/${subscription.id}`, { action: 'CHANGE_PLAN', planId: event.target.value })}>{productPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</Select><Button disabled={busy} onClick={() => void run(`/subscriptions/${subscription.id}`, { action: 'SUSPEND' })}>Suspend</Button><Button disabled={busy} onClick={() => void run(`/subscriptions/${subscription.id}`, { action: 'REACTIVATE' })}>Reactivate</Button></div>}
      {message && <p className="owner-user-message" role="status">{message}</p>}
    </Card>
    <Card title="Customer entitlement override" subtitle="Temporary exceptions are audited and stored server-side.">
      <form className="owner-user-form" onSubmit={(event) => { event.preventDefault(); const fields = new FormData(event.currentTarget); try { void run(`/customers/${customer.id}/entitlements`, { productId: fields.get('productId'), entitlementKey: fields.get('entitlementKey'), value: String(fields.get('value')) === 'true', reason: fields.get('reason'), expiresAt: fields.get('expiresAt') ? new Date(String(fields.get('expiresAt'))).toISOString() : null }); } catch { setMessage('Invalid entitlement value.'); } }}>
        <Select name="productId" required defaultValue=""><option value="" disabled>Select product</option>{detail.products.map((product: any) => <option key={product.id} value={product.id}>{product.name}</option>)}</Select>
        <Input name="entitlementKey" required placeholder="Feature or limit key" />
        <Select name="value" defaultValue="true"><option value="true">Enabled</option><option value="false">Disabled</option></Select>
        <Input name="expiresAt" type="datetime-local" aria-label="Override expiry" />
        <Input name="reason" required placeholder="Business reason" />
        <Button type="submit" disabled={busy}>Apply override</Button>
      </form>
    </Card>
  </>;
}

function Customer360({
  id,
  back,
}: {
  id: string;
  back: () => void;
}) {
  const [d, setD] = useState<any>();
  const [activeTab, setActiveTab] = useState('Overview');

  const load = async () => setD(await api<any>(`/customers/${id}`));

  useEffect(() => {
    void load();
  }, [id]);

  if (!d) {
    return <Loading />;
  }

  const c = d.customer;
  const tabs = ['Overview', 'Products', 'Users', 'Documents', 'Subscription', 'Configuration', 'Infrastructure', 'Activity'];

  const content = activeTab === 'Overview' ? <>
    <CustomerProfile customer={c} onSaved={load} />
    <div className="cols">
      <Card title="Company information"><p><b>Legal name:</b> {c.legalName}</p><p><b>Location:</b> {c.city || '—'}, {c.country || '—'}</p><p><b>Account owner:</b> {c.accountOwner}</p></Card>
      <Card title="Subscription"><p><b>{d.subscription.plan}</b> · {d.subscription.status}</p><p>Expiry: {d.subscription.expiryDate}</p><p>Renewal: {d.subscription.renewal}</p></Card>
    </div>
    <Card title="Assigned products">{d.products.map((p: any) => <p key={p.id} className="health"><span>{p.name}<small>{p.version}</small></span><Badge>{p.status}</Badge></p>)}</Card>
  </> : activeTab === 'Products' ? <Card title="Assigned products" subtitle="Products and their current tenant entitlement status."><Table headers={['Product', 'Version', 'Modules', 'Features', 'Status']}>
    {d.products.map((p: any) => <tr key={p.id}><td>{p.name}</td><td>{p.version}</td><td>{p.modules?.join(', ') || '—'}</td><td>{p.features?.join(', ') || '—'}</td><td><Badge>{p.status}</Badge></td></tr>)}
  </Table></Card> : activeTab === 'Users' ? <Card title="Customer users" subtitle="Users with access to this customer workspace."><Table headers={['Name', 'Role', 'Status', 'Last login']}>
    {d.users.map((user: any) => <tr key={`${user.name}-${user.role}`}><td>{user.name}</td><td>{user.role}</td><td><Badge>{user.status}</Badge></td><td>{user.lastLogin}</td></tr>)}
  </Table></Card> : activeTab === 'Documents' ? <CustomerDocuments id={id} /> : activeTab === 'Subscription' ? <><Card title="Subscription details"><div className="customer-detail-grid"><div><small>Plan</small><b>{d.subscription.plan}</b></div><div><small>Status</small><b>{d.subscription.status}</b></div><div><small>Start date</small><b>{d.subscription.startDate}</b></div><div><small>Expiry date</small><b>{d.subscription.expiryDate}</b></div><div><small>Renewal</small><b>{d.subscription.renewal}</b></div></div></Card><CustomerCommercial customer={c} detail={d} onSaved={load} /></> : activeTab === 'Configuration' ? <Card title="Customer configuration" subtitle="Configuration values currently applied to this customer."><Table headers={['Key', 'Value', 'Scope', 'Environment', 'Status', 'Updated by', 'Updated date']}>
    {d.configuration.map((item: any) => <tr key={item.key}><td>{item.key}</td><td>{item.value}</td><td>{item.scope}</td><td>{item.environment}</td><td><Badge>{item.status}</Badge></td><td>{item.updatedBy}</td><td>{item.updatedDate}</td></tr>)}
  </Table></Card> : activeTab === 'Infrastructure' ? <Card title="Infrastructure" subtitle="Current hosting and service health for this customer."><Table headers={['Server', 'Environment', 'Status', 'Services']}>
    {d.infrastructure.map((item: any) => <tr key={item.server}><td>{item.server}</td><td>{item.environment}</td><td><Badge>{item.status}</Badge></td><td>{item.services}</td></tr>)}
  </Table></Card> : <Card title="Customer activity" subtitle="Auditable changes for this customer."><Table headers={['Actor', 'Action', 'Resource', 'Time']}>
    {d.activity.length === 0 ? <tr><td colSpan={4}>No recorded activity for this customer.</td></tr> : d.activity.map((item: any) => <tr key={item.id}><td>{item.actor}</td><td>{item.action}</td><td>{item.resourceType} · {item.resourceId}</td><td>{new Date(item.timestamp).toLocaleString('en-IN')}</td></tr>)}
  </Table></Card>;

  return (
    <>
      <Button onClick={back}>
        ← Customers
      </Button>

      <div className="customer-head">

        <div>
          <h1>{c.companyName}</h1>

          <p>
            {c.customerId} · {c.industry} · {c.email}
          </p>
        </div>

        <Badge>
          {c.status}
        </Badge>

      </div>

      <div className="tabs">
        {tabs.map((x) => (
          <button key={x} className={activeTab === x ? 'active' : ''} onClick={() => setActiveTab(x)} aria-current={activeTab === x ? 'page' : undefined}>
            {x}
          </button>
        ))}
      </div>
      {activeTab === 'Overview' && <EngageStayControls key={id} id={id} />}
      {content}
    </>
  );
}


/* =========================================================
   GENERIC COLLECTION
========================================================= */

function Collection({
  endpoint,
  title,
  headers,
}: {
  endpoint: string;
  title: string;
  headers: string[];
}) {
  const [rows, setRows] =
    useState<any[]>();

  useEffect(() => {
    api<any[]>(endpoint)
      .then(setRows);
  }, [endpoint]);

  if (!rows) {
    return <Loading />;
  }

  const valueFor = (row: Record<string, unknown>, header: string) => {
    const key = Object.keys(row).find((candidate) => candidate.toLowerCase() === header.toLowerCase());
    const value = key ? row[key] : undefined;
    return value === undefined || value === null || value === '' ? '—' : String(value);
  };

  return (
    <Card title={title}>

      <Table headers={headers}>

        {rows.map((x, i) => (
          <tr key={x.id || i}>

            {headers.map((h) => (
              <td key={h}>
                {valueFor(x, h)}
              </td>
            ))}

          </tr>
        ))}

      </Table>

    </Card>
  );
}

function UsersAccess() {
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', email: '', role: 'Operations' });
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  // UI visibility only: the current header currently displays the signed-in demo
  // profile as Owner. Prefer an app-supplied role if present, then fall back to
  // that displayed demo role. This is NOT authorization; the backend must verify
  // the role before allowing any deletion.
  const currentRole = (
    localStorage.getItem('friday-owner-role') ||
    'Owner'
  ).trim();
  const canDeleteUsers = ['Owner', 'Super Admin', 'Admin'].includes(currentRole);

  useEffect(() => {
    api<any[]>('/users-access')
      .then(setRows)
      .catch((err: Error) => setMessage(err.message));
  }, []);

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setMessageError(false);
    try {
      const user = await api<any>('/users-access', { method: 'POST', body: JSON.stringify(form) });
      if (user.persistence === 'in-memory-demo-only') {
        setMessageError(true);
        setMessage('Local demo only: user was not created in Supabase.');
      } else {
        setMessage(`Supabase user created and invitation sent to ${user.email}.`);
      }
      setRows((current) => [user, ...current]);
      setForm({ name: '', email: '', role: 'Operations' });
    } catch (err) {
      setMessageError(true);
      setMessage(err instanceof Error ? err.message : 'Could not create this user.');
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (user: any) => {
    if (!canDeleteUsers) {
      setMessage('Delete User is restricted to Owner, Super Admin, and Admin.');
      return;
    }
    if (user.role === 'Owner' || user.isPrimaryOwner === true || user.is_primary_owner === true) {
      setMessage('The primary Owner account cannot be deleted.');
      return;
    }
    setPendingDelete(user);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    // No DELETE endpoint has been verified in the supplied backend contract.
    // Do not remove the row locally or report success until a real endpoint exists.
    setDeleting(true);
    setMessage('Deletion is not connected yet: the backend must provide a verified DELETE /users-access/:id endpoint with server-side role checks, primary-Owner protection, session revocation, and audit logging.');
    setDeleting(false);
    setPendingDelete(null);
  };

  return <div className="owner-users-page">
    <Card title="Owner users & access" subtitle="Create a Supabase Auth employee and email an invitation to set their password.">
      <form className="owner-user-form" onSubmit={invite}>
        <Input required placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input required type="email" placeholder="Work email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Select value={form.role} onChange={(e: ChangeEvent<HTMLSelectElement>) => setForm({ ...form, role: e.target.value })}>
          {['Super Admin', 'Admin', 'Operations', 'Support', 'Finance', 'Infrastructure Admin', 'Viewer'].map((role) => <option key={role}>{role}</option>)}
        </Select>
        <Button type="submit" disabled={saving}>{saving ? 'Sending invite…' : 'Create & invite'}</Button>
      </form>
      {message && <p className={messageError ? "owner-user-message error" : "owner-user-message"} role={messageError ? "alert" : "status"}>{message}</p>}
    </Card>
    <Card title="Access directory" subtitle="Delete controls are shown only for Owner, Super Admin, and Admin when the signed-in role is supplied by the app.">
      {!canDeleteUsers && <p className="owner-user-message" role="note">Delete User is restricted to Owner, Super Admin, and Admin. A server-verified role is not yet wired to this screen.</p>}
      <Table headers={['Name', 'Email', 'Role', 'Status', 'Last login', 'Actions']}>
        {rows.map((user) => <tr key={user.id}>
          <td>{user.name}</td>
          <td>{user.email}</td>
          <td><Badge>{user.role}</Badge></td>
          <td>{user.status}</td>
          <td>{user.lastLogin || '—'}</td>
          <td>
            {canDeleteUsers && user.role !== 'Owner' && user.isPrimaryOwner !== true && user.is_primary_owner !== true
              ? <Button type="button" onClick={() => requestDelete(user)} disabled={deleting}>Delete User</Button>
              : <span>—</span>}
          </td>
        </tr>)}
      </Table>
    </Card>
    {pendingDelete && <div className="owner-delete-backdrop" role="presentation">
      <section className="owner-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="owner-delete-title">
        <h3 id="owner-delete-title">Confirm user deletion</h3>
        <p>You're requesting deletion of <strong>{pendingDelete.name || pendingDelete.email}</strong>. This cannot proceed until the backend delete operation is implemented.</p>
        <div className="owner-delete-actions">
          <Button type="button" disabled={deleting} onClick={() => setPendingDelete(null)}>Cancel</Button>
          <Button type="button" disabled={deleting} onClick={confirmDelete}>{deleting ? 'Checking…' : 'Confirm deletion'}</Button>
        </div>
      </section>
    </div>}
  </div>;
}


/* =========================================================
   MAIN APPLICATION
========================================================= */

type ActiveProduct = { id: string; code: string; name: string; description: string; status: string; commercialStatus?: string };

type OwnerIdentity = { name: string; email?: string; role: string };

function OwnerAccountActions({ identity, onSignOut }: { identity: OwnerIdentity | null; onSignOut: () => void }) {
  const displayName = identity?.name || identity?.email || 'Owner account';
  const initials = displayName.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('') || 'O';
  return (
    <div className="topbar-account-actions">
      <div className="topbar-profile">
        <div className="topbar-avatar" aria-hidden="true">{initials}</div>
        <div className="topbar-user-details">
          <span>{displayName}</span>
          <small>{identity?.role || 'Owner'}</small>
        </div>
      </div>
      <button type="button" className="topbar-signout" aria-label="Sign out" title="Sign out" onClick={onSignOut}>
        <LogOut size={18} aria-hidden="true" />
        <span>Sign out</span>
      </button>
    </div>
  );
}

function ApplicationIcon({ code }: { code: string }) {
  const productCode = code.toLowerCase();
  if (productCode.includes('stay')) return <Hotel size={25} strokeWidth={1.8} />;
  if (productCode.includes('fit')) return <Activity size={25} strokeWidth={1.8} />;
  if (productCode.includes('realty')) return <Building2 size={25} strokeWidth={1.8} />;
  return <Users size={25} strokeWidth={1.8} />;
}

function ApplicationLoadingProgress({ label, value }: { label: string; value: number }) {
  return (
    <div className="application-selector-progress-wrapper">
      <div className="application-selector-progress-heading">
        <span>Estimated loading progress</span>
        <strong className="application-selector-progress-value">{value}%</strong>
      </div>
      <div className="application-selector-progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <span className="application-selector-progress-indicator" style={{ width: value + "%" }} aria-hidden="true" />
      </div>
    </div>
  );
}

function ApplicationSelector({ onSelect, identity, onSignOut }: { onSelect: (product: ActiveProduct) => void; identity: OwnerIdentity | null; onSignOut: () => void }) {
  const [products, setProducts] = useState<ActiveProduct[]>([]);
  const [error, setError] = useState('');
  const [entering, setEntering] = useState('');
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [listProgress, setListProgress] = useState(0);
  const [openingProgress, setOpeningProgress] = useState(0);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    let mounted = true;
    let timedOut = false;
    setListProgress(0);
    // Estimated percentages rise by 1% while the request is pending.
    // Do not reach 100% until real product data has arrived and been parsed.
    const progressTimer = window.setInterval(() => {
      if (mounted) setListProgress(current => current === 100 ? 100 : Math.min(current + 1, 94));
    }, 95);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 12000);
    setLoading(true);
    setError('');
    api<any[]>('/products/selector', { signal: controller.signal })
      .then(async rows => {
        if (!mounted) return;
        setProducts(rows.map(row => ({
          id: row.id, code: row.code, name: row.name,
          description: row.description || 'Manage this application workspace.',
          status: row.status, commercialStatus: row.commercialStatus,
        })));
        setListProgress(100);
        await new Promise(resolve => window.setTimeout(resolve, 240));
      })
      .catch(cause => {
        if (mounted) setError(timedOut
          ? 'The application list is taking longer than expected. Please try again.'
          : cause instanceof Error ? cause.message : 'Unable to load applications.');
      })
      .finally(() => {
        window.clearTimeout(timeout);
        window.clearInterval(progressTimer);
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      window.clearInterval(progressTimer);
      controller.abort();
    };
  }, [retryCount]);

  useEffect(() => {
    if (!entering) return;
    const timer = window.setInterval(() => {
      setOpeningProgress(current => current === 100 ? 100 : Math.min(current + 1, 94));
    }, 95);
    return () => window.clearInterval(timer);
  }, [entering]);

  const enter = async (product: ActiveProduct) => {
    setOpeningProgress(0);
    setEntering(product.id);
    setError('');
    try {
      const context = await api<any>('/products/' + encodeURIComponent(product.code) + '/context');
      setOpeningProgress(100);
      await new Promise(resolve => window.setTimeout(resolve, 240));
      onSelect(context.product);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Application access could not be verified.');
    } finally {
      setEntering('');
    }
  };

  const orderedProducts = [...products].sort((a, b) =>
    Number(b.status !== 'NOT_CONNECTED') - Number(a.status !== 'NOT_CONNECTED') ||
    a.name.localeCompare(b.name),
  );

  return (
    <main className="application-selector">
      <div className="application-selector-frame">
        <header className="application-selector-header">
          <div className="application-selector-brand" aria-label="Engage AI Owner Console">
            <img src={logo} alt="" className="application-selector-brand-mark" />
            <span className="application-selector-brand-name">Engage</span>
            <span className="application-selector-brand-badge">AI</span>
          </div>
          <div className="application-selector-account">
            <OwnerAccountActions identity={identity} onSignOut={onSignOut} />
          </div>
        </header>

        <section className="application-selector-intro" aria-labelledby="application-selector-heading">
          <h1 id="application-selector-heading">Select an application<span className="application-selector-heading-accent">.</span></h1>
        </section>

        {error && <div className="application-selector-error" role="alert">
          <span>{error}</span>
          {!loading && products.length === 0 && (
            <button type="button" className="application-selector-retry" onClick={() => setRetryCount(count => count + 1)}>
              Retry loading
            </button>
          )}
        </div>}

        {loading ? (
          <div className="application-selector-loading" role="status" aria-label="Loading available applications">
            <div className="application-selector-loading-message">
              <span className="application-selector-spinner" aria-hidden="true" />
              <span>Connecting to your workspaces…</span>
            </div>
            <ApplicationLoadingProgress label="Loading application list" value={listProgress} />
            <div className="application-selector-skeleton-grid" aria-hidden="true">
              {[0, 1, 2, 3].map(index => (
                <div className="application-selector-skeleton-card" key={index}>
                  <span className="application-selector-skeleton-icon application-selector-shimmer" />
                  <span className="application-selector-skeleton-title application-selector-shimmer" />
                  <span className="application-selector-skeleton-description application-selector-shimmer" />
                  <span className="application-selector-skeleton-description application-selector-skeleton-short application-selector-shimmer" />
                  <span className="application-selector-skeleton-action application-selector-shimmer" />
                </div>
              ))}
            </div>
          </div>
        ) : orderedProducts.length === 0 ? (
          error ? null : <div className="application-selector-empty">No applications are available for your account.</div>
        ) : (
          <>
          {entering && (
            <div className="application-selector-opening" role="status">
              <span>Opening your workspace…</span>
              <ApplicationLoadingProgress label="Opening selected workspace" value={openingProgress} />
            </div>
          )}
          <section className="application-grid" aria-label="Available product workspaces">
            {orderedProducts.map(product => {
              const connected = product.status !== 'NOT_CONNECTED';
              const commercialLabel = !connected
                ? 'Integration pending'
                : product.commercialStatus === 'ACTIVE' ? 'Commercially available' : 'Commercial setup pending';
              return (
                <article className={'application-card ' + (connected ? 'application-card--connected' : 'application-card--pending')} key={product.id}>
                  <div className="application-card-top">
                    <span className="application-card-icon" aria-hidden="true"><ApplicationIcon code={product.code} /></span>
                    <span className={'application-card-status ' + (connected ? 'application-card-status--connected' : '')}>
                      <span className="application-card-status-dot" aria-hidden="true" />
                      {product.status === 'CONFIGURED' ? 'Connected' : product.status.replace(/_/g, ' ').toLowerCase()}
                    </span>
                  </div>
                  <div className="application-card-copy">
                    <h2>{product.name}</h2>
                    <p>{product.description}</p>
                  </div>
                  <footer className="application-card-footer">
                    <span className="application-card-commercial">{commercialLabel}</span>
                    <button
                      className="application-card-action"
                      type="button"
                      disabled={!connected || Boolean(entering)}
                      onClick={() => void enter(product)}
                      aria-label={connected ? 'Enter ' + product.name : product.name + ' not connected'}
                    >
                      {entering === product.id ? 'Opening…' : connected ? 'Enter workspace' : 'Unavailable'}
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </button>
                  </footer>
                </article>
              );
            })}
          </section>
          </>
        )}
      </div>
    </main>
  );
}

function App({ product, backToApplications, identity, onSignOut }: { product: ActiveProduct; backToApplications: () => void; identity: OwnerIdentity | null; onSignOut: () => void }) {

  const [page, setPage] =
    useState('Dashboard');

  const [collapsed, setCollapsed] =
    useState(false);

  const [customer, setCustomer] =
    useState('');

let content =
  page === 'Dashboard' ? (
    <Dashboard
      productCode={product.code}
      productName={product.name}
      onNavigate={nextPage => { setCustomer(''); setPage(nextPage); }}
      onOpenCustomer={customerId => { setPage('Customers'); setCustomer(customerId); }}
    />
  ) :

    page === 'Customer Onboarding' ? (
      <NewOnboarding />
    ) :

    page === 'Customers' ? (
      <Customers
        open={setCustomer}
      />
    ) :

    page === 'Products' ? (
      <Collection
        endpoint="/products"
        title="Products"
        headers={[
          'name',
          'description',
          'version',
          'status',
        ]}
      />
    ) :

    page === 'Subscriptions' ? (
      <Collection
        endpoint="/subscriptions"
        title="Subscriptions"
        headers={[
          'customer',
          'product',
          'plan',
          'status',
          'expiryDate',
        ]}
      />
    ) :

    page === 'Infrastructure' ? (
      <Collection
        endpoint="/infrastructure"
        title="Infrastructure control center (mock provider)"
        headers={[
          'server',
          'environment',
          'region',
          'status',
          'cpu',
          'ram',
        ]}
      />
    ) :

    page === 'Deployments' ? (
      <Collection
        endpoint="/deployments"
        title="Deployments (mock provider — no server actions)"
        headers={[
          'application',
          'customer',
          'environment',
          'version',
          'status',
          'triggeredBy',
        ]}
      />
    ) :

    page === 'Configuration' ? (
      <Collection
        endpoint="/configuration"
        title="Configuration"
        headers={[
          'key',
          'value',
          'scope',
          'environment',
          'status',
          'updatedBy',
        ]}
      />
    ) :

    page === 'Audit Logs' ? (
      <Collection
        endpoint="/audit-logs"
        title="Audit logs"
        headers={[
          'actor',
          'action',
          'resourceType',
          'resourceId',
          'timestamp',
        ]}
      />
    ) :

    page === 'Connected Integrations' ? (
      <Collection
        endpoint="/integrations"
        title="Connected integrations"
        headers={['integration', 'provider', 'scope', 'status', 'lastSync']}
      />
    ) :

    page === 'Live Monitoring' ? (
      <Collection
        endpoint="/monitoring"
        title="Live monitoring"
        headers={['service', 'environment', 'status', 'uptime', 'checkedAt']}
      />
    ) :

    page === 'Backup & Restore' ? (
      <Collection
        endpoint="/backups"
        title="Backup & restore"
        headers={['resource', 'schedule', 'lastBackup', 'status', 'retention']}
      />
    ) :

    page === 'Users & Access' ? (
      <UsersAccess />
    ) :

    page === 'Owner Settings' ? (
      <Collection
        endpoint="/owner-settings"
        title="Owner settings"
        headers={['setting', 'value', 'scope', 'updatedBy']}
      />
    ) :

    (
      <Card title={page}>
        <p>
          No operational records are available for this module yet.
        </p>
      </Card>
    );


  if (customer) {
    content = (
      <Customer360
        id={customer}
        back={() => setCustomer('')}
      />
    );
  }


  const isDashboard = page === 'Dashboard' && !customer;
  const activeModule = customer
    ? { title: 'Customer 360', description: 'Customer profile, assigned products, subscriptions, documents and operational history.' }
    : ownerModuleDescriptions[page] || { title: page, description: 'Administrative records and operations for the selected application.' };

  return (
    <div
      className={
        'shell ' +
        (collapsed ? 'collapsed' : '')
      }
    >

      {/* =================================================
          SIDEBAR
      ================================================= */}

      <aside>

        <div className="brand">

          <img
            src={logo}
            alt="Engagehubs"
          />

          <span>
            ENGAGEHUBS
            <br />
            <b>{product.name.toUpperCase()} · OWNER</b>
          </span>

        </div>

        <nav>
          {nav.map(({ name, icon: Icon }) => (
            <button
              key={name}
              type="button"
              className={
                (
                  name === 'Home'
                    ? page === 'Dashboard' || page === 'Home'
                    : name === 'New Onboarding'
                    ? page === 'Customer Onboarding'
                    : name === 'Products & Plans'
                    ? page === 'Products' || page === 'Products & Plans'
                    : name === 'Customer Settings'
                    ? page === 'Configuration' || page === 'Customer Settings'
                    : page === name
                )
                  ? 'active'
                  : ''
              }
              onClick={() => {
                setPage(
                  name === 'Home'
                    ? 'Dashboard'
                    : name === 'New Onboarding'
                    ? 'Customer Onboarding'
                    : name === 'Products & Plans'
                    ? 'Products'
                    : name === 'Customer Settings'
                    ? 'Configuration'
                    : name
                );
                setCustomer('');
                window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                document.querySelector('main')?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                document.querySelector('aside')?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
              }}
              title={collapsed ? name : undefined}
            >
              <span className="nav-icon">
                <Icon size={18} strokeWidth={1.8} />
              </span>
              <em>{name}</em>
            </button>
          ))}
        </nav>

      </aside>

      {/* =================================================
          MAIN CONTENT
      ================================================= */}

      <main className={isDashboard ? 'owner-dashboard-main' : 'owner-modules-main'}>
        <header className="topbar">

          <div className="topbar-title">
            <button className="workspace-switcher" type="button" onClick={backToApplications} title="Return to application selection"><ArrowLeft size={15} aria-hidden="true" /> Switch application</button>
            <h1>
              {customer
                ? 'View Customer'
                : isDashboard ? `${product.name} · Dashboard` : `${product.name} · Owner Console`}
            </h1>
          </div>

          {page !== 'Home' && page !== 'Dashboard' && (
            <div className="global-search">
              <Search size={18} />
              <input
                type="search"
                aria-label="Search all modules"
              />
            </div>
          )}

          <OwnerAccountActions identity={identity} onSignOut={onSignOut} />

        </header>

        {isDashboard ? content : (
          <div className="owner-modules-content">
            <section className="owner-module-hero" aria-label={`${activeModule.title} section`}>
              <div className="owner-module-hero-copy">
                <span className="owner-module-eyebrow">ENGAGEHUBS / {product.name.toUpperCase()}</span>
                <h2>{activeModule.title}<span>.</span></h2>
                <p>{activeModule.description}</p>
              </div>
              <div className="owner-module-hero-mark" aria-hidden="true"><img src={logo} alt="" /></div>
            </section>
            <div className="owner-module-body">{content}</div>
          </div>
        )}
      </main>
    </div>
  );
}

/* =========================================================
   ROOT / AUTHENTICATION
========================================================= */

type FridaySession = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  user?: { id: string; email?: string };
};

function readOwnerInvitation(): OwnerInvitation | null {
  if (typeof window === 'undefined' || !window.location.hash.startsWith('#')) return null;
  const data = new URLSearchParams(window.location.hash.slice(1));
  if (data.get('type') !== 'invite' && !data.has('error')) return null;
  const accessToken = data.get('access_token') || '';
  const refreshToken = data.get('refresh_token') || undefined;
  const error = data.get('error_description') ||
    (!accessToken ? 'This invitation link is invalid or has expired. Ask your Owner to send a new invitation.' : undefined);
  // Never retain invite bearer tokens in the URL or browser history.
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return { accessToken, refreshToken, error };
}

function Root() {
  const [signed, setSigned] = useState(
    () => Boolean(localStorage.getItem('friday-access-token')),
  );
  const [activeProduct, setActiveProduct] = useState<ActiveProduct | null>(null);
  const [identity, setIdentity] = useState<OwnerIdentity | null>(null);
  const [invitation, setInvitation] = useState<OwnerInvitation | null>(readOwnerInvitation);
  const [identityRevision, setIdentityRevision] = useState(0);

  const signOut = () => {
    localStorage.removeItem('friday-access-token');
    localStorage.removeItem('friday-refresh-token');
    setActiveProduct(null);
    setIdentity(null);
    setSigned(false);
  };

  const done = (session: FridaySession) => {
    localStorage.setItem('friday-access-token', session.access_token);

    if (session.refresh_token) {
      localStorage.setItem('friday-refresh-token', session.refresh_token);
    }

    if (session.user?.email) {
      setIdentity({ name: session.user.email, email: session.user.email, role: 'Owner' });
    }
    setSigned(true);
    setIdentityRevision(revision => revision + 1);
  };

  useEffect(() => {
    if (!signed) return;
    let mounted = true;
    api<OwnerIdentity>('/auth/me')
      .then(profile => { if (mounted) setIdentity(profile); })
      .catch(() => { /* Keep the page functional if profile details are temporarily unavailable. */ });
    return () => { mounted = false; };
  }, [signed, identityRevision]);

  useEffect(() => {
    const onExpired = () => signOut();
    window.addEventListener('friday:session-expired', onExpired);
    return () => window.removeEventListener('friday:session-expired', onExpired);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('friday-access-token');
    if (!token) setSigned(false);
  }, []);

  if (invitation) {
    return <InviteActivation
      invitation={invitation}
      onActivated={session => { done(session); setInvitation(null); }}
      onCancel={() => setInvitation(null)}
    />;
  }

  if (!signed) {
    return <Login onSuccess={done} />;
  }

  if (!activeProduct) return <ApplicationSelector onSelect={setActiveProduct} identity={identity} onSignOut={signOut} />;
  return <App product={activeProduct} backToApplications={() => setActiveProduct(null)} identity={identity} onSignOut={signOut} />;
}


/* =========================================================
   APPLICATION START
========================================================= */

createRoot(
  document.getElementById('root')!
).render(
  <Root />
);
