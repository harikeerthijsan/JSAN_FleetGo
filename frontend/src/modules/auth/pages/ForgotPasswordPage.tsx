import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, FormInput } from '@/components';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { authService } from '@/services/authService';
import { AuthShell } from '../components/AuthShell';

export function ForgotPasswordPage() {
  useDocumentTitle('Forgot Password');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [devToken, setDevToken] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authService.forgotPassword(email);
      setDevToken(res.devToken);
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll issue reset instructions."
      footer={<Link to="/login">Back to sign in</Link>}
    >
      {submitted ? (
        <div className="fg-auth__form">
          <div className="fg-auth__notice">
            If an account exists for <strong>{email}</strong>, reset
            instructions have been issued.
          </div>
          {devToken ? (
            <div className="fg-auth__hint">
              <strong>Development:</strong> email delivery is not configured in
              this phase. Use this reset token:
              <br />
              <code>{devToken}</code>
              <br />
              <Link to={`/reset-password?token=${devToken}`}>
                Continue to reset →
              </Link>
            </div>
          ) : null}
        </div>
      ) : (
        <form className="fg-auth__form" onSubmit={onSubmit}>
          <FormInput
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@organization.com"
            required
          />
          <Button type="submit" loading={loading} fullWidth>
            Send reset instructions
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
