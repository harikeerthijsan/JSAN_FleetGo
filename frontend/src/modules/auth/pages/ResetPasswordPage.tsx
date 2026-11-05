import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, FormInput } from '@/components';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { NormalizedApiError } from '@/services/apiClient';
import { authService } from '@/services/authService';
import { AuthShell } from '../components/AuthShell';

export function ResetPasswordPage() {
  useDocumentTitle('Reset Password');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState(params.get('token') ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await authService.resetPassword(token, newPassword);
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 1800);
    } catch (err) {
      setError((err as NormalizedApiError).message ?? 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose a strong password for your account."
      footer={<Link to="/login">Back to sign in</Link>}
    >
      {done ? (
        <div className="fg-auth__notice">
          Password reset successfully. Redirecting to sign in…
        </div>
      ) : (
        <form className="fg-auth__form" onSubmit={onSubmit}>
          {error ? <div className="fg-auth__error">{error}</div> : null}
          <FormInput
            label="Reset token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
          />
          <FormInput
            label="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            hint="At least 8 characters with upper, lower and a number."
            required
          />
          <FormInput
            label="Confirm new password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          <Button type="submit" loading={loading} fullWidth>
            Reset password
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
