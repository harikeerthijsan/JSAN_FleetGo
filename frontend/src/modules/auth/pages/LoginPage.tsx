import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, FormInput } from '@/components';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { NormalizedApiError } from '@/services/apiClient';
import { settingsApi } from '@/services/settingsService';
import { AuthShell } from '../components/AuthShell';

export function LoginPage() {
  useDocumentTitle('Sign In');
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const explicitFrom = (location.state as { from?: string } | null)?.from;
  const from = explicitFrom ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      // Honor an explicit redirect first; otherwise fall back to the user's
      // preferred landing page from Settings, then the dashboard.
      let target = from;
      if (!explicitFrom) {
        try {
          const prefs = await settingsApi.getPreferences();
          if (prefs.defaultLanding && prefs.defaultLanding.startsWith('/')) target = prefs.defaultLanding;
        } catch {
          /* preferences are best-effort; ignore and use the default */
        }
      }
      navigate(target, { replace: true });
    } catch (err) {
      setError((err as NormalizedApiError).message ?? 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Sign in to FleetGo"
      subtitle="Access fleet operations, vehicle inventory, movement and claims."
      footer={<Link to="/forgot-password">Forgot your password?</Link>}
    >
      <form className="fg-auth__form" onSubmit={onSubmit}>
        {error ? <div className="fg-auth__error" role="alert">{error}</div> : null}
        <div className="fg-auth__input-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></svg>
        <FormInput
          label="Work email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@organization.com"
          required
        />
        </div>
        <div className="fg-auth__input-wrap fg-auth__input-wrap--password">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3" /></svg>
        <FormInput
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          required
        />
        <button type="button" className="fg-auth__password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{showPassword ? <path d="m3 3 18 18" /> : null}</svg>
        </button>
        </div>
        <Button type="submit" loading={loading} fullWidth rightIcon={<span aria-hidden="true">→</span>}>
          Continue to dashboard
        </Button>
      </form>

      {import.meta.env.DEV ? (
        <details className="fg-auth__hint"><summary>Development sign-in details</summary>
          <strong>Dev accounts</strong> (password <code>FleetGo123</code>):
          <br />
          superadmin@fleetgo.dev · jsanadmin@fleetgo.dev · opsmanager@fleetgo.dev
          · ctsuser@fleetgo.dev · vendor1@fleetgo.dev · driver@fleetgo.dev
        </details>
      ) : null}
    </AuthShell>
  );
}

