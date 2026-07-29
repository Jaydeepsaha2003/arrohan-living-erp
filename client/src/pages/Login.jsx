import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { Alert, Field, Input } from '../ui/kit.jsx';
import { IconArrowRight, IconLock } from '../ui/Icons.jsx';

const FLOW = [
  'Enquiry', 'Factory Costing', 'Sales Planning', 'Quotation', 'Customer Approval',
  'Sales Order', 'Advance', 'Store Issue', 'Production', 'Quality Check',
  'Packaging', 'Dispatch', 'Invoice', 'Final Payment', 'Gate Pass',
];

const ACCOUNTS = [
  ['admin', 'Administrator — full access'],
  ['sales', 'Sales'],
  ['costing', 'Factory / Costing'],
  ['store', 'Store'],
  ['production', 'Production'],
  ['qc', 'Quality Control'],
  ['packing', 'Packaging'],
  ['dispatch', 'Dispatch'],
  ['accounts', 'Accounts'],
  ['director', 'Management — read only'],
];

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  function fill(name) {
    setUsername(name);
    setError('');
  }

  return (
    <div className="login-page">
      <aside className="login-art">
        <div>
          <div className="row" style={{ marginBottom: 40 }}>
            <span className="brand-mark" style={{ width: 36, height: 36, fontSize: 20 }}>A</span>
            <div>
              <div className="brand-name" style={{ fontSize: 19 }}>Arrohan Living</div>
              <div className="brand-sub">Private Limited · Surat</div>
            </div>
          </div>
          <h1>
            One connected workflow,
            <br />
            enquiry to gate pass.
          </h1>
          <p className="lede">
            Every department picks up where the last one signed off. The next step unlocks only when the
            previous one is approved, so nothing is skipped, stock stays accurate, and management sees
            the whole pipeline in real time.
          </p>
          <div className="login-flow">
            {FLOW.map((s, i) => (
              <span key={s}>
                {i + 1}. {s}
              </span>
            ))}
          </div>
        </div>
        <div className="tiny" style={{ color: '#7d716a' }}>
          Enterprise Resource Planning · Manufacturing &amp; Interiors
        </div>
      </aside>

      <main className="login-panel">
        <form className="login-form" onSubmit={submit}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Sign in</div>
          <h2 style={{ fontSize: 'var(--fs-xl)', fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 4 }}>
            Welcome back
          </h2>
          <p className="small muted" style={{ marginBottom: 24 }}>
            Use the login issued to your department.
          </p>

          <div className="stack">
            {error && <Alert tone="bad">{error}</Alert>}

            <Field label="Username">
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck="false"
                autoFocus
                placeholder="e.g. sales"
              />
            </Field>

            <Field label="Password">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </Field>

            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy ? <span className="spinner" /> : <IconLock size={15} />}
              {busy ? 'Signing in…' : 'Sign in'}
              {!busy && <IconArrowRight size={15} />}
            </button>
          </div>

          <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--line)' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ paddingLeft: 0 }}
              onClick={() => setShowHelp((v) => !v)}
            >
              {showHelp ? 'Hide' : 'Show'} the department usernames
            </button>
            {showHelp && (
              <div style={{ marginTop: 10 }}>
                <p className="tiny dim" style={{ marginBottom: 8 }}>
                  Click a row to fill in the username. Your administrator issues the password — on a new
                  installation they are printed once when the server first starts, and saved to{' '}
                  <span className="mono">data/FIRST-RUN-LOGINS.txt</span>.
                </p>
                <table className="cred-table">
                  <tbody>
                    {ACCOUNTS.map(([name, role]) => (
                      <tr
                        key={name}
                        onClick={() => fill(name)}
                        style={{ cursor: 'pointer' }}
                        title={`Fill in the username ${name}`}
                      >
                        <td>{name}</td>
                        <td>{role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
