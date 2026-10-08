import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import {
  Activity,
  CreditCard,
  DatabaseBackup,
  FileClock,
  LayoutDashboard,
  Package,
  PlugZap,
  Rocket,
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

import Dashboard from './Dashboard';


/* =========================================================
   FRIDAY MASTER NAVIGATION
========================================================= */

const nav = [
  {
    name: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    name: 'Customer Onboarding',
    icon: UserPlus,
  },
  {
    name: 'Customers',
    icon: Users,
  },
  {
    name: 'Products',
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
    name: 'Configuration',
    icon: Settings2,
  },
  {
    name: 'Integrations',
    icon: PlugZap,
  },
  {
    name: 'Monitoring',
    icon: Activity,
  },
  {
    name: 'Backup & Recovery',
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
    name: 'Master Settings',
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

  useEffect(() => {
    api<any[]>('/customers')
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  return (
    <Card title="Customers">
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
                Customer 360
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
    'Company Details',
    'KYC / Documents',
    'Product Selection',
    'Plan Selection',
    'Tenant Creation',
    'Product Configuration',
    'Customer Admin',
    'Infrastructure Assignment',
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
          <h2>Customer onboarding</h2>

          <p>
            Progressive saving is enabled. Every step is
            validated by the API.
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
            placeholder="Company name"
            value={form.companyName}
            onChange={(e) =>
              setForm({
                ...form,
                companyName: e.target.value,
              })
            }
          />

          <Input
            placeholder="Legal name"
            value={form.legalName}
            onChange={(e) =>
              setForm({
                ...form,
                legalName: e.target.value,
              })
            }
          />

          <Input
            placeholder="Admin email"
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
            placeholder="Account owner"
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

  useEffect(() => {
    api<any>(`/customers/${id}`)
      .then(setD);
  }, [id]);

  if (!d) {
    return <Loading />;
  }

  const c = d.customer;

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
        {[
          'Overview',
          'Products',
          'Users',
          'Subscription',
          'Configuration',
          'Infrastructure',
          'Activity',
        ].map((x) => (
          <button key={x}>
            {x}
          </button>
        ))}
      </div>

      <div className="cols">

        <Card title="Company information">

          <p>
            <b>Legal name:</b>{' '}
            {c.legalName}
          </p>

          <p>
            <b>Location:</b>{' '}
            {c.city}, {c.country}
          </p>

          <p>
            <b>Account owner:</b>{' '}
            {c.accountOwner}
          </p>

        </Card>

        <Card title="Subscription">

          <p>
            <b>
              {d.subscription.plan}
            </b>{' '}
            · {d.subscription.status}
          </p>

          <p>
            Expiry: {d.subscription.expiryDate}
          </p>

          <p>
            Renewal: {d.subscription.renewal}
          </p>

        </Card>

      </div>

      <Card title="Assigned products">

        {d.products.map((p: any) => (
          <p
            key={p.id}
            className="health"
          >
            <span>
              {p.name}
              <small>
                {p.version}
              </small>
            </span>

            <Badge>
              {p.status}
            </Badge>
          </p>
        ))}

      </Card>
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

  return (
    <Card title={title}>

      <Table headers={headers}>

        {rows.map((x, i) => (
          <tr key={x.id || i}>

            {headers.map((h) => (
              <td key={h}>
                {String(
                  x[
                    h
                      .toLowerCase()
                      .replace(/ /g, '')
                  ] ??
                    x[h.toLowerCase()] ??
                    '—'
                )}
              </td>
            ))}

          </tr>
        ))}

      </Table>

    </Card>
  );
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
      <Onboarding />
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

    (
      <Card title={page}>
        <p>
          This control-plane module is scaffolded
          with its backing schema and is ready for
          a provider integration. It deliberately
          does not access product operational data
          directly.
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
            <b>MASTER</b>
          </span>

        </div>


        <button
          className="collapse"
          onClick={() =>
            setCollapsed(!collapsed)
          }
          type="button"
          aria-label={
            collapsed
              ? 'Expand sidebar'
              : 'Collapse sidebar'
          }
        >
          ☰
        </button>


        <nav>

          {nav.map(
            ({
              name,
              icon: Icon,
            }) => (

              <button
                className={
                  page === name
                    ? 'active'
                    : ''
                }
                onClick={() => {
                  setPage(name);
                  setCustomer('');
                }}
                key={name}
                type="button"
                title={
                  collapsed
                    ? name
                    : undefined
                }
              >

                <span className="nav-icon">
                  <Icon
                    size={18}
                    strokeWidth={1.8}
                  />
                </span>

                <em>
                  {name}
                </em>

              </button>

            )
          )}

        </nav>

      </aside>


      {/* =================================================
          MAIN CONTENT
      ================================================= */}

      <main>

        <header>

          <div>
            <small>
              FRIDAY INNOVATIONS / CONTROL PLANE
            </small>

            <h1>
              {customer
                ? 'Customer 360'
                : page}
            </h1>
          </div>


          <div className="env">
            DEV
          </div>


          <div className="user">
            SA
            <br />
            <small>
              Super Admin
            </small>
          </div>

        </header>

        {content}

      </main>

    </div>
  );
}


/* =========================================================
   SIGN IN
========================================================= */

function SignIn({
  done,
}: {
  done: () => void;
}) {

  const [email, setEmail] =
    useState('');

  const [password, setPassword] =
    useState('');

  const [error, setError] =
    useState('');


  const submit = async (
    e: any
  ) => {

    e.preventDefault();

    setError('');

    try {

      await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
        }),
      });

      done();

    } catch (x: any) {

      setError(x.message);

    }
  };


  return (
    <div className="signin">

      <div className="signin-art">

        <div className="signin-brand">

          <i>F</i>

          <span>
            FRIDAY
            <br />
            <b>MASTER</b>
          </span>

        </div>


        <div>

          <small>
            FRIDAY INNOVATIONS
          </small>

          <h1>
            Run your business
            <br />
            from one control plane.
          </h1>

          <p>
            Secure access to customers,
            entitlements, infrastructure,
            and every Friday product.
          </p>

        </div>


        <div className="signin-orb one" />
        <div className="signin-orb two" />

      </div>


      <div className="signin-panel">

        <form onSubmit={submit}>

          <div className="signin-mobile-brand">
            <i>F</i>{' '}
            FRIDAY MASTER
          </div>


          <small>
            WELCOME BACK
          </small>

          <h2>
            Sign in to your workspace
          </h2>

          <p>
            Use your Friday MASTER account.
          </p>


          <label>
            Work email

            <Input
              type="email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              placeholder="you@fridayinnovations.com"
              required
            />

          </label>


          <label>
            Password

            <Input
              type="password"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              placeholder="••••••••"
              required
            />

          </label>


          {error && (
            <div className="error">
              {error}
            </div>
          )}


          <Button type="submit">
            Sign in
          </Button>


          <button
            type="button"
            className="demo-button"
            onClick={done}
          >
            Continue in local demo mode
          </button>


          <small className="signin-note">
            Supabase Auth is used when configured.
            Demo mode contains no production access.
          </small>

        </form>

      </div>

    </div>
  );
}


/* =========================================================
   ROOT
========================================================= */

function Root() {

  const [signed, setSigned] =
    useState(
      () =>
        localStorage.getItem(
          'friday-demo-session'
        ) === 'active'
    );


  const done = () => {

    localStorage.setItem(
      'friday-demo-session',
      'active'
    );

    setSigned(true);
  };


  return signed ? (
    <App />
  ) : (
    <SignIn done={done} />
  );
}


/* =========================================================
   APPLICATION START
========================================================= */

createRoot(
  document.getElementById('root')!
).render(
  <Root />
);