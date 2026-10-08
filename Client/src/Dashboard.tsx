import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
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
};

const metric = (data: DashboardData, name: string) =>
  String(data.metrics.find(([label]) => label === name)?.[1] ?? '—');

const relativeTime = (timestamp: string) => {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000),
  );
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
    ['Total Customers', metric(data, 'Total Customers'), 'From control-plane data', <UserPlus size={22} />, 'blue'],
    ['Active Customers', metric(data, 'Active Customers'), 'Currently active', <Users size={22} />, 'green'],
    ['Active Tenants', metric(data, 'Active Tenants'), 'Currently active', <Building2 size={22} />, 'purple'],
    ['Active Subscriptions', metric(data, 'Active Subscriptions'), 'From control-plane data', <Package size={22} />, 'orange'],
    ['Total Users', metric(data, 'Total Users'), 'Across managed customers', <Users size={22} />, 'blue'],
    ['Infrastructure Nodes', metric(data, 'Infrastructure Nodes'), 'Configured nodes', <Server size={22} />, 'purple'],
    ['Ongoing Deployments', metric(data, 'Ongoing Deployments'), 'From dashboard API', <Rocket size={22} />, 'purple'],
    ['System Health', metric(data, 'System Health'), 'Current API status', <HeartPulse size={22} />, 'green'],
  ] as const;

  return (
    <div className="master-kpi-grid">
      {items.map(([title, value, note, icon, tone]) => (
        <div className={`master-kpi ${tone}`} key={title}>
          <div className="master-kpi-icon">{icon}</div>
          <div className="master-kpi-content">
            <div className="master-kpi-title">{title}</div>
            <div className="master-kpi-value">{value}</div>
            <div className="master-kpi-note">{note}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Unavailable({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <section className="master-panel">
      <div className="master-panel-header">
        <div className="master-panel-title">
          <div className="master-panel-icon blue">{icon}</div>
          <div><h3>{title}</h3><p>{description}</p></div>
        </div>
      </div>
      <div className="state state-empty">
        <Database size={22} />
        <span>Data not available from the current dashboard API.</span>
      </div>
    </section>
  );
}

function CustomerGrowth() {
  return (
    <Unavailable
      icon={<BarChart3 size={19} />}
      title="Customer Growth"
      description="Historical customer growth requires a time-series API."
    />
  );
}

function SubscriptionOverview({ data }: { data: DashboardData }) {
  const s = data.subscriptions;
  const total = s.active + s.trial + s.expiring + s.suspended + s.cancelled;
  const rows = [
    ['Active', s.active, 'active-dot'],
    ['Trial', s.trial, 'trial-dot'],
    ['Expiring Soon', s.expiring, 'expiry-dot'],
    ['Suspended', s.suspended, 'suspended-dot'],
    ['Cancelled', s.cancelled, 'cancelled-dot'],
  ] as const;

  return (
    <section className="master-panel subscription-panel">
      <div className="master-panel-header">
        <div className="master-panel-title">
          <div className="master-panel-icon blue"><Clock3 size={19} /></div>
          <div><h3>Subscription Overview</h3><p>Live subscription status from the control plane</p></div>
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
    ['API Services', data.health.api],
    ['Database', data.health.database],
    ['Infrastructure', data.health.infrastructure],
    ['Deployments', data.health.deployment],
  ];

  return (
    <section className="master-panel health-panel">
      <div className="master-panel-header">
        <div className="master-panel-title">
          <div className="master-panel-icon blue"><Activity size={19} /></div>
          <div><h3>System Health</h3><p>Live status from the control plane</p></div>
        </div>
      </div>
      <div className="health-services">
        {services.map(([name, status]) => (
          <div className="health-service" key={name}>
            <strong>{name}</strong>
            <span className="health-status"><i />{status}</span>
            <span className="uptime">{status}</span>
            <ChevronRight size={14} />
          </div>
        ))}
      </div>
    </section>
  );
}

function Products() {
  return (
    <Unavailable
      icon={<Package size={19} />}
      title="Products"
      description="Product-level customer and user analytics require product aggregation data."
    />
  );
}

function RecentActivity({ data }: { data: DashboardData }) {
  return (
    <section className="master-panel activity-panel">
      <div className="master-panel-header">
        <div className="master-panel-title">
          <div className="master-panel-icon blue"><Activity size={19} /></div>
          <div><h3>Recent Activity</h3><p>Latest control-plane events</p></div>
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
          <div><h3>Ongoing Onboarding</h3><p>Customers currently in onboarding or trial</p></div>
        </div>
        <button className="master-view-all">View All</button>
      </div>
      <div className="master-table-wrap">
        <table className="master-table">
          <thead><tr><th>Customer</th><th>Industry</th><th>Status</th><th>Account Owner</th><th>Created</th></tr></thead>
          <tbody>
            {data.onboarding.length === 0 ? (
              <tr><td colSpan={5}>No onboarding records.</td></tr>
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

function LatestDeployments() {
  return (
    <Unavailable
      icon={<Rocket size={19} />}
      title="Latest Deployments"
      description="Deployment history is not included in the current dashboard API response."
    />
  );
}

function UpcomingRenewals() {
  return (
    <Unavailable
      icon={<CalendarDays size={19} />}
      title="Upcoming Renewals"
      description="Renewal dates are not included in the current dashboard API response."
    />
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
          <div className="state state-error"><span>Unable to load live dashboard data: {error}</span></div>
        </section>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="master-dashboard">
        <section className="master-panel">
          <div className="state state-loading"><span>Loading live control-plane data...</span></div>
        </section>
      </div>
    );
  }

  return (
    <div className="master-dashboard">
      <section className="master-welcome">
        <div>
          <span>FRIDAY MASTER</span>
          <h2>Good morning, <b>Jaya</b></h2>
          <p>Here&apos;s what&apos;s happening across your Friday ecosystem.</p>
        </div>
        <div className="master-date">
          <CalendarDays size={19} />
          <div><small>Today</small><strong>{today}</strong></div>
          <ChevronRight size={15} />
        </div>
      </section>

      <KPIGrid data={data} />

      <div className="master-analytics-grid">
        <CustomerGrowth />
        <SubscriptionOverview data={data} />
        <SystemHealth data={data} />
      </div>

      <div className="master-main-grid">
        <Products />
        <RecentActivity data={data} />
      </div>

      <div className="master-bottom-grid">
        <OngoingOnboarding data={data} />
        <LatestDeployments />
        <UpcomingRenewals />
      </div>

      <FridayAI />
    </div>
  );
}
