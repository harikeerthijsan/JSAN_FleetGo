import nodemailer from 'nodemailer';
import { config } from '../config';

export const mailConfigured = () =>
  Boolean(config.mail.host && config.mail.from && config.app.publicUrl);

/** Server-only SMTP; tokens appear only in the addressed email, never in logs. */
export async function sendPasswordReset(
  email: string,
  token: string,
): Promise<void> {
  if (!mailConfigured())
    throw new Error('Password reset email is not configured');
  const reset = new URL('/reset-password', config.app.publicUrl);
  reset.searchParams.set('token', token);
  const transport = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    requireTLS: !config.mail.secure,
    auth: config.mail.user
      ? { user: config.mail.user, pass: config.mail.password }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
    logger: false,
    debug: false,
  });
  try {
    await transport.sendMail({
      from: config.mail.from,
      to: email,
      subject: 'Reset your FleetGo password',
      text: `A password reset was requested for your FleetGo account.\n\n${reset.href}\n\nThis link expires in ${config.auth.passwordResetTtlMin} minutes. If you did not request it, ignore this email.`,
    });
  } finally {
    transport.close();
  }
}
