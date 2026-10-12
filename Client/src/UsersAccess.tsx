import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from './api';
import { Badge, Button, Card, ErrorState, Input, Loading, Table } from './components';
import './UsersAccess.css';

type AccessUser = { id: string; name: string; email: string; role: string; status?: string; lastLogin?: string };
type AccessTab = 'Users' | 'Roles & Permissions' | 'Role Assignment';
const roles = ['Owner', 'Super Admin', 'Admin', 'Operations Manager', 'Sales Manager', 'Support Executive', 'Freelancer', 'Customer Admin', 'Customer User'];
const modules = ['Dashboard', 'Customers', 'New Onboarding', 'Products & Plans', 'Subscriptions', 'Infrastructure', 'Deployments', 'Integrations', 'Live Monitoring', 'Backup & Restore', 'Users & Access', 'Audit Logs', 'Owner Settings'];
const actions = ['View', 'Create', 'Edit', 'Delete', 'Approve', 'Export', 'Manage Users', 'Manage Permissions', 'Configure', 'Execute'];

export default function UsersAccess() {
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<AccessTab>('Users');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ name: '', email: '', role: 'Operations Manager' });
  const [saving, setSaving] = useState(false);
  const [selectedRole, setSelectedRole] = useState('Operations Manager');
  const [permissionDraft, setPermissionDraft] = useState<Record<string, string[]>>({
    'Owner': [...actions], 'Super Admin': ['View', 'Create', 'Edit', 'Delete', 'Approve', 'Export', 'Manage Users', 'Configure', 'Execute'],
    'Admin': ['View', 'Create', 'Edit', 'Export', 'Manage Users'], 'Operations Manager': ['View', 'Create', 'Edit', 'Approve'],
    'Sales Manager': ['View', 'Create', 'Edit', 'Export'], 'Support Executive': ['View', 'Edit'], 'Freelancer': ['View', 'Create', 'Edit'],
    'Customer Admin': ['View', 'Manage Users'], 'Customer User': ['View']
  });
  useEffect(() => {
    let active = true;
    api<AccessUser[]>('/users-access').then(data => { if (active) setUsers(Array.isArray(data) ? data : []); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Could not load users.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const filteredUsers = useMemo(() => users.filter(u => `${u.name} ${u.email} ${u.role} ${u.status ?? ''}`.toLowerCase().includes(query.toLowerCase())), [users, query]);
  async function createUser(event: FormEvent) {
    event.preventDefault(); setSaving(true); setNotice(''); setError('');
    try {
      const user = await api<AccessUser>('/users-access', { method: 'POST', body: JSON.stringify(form) });
      setUsers(current => [user, ...current]); setForm({ name: '', email: '', role: 'Operations Manager' });
      setNotice(`User record created for ${user.email}.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create this user.'); }
    finally { setSaving(false); }
  }
  function togglePermission(module: string, action: string) {
    setPermissionDraft(current => {
      const existing = current[selectedRole] ?? [];
      return { ...current, [selectedRole]: existing.includes(`${module}:${action}`) ? existing.filter(x => x !== `${module}:${action}`) : [...existing, `${module}:${action}`] };
    });
  }
  return <section className="ua-page">
    <header className="ua-heading"><div><p className="ua-eyebrow">PLATFORM ADMINISTRATION</p><h2>Users &amp; Access</h2><p>Manage platform users, roles, and access boundaries from one place.</p></div><div className="ua-stat"><span>Total users</span><strong>{users.length}</strong></div></header>
    <nav className="ua-tabs" aria-label="Users and access sections">{(['Users', 'Roles & Permissions', 'Role Assignment'] as AccessTab[]).map(item => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)} type="button">{item}</button>)}</nav>
    {error && <div className="ua-alert error" role="alert">{error}</div>}{notice && <div className="ua-alert success" role="status">{notice}</div>}
    {tab === 'Users' && <div className="ua-grid"><Card title="Add a platform user" subtitle="Create an internal user record and choose an initial role."><form className="ua-form" onSubmit={createUser}><label>Full name<Input required placeholder="Full name" value={form.name} onChange={e => setForm({...form, name:e.target.value})} /></label><label>Work email<Input required type="email" placeholder="name@company.com" value={form.email} onChange={e => setForm({...form, email:e.target.value})} /></label><label>Initial role<select value={form.role} onChange={e => setForm({...form, role:e.target.value})}>{roles.map(role => <option key={role}>{role}</option>)}</select></label><Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create user'}</Button><small className="ua-muted">Actual email invitations require an identity-provider or email integration.</small></form></Card>
    <Card title="User directory" subtitle="Search current platform user records."><div className="ua-directory-tools">
<Input
  placeholder="Search name, email, role, or status"
  value={query}
  onChange={(e) => setQuery(e.target.value)}
/>
<span>{filteredUsers.length} shown</span></div>{loading ? <Loading /> : error ? <ErrorState message={error} /> : <div className="ua-table-wrap"><Table headers={['User', 'Role', 'Status', 'Last login']}>{filteredUsers.map((u, i) => <tr key={u.id || u.email || i}><td><strong>{u.name || 'Unnamed user'}</strong><small>{u.email}</small></td><td><Badge>{u.role}</Badge></td><td>{u.status || 'Pending'}</td><td>{u.lastLogin || '—'}</td></tr>)}</Table>{!filteredUsers.length && <p className="ua-empty">No users match this search.</p>}</div>}</Card></div>}
    {tab === 'Roles & Permissions' && <Card title="Role permissions" subtitle="Review the permission matrix. Changes on this screen are a local draft until role-permission persistence is connected."><div className="ua-role-toolbar"><label>Role<select value={selectedRole} onChange={e => setSelectedRole(e.target.value)}>{roles.map(role => <option key={role}>{role}</option>)}</select></label><span className="ua-muted">{(permissionDraft[selectedRole] || []).length} permissions selected</span></div><div className="ua-permission-wrap"><table className="ua-permission-table"><thead><tr><th>Module</th>{actions.map(action => <th key={action}>{action}</th>)}</tr></thead><tbody>{modules.map(module => <tr key={module}><th>{module}</th>{actions.map(action => { const key = `${module}:${action}`; const checked = (permissionDraft[selectedRole] || []).includes(key) || (selectedRole === 'Owner' && (permissionDraft[selectedRole] || []).includes(action)); return <td key={action}><input aria-label={`${selectedRole}: ${module} ${action}`} type="checkbox" checked={checked} disabled={selectedRole === 'Owner'} onChange={() => togglePermission(module, action)} /></td>; })}</tr>)}</tbody></table></div><p className="ua-muted">Owner permissions are locked in this draft. Server-side authorization must enforce all permissions before these settings are production-ready.</p></Card>}
    {tab === 'Role Assignment' && <Card title="Assign roles to users" subtitle="Select a user to prepare a role assignment. Saving role changes requires a dedicated backend endpoint."><div className="ua-assignment"><label>User<select id="ua-assignment-user" defaultValue=""><option value="" disabled>Select a user</option>{users.map((u, i) => <option key={u.id || u.email || i} value={u.email}>{u.name} — {u.email}</option>)}</select></label><label>Role<select id="ua-assignment-role" defaultValue="Operations Manager">{roles.map(role => <option key={role}>{role}</option>)}</select></label><Button type="button" onClick={() => setNotice('Role assignment is a preview only. Connect a server-side assignment endpoint before saving changes.')}>Prepare assignment</Button></div><div className="ua-note"><strong>Access scope matters</strong><p>Internal roles should be platform-scoped only where required. Customer Admin and Customer User permissions must remain restricted to their own tenant. Products must independently enforce these rules on their backend.</p></div></Card>}
  </section>;
}
