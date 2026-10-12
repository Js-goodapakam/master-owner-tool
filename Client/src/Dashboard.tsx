import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  HeartPulse,
  Package,
  Rocket,
  Sparkles,
  UserPlus,
  Users,
  Server,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from './api';

type DashboardData = {
  metrics: [string, string | number][];
  activity: {
    id: string;
    actor: string;
    action: string;
    resourceType: string;
    resourceId: string;
    timestamp: string;
  }[];
  onboarding: {
    id: string;
    customerId: string;
    companyName: string;
    legalName: string;
    email: string;
    industry: string;
    status: string;
    accountOwner: string;
    createdAt: string;
    city: string;
    country: string;
  }[];
  subscriptions: {
    active: number;
    trial: number;
    expiring: number;
    suspended: number;
    cancelled: number;
  };
  health: {
    api: string;
    database: string;
    infrastructure: string;
    deployment: string;
  };
  customerGrowth: { period: string; label: string; newCustomers: number; totalCustomers: number }[];
  productAdoption: { product: string; customers: number; modules: number }[];
  deployments: { id: string; application: string; customer: string; environment: string; version: string; status: string; completed: string }[];
  renewals: { customer: string; product: string; plan: string; status: string; expiryDate: string }[];
};

const metric = (data: DashboardData, name: string) =>
  String(data.metrics.find(([label]) => label === name)?.[1] ?? '—');

const relativeTime = (timestamp: string) => {
  const parsed = new Date(timestamp).getTime();
  if (!Number.isFinite(parsed)) return 'Time unavailable';
  const seconds = Math.max(0, Math.floor((Date.now() - parsed) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const dateText = (value: string) =>
  new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const label = (value: string) =>
  value.replace(/[_-]/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

function KPIGrid({ data }: { data: DashboardData }) {
  const items = [
    ['Customers', metric(data, 'Total Customers'), 'Total customer accounts', <UserPlus size={20} />, 'blue'],
    ['Active accounts', metric(data, 'Active Customers'), 'Live or trial customers', <Users size={20} />, 'green'],
    ['Subscriptions', metric(data, 'Active Subscriptions'), 'Billing plans currently active', <CircleDollarSign size={20} />, 'orange'],
    ['Customer users', metric(data, 'Total Users'), 'Users across all workspaces', <Users size={20} />, 'purple'],
  ] as const;
  const operations = [
    ['Tenants online', metric(data, 'Active Tenants'), <Building2 size={17} />],
    ['Hosting nodes', metric(data, 'Hosting Nodes'), <Server size={17} />],
    ['Deployments running', metric(data, 'Ongoing Deployments'), <Rocket size={17} />],
    ['Platform health', metric(data, 'System Health'), <HeartPulse size={17} />],
  ] as const;

  return (
    <section className="owner-overview" aria-label="Owner overview">
      <div className="owner-kpi-grid">
        {items.map(([title, value, note, icon, tone]) => <div className={`owner-kpi ${tone}`} key={title}><div className="owner-kpi-top"><span>{title}</span><i>{icon}</i></div><strong>{value}</strong><small>{note}</small></div>)}
      </div>
      <div className="owner-operations"><div className="owner-operations-head"><span>Platform operations</span><small>Live control-plane snapshot</small></div><div className="owner-operations-grid">{operations.map(([title, value, icon]) => <div key={title}><i>{icon}</i><span>{title}</span><b className={title === 'Platform health' && value === 'Healthy' ? 'is-healthy' : ''}>{value}</b></div>)}</div></div>
    </section>
  );
}

function CustomerGrowth({ data }: { data: DashboardData }) {
  const highest = Math.max(1, ...data.customerGrowth.map((item) => item.totalCustomers));
  return (
    <section className="master-panel master-growth-panel">
      <div className="master-panel-header"><div className="master-panel-title"><div className="master-panel-icon blue"><BarChart3 size={19} /></div><div><h3>Customer Growth</h3><p>Customer records created over time</p></div></div></div>
      {data.customerGrowth.length === 0 ? <div className="state state-empty">No customer growth data yet.</div> : <div className="growth-chart" aria-label="Customer growth chart">{data.customerGrowth.map((item) => <div className="growth-column" key={`${item.period}-${item.totalCustomers}`}><span className="growth-value">{item.totalCustomers}</span><div className="growth-bar-wrap"><span className="growth-bar" style={{ height: `${Math.max(12, item.totalCustomers / highest * 100)}%` }} /></div><small>{item.label}</small></div>)}</div>}
    </section>
  );
}

function SubscriptionOverview({ data }: { data: DashboardData }) {
  const s = data.subscriptions;
  const total = s.active + s.trial + s.expiring + s.suspended + s.cancelled;
  const rows = [
    ['Active', s.active, 'active-dot'],
    ['Trial', s.trial, 'trial-dot'],
    ['Ending Soon', s.expiring, 'expiry-dot'],
    ['Temporarily Blocked', s.suspended, 'suspended-dot'],
    ['Cancelled', s.cancelled, 'cancelled-dot'],
  ] as const;

  return (
    <section className="master-panel subscription-panel">
      <div className="master-panel-header">
        <div className="master-panel-title">
          <div className="master-panel-icon blue"><Clock3 size={19} /></div>
          <div><h3>Plans & Subscriptions</h3><p>Current plan status</p></div>
        </div>
      </div>
      <div className="subscription-content">
        <div className="donut">
          <div className="donut-inner"><strong>{total}</strong><span>Total</span></div>
        </div>
        <div className="subscription-list">
          {rows.map(([name, value, dot]) => (
            <div key={name}>
              <span><i className={`dot ${dot}`} />{name}</span>
              <strong>{value} <small>({total ? Math.round(value / total * 100) : 0}%)</small></strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SystemHealth({ data }: { data: DashboardData }) {
  const services = [
    ['Application', data.health.api],
    ['Database', data.health.database],
    ['Hosting', data.health.infrastructure],
    ['Deployments', data.health.deployment],
  ];

  return (
    <section className="master-panel health-panel">
      <div className="master-panel-header">
        <div className="master-panel-title">
          <div className="master-panel-icon blue"><Activity size={19} /></div>
          <div><h3>Live System Status</h3><p>Current service status</p></div>
        </div>
      </div>
      <div className="health-services">
        {services.map(([name, status]) => (
          <div className="health-service" key={name}>
            <strong>{name}</strong>
            <span className="health-status"><i />{status}</span>
            <span className="uptime">Status</span>
            <ChevronRight size={14} />
          </div>
        ))}
      </div>
    </section>
  );
}

function Products({ data }: { data: DashboardData }) {
  return (
    <section className="master-panel">
      <div className="master-panel-header"><div className="master-panel-title"><div className="master-panel-icon blue"><Package size={19} /></div><div><h3>Product Adoption</h3><p>Assigned customer workspaces by product</p></div></div></div>
      <div className="adoption-list">{data.productAdoption.map((item) => <div className="adoption-row" key={item.product}><div><strong>{item.product}</strong><small>{item.modules} modules available</small></div><b>{item.customers} customers</b></div>)}</div>
    </section>
  );
}

function RecentActivity({ data }: { data: DashboardData }) {
  return (
    <section className="master-panel activity-panel">
      <div className="master-panel-header">
        <div className="master-panel-title">
          <div className="master-panel-icon blue"><Activity size={19} /></div>
          <div><h3>Recent Changes</h3><p>Latest activity in Friday Master</p></div>
        </div>
        <button className="master-view-all">View All</button>
      </div>
      <div className="activity-items">
        {data.activity.length === 0 ? (
          <div className="state state-empty"><CheckCircle2 size={22} /><span>No recent activity.</span></div>
        ) : data.activity.map(item => (
          <div className="activity-row" key={item.id}>
            <div className="activity-bullet success"><ArrowUpRight size={15} /></div>
            <div className="activity-copy">
              <strong>{item.actor}</strong>
              <span>{item.action} · {item.resourceId}</span>
            </div>
            <time>{relativeTime(item.timestamp)}</time>
          </div>
        ))}
      </div>
    </section>
  );
}

function OngoingOnboarding({ data }: { data: DashboardData }) {
  return (
    <section className="master-panel table-panel">
      <div className="master-panel-header">
        <div className="master-panel-title">
          <div className="master-panel-icon blue"><UserPlus size={19} /></div>
          <div><h3>New Customer Requests</h3><p>Signups waiting for review or trial setup</p></div>
        </div>
        <button className="master-view-all">View All</button>
      </div>
      <div className="master-table-wrap">
        <table className="master-table">
          <thead><tr><th>Customer</th><th>Industry</th><th>Status</th><th>Handled By</th><th>Request Date</th></tr></thead>
          <tbody>
            {data.onboarding.length === 0 ? (
              <tr><td colSpan={5}>No customer requests found.</td></tr>
            ) : data.onboarding.map(row => (
              <tr key={row.id}>
                <td><strong>{row.companyName}</strong></td>
                <td>{row.industry}</td>
                <td><span className={row.status === 'ONBOARDING' ? 'stage warning-stage' : 'stage'}>{label(row.status)}</span></td>
                <td>{row.accountOwner}</td>
                <td>{dateText(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LatestDeployments({ data }: { data: DashboardData }) {
  return (
    <section className="master-panel"><div className="master-panel-header"><div className="master-panel-title"><div className="master-panel-icon blue"><Rocket size={19} /></div><div><h3>Latest Deployments</h3><p>Most recently completed releases</p></div></div></div><div className="adoption-list">{data.deployments.length === 0 ? <div className="state state-empty">No deployments recorded.</div> : data.deployments.map((item) => <div className="adoption-row" key={item.id}><div><strong>{item.application} · {item.version}</strong><small>{item.customer} · {dateText(item.completed)}</small></div><b>{item.status}</b></div>)}</div></section>
  );
}

function UpcomingRenewals({ data }: { data: DashboardData }) {
  return (
    <section className="master-panel"><div className="master-panel-header"><div className="master-panel-title"><div className="master-panel-icon blue"><CalendarDays size={19} /></div><div><h3>Subscription Schedule</h3><p>Current subscription renewal dates</p></div></div></div><div className="adoption-list">{data.renewals.map((item) => <div className="adoption-row" key={item.customer}><div><strong>{item.customer}</strong><small>{item.plan} · {item.status}</small></div><b>{item.expiryDate}</b></div>)}</div></section>
  );
}

function FridayAI() {
  return (
    <div className="master-friday-ai">
      <div className="master-friday-ai-icon"><Sparkles size={24} /></div>
      <div><strong>Friday AI</strong><span>Get insights across your ecosystem</span></div>
      <button><ArrowUpRight size={20} /></button>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    api<DashboardData>('/dashboard')
      .then(result => {
        if (mounted) setData(result);
      })
      .catch((err: any) => {
        if (mounted) setError(err?.message || 'Unable to load dashboard data.');
      });
    return () => { mounted = false; };
  }, []);

  const today = useMemo(
    () => new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date()),
    [],
  );

  if (error) {
    return (
      <div className="master-dashboard">
        <section className="master-panel">
          <div className="state state-error"><span>Could not load dashboard information: {error}</span></div>
        </section>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="master-dashboard">
        <section className="master-panel">
          <div className="state state-loading"><span>Loading dashboard information...</span></div>
        </section>
      </div>
    );
  }

  return (
    <div className="master-dashboard">
      <section className="master-welcome">
        <div>
          <span>FRIDAY MASTER</span>
          <h2>Welcome to <b>Friday Master</b></h2>
          <p>Customer, revenue and platform health at a glance.</p>
        </div>
        <div className="master-date">
          <CalendarDays size={19} />
          <div><small>Today</small><strong>{today}</strong></div>
          <ChevronRight size={15} />
        </div>
      </section>

      <KPIGrid data={data} />

      <div className="master-analytics-grid">
        <CustomerGrowth data={data} />
        <SubscriptionOverview data={data} />
        <SystemHealth data={data} />
      </div>

      <div className="master-main-grid">
        <Products data={data} />
        <RecentActivity data={data} />
      </div>

      <div className="master-bottom-grid">
        <OngoingOnboarding data={data} />
        <LatestDeployments data={data} />
        <UpcomingRenewals data={data} />
      </div>

      <FridayAI />
    </div>
  );
}
