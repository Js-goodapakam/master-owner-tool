import { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowRight, ArrowUpRight, Building2, CalendarClock, CheckCircle2,
  ChevronRight, CircleDollarSign, Clock3, CreditCard, Layers3, RefreshCw,
  Rocket, ShieldAlert, Users, UserRoundPlus, Workflow,
} from 'lucide-react';
import { api } from './api';
import './Dashboard.css';

type Customer = { id: string; name: string; status: string; createdAt: string };
type Signup = { id: string; name: string; email: string; status: string; requestedLifecycle: string; createdAt: string };
type Onboarding = { id: string; signupRequestId: string | null; customerId: string | null; status: string; step: number; updatedAt: string };
type Subscription = { id: string; customerId: string; status: string; plan: string; expiresAt: string | null };
type Provisioning = { id: string; customerId: string; status: string; operation: string; failureCode: string | null; updatedAt: string };
type Environment = { environment: string; status: string; checkedAt: string | null };
type Deployment = { id: string; status: string; environment: string; version: string | null; completedAt: string | null };
type ActivityEvent = { id: string; action: string; resourceId: string; resourceType: string; createdAt: string };
type Overview = {
  product: { code: string; name: string };
  fetchedAt: string;
  visibility: { signups: boolean; subscriptions: boolean; audit: boolean };
  customers: Customer[];
  signups: Signup[];
  onboarding: Onboarding[];
  subscriptions: Subscription[];
  provisioning: Provisioning[];
  operations: Environment[];
  deployments: Deployment[];
  activity: ActivityEvent[];
  billing: { connected: boolean; mrr: number | null };
};

type Props = {
  productCode: string;
  productName: string;
  onNavigate: (page: string) => void;
  onOpenCustomer: (id: string) => void;
};

type PipelineCard = { id: string; name: string; detail: string; meta: string; customerId?: string };
type PipelineStage = { key: string; name: string; helper: string; cards: PipelineCard[]; action: string; page: string; tone?: string };
type OwnerAction = { key: string; title: string; detail: string; kind: string; customerId?: string; page: string };

const safeDate = (value?: string | null) => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Date unavailable';
};

const humanize = (text: string) => text.replace(/[_-.]/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase());
const countDistinct = (items: string[]) => new Set(items.filter(Boolean)).size;
const isWithinDays = (value: string | null, days: number) => {
  if (!value) return false;
  const date = new Date(value).getTime();
  const remaining = date - Date.now();
  return Number.isFinite(date) && remaining >= 0 && remaining <= days * 86400000;
};

function StatusPill({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const tone = /^(ACTIVE|SUCCEEDED|HEALTHY)$/.test(normalized) ? 'good'
    : /^(FAILED|UNAVAILABLE|ERROR|DEGRADED)$/.test(normalized) ? 'bad'
    : /^(TRIAL|IN_PROGRESS|RUNNING|PENDING|IN_REVIEW|CONFIGURED)$/.test(normalized) ? 'warn' : 'muted';
  return <span className={'ehd-status ehd-status--' + tone}><span aria-hidden="true" />{humanize(status)}</span>;
}

function EmptyNote({ children }: { children: string }) {
  return <div className="ehd-empty"><CheckCircle2 size={18} aria-hidden="true" /><span>{children}</span></div>;
}

export default function Dashboard({ productCode, productName, onNavigate, onOpenCustomer }: Props) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestNumber, setRequestNumber] = useState(0);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api<Overview>('/dashboard/overview?productCode=' + encodeURIComponent(productCode), { signal: controller.signal })
      .then(result => { if (mounted) setData(result); })
      .catch(cause => {
        if (mounted) setError(cause instanceof Error ? cause.message : 'Unable to load Owner dashboard.');
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; controller.abort(); };
  }, [productCode, requestNumber]);

  const view = useMemo(() => {
    if (!data) return null;
    const customerNames = new Map(data.customers.map(customer => [customer.id, customer.name]));
    const signupNames = new Map(data.signups.map(signup => [signup.id, signup.name]));
    const customerName = (id?: string | null) => id ? (customerNames.get(id) || 'Customer workspace') : 'Customer workspace';
    const live = data.subscriptions.filter(row => row.status === 'ACTIVE');
    const trials = data.subscriptions.filter(row => row.status === 'TRIAL');
    const pendingSignups = data.signups.filter(row => ['NEW', 'IN_REVIEW'].includes(row.status));
    const pendingJobs = data.provisioning.filter(row => ['RUNNING', 'PENDING'].includes(row.status));
    const failedJobs = data.provisioning.filter(row => ['FAILED', 'REQUIRES_ACTION'].includes(row.status));
    const expiring = data.subscriptions.filter(row =>
      ['ACTIVE', 'TRIAL'].includes(row.status) && isWithinDays(row.expiresAt, 30)
    );
    const inProgress = data.onboarding.filter(row => row.status === 'IN_PROGRESS');

    const pipeline: PipelineStage[] = [
      {
        key: 'new', name: 'Awaiting approval', helper: 'New requests', action: 'Review requests', page: 'Customer Onboarding',
        cards: pendingSignups.map(item => ({
          id: item.id, name: item.name, detail: item.requestedLifecycle + ' request',
          meta: safeDate(item.createdAt),
        })),
      },
      {
        key: 'onboarding', name: 'Onboarding', helper: 'Setup in progress', action: 'Continue onboarding', page: 'Customer Onboarding',
        cards: inProgress.map(item => ({
          id: item.id, name: customerNames.get(item.customerId || '') || signupNames.get(item.signupRequestId || '') || 'Customer onboarding',
          detail: 'Step ' + item.step + ' of 7', meta: safeDate(item.updatedAt), customerId: item.customerId || undefined,
        })),
      },
      {
        key: 'provisioning', name: 'Provisioning', helper: 'Workspace activation', action: 'View customers', page: 'Customers',
        cards: pendingJobs.map(item => ({
          id: item.id, name: customerName(item.customerId), detail: humanize(item.status),
          meta: safeDate(item.updatedAt), customerId: item.customerId,
        })),
      },
      {
        key: 'trial', name: 'Trial', helper: 'Evaluating the product', action: 'Manage subscriptions', page: 'Subscriptions',
        cards: trials.map(item => ({
          id: item.id, name: customerName(item.customerId), detail: item.plan + ' plan',
          meta: item.expiresAt ? 'Ends ' + safeDate(item.expiresAt) : 'Expiry not set', customerId: item.customerId,
        })),
      },
      {
        key: 'live', name: 'Live customers', helper: 'Paid / active accounts', action: 'Manage subscriptions', page: 'Subscriptions', tone: 'live',
        cards: live.map(item => ({
          id: item.id, name: customerName(item.customerId), detail: item.plan + ' plan',
          meta: item.expiresAt ? 'Renews / expires ' + safeDate(item.expiresAt) : 'No expiry date', customerId: item.customerId,
        })),
      },
    ];

    const actions: OwnerAction[] = [
      ...failedJobs.map(item => ({
        key: 'fail-' + item.id, title: customerName(item.customerId),
        detail: 'Provisioning needs attention' + (item.failureCode ? ' · ' + humanize(item.failureCode) : ''),
        kind: 'critical', customerId: item.customerId, page: 'Customers',
      })),
      ...pendingSignups.map(item => ({
        key: 'signup-' + item.id, title: item.name,
        detail: 'Signup awaiting review · ' + safeDate(item.createdAt),
        kind: 'review', page: 'Customer Onboarding',
      })),
      ...expiring.map(item => ({
        key: 'exp-' + item.id, title: customerName(item.customerId),
        detail: item.plan + ' subscription expires ' + safeDate(item.expiresAt),
        kind: 'renewal', customerId: item.customerId, page: 'Subscriptions',
      })),
      ...inProgress.map(item => ({
        key: 'onboard-' + item.id,
        title: customerNames.get(item.customerId || '') || signupNames.get(item.signupRequestId || '') || 'Incomplete onboarding',
        detail: 'Onboarding paused at step ' + item.step + ' of 7',
        kind: 'onboarding', customerId: item.customerId || undefined, page: 'Customer Onboarding',
      })),
    ];

    const plans = ['Basic', 'Premium', 'Enterprise'].map(name => ({
      name, total: data.subscriptions.filter(item =>
        ['ACTIVE', 'TRIAL'].includes(item.status) && item.plan.toLowerCase() === name.toLowerCase()
      ).length,
    }));
    const otherPlans = data.subscriptions.filter(item =>
      ['ACTIVE','TRIAL'].includes(item.status) && !plans.some(plan => plan.name.toLowerCase() === item.plan.toLowerCase())
    ).length;

    return {
      pipeline, actions, plans, otherPlans, failedJobs, expiring,
      kpis: {
        customers: data.customers.length,
        live: countDistinct(live.map(item => item.customerId)),
        trials: countDistinct(trials.map(item => item.customerId)),
        approvals: pendingSignups.length,
        activations: inProgress.length + pendingJobs.length,
        expiring: expiring.length,
        failed: failedJobs.length,
      },
    };
  }, [data]);

  const navigate = (page: string, customerId?: string) => {
    if (customerId) onOpenCustomer(customerId);
    else onNavigate(page);
  };

  const refreshed = () => setRequestNumber(current => current + 1);
  const today = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date());

  if (loading && !data) {
    return <div className="ehd-root ehd-loading" role="status" aria-label="Loading Owner dashboard">
      <div className="ehd-skeleton ehd-skeleton-hero" />
      <div className="ehd-skeleton-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="ehd-skeleton ehd-skeleton-tile" />)}</div>
      <div className="ehd-skeleton ehd-skeleton-board" />
      <span className="ehd-loading-label"><RefreshCw size={17} className="ehd-rotate" /> Connecting to Owner data…</span>
    </div>;
  }

  if (error && !data) {
    return <div className="ehd-root">
      <div className="ehd-error" role="alert">
        <ShieldAlert size={27} />
        <div><strong>Owner dashboard unavailable</strong><p>{error}</p></div>
        <button type="button" onClick={refreshed}><RefreshCw size={16} /> Retry</button>
      </div>
    </div>;
  }

  if (!data || !view) return null;
  const { kpis, pipeline, actions, plans, otherPlans } = view;
  const paidLabel = data.billing.connected && typeof data.billing.mrr === 'number'
    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(data.billing.mrr)
    : 'Not connected';

  const stats = [
    { label: 'Total customers', value: String(kpis.customers), note: 'Assigned to ' + productName, icon: Building2 },
    { label: 'Live customers', value: String(kpis.live), note: 'Active subscriptions', icon: Users },
    { label: 'Active trials', value: String(kpis.trials), note: 'Trial subscriptions', icon: Clock3 },
    { label: 'Pending approvals', value: data.visibility.signups ? String(kpis.approvals) : 'Restricted', note: 'Requests awaiting review', icon: UserRoundPlus },
    { label: 'Expiring in 30 days', value: data.visibility.subscriptions ? String(kpis.expiring) : 'Restricted', note: 'Live and trial subscriptions', icon: CalendarClock },
    { label: 'Monthly recurring revenue', value: paidLabel, note: data.billing.connected ? 'Paid recurring revenue' : 'Connect verified billing data', icon: CircleDollarSign },
  ];

  const env = data.operations.find(item => item.environment === 'PRODUCTION') || data.operations[0];
  const latestDeployment = data.deployments[0];
  const ops = [
    { name: 'Application environment', status: env?.status || 'Not monitored', detail: env ? env.environment + ' · Last checked ' + (env.checkedAt ? safeDate(env.checkedAt) : 'not recorded') : 'No health check connected', icon: Layers3 },
    { name: 'Database', status: 'Data accessible', detail: 'Owner data queries succeeded; database health not monitored', icon: Activity },
    { name: 'Latest deployment', status: latestDeployment?.status || 'Not monitored', detail: latestDeployment ? (latestDeployment.version || latestDeployment.environment) + ' · ' + safeDate(latestDeployment.completedAt) : 'No deployment telemetry connected', icon: Rocket },
    { name: 'Recent provisioning failures', status: String(view.failedJobs.length), detail: 'Based on the 100 most recent provisioning records', icon: Workflow },
  ];

  return <div className="ehd-root">
    <header className="ehd-hero">
      <div className="ehd-hero-copy">
        <span className="ehd-eyebrow"><span aria-hidden="true" className="ehd-eyebrow-dot" /> OWNER WORKSPACE OVERVIEW</span>
        <h2>Manage what matters<span>.</span></h2>
        <p>Customers, activations, subscriptions and operational priorities for {productName}.</p>
      </div>
      <div className="ehd-hero-aside">
        <span><CalendarClock size={16} aria-hidden="true" /> {today}</span>
        <button type="button" className="ehd-refresh" onClick={refreshed} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'ehd-rotate' : ''} aria-hidden="true" />
          {loading ? 'Refreshing…' : 'Refresh data'}
        </button>
      </div>
    </header>

    <section className="ehd-kpi-grid" aria-label="Key performance metrics">
      {stats.map(({ label, value, note, icon: Icon }) => (
        <article className="ehd-kpi" key={label}>
          <div className="ehd-kpi-header"><span>{label}</span><span className="ehd-kpi-icon"><Icon size={18} aria-hidden="true" /></span></div>
          <strong className={value === 'Not connected' || value === 'Restricted' ? 'ehd-kpi-value ehd-kpi-value--unavailable' : 'ehd-kpi-value'}>{value}</strong>
          <small>{note}</small>
        </article>
      ))}
    </section>

    <section className="ehd-panel ehd-pipeline" aria-labelledby="ehd-pipeline-title">
      <div className="ehd-panel-heading">
        <div><span className="ehd-section-kicker">CUSTOMER JOURNEY</span><h3 id="ehd-pipeline-title">Customer lifecycle pipeline</h3><p>Track each stage from the first request through activation.</p></div>
        <button type="button" className="ehd-button-ghost" onClick={() => onNavigate('Customer Onboarding')}>Open onboarding <ArrowUpRight size={16} /></button>
      </div>
      <div className="ehd-pipeline-grid">
        {pipeline.map(stage => (
          <article className={'ehd-stage' + (stage.tone === 'live' ? ' ehd-stage--live' : '')} key={stage.key}>
            <header className="ehd-stage-heading">
              <div><span className="ehd-stage-dot" /><strong>{stage.name}</strong></div>
              <span className="ehd-stage-count">{stage.cards.length}</span>
            </header>
            <p className="ehd-stage-helper">{stage.helper}</p>
            <div className="ehd-stage-list">
              {stage.cards.length ? stage.cards.slice(0, 3).map(item =>
                <button type="button" key={item.id} className="ehd-customer-card"
                  onClick={() => navigate(stage.page, item.customerId)}>
                  <strong>{item.name}</strong>
                  <span>{item.detail}</span>
                  <small>{item.meta}</small>
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
              ) : <div className="ehd-stage-empty"><span aria-hidden="true">—</span> No customers yet</div>}
              {stage.cards.length > 3 && <span className="ehd-more">+{stage.cards.length - 3} more in this stage</span>}
            </div>
            <button type="button" className="ehd-stage-action" onClick={() => onNavigate(stage.page)}>
              {stage.action}<ArrowRight size={14} aria-hidden="true" />
            </button>
          </article>
        ))}
      </div>
    </section>

    <div className="ehd-three-column">
      <section className="ehd-panel" aria-labelledby="ehd-plans-title">
        <div className="ehd-panel-heading"><div><span className="ehd-section-kicker">COMMERCIAL</span><h3 id="ehd-plans-title">Plans & subscriptions</h3><p>Current subscription distribution.</p></div><CreditCard size={20} /></div>
        <div className="ehd-plan-list">
          {plans.map((plan, index) => (
            <div className="ehd-plan-row" key={plan.name}>
              <div><span className={'ehd-plan-bar-key ehd-plan-bar-key--' + index} /><strong>{plan.name}</strong></div>
              <span>{data.visibility.subscriptions ? plan.total : '—'}</span>
            </div>
          ))}
          {otherPlans > 0 && <div className="ehd-plan-row"><div><span className="ehd-plan-bar-key" /><strong>Other plans</strong></div><span>{otherPlans}</span></div>}
        </div>
        <div className="ehd-inline-facts">
          <div><span>Trial</span><strong>{data.visibility.subscriptions ? kpis.trials : '—'}</strong></div>
          <div><span>Live</span><strong>{data.visibility.subscriptions ? kpis.live : '—'}</strong></div>
          <div><span>Expiring</span><strong>{data.visibility.subscriptions ? kpis.expiring : '—'}</strong></div>
        </div>
        <button type="button" className="ehd-link-button" onClick={() => onNavigate('Subscriptions')}>Manage subscriptions <ArrowUpRight size={15}/></button>
      </section>

      <section className="ehd-panel ehd-commercial" aria-labelledby="ehd-commercial-title">
        <div className="ehd-panel-heading"><div><span className="ehd-section-kicker">REVENUE</span><h3 id="ehd-commercial-title">Commercial overview</h3><p>Verified recurring subscription revenue.</p></div><CircleDollarSign size={20}/></div>
        <div className="ehd-commercial-figure"><small>Monthly recurring revenue</small><strong>{paidLabel}</strong><span>{data.billing.connected ? 'Based on connected billing' : 'Connect a billing provider to report actual revenue'}</span></div>
        <div className="ehd-commercial-detail"><span>Annual recurring revenue</span><strong>{data.billing.connected && typeof data.billing.mrr === 'number' ? new Intl.NumberFormat('en-IN', { style:'currency',currency:'INR',maximumFractionDigits:0 }).format(data.billing.mrr * 12) : 'Not measured'}</strong></div>
        <div className="ehd-commercial-detail"><span>Activation backlog</span><strong>{kpis.activations}</strong></div>
        <div className="ehd-commercial-detail"><span>Recent provisioning failures</span><strong>{kpis.failed}</strong></div>
      </section>

      <section className="ehd-panel ehd-operations" aria-labelledby="ehd-ops-title">
        <div className="ehd-panel-heading"><div><span className="ehd-section-kicker">RELIABILITY</span><h3 id="ehd-ops-title">Platform operations</h3><p>Configuration and monitored records.</p></div><Activity size={20}/></div>
        <div className="ehd-operations-list">
          {ops.map(({ name, status, detail, icon: Icon }) => (
            <div className="ehd-operation" key={name}>
              <span className="ehd-operation-icon"><Icon size={18} aria-hidden="true" /></span>
              <div><strong>{name}</strong><small>{detail}</small></div>
              {name === 'Recent provisioning failures' ? <b>{status}</b> : <StatusPill status={status}/>}
            </div>
          ))}
        </div>
      </section>
    </div>

    <div className="ehd-bottom-grid">
      <section className="ehd-panel" aria-labelledby="ehd-action-title">
        <div className="ehd-panel-heading">
          <div><span className="ehd-section-kicker">PRIORITIES</span><h3 id="ehd-action-title">Owner action center</h3><p>Issues and customer requests needing a decision.</p></div>
          <span className="ehd-heading-count">{actions.length}</span>
        </div>
        <div className="ehd-action-list">
          {actions.length ? actions.slice(0, 6).map(item => (
            <button type="button" className="ehd-action-row" key={item.key} onClick={() => navigate(item.page, item.customerId)}>
              <span className={'ehd-action-alert ehd-action-alert--' + item.kind}>
                {item.kind === 'critical' ? <ShieldAlert size={17}/> : <CalendarClock size={17}/>}
              </span>
              <span className="ehd-action-body"><strong>{item.title}</strong><small>{item.detail}</small></span>
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          )) : <EmptyNote>No pending actions in the available records.</EmptyNote>}
          {actions.length > 6 && <span className="ehd-list-more">Showing the six most recent priority items.</span>}
        </div>
      </section>

      <section className="ehd-panel" aria-labelledby="ehd-activity-title">
        <div className="ehd-panel-heading"><div><span className="ehd-section-kicker">AUDIT FEED</span><h3 id="ehd-activity-title">Recent activity</h3><p>Latest recorded events for {productName}.</p></div><Activity size={20}/></div>
        <div className="ehd-activity-list">
          {data.activity.length ? data.activity.slice(0, 6).map(item => (
            <div className="ehd-activity-row" key={item.id}>
              <span className="ehd-activity-icon"><CheckCircle2 size={15} aria-hidden="true" /></span>
              <div><strong>{humanize(item.action)}</strong><small>{humanize(item.resourceType)} · {safeDate(item.createdAt)}</small></div>
            </div>
          )) : <EmptyNote>{data.visibility.audit ? 'No recent activity recorded for this application.' : 'Activity data is restricted for this account.'}</EmptyNote>}
        </div>
      </section>
    </div>

    <footer className="ehd-data-footnote">
      <span><CheckCircle2 size={14} aria-hidden="true" /> Data from the Owner control plane · Updated {safeDate(data.fetchedAt)}</span>
      <span>Financial figures and uptime are shown only when their sources are connected.</span>
    </footer>
  </div>;
}
