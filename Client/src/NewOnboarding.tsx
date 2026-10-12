import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, CircleCheck, Clock3, RefreshCw, Search, ShieldCheck, Trash2, UserRound, Building2, Layers3, Server, Settings2, Users, Rocket } from 'lucide-react';
import { deleteSignupRequest, listSignupRequests, type SignupRequestRow } from './signupRequests';
import { api } from './api';
import './NewOnboarding.css';

type Environment = 'Trial' | 'Live';
type SignupRequest = {
  businessName: string;
  email: string;
  mobile: string;
  signupDate: string;
  emailStatus: 'Verified' | 'Pending';
  mobileStatus: 'Verified' | 'Pending';
};

const steps = [
  { title: 'Review Signup', subtitle: 'Confirm customer signup information', icon: UserRound },
  { title: 'Product & Environment', subtitle: 'Choose product and environment', icon: Layers3 },
  { title: 'Tenant Configuration', subtitle: 'Prepare the customer workspace', icon: Building2 },
  { title: 'Users & Access', subtitle: 'Set up customer administrator access', icon: Users },
  { title: 'Product Configuration', subtitle: 'Enable modules and features', icon: Settings2 },
  { title: 'Infrastructure & Deployment', subtitle: 'Configure hosting and deployment', icon: Server },
  { title: 'Review & Activation', subtitle: 'Validate readiness and activate', icon: Rocket },
];

// Local calendar date (YYYY-MM-DD). toISOString() is UTC and shows yesterday's date in IST before 05:30.
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const toDateInput = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : today());


function OnboardingWizard({ signup, onBackToQueue }: { signup: SignupRequestRow; onBackToQueue: () => void }) {
  const [step, setStep] = useState(0);
  const [environment, setEnvironment] = useState<Environment>('Trial');
  const [request, setRequest] = useState<SignupRequest>({
    businessName: signup.name, email: signup.email, mobile: signup.mobile, signupDate: toDateInput(signup.signupDate), emailStatus: 'Verified', mobileStatus: 'Verified', // only OTP-verified signups reach the queue
  });
  const [industry, setIndustry] = useState('Hospitality');
  const [product, setProduct] = useState('Friday AI Desk');
  const [deployment, setDeployment] = useState('Shared');
  const [trialStart, setTrialStart] = useState(today());
  const [trialEnd, setTrialEnd] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [appUrl, setAppUrl] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [modules, setModules] = useState<string[]>([]);
  const [assignedOwner, setAssignedOwner] = useState('');
  const [provisioning, setProvisioning] = useState('Not Started');
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const trialDays = useMemo(() => {
    if (!trialStart || !trialEnd || trialEnd < trialStart) return null;
    return Math.round((Date.parse(`${trialEnd}T00:00:00Z`) - Date.parse(`${trialStart}T00:00:00Z`)) / 86400000);
  }, [trialStart, trialEnd]);

  const updateRequest = (key: keyof SignupRequest, value: string) => setRequest((old) => ({ ...old, [key]: value }));
  const toggleModule = (value: string) => setModules((old) => old.includes(value) ? old.filter((x) => x !== value) : [...old, value]);
  const canContinue = () => {
    if (step === 0) return Boolean(request.businessName.trim() && request.email.trim() && request.mobile.trim() && assignedOwner.trim());
    if (step === 1) return Boolean(product && environment && (environment === 'Live' || (trialStart && trialEnd && trialEnd >= trialStart)));
    if (step === 2) return Boolean(tenantName.trim() && tenantId.trim());
    if (step === 3) return Boolean(adminName.trim() && adminEmail.trim());
    if (step === 4) return modules.length > 0;
    if (step === 5) return provisioning === 'Ready';
    return true;
  };
  const next = async () => {
    if (!canContinue()) { alert('Complete the required fields before continuing.'); return; }
    if (step < steps.length - 1) setStep(step + 1);
    else try {
      setSaving(true); setSaveError('');
      await api('/onboarding', { method: 'POST', body: JSON.stringify({
        step: 7,
        data: {
          companyName: request.businessName, legalName: request.businessName,
          email: request.email, phone: request.mobile,
          industry: ['Hospitality', 'Real Estate', 'Fitness', 'Sales'].includes(industry) ? industry : 'Sales',
          accountOwner: assignedOwner,
          city: '', country: 'India', product, environment, deployment,
          tenantName, tenantId, appUrl, adminName, adminEmail, modules,
          provisioning, notes,
          trialStart: environment === 'Trial' ? trialStart : null,
          trialEnd: environment === 'Trial' ? trialEnd : null,
        },
      }) });
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save this onboarding record.');
    } finally { setSaving(false); }
  };

  return <section className="fo-onboarding">
    <div className="fo-onboarding-layout">
      <div className="fo-stepper" role="navigation" aria-label="Onboarding steps"><div className="fo-stepper-title">ONBOARDING WORKFLOW <span>{step + 1}/{steps.length}</span></div>{steps.map((item, i) => { const Icon = item.icon; return <button type="button" key={item.title} onClick={() => i <= step && setStep(i)} aria-current={i === step ? 'step' : undefined} className={`fo-step ${i === step ? 'is-current' : ''} ${i < step ? 'is-complete' : ''}`}><span className="fo-step-icon">{i < step ? <Check size={17}/> : <Icon size={17}/>}</span><span className="fo-step-copy"><b>{item.title}</b><small>{item.subtitle}</small></span><span className="fo-step-number">{String(i + 1).padStart(2, '0')}</span></button>; })}</div>
      <div className="fo-onboarding-panel"><div className="fo-panel-heading"><div><span className="fo-eyebrow">STEP {String(step + 1).padStart(2, '0')} OF {steps.length}</span><h2>{steps[step].title}</h2><p>{steps[step].subtitle}</p></div><div className="fo-progress-count">{Math.round(((step + 1) / steps.length) * 100)}% <span>complete</span></div></div><div className="fo-progress-track"><span style={{ width: `${((step + 1) / steps.length) * 100}%` }}/></div>
      {step === 0 && <div className="fo-section"><div className="fo-section-title"><div><h3>Signup details</h3><p>These details should be pre-filled from the customer-facing signup form.</p></div><span className="fo-chip">Signup record</span></div><div className="fo-form-grid"><label>Business Name *<input value={request.businessName} onChange={e => updateRequest('businessName', e.target.value)} placeholder="Customer business name"/></label><label>Business Email ID *<input type="email" value={request.email} onChange={e => updateRequest('email', e.target.value)} placeholder="admin@company.com"/></label><label>Mobile Number *<input value={request.mobile} onChange={e => updateRequest('mobile', e.target.value)} placeholder="Customer mobile number"/></label><label>Signup Date<input type="date" value={request.signupDate} onChange={e => updateRequest('signupDate', e.target.value)}/></label><label>Email Verification<select value={request.emailStatus} onChange={e => updateRequest('emailStatus', e.target.value as SignupRequest['emailStatus'])}><option>Pending</option><option>Verified</option></select></label><label>Mobile Verification<select value={request.mobileStatus} onChange={e => updateRequest('mobileStatus', e.target.value as SignupRequest['mobileStatus'])}><option>Pending</option><option>Verified</option></select></label><label>Industry<select value={industry} onChange={e => setIndustry(e.target.value)}><option>Hospitality</option><option>Real Estate</option><option>Sales</option><option>Fitness</option><option>Other</option></select></label><label>Assigned Friday Team Member<input value={assignedOwner} onChange={e => setAssignedOwner(e.target.value)} placeholder="Assign onboarding owner"/></label></div><div className="fo-notice"><ShieldCheck size={18}/><span>Verify the signup request before provisioning. Do not store passwords or raw OTP values in this record.</span></div></div>}
      {step === 1 && <div className="fo-section"><div className="fo-section-title"><div><h3>Product and environment</h3><p>Select the product and the type of environment to provision.</p></div></div><div className="fo-form-grid"><label>Product *<select value={product} onChange={e => setProduct(e.target.value)}><option>Friday AI Desk</option><option>Friday CRM</option><option>Friday Automation</option><option>Friday AI</option><option>Other</option></select></label><label>Industry<select value={industry} onChange={e => setIndustry(e.target.value)}><option>Hospitality</option><option>Real Estate</option><option>Sales</option><option>Fitness</option><option>Other</option></select></label></div><div className="fo-environment-options"><button type="button" className={environment === 'Trial' ? 'selected' : ''} onClick={() => setEnvironment('Trial')}><span className="fo-radio"/><span><b>Trial Environment</b><small>Time-limited evaluation access</small></span><Clock3 size={21}/></button><button type="button" className={environment === 'Live' ? 'selected' : ''} onClick={() => setEnvironment('Live')}><span className="fo-radio"/><span><b>Live / Production</b><small>Production-ready customer environment</small></span><Rocket size={21}/></button></div>{environment === 'Trial' && <div className="fo-trial-box"><h4><CalendarDays size={18}/> Trial access period</h4><div className="fo-form-grid"><label>Trial Start Date *<input type="date" value={trialStart} onChange={e => setTrialStart(e.target.value)}/></label><label>Trial Expiry Date *<input type="date" min={trialStart || undefined} value={trialEnd} onChange={e => setTrialEnd(e.target.value)}/></label></div><div className="fo-trial-duration"><span>Calculated trial duration</span><b>{trialDays === null ? 'Select valid start and expiry dates' : `${trialDays} ${trialDays === 1 ? 'day' : 'days'}`}</b></div></div>}<div className="fo-form-grid fo-single-row"><label>Deployment Model<select value={deployment} onChange={e => setDeployment(e.target.value)}><option>Shared</option><option>Dedicated</option></select></label></div></div>}
      {step === 2 && <div className="fo-section"><div className="fo-section-title"><div><h3>Tenant configuration</h3><p>Define the tenant identity and workspace destination.</p></div></div><div className="fo-form-grid"><label>Tenant / Workspace Name *<input value={tenantName} onChange={e => setTenantName(e.target.value)} placeholder="e.g. Acme Hospitality"/></label><label>Unique Tenant ID *<input value={tenantId} onChange={e => setTenantId(e.target.value)} placeholder="Generated or assigned unique ID"/></label><label>Application URL<input value={appUrl} onChange={e => setAppUrl(e.target.value)} placeholder="https://customer.friday..."/></label><label>Region<select defaultValue="India" ><option>India</option><option>Singapore</option><option>United Kingdom</option><option>United States</option><option>Other</option></select></label></div><div className="fo-notice"><Building2 size={18}/><span>Tenant creation should be confirmed by the provisioning service before activation.</span></div></div>}
      {step === 3 && <div className="fo-section"><div className="fo-section-title"><div><h3>Customer administrator</h3><p>Set up the initial administrator and access invitation.</p></div></div><div className="fo-form-grid"><label>Administrator Name *<input value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Full name"/></label><label>Administrator Email *<input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="admin@company.com"/></label><label>Access Role<select defaultValue="Customer Admin"><option>Customer Admin</option><option>Tenant Admin</option></select></label><label>Invitation Status<select defaultValue="Not Sent"><option>Not Sent</option><option>Ready to Send</option></select></label></div><div className="fo-notice"><ShieldCheck size={18}/><span>Use a secure invitation flow. Do not enter a password manually.</span></div></div>}
      {step === 4 && <div className="fo-section"><div className="fo-section-title"><div><h3>Product configuration</h3><p>Select the modules required for this customer. Availability depends on the selected product.</p></div></div><div className="fo-module-options">{['Core workspace','Customer management','Automation','AI assistant','Analytics & reports','Integrations','Notifications'].map(m => <label key={m} className="fo-module-option"><input type="checkbox" checked={modules.includes(m)} onChange={() => toggleModule(m)}/><span><b>{m}</b><small>Enable this module for the tenant</small></span></label>)}</div></div>}
      {step === 5 && <div className="fo-section"><div className="fo-section-title"><div><h3>Infrastructure and deployment</h3><p>Track environment readiness. Fields can be adapted to your hosting architecture.</p></div></div><div className="fo-form-grid"><label>Hosting Target<select defaultValue={deployment}><option>Shared</option><option>Dedicated</option></select></label><label>Provisioning Status<select value={provisioning} onChange={e => setProvisioning(e.target.value)}><option>Not Started</option><option>In Progress</option><option>Ready</option><option>Failed</option></select></label><label>Domain / URL<input value={appUrl} onChange={e => setAppUrl(e.target.value)} placeholder="Customer application URL"/></label><label>SSL Status<select defaultValue="Pending"><option>Pending</option><option>Configured</option><option>Not Required</option></select></label></div><div className="fo-notice"><Server size={18}/><span>Production deployment must pass the required health and security checks before activation.</span></div></div>}
      {step === 6 && <div className="fo-section"><div className="fo-section-title"><div><h3>Review onboarding details</h3><p>Confirm the information before creating the customer onboarding record.</p></div></div><div className="fo-review-grid">{[['Business',request.businessName || 'Not provided'],['Email',request.email || 'Not provided'],['Mobile',request.mobile || 'Not provided'],['Industry',industry],['Product',product],['Environment',environment],['Tenant',tenantName || 'Not configured'],['Tenant ID',tenantId || 'Not configured'],['Administrator',adminEmail || 'Not configured'],['Deployment',deployment],['Provisioning',provisioning],['Modules',modules.length ? modules.join(', ') : 'No modules selected']].map(([k,v]) => <div className="fo-review-item" key={k}><small>{k}</small><b>{v}</b></div>)}</div>{environment === 'Trial' && <div className="fo-review-trial"><CalendarDays size={18}/><span>Trial: {trialStart || 'Start date not set'} → {trialEnd || 'Expiry date not set'} ({trialDays === null ? 'duration not set' : `${trialDays} days`})</span></div>}<label className="fo-notes-label">Onboarding notes<textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes or outstanding checks"/></label><div className="fo-notice"><ShieldCheck size={18}/><span>Creating this record adds the customer to the Owner onboarding workflow. Activation remains subject to your standard provisioning checks.</span></div></div>}
      {saveError && <div className="fo-signups-error" role="alert"><AlertCircle size={18}/><span>{saveError}</span></div>}
      {saved && <div className="fo-saved"><CircleCheck size={19}/> Onboarding record created and added to the Owner workflow.</div>}
      <footer className="fo-wizard-actions"><button type="button" className="fo-btn secondary" title={step === 0 ? 'Back to signup requests' : undefined} onClick={() => { if (step === 0) { onBackToQueue(); return; } setSaved(false); setSaveError(''); setStep(step - 1); }}><ChevronLeft size={17}/> Back</button><span className="fo-required-note">* Required fields</span><button type="button" className="fo-btn primary" onClick={() => void next()} disabled={saving || saved}>{step === steps.length - 1 ? (saving ? 'Creating…' : 'Create onboarding record') : 'Save & continue'} <ChevronRight size={17}/></button></footer>
      </div>
    </div>
  </section>;
}

const matchesQuery = (row: SignupRequestRow, query: string) =>
  [row.name, row.email, row.mobile].some((value) => (value ?? '').toLowerCase().includes(query));

function SignupQueue({ onProceed }: { onProceed: (row: SignupRequestRow) => void }) {
  const [rows, setRows] = useState<SignupRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<SignupRequestRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const latest = useRef(0);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    setError('');
    try {
      const data = await listSignupRequests();
      if (id === latest.current) setRows(data);
    } catch (err) {
      if (id === latest.current) { setRows([]); setError(err instanceof Error ? err.message : 'Could not load signup requests.'); }
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); return () => { latest.current += 1; }; }, [load]);
  useEffect(() => { if (pendingDelete) cancelRef.current?.focus(); }, [pendingDelete]);

  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => (needle ? rows.filter((row) => matchesQuery(row, needle)) : rows), [rows, needle]);

  const closeDialog = () => { if (!deleting) { setPendingDelete(null); setDeleteError(''); } };
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteSignupRequest(target.id);
      setRows((old) => old.filter((row) => row.id !== target.id));
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete this signup request.');
    } finally {
      setDeleting(false);
    }
  };

  return <section className="fo-signups" aria-labelledby="fo-signups-title">
    <div className="fo-signups-card">
      <div className="fo-signups-head">
        <div><span className="fo-eyebrow">NEW ONBOARDING</span><h2 id="fo-signups-title">Signup Requests</h2><p>Choose a customer signup to start onboarding. Their details are prefilled in the form.</p></div>
        <span className="fo-chip" aria-live="polite">{loading ? 'Loading…' : `${visible.length}${needle ? ` of ${rows.length}` : ''} ${rows.length === 1 && !needle ? 'request' : 'requests'}`}</span>
      </div>
      <div className="fo-signups-toolbar">
        <label className="fo-signup-search"><Search size={17} aria-hidden="true"/><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, email or mobile" aria-label="Search signup requests"/></label>
        <div className="fo-signups-toolbar-actions"><button type="button" className="fo-btn secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? 'fo-spin' : undefined} aria-hidden="true"/> Refresh</button></div>
      </div>
      {error && <div className="fo-signups-error" role="alert"><AlertCircle size={18} aria-hidden="true"/><span>{error}</span></div>}
      <div className="fo-signups-table-wrap">
        <table className="fo-signups-table">
          <caption className="fo-sr-only">Signup requests</caption>
          <thead><tr><th scope="col">Customer</th><th scope="col">Email ID</th><th scope="col">Mobile Number</th><th scope="col"><span className="fo-sr-only">Actions</span></th></tr></thead>
          <tbody>
            {loading && rows.length === 0 ? <tr className="fo-signups-message"><td colSpan={4}>Loading signup requests…</td></tr>
              : visible.length === 0 ? <tr className="fo-signups-message"><td colSpan={4}>{error ? 'No signup requests to show.' : needle ? 'No signup requests match your search.' : 'No signup requests are waiting.'}</td></tr>
              : visible.map((row) => <tr key={row.id}>
                <td data-label="Customer"><strong>{row.name || '—'}</strong></td>
                <td data-label="Email ID" className="fo-signups-wrap">{row.email || '—'}</td>
                <td data-label="Mobile Number">{row.mobile || '—'}</td>
                <td data-label="Actions" className="fo-signups-actions"><div className="fo-signups-actions-inner"><button type="button" className="fo-btn primary sm" onClick={() => onProceed(row)}>Proceed <ArrowRight size={15} aria-hidden="true"/></button><button type="button" className="fo-btn danger sm" onClick={() => { setDeleteError(''); setPendingDelete(row); }} aria-label={`Delete signup request for ${row.name || row.email}`}><Trash2 size={15} aria-hidden="true"/> Delete</button></div></td>
              </tr>)}
          </tbody>
        </table>
      </div>
    </div>
    {pendingDelete && <div className="fo-confirm-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="fo-confirm" role="alertdialog" aria-modal="true" aria-labelledby="fo-confirm-title" aria-describedby="fo-confirm-text" onKeyDown={(e) => { if (e.key === 'Escape') closeDialog(); }}>
        <h3 id="fo-confirm-title">Delete signup request?</h3>
        <p id="fo-confirm-text">This will permanently remove the signup request for <b>{pendingDelete.name || pendingDelete.email}</b>. This cannot be undone.</p>
        {deleteError && <div className="fo-signups-error" role="alert"><AlertCircle size={18} aria-hidden="true"/><span>{deleteError}</span></div>}
        <div className="fo-confirm-actions">
          <button type="button" className="fo-btn secondary" ref={cancelRef} onClick={closeDialog} disabled={deleting}>Cancel</button>
          <button type="button" className="fo-btn danger solid" onClick={() => void confirmDelete()} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</button>
        </div>
      </div>
    </div>}
  </section>;
}

export default function NewOnboarding() {
  const [selected, setSelected] = useState<SignupRequestRow | null>(null);
  useEffect(() => { document.querySelector('.shell > main')?.scrollTo({ top: 0, left: 0 }); }, [selected]);
  return selected
    ? <OnboardingWizard key={selected.id} signup={selected} onBackToQueue={() => setSelected(null)} />
    : <SignupQueue onProceed={setSelected} />;
}
