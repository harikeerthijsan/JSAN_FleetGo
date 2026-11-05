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
      title="Welcome back."
      subtitle="Sign in to your workspace and keep things moving."
      footer={<Link to="/forgot-password">Forgot your password?</Link>}
    >
      <form className="fg-auth__form" onSubmit={onSubmit}>
        {error ? <div className="fg-auth__error" role="alert">{error}</div> : null}
        <FormInput
          label="Work email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@organization.com"
          required
        />
        <FormInput
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          required
        />
        <Button type="submit" loading={loading} fullWidth>
          Sign in to workspace
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

