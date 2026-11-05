import bcrypt from 'bcryptjs';
import { config } from '../config';

/**
 * Password hashing using bcrypt (via the pure-JS `bcryptjs` implementation, so
 * no native build step is required). Plaintext passwords are never stored or
 * logged.
 */
export const password = {
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, config.auth.bcryptRounds);
  },

  verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  },
};

/**
 * Lightweight password-strength policy used by validators. Keeping it here lets
 * both the Zod schemas and any programmatic checks share one definition.
 */
export const PASSWORD_MIN_LENGTH = 8;

export function isStrongPassword(value: string): boolean {
  return (
    value.length >= PASSWORD_MIN_LENGTH &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /[0-9]/.test(value)
  );
}
