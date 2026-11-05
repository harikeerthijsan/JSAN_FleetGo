import { createHash, randomBytes } from 'node:crypto';

/**
 * Opaque secret tokens for refresh sessions and password resets.
 *
 * The raw token is returned to the client (refresh cookie / reset link) but
 * only its SHA-256 hash is persisted, so a database leak cannot be used to
 * impersonate a session or reset a password.
 */
export function generateOpaqueToken(bytes = 48): string {
  return randomBytes(bytes).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Compute an expiry Date `ms` milliseconds from now. */
export function expiresInMs(ms: number): Date {
  return new Date(Date.now() + ms);
}

/**
 * Parse a duration string like "7d", "15m", "30s", "12h" into milliseconds.
 * Used to align the refresh-cookie Max-Age with JWT_REFRESH_EXPIRES_IN.
 */
export function durationToMs(duration: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(duration.trim());
  if (!match) {
    const asNumber = Number(duration);
    if (!Number.isNaN(asNumber)) return asNumber;
    throw new Error(`Invalid duration string: ${duration}`);
  }
  const value = Number(match[1]);
  const unit = match[2];
  const unitMs: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return value * unitMs[unit];
}
