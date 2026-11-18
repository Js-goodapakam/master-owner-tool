import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUpRight, CheckCircle2, ChevronRight, ClipboardCheck, KeyRound, LockKeyhole, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { api } from './api';
import { Badge, Button, Card, ErrorState, Loading } from './components';
import './OTAIntegrations.css';

type Approval = 'NOT_STARTED' | 'REQUESTED' | 'APPROVED' | 'CERTIFIED';
type Environment = 'sandbox' | 'production';
type OtaConfiguration = {
  approvalStatus: Approval; environment: Environment; partnerReference: string; clientId: string;
  notes: string; hasCredential: boolean; connectionStatus: 'NOT_CONNECTED' | 'VERIFIED' | 'FAILED';
  verifiedAt: string | null; lastError: string | null; updatedAt: string | null;
};
type OtaProvider = {
  id: string; name: string; type: string; priority: string; feasibility: string;
  auth: string; capabilities: string[]; requirements: string[]; docsUrl: string;
  notes: string; supportsLiveVerification: boolean; configuration: OtaConfiguration;
};
type OtaResponse = { providers: OtaProvider[]; storageReady: boolean; credentialVaultReady: boolean; guidance: string };
type IntegrationRow = { id: string; integration: string; provider: string; scope: string; status: string; lastSync: string; kind?: 'ota' | 'platform'; providerId?: string };
type FormState = {
  approvalStatus: Approval; environment: Environment; partnerReference: string;
  clientId: string; notes: string; credential: string;
};
const blankForm = (p: OtaProvider): FormState => ({
  approvalStatus: p.configuration.approvalStatus,
  environment: p.configuration.environment,
  partnerReference: p.configuration.partnerReference,
  clientId: p.configuration.clientId,
  notes: p.configuration.notes,
  credential: '',
});
const approvalLabels: Record<Approval, string> = {
  NOT_STARTED: 'Not started', REQUESTED: 'Access requested', APPROVED: 'Access approved', CERTIFIED: 'Certified',
};
const statusLabel = (p: OtaProvider): string => {
  if (p.configuration.connectionStatus === 'VERIFIED') return 'API verified';
  if (p.configuration.connectionStatus === 'FAILED') return 'Verification failed';
  if (p.configuration.approvalStatus === 'NOT_STARTED') return 'Partner access required';
  if (p.configuration.approvalStatus === 'REQUESTED') return 'Approval pending';
  return 'Not connected';
};
const statusVariant = (p: OtaProvider): 'success' | 'warning' | 'neutral' => {
  if (p.configuration.connectionStatus === 'VERIFIED') return 'success';
  if (p.configuration.connectionStatus === 'FAILED') return 'warning';
  return 'neutral';
};
export default function OTAIntegrations() {
  const [data, setData] = useState<OtaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [integrationRows, setIntegrationRows] = useState<IntegrationRow[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function refresh() {
    const [catalog, rows] = await Promise.all([
      api<OtaResponse>('/integrations/ota'),
      api<IntegrationRow[]>('/integrations'),
    ]);
    setData(catalog);
    setIntegrationRows(rows);
    return catalog;
  }
  useEffect(() => {
    let live = true;
    Promise.all([
      api<OtaResponse>('/integrations/ota'),
      api<IntegrationRow[]>('/integrations'),
    ])
      .then(([catalog, rows]) => {
        if (!live) return;
        setData(catalog);
        setIntegrationRows(rows);
      })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : 'Could not load integrations.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (selectedId) document.getElementById('ota-provider-setup')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedId]);
  const selected = data?.providers.find(p => p.id === selectedId);
  function openProvider(provider: OtaProvider) {
    setSelectedId(provider.id);
    setForm(blankForm(provider));
    setError('');
    setNotice('');
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || !form) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const payload: Record<string, string> = {
        approvalStatus: form.approvalStatus, environment: form.environment,
        partnerReference: form.partnerReference, clientId: form.clientId, notes: form.notes,
      };
      if (form.credential.trim()) payload.credential = form.credential.trim();
      const result = await api<{ message: string }>('/integrations/ota/' + selected.id, {
        method: 'PUT', body: JSON.stringify(payload),
      });
      const refreshed = await refresh();
      const updated = refreshed.providers.find(p => p.id === selected.id);
      if (updated) setForm(blankForm(updated));
      setNotice(result.message);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save provider configuration.'); }
    finally { setSaving(false); }
  }
  async function testProvider() {
    if (!selected) return;
    setTesting(true); setError(''); setNotice('');
    try {
      const result = await api<{ verified: boolean; message: string }>('/integrations/ota/' + selected.id + '/verify', { method: 'POST' });
      await refresh();
      setNotice(result.message);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to validate API credentials.'); }
    finally { setTesting(false); }
  }
  if (loading) return <Loading />;
  if (!data) return <ErrorState message={error || 'OTA connectivity catalog is not available.'} />;
  const verified = data.providers.filter(p => p.configuration.connectionStatus === 'VERIFIED').length;
  const reviewCount = data.providers.filter(p => p.configuration.approvalStatus === 'REQUESTED').length;
  return (
    <div className="ota-module">
      <div className="ota-module-heading">
        <div><span className="ota-eyebrow">Engage Stay · Channel Manager</span>
          <h3>OTA connectivity and verification</h3>
          <p>Review every OTA in the existing integration list. Use Connect to open provider-specific internal settings and connection checks.</p>
        </div>
        <button className="ota-refresh" type="button" onClick={() => { setError(''); void refresh().catch(() => setError('Unable to refresh OTA information.')); }}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
      <Card title="Connected integrations" subtitle="EngageStay workspace and all OTA providers — connection status is based on actual verification records">
        <div className="ota-integration-table-scroll">
          <table className="ota-integration-table">
            <thead><tr>
              <th scope="col">Integration</th>
              <th scope="col">Provider</th>
              <th scope="col">Scope</th>
              <th scope="col">Status</th>
              <th scope="col">Last sync / verification</th>
              <th scope="col">Action</th>
            </tr></thead>
            <tbody>
              {integrationRows.map(row => {
                const provider = row.kind === 'ota' ? data.providers.find(p => p.id === row.providerId) : undefined;
                const connected = row.status === 'Connected' || row.status === 'API verified';
                const badStatus = row.status === 'Verification failed' || row.status === 'Status unavailable' || row.status === 'Action required' || row.status === 'Unavailable';
                return <tr key={row.id} className={provider && selectedId === provider.id ? 'ota-table-row-selected' : ''}>
                  <td><strong>{row.integration}</strong></td>
                  <td>{row.provider}</td>
                  <td>{row.scope}</td>
                  <td><Badge variant={connected ? 'success' : badStatus ? 'warning' : 'neutral'}>{row.status}</Badge></td>
                  <td className="ota-sync-value">{row.lastSync && row.lastSync !== '—' ? new Date(row.lastSync).toLocaleString() : '—'}</td>
                  <td>
                    {provider ? <button type="button" className="ota-connect-button" aria-label={'Connect ' + provider.name}
                      onClick={() => openProvider(provider)}>
                      {provider.configuration.connectionStatus === 'VERIFIED' ? 'Manage' : 'Connect'} <ChevronRight size={15} />
                    </button> : <span className="ota-table-na">—</span>}
                  </td>
                </tr>;
              })}
              {integrationRows.length === 0 && <tr><td colSpan={6}>No integrations are available for the selected application.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="ota-table-hint">Connect opens the provider's internal setup form below. A provider is marked API verified only after a successful authenticated check.</p>
      </Card>
      <div className="ota-summary">
        <div><strong>{data.providers.length}</strong><span>Providers reviewed</span></div>
        <div><strong>{verified}</strong><span>Verified API connections</span></div>
        <div><strong>{reviewCount}</strong><span>Partner applications pending</span></div>
      </div>
      <p className="ota-information"><LockKeyhole size={16} /> {data.guidance} A verified Channex API account does not mean any hotel or OTA channel is mapped.</p>
      {!data.storageReady && <p className="ota-warning"><ShieldAlert size={16} /> Configuration saving is disabled. Configure Supabase and apply Database/migrations/010_owner_ota_integrations.sql.</p>}
      {!data.credentialVaultReady && <p className="ota-warning"><KeyRound size={16} /> Credential storage requires the server-only OTA_CREDENTIAL_ENCRYPTION_KEY (64 hexadecimal characters). Non-secret setup details can still be saved.</p>}
      {selected && <div id="ota-provider-setup" className="ota-setup-focus" tabIndex={-1}><Card className="ota-detail-card" title={selected.name + ' · Internal connection details'}
        subtitle="Official developer requirements, required credentials and connection verification">
        <div className="ota-detail-toolbar"><span>Provider setup · {selected.type}</span>
          <button type="button" onClick={() => { setSelectedId(null); setForm(null); setError(''); setNotice(''); }}
            aria-label="Close provider setup"><X size={16}/> Close</button>
        </div>
        <div className="ota-detail-grid">
          <div className="ota-technical">
            <div className="ota-section-title"><ClipboardCheck size={17} /> Developer documentation & feasibility</div>
            <div className="ota-field"><span>Integration path</span><strong>{selected.type}</strong></div>
            <div className="ota-field"><span>Current feasibility</span><strong>{selected.feasibility}</strong></div>
            <div className="ota-field"><span>Authentication</span><strong>{selected.auth}</strong></div>
            <div className="ota-list-title">Documented capabilities</div>
            <ul>{selected.capabilities.map(item => <li key={item}><CheckCircle2 size={14}/>{item}</li>)}</ul>
            <div className="ota-list-title">Requirements before going live</div>
            <ol>{selected.requirements.map(item => <li key={item}>{item}</li>)}</ol>
            <p className="ota-doc-note">{selected.notes}</p>
            <a className="ota-document-link" href={selected.docsUrl} target="_blank" rel="noopener noreferrer">Read official developer documentation <ArrowUpRight size={15}/></a>
          </div>
          <form className="ota-config-form" onSubmit={e => { void save(e); }}>
            <div className="ota-section-title"><KeyRound size={17} /> Provider account & approval</div>
            <p>These are Engagehubs-level connection records. Hotel codes and property-specific tokens must be entered by the customer in Engage Stay.</p>
            <label>Partner approval status
              <select disabled={!data.storageReady || saving} value={form?.approvalStatus || 'NOT_STARTED'} onChange={e => setForm(s => s && ({...s, approvalStatus: e.target.value as Approval}))}>
                {(Object.keys(approvalLabels) as Approval[]).map(key => <option key={key} value={key}>{approvalLabels[key]}</option>)}
              </select>
            </label>
            <label>API environment
              <select disabled={!data.storageReady || saving} value={form?.environment || 'sandbox'} onChange={e => setForm(s => s && ({...s, environment: e.target.value as Environment}))}>
                <option value="sandbox">Sandbox / staging</option><option value="production">Production</option>
              </select>
            </label>
            <label>Provider / partner reference
              <input disabled={!data.storageReady || saving} maxLength={150} placeholder="Provider-issued partner ID or account reference"
                value={form?.partnerReference || ''} onChange={e => setForm(s => s && ({...s, partnerReference: e.target.value}))}/>
            </label>
            <label>OAuth client ID / API identifier (where applicable)
              <input disabled={!data.storageReady || saving} maxLength={200} placeholder="Client ID (not a secret)"
                value={form?.clientId || ''} onChange={e => setForm(s => s && ({...s, clientId: e.target.value}))}/>
            </label>
            <label>Provider API key / client secret (encrypted at rest)
              <input type="password" autoComplete="new-password" maxLength={4000}
                disabled={!data.storageReady || !data.credentialVaultReady || saving}
                placeholder={selected.configuration.hasCredential ? 'Credential securely stored · enter to replace' : 'Enter approved provider credential'}
                value={form?.credential || ''} onChange={e => setForm(s => s && ({...s, credential: e.target.value}))}/>
            </label>
            <label>Internal onboarding notes (do not paste secrets)
              <textarea disabled={!data.storageReady || saving} rows={3} maxLength={1000} placeholder="Partner ticket, certification milestones or integration owner"
                value={form?.notes || ''} onChange={e => setForm(s => s && ({...s, notes: e.target.value}))}/>
            </label>
            <p className="ota-credential-note"><LockKeyhole size={15}/> Credentials are never returned by the API. Saving resets verification until the connection is checked again.</p>
            <div className="ota-actions">
              <Button type="submit" disabled={!data.storageReady || saving || !form}>{saving ? 'Saving…' : 'Save setup'}</Button>
              {selected.supportsLiveVerification &&
                <Button type="button" variant="secondary" disabled={testing || saving || !selected.configuration.hasCredential || !['APPROVED', 'CERTIFIED'].includes(selected.configuration.approvalStatus)}
                  onClick={() => void testProvider()}>{testing ? 'Checking…' : 'Verify API access'}</Button>}
            </div>
            {!selected.supportsLiveVerification &&
              <p className="ota-credential-note">Live verification will be enabled only after an approved provider-specific API adapter is implemented.</p>}
            <div className="ota-connection-state"><strong>Connection state:</strong> <Badge variant={statusVariant(selected)}>{statusLabel(selected)}</Badge>
              {selected.configuration.verifiedAt && <span>Last verified {new Date(selected.configuration.verifiedAt).toLocaleString()}</span>}</div>
          </form>
        </div>
        {error && <p className="ota-action-error" role="alert">{error}</p>}
        {notice && <p className="ota-action-notice" role="status">{notice}</p>}
      </Card></div>}
      <p className="ota-footnote">Documentation references reviewed 18 November 2026. API access and OTA partnerships must be verified with each provider before production activation.</p>
    </div>
  );
}
