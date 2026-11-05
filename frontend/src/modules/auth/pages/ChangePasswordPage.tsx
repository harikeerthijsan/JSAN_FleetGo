import { useState, type FormEvent } from 'react';
import { Button, Card, FormInput, PageTitle, StatusBadge } from '@/components';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { NormalizedApiError } from '@/services/apiClient';
import { authService } from '@/services/authService';

export function ChangePasswordPage() {
  useDocumentTitle('Change Password');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (next !== confirm) {
      setError('New passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await authService.changePassword(current, next);
      setSuccess(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError((err as NormalizedApiError).message ?? 'Could not change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageTitle
        title="Change Password"
        description="Update your account password. Other active sessions will be signed out."
        breadcrumbs={[{ label: 'FleetGo', to: '/dashboard' }, { label: 'Change Password' }]}
      />
      <div style={{ maxWidth: 480 }}>
        <Card>
          <form className="fg-auth__form" onSubmit={onSubmit}>
            {error ? <div className="fg-auth__error">{error}</div> : null}
            {success ? (
              <StatusBadge tone="success">Password updated</StatusBadge>
            ) : null}
            <FormInput
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
            <FormInput
              label="New password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              hint="At least 8 characters with upper, lower and a number."
              required
            />
            <FormInput
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            <Button type="submit" loading={loading}>
              Update password
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
