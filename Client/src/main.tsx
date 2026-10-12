import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import Login from './Login';

import {
  Activity,
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
            placeholder="Friday Team Member Handling This Request"
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

function Customer360({
  id,
  back,
}: {
  id: string;
  back: () => void;
}) {
  const [d, setD] = useState<any>();
  const [activeTab, setActiveTab] = useState('Overview');

  useEffect(() => {
    api<any>(`/customers/${id}`)
      .then(setD);
  }, [id]);

  if (!d) {
    return <Loading />;
  }

  const c = d.customer;
  const tabs = ['Overview', 'Products', 'Users', 'Subscription', 'Configuration', 'Infrastructure', 'Activity'];

  const content = activeTab === 'Overview' ? <>
    <div className="cols">
      <Card title="Company information"><p><b>Legal name:</b> {c.legalName}</p><p><b>Location:</b> {c.city || '—'}, {c.country || '—'}</p><p><b>Account owner:</b> {c.accountOwner}</p></Card>
      <Card title="Subscription"><p><b>{d.subscription.plan}</b> · {d.subscription.status}</p><p>Expiry: {d.subscription.expiryDate}</p><p>Renewal: {d.subscription.renewal}</p></Card>
    </div>
    <Card title="Assigned products">{d.products.map((p: any) => <p key={p.id} className="health"><span>{p.name}<small>{p.version}</small></span><Badge>{p.status}</Badge></p>)}</Card>
  </> : activeTab === 'Products' ? <Card title="Assigned products" subtitle="Products and their current tenant entitlement status."><Table headers={['Product', 'Version', 'Modules', 'Features', 'Status']}>
    {d.products.map((p: any) => <tr key={p.id}><td>{p.name}</td><td>{p.version}</td><td>{p.modules?.join(', ') || '—'}</td><td>{p.features?.join(', ') || '—'}</td><td><Badge>{p.status}</Badge></td></tr>)}
  </Table></Card> : activeTab === 'Users' ? <Card title="Customer users" subtitle="Users with access to this customer workspace."><Table headers={['Name', 'Role', 'Status', 'Last login']}>
    {d.users.map((user: any) => <tr key={`${user.name}-${user.role}`}><td>{user.name}</td><td>{user.role}</td><td><Badge>{user.status}</Badge></td><td>{user.lastLogin}</td></tr>)}
  </Table></Card> : activeTab === 'Subscription' ? <Card title="Subscription details"><div className="customer-detail-grid"><div><small>Plan</small><b>{d.subscription.plan}</b></div><div><small>Status</small><b>{d.subscription.status}</b></div><div><small>Start date</small><b>{d.subscription.startDate}</b></div><div><small>Expiry date</small><b>{d.subscription.expiryDate}</b></div><div><small>Renewal</small><b>{d.subscription.renewal}</b></div></div></Card> : activeTab === 'Configuration' ? <Card title="Customer configuration" subtitle="Configuration values currently applied to this customer."><Table headers={['Key', 'Value', 'Scope', 'Environment', 'Status', 'Updated by', 'Updated date']}>
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
    try {
      const user = await api<any>('/users-access', { method: 'POST', body: JSON.stringify(form) });
      setRows((current) => [user, ...current]);
      setForm({ name: '', email: '', role: 'Operations' });
      setMessage(`Invitation created for ${user.email}.`);
    } catch (err) {
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
    <Card title="Owner users & access" subtitle="Invite internal operators and assign their Owner Tool role.">
      <form className="owner-user-form" onSubmit={invite}>
        <Input required placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input required type="email" placeholder="Work email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Select value={form.role} onChange={(e: ChangeEvent<HTMLSelectElement>) => setForm({ ...form, role: e.target.value })}>
          {['Owner', 'Super Admin', 'Admin', 'Operations', 'Support', 'Finance', 'Infrastructure Admin', 'Viewer'].map((role) => <option key={role}>{role}</option>)}
        </Select>
        <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create user'}</Button>
      </form>
      {message && <p className="owner-user-message" role="status">{message}</p>}
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

function App() {

  const [page, setPage] =
    useState('Dashboard');

  const [collapsed, setCollapsed] =
    useState(false);

  const [customer, setCustomer] =
    useState('');

let content =
  page === 'Dashboard' ? (
    <Dashboard />
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
            src="/src/assets/friday-f-logo.png"
            alt="FRIDAY"
          />

          <span>
            FRIDAY
            <br />
            <b>OWNER</b>
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

      <main>
        <header className="topbar">

          <div className="topbar-title">
            <h1>
              {customer
                ? 'View Customer'
                : page}
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

          <div className="topbar-account-actions">
            <div className="topbar-profile">
              <div className="topbar-avatar">
                JS
              </div>
              <div className="topbar-user-details">
                <span>Jaya Sankara</span>
                <small>Owner</small>
              </div>
            </div>

            <button
              type="button"
              className="topbar-signout"
              aria-label="Sign out"
              title="Sign out"
              onClick={() => {
                localStorage.removeItem('friday-access-token');
                localStorage.removeItem('friday-refresh-token');
                window.location.reload();
              }}
            >
              <LogOut size={18} />
              <span>Sign out</span>
            </button>
          </div>

        </header>

        {content}
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

function Root() {
  const [signed, setSigned] = useState(
    () => Boolean(localStorage.getItem('friday-access-token')),
  );

  const done = (session: FridaySession) => {
    localStorage.setItem('friday-access-token', session.access_token);

    if (session.refresh_token) {
      localStorage.setItem('friday-refresh-token', session.refresh_token);
    }

    setSigned(true);
  };

  useEffect(() => {
    const token = localStorage.getItem('friday-access-token');
    if (!token) setSigned(false);
  }, []);

  if (!signed) {
    return <Login onSuccess={done} />;
  }

  return <App />;
}


/* =========================================================
   APPLICATION START
========================================================= */

createRoot(
  document.getElementById('root')!
).render(
  <Root />
);
