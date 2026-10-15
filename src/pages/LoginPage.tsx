import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from '../components/Alert';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { signIn, completeSetup, setupRequired, session, isAdmin, loading, refreshSetupStatus } =
    useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-check whether setup is still open, in case it was completed elsewhere.
  useEffect(() => {
    void refreshSetupStatus();
  }, [refreshSetupStatus]);

  useEffect(() => {
    if (!loading && session && isAdmin) navigate('/dashboard', { replace: true });
  }, [loading, session, isAdmin, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (setupRequired) {
        if (!name.trim()) throw new Error('Your name is required');
        if (password.length < 8) throw new Error('Password must be at least 8 characters');
        if (password !== confirm) throw new Error('Passwords do not match');
        await completeSetup({ email: email.trim(), password, name: name.trim() });
      } else {
        await signIn(email, password);
      }
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-brand">
          <span className="brand-mark">R</span>
          <div>
            <h1>RentHub Admin</h1>
            <p>{setupRequired ? 'Create the first administrator account' : 'Sign in to continue'}</p>
          </div>
        </div>

        {setupRequired && (
          <Alert kind="info">
            No administrator exists yet. This one-time step creates the first admin account; it closes
            permanently afterwards.
          </Alert>
        )}

        {error && <Alert kind="error" onDismiss={() => setError(null)}>{error}</Alert>}

        {setupRequired && (
          <label className="field">
            <span>Full name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada Lovelace"
              autoComplete="name"
              required
            />
          </label>
        )}

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
            autoComplete="username"
            required
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={setupRequired ? 'At least 8 characters' : '••••••••'}
            autoComplete={setupRequired ? 'new-password' : 'current-password'}
            required
          />
        </label>

        {setupRequired && (
          <label className="field">
            <span>Confirm password</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat the password"
              autoComplete="new-password"
              required
            />
          </label>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Please wait…' : setupRequired ? 'Create admin account' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
