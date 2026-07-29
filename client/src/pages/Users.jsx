import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import {
  Alert, Badge, Card, DataTable, Empty, Field, Input, Loading, Modal, PageHead,
  Select, Tabs, useToast, Check,
} from '../ui/kit.jsx';
import { fmtDateTime, relTime, initials } from '../format.js';
import { IconPlus, IconKey, IconUsers, IconHistory } from '../ui/Icons.jsx';

export default function Users() {
  const [tab, setTab] = useState('users');
  return (
    <div className="content-inner">
      <PageHead
        title="Users & access"
        desc="Every person gets their own login. The role decides which workflow steps they can complete — the rules are enforced on the server, not just hidden in the interface."
      />
      <Card flush>
        <div style={{ padding: '0 var(--s5)' }}>
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'users', label: 'Users' },
              { value: 'roles', label: 'Roles & permissions' },
              { value: 'audit', label: 'Activity log' },
            ]}
          />
        </div>
        <div style={{ padding: 'var(--s5)' }}>
          {tab === 'users' && <UserList />}
          {tab === 'roles' && <RoleMatrix />}
          {tab === 'audit' && <AuditLog />}
        </div>
      </Card>
    </div>
  );
}

function UserList() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);

  const load = () => api.get('/users').then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function toggleActive(u) {
    try {
      await api.patch(`/users/${u.id}`, { active: !u.active });
      toast.success(u.active ? `${u.username} deactivated` : `${u.username} reactivated`);
      load();
    } catch (e) {
      toast.error('Could not update the account', e.message);
    }
  }

  if (error) return <Alert tone="bad">{error}</Alert>;
  if (!data) return <Loading pad={40} />;

  return (
    <div className="stack">
      <div className="between wrap">
        <div className="row-tight">
          <Badge tone="neutral">{data.users.filter((u) => u.active).length} active</Badge>
          {data.users.some((u) => !u.active) && <Badge tone="bad">{data.users.filter((u) => !u.active).length} deactivated</Badge>}
          {data.users.some((u) => u.mustChangePassword) && (
            <Badge tone="warn">{data.users.filter((u) => u.mustChangePassword).length} still using the issued password</Badge>
          )}
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <IconPlus size={13} /> Add user
        </button>
      </div>

      {data.users.some((u) => u.mustChangePassword && u.active) && (
        <Alert tone="warn" title="Some accounts still have their starting password">
          Everyone was issued the same password. Ask each department to sign in and change it — the app prompts them
          automatically on first sign-in.
        </Alert>
      )}

      <DataTable
        rows={data.users}
        searchable={false}
        pageSize={0}
        columns={[
          {
            key: 'fullName',
            label: 'User',
            render: (u) => (
              <div className="row-tight">
                <span className="avatar" style={{ opacity: u.active ? 1 : 0.4 }}>{initials(u.fullName)}</span>
                <span>
                  <span style={{ display: 'block', fontWeight: 600 }}>
                    {u.fullName}
                    {u.id === me.id && <span className="tiny dim"> (you)</span>}
                  </span>
                  <span className="mono tiny dim">{u.username}</span>
                </span>
              </div>
            ),
          },
          { key: 'roleLabel', label: 'Role', render: (u) => <Badge tone={u.role === 'admin' ? 'brand' : u.role === 'management' ? 'info' : 'neutral'}>{u.roleLabel}</Badge> },
          { key: 'email', label: 'Email' },
          { key: 'phone', label: 'Phone' },
          { key: 'lastLoginAt', label: 'Last signed in', render: (u) => (u.lastLoginAt ? <span title={fmtDateTime(u.lastLoginAt)}>{relTime(u.lastLoginAt)}</span> : <span className="dim">Never</span>) },
          { key: 'activeSessions', label: 'Sessions', type: 'num' },
          {
            key: 'active',
            label: 'Status',
            render: (u) => (
              <div className="row-tight">
                {u.active ? <Badge tone="ok" dot>Active</Badge> : <Badge tone="bad">Deactivated</Badge>}
                {u.mustChangePassword && u.active && <Badge tone="warn">Default password</Badge>}
              </div>
            ),
          },
          {
            key: '_act',
            label: '',
            sortable: false,
            render: (u) => (
              <div className="row-tight" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(u)}>Edit</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setResetting(u)}>Reset password</button>
                {u.id !== me.id && (
                  <button type="button" className={`btn btn-sm ${u.active ? 'btn-ghost' : 'btn-ok'}`} onClick={() => toggleActive(u)}>
                    {u.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                )}
              </div>
            ),
          },
        ]}
        empty={<Empty icon={IconUsers} title="No users">Add a login for each person who needs access.</Empty>}
      />

      <UserModal
        open={adding || !!editing}
        user={editing}
        roles={data.roles}
        onClose={() => { setAdding(false); setEditing(null); }}
        onSaved={() => { setAdding(false); setEditing(null); load(); }}
      />

      <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} onSaved={() => { setResetting(null); load(); }} />
    </div>
  );
}

function UserModal({ open, user, roles, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!user;
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(
      user
        ? { full_name: user.fullName, role: user.role, email: user.email || '', phone: user.phone || '' }
        : { username: '', full_name: '', role: 'sales', password: '', email: '', phone: '', must_change_pw: true }
    );
  }, [open, user]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setBusy(true);
    try {
      if (isEdit) await api.patch(`/users/${user.id}`, form);
      else await api.post('/users', form);
      toast.success(isEdit ? 'User updated' : `${form.username} can now sign in`);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const roleKeys = Object.keys(roles || {});

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${user.fullName}` : 'Add a user'}
      sub={isEdit ? `Username ${user.username} cannot be changed.` : 'Give them a starting password — they will be asked to change it on first sign-in.'}
      foot={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy && <span className="spinner" />}
            {isEdit ? 'Save changes' : 'Create user'}
          </button>
        </>
      }
    >
      <div className="stack">
        {error && <Alert tone="bad">{error}</Alert>}
        <div className="grid grid-2">
          {!isEdit && (
            <Field label="Username" required hint="Letters, numbers, dot, dash or underscore.">
              <Input value={form.username || ''} onChange={set('username')} autoFocus autoCapitalize="none" spellCheck="false" />
            </Field>
          )}
          <Field label="Full name" required span={isEdit ? 2 : 1}>
            <Input value={form.full_name || ''} onChange={set('full_name')} autoFocus={isEdit} />
          </Field>
          <Field label="Role" required span={2} hint={roles?.[form.role]?.desc}>
            <Select
              value={form.role || 'sales'}
              onChange={set('role')}
              options={roleKeys.map((k) => ({ value: k, label: roles[k].label }))}
            />
          </Field>
          {!isEdit && (
            <Field label="Starting password" required hint="At least 6 characters." span={2}>
              <Input type="text" value={form.password || ''} onChange={set('password')} />
            </Field>
          )}
          <Field label="Email">
            <Input type="email" value={form.email || ''} onChange={set('email')} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone || ''} onChange={set('phone')} inputMode="tel" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose, onSaved }) {
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setPw('');
    setError('');
  }, [user]);

  async function save() {
    if (pw.length < 6) return setError('Password must be at least 6 characters.');
    setBusy(true);
    try {
      await api.post(`/users/${user.id}/reset-password`, { password: pw });
      toast.success(`Password reset for ${user.username}`, 'They have been signed out everywhere and will be asked to choose a new one.');
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;
  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title={`Reset password — ${user.fullName}`}
      sub="They will be signed out of every device and asked to choose their own password."
      foot={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy && <span className="spinner" />}
            Reset password
          </button>
        </>
      }
    >
      <div className="stack">
        {error && <Alert tone="bad">{error}</Alert>}
        <Field label="New starting password" required hint="Tell them this in person, not over chat.">
          <Input type="text" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        </Field>
        <button type="button" className="btn btn-sm" onClick={() => setPw(`arrohan@${Math.floor(1000 + Math.random() * 9000)}`)}>
          <IconKey size={13} /> Suggest a password
        </button>
      </div>
    </Modal>
  );
}

function RoleMatrix() {
  const { meta } = useAuth();
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    api.get('/settings').then(setSettings).catch(() => {});
  }, []);

  if (!settings) return <Loading pad={40} />;

  const roles = Object.entries(settings.roles);

  return (
    <div className="stack">
      <Alert tone="info" title="How access works">
        A role owns specific workflow steps. Nobody — not even by calling the API directly — can complete a step that
        belongs to another department, and no step can be completed out of sequence. Administrators can do everything and
        are the only role that can reopen a completed stage. Management is read-only everywhere.
      </Alert>

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ minWidth: 190 }}>Workflow step</th>
              <th>Department</th>
              {roles.map(([k, r]) => (
                <th key={k} className="center" style={{ writingMode: 'vertical-rl', height: 108, padding: '8px 4px' }}>
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {settings.workflow.map((s) => (
              <tr key={s.key}>
                <td className="strong">{s.step}. {s.label}</td>
                <td className="small muted">{s.dept}</td>
                {roles.map(([k, r]) => {
                  const allowed = k === 'admin' || s.roles.includes(k);
                  return (
                    <td key={k} className="center">
                      {allowed ? (
                        <span style={{ color: 'var(--ok-fg)', fontWeight: 700 }}>✓</span>
                      ) : k === 'management' ? (
                        <span className="dim tiny">view</span>
                      ) : (
                        <span className="dim">·</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-2">
        {roles.map(([k, r]) => (
          <div key={k} className="stat" style={{ gap: 4 }}>
            <span className="row-tight">
              <Badge tone={k === 'admin' ? 'brand' : k === 'management' ? 'info' : 'neutral'}>{r.label}</Badge>
              <span className="mono tiny dim">{k}</span>
            </span>
            <span className="small muted" style={{ lineHeight: 1.5 }}>{r.desc}</span>
            <span className="tiny dim">
              Owns:{' '}
              {k === 'admin'
                ? 'every step'
                : k === 'management'
                  ? 'nothing — read-only'
                  : settings.workflow.filter((s) => s.roles.includes(k)).map((s) => s.label).join(', ') || 'no workflow steps'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditLog() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/users/audit?limit=400').then((d) => setEntries(d.entries)).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert tone="bad">{error}</Alert>;
  if (!entries) return <Loading pad={40} />;

  return (
    <DataTable
      rows={entries}
      exportName="activity-log"
      searchPlaceholder="Search action, user, entity…"
      pageSize={50}
      compact
      columns={[
        { key: 'at', label: 'When', type: 'datetime' },
        { key: 'username', label: 'User', render: (r) => <span className="mono small">{r.username || '—'}</span> },
        { key: 'action', label: 'Action', render: (r) => <span className="mono small">{r.action}</span> },
        { key: 'entity', label: 'Entity' },
        { key: 'entity_id', label: 'ID', render: (r) => <span className="mono small">{r.entity_id || '—'}</span> },
        { key: 'detail', label: 'Detail', render: (r) => <span className="small muted truncate" style={{ maxWidth: 380, display: 'inline-block' }}>{r.detail || '—'}</span> },
      ]}
      empty={<Empty icon={IconHistory} title="Nothing logged yet">Sign-ins, stage completions and record changes appear here.</Empty>}
    />
  );
}
