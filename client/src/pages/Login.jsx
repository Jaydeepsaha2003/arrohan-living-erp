import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { Alert, Field, Input } from '../ui/kit.jsx';
import { IconArrowRight, IconLock, IconEye, IconEyeOff, IconCheckCircle, IconShield, IconLayers } from '../ui/Icons.jsx';

const FLOW = [
  'Enquiry', 'Factory Costing', 'Sales Planning', 'Quotation', 'Customer Approval',
  'Sales Order', 'Advance', 'Store Issue', 'Production', 'Quality Check',
  'Packaging', 'Dispatch', 'Invoice', 'Final Payment', 'Gate Pass',
];

const HIGHLIGHTS = [
  { icon: IconLayers, text: '14 gated stages, one department at a time' },
  { icon: IconShield, text: 'No skipping a step — enforced on the server' },
  { icon: IconCheckCircle, text: 'Every stock movement traced back to its order' },
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
  const [showPassword, setShowPassword] = useState(false);
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
          <div className="login-brand-row">
            <span className="brand-mark login-mark">A</span>
            <div>
              <div className="login-brand-name">Arrohan Living</div>
              <div className="brand-sub">Private Limited · Surat</div>
            </div>
          </div>

          <h1 className="login-headline">
            One connected workflow,
            <br />
            enquiry to gate pass.
          </h1>
          <p className="lede">
            Every department picks up where the last one signed off. The next step unlocks only when the
            previous one is approved, so nothing is skipped, stock stays accurate, and management sees
            the whole pipeline in real time.
          </p>

          <ul className="login-highlights">
            {HIGHLIGHTS.map(({ icon: Ico, text }) => (
              <li key={text}>
                <Ico size={15} />
                <span>{text}</span>
              </li>
            ))}
          </ul>

          <div className="login-flow-label">The full workflow</div>
          <div className="login-flow">
            {FLOW.map((s, i) => (
              <span key={s}>
                <em>{i + 1}</em>
                {s}
              </span>
            ))}
          </div>
        </div>

        <div className="login-foot">
          Enterprise Resource Planning · Manufacturing &amp; Interiors
        </div>
      </aside>

      <main className="login-panel">
        <form className="login-form" onSubmit={submit} noValidate>
          <div className="eyebrow">Sign in</div>
          <h2 className="login-welcome">Welcome back</h2>
          <p className="small muted login-sub">Use the login issued to your department.</p>

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
                className="login-input"
              />
            </Field>

            <Field label="Password">
              <div className="login-password-field">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="login-input"
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                </button>
              </div>
            </Field>

            <button type="submit" className="btn btn-primary btn-lg btn-block login-submit" disabled={busy}>
              {busy ? <span className="spinner" /> : <IconLock size={15} />}
              {busy ? 'Signing in…' : 'Sign in'}
              {!busy && <IconArrowRight size={15} />}
            </button>
          </div>

          <div className="login-help">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ paddingLeft: 0 }}
              onClick={() => setShowHelp((v) => !v)}
            >
              {showHelp ? 'Hide' : 'Show'} the department usernames
            </button>
            {showHelp && (
              <div className="login-help-body">
                <p className="tiny dim">
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
