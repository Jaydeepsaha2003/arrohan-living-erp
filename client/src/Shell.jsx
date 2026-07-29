import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { api } from './api.js';
import { Badge, Modal, Field, Input, Alert, ThemeToggle, useToast } from './ui/kit.jsx';
import { initials } from './format.js';
import {
  IconDashboard, IconInbox, IconOrders, IconChart, IconWarehouse, IconCart,
  IconUsers, IconSettings, IconLogout, IconMenu, IconPanelLeft, IconLayers,
  IconKey, IconRefresh, IconX,
} from './ui/Icons.jsx';

const NAV = [
  {
    group: 'Workflow',
    items: [
      { to: '/', label: 'Dashboard', icon: IconDashboard, end: true },
      { to: '/queue', label: 'My work queue', icon: IconLayers, badge: 'queue' },
      { to: '/enquiries', label: 'Enquiries', icon: IconInbox, cap: 'enquiry.create', alsoFor: ['admin', 'management'] },
      { to: '/orders', label: 'Orders', icon: IconOrders },
    ],
  },
  {
    group: 'Inventory',
    items: [
      { to: '/inventory', label: 'Stock & materials', icon: IconWarehouse },
      { to: '/purchase', label: 'Purchase orders', icon: IconCart },
    ],
  },
  {
    group: 'Records',
    items: [
      { to: '/masters', label: 'Masters', icon: IconUsers },
      { to: '/reports', label: 'Reports', icon: IconChart },
    ],
  },
  {
    group: 'Administration',
    adminOnly: true,
    items: [
      { to: '/users', label: 'Users & access', icon: IconKey },
      { to: '/settings', label: 'Settings', icon: IconSettings },
    ],
  },
];

export default function Shell({ children, title, crumb }) {
  const { user, logout, isAdmin, can, readOnly } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('arrohan-nav') === 'collapsed');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [queueCount, setQueueCount] = useState(null);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    localStorage.setItem('arrohan-nav', collapsed ? 'collapsed' : 'expanded');
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Keep the sidebar badge current without hammering the server.
  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const d = await api.get('/dashboard');
        if (alive) setQueueCount(d.myQueue.length);
      } catch {
        /* the page itself will surface any error */
      }
    }
    tick();
    const id = setInterval(tick, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [location.pathname]);

  useEffect(() => {
    if (user?.mustChangePassword) setShowPw(true);
  }, [user]);

  const visibleGroups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      if (g.adminOnly && !isAdmin) return false;
      if (!i.cap) return true;
      if (i.alsoFor && i.alsoFor.includes(user.role)) return true;
      return can(i.cap);
    }),
  })).filter((g) => (g.adminOnly ? isAdmin : true) && g.items.length);

  return (
    <div className="shell">
      <div className={`scrim no-print ${mobileOpen ? 'show' : ''}`} onClick={() => setMobileOpen(false)} />

      <aside className={`sidebar no-print ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'open' : ''}`}>
        <Link to="/" className="brand" style={{ textDecoration: 'none' }}>
          <span className="brand-mark">A</span>
          <span className="brand-text">
            <span className="brand-name">Arrohan Living</span>
          </span>
        </Link>

        <nav className="nav">
          {visibleGroups.map((g) => (
            <div className="nav-group" key={g.group}>
              <div className="nav-group-label">{g.group}</div>
              {g.items.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  end={i.end}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  title={collapsed ? i.label : undefined}
                >
                  <i.icon size={16} />
                  <span className="nav-label">{i.label}</span>
                  {i.badge === 'queue' && queueCount ? <span className="nav-count">{queueCount}</span> : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="side-foot">
          <button type="button" className="side-user" onClick={() => setShowPw(true)} title="Account settings">
            <span className="avatar">{initials(user.fullName)}</span>
            <span className="side-foot-text grow" style={{ minWidth: 0 }}>
              <span className="truncate" style={{ display: 'block', fontSize: 'var(--fs-base)', fontWeight: 600, color: '#fff' }}>
                {user.fullName}
              </span>
              <span className="truncate" style={{ display: 'block', fontSize: 'var(--fs-xs)', color: '#7d716a' }}>
                {user.roleLabel}
                {readOnly ? ' · read only' : ''}
              </span>
            </span>
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar no-print">
          <button
            type="button"
            className="btn btn-ghost btn-icon side-toggle"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <IconX size={17} /> : <IconMenu size={17} />}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{ display: window.innerWidth <= 900 ? 'none' : undefined }}
          >
            <IconPanelLeft size={16} />
          </button>

          <div className="grow" style={{ minWidth: 0 }}>
            {crumb && <div className="crumb truncate">{crumb}</div>}
            <h1 className="truncate">{title}</h1>
          </div>

          {readOnly && <Badge tone="info">Read only</Badge>}
          <ThemeToggle />
          <button type="button" className="btn btn-ghost btn-icon" onClick={() => window.location.reload()} title="Reload">
            <IconRefresh size={15} />
          </button>
          <button type="button" className="btn btn-ghost btn-icon" onClick={logout} title="Sign out">
            <IconLogout size={15} />
          </button>
        </header>

        <div className="content">{children}</div>
      </div>

      <PasswordModal open={showPw} onClose={() => setShowPw(false)} forced={!!user?.mustChangePassword} />
    </div>
  );
}

function PasswordModal({ open, onClose, forced }) {
  const { user, refresh, logout } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (next.length < 6) return setError('The new password must be at least 6 characters.');
    if (next !== confirm) return setError('The two new passwords do not match.');
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      toast.success('Password changed', 'Other devices signed in as you have been signed out.');
      setCurrent('');
      setNext('');
      setConfirm('');
      await refresh();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={forced ? undefined : onClose}
      title={forced ? 'Choose your own password' : 'Account & password'}
      sub={
        forced
          ? 'This account is still using the password it was issued. Set a private one before you continue.'
          : `Signed in as ${user?.fullName} · ${user?.roleLabel}`
      }
      closeOnScrim={!forced}
      foot={
        <>
          {forced ? (
            <button type="button" className="btn" onClick={logout}>
              Sign out instead
            </button>
          ) : (
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy && <span className="spinner" />}
            Change password
          </button>
        </>
      }
    >
      <form className="stack" onSubmit={submit}>
        {error && <Alert tone="bad">{error}</Alert>}
        {forced && (
          <Alert tone="warn" title="Shared password in use">
            Everyone was given the same starting password. Until you change it, anyone who knows it can act as{' '}
            {user?.roleLabel}.
          </Alert>
        )}
        <Field label="Current password" required>
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="New password" required hint="At least 6 characters.">
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Repeat the new password" required>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </Field>
      </form>
    </Modal>
  );
}
