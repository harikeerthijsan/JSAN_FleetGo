import dotenv from 'dotenv';
import { z } from 'zod';

// Load variables from `.env` into process.env (no-op if the file is absent).
dotenv.config();

/**
 * Schema describing every environment variable the backend understands.
 * Validation happens once, at startup, so the rest of the application can rely
 * on a fully-typed, already-validated configuration object.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  APP_NAME: z.string().default('FleetGo'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().default('/api/v1'),
  APP_PUBLIC_URL: z.string().optional(),
  RAILWAY_PUBLIC_DOMAIN: z.string().optional(),
  TRUST_PROXY_HOPS: z.coerce
    .number()
    .int()
    .min(0)
    .max(5)
    .default(process.env.NODE_ENV === 'production' ? 1 : 0),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required (see backend/.env.example)'),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'http', 'debug'])
    .default(process.env.NODE_ENV === 'production' ? 'info' : 'debug'),

  // --- Authentication (Phase 2) -------------------------------------------
  // Access tokens are short-lived JWTs; refresh tokens are opaque random
  // strings stored (hashed) in the database and delivered via httpOnly cookie.
  JWT_ACCESS_SECRET: z
    .string()
    .min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Refresh-token cookie
  REFRESH_COOKIE_NAME: z.string().default('fg_refresh'),
  // Force the Secure cookie flag (otherwise derived from NODE_ENV=production)
  COOKIE_SECURE: z
    .preprocess(
      (v) => (v === '' ? undefined : v),
      z.enum(['true', 'false']).optional(),
    )
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  // SameSite policy for the refresh cookie
  COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('strict'),

  // Password hashing cost (bcrypt rounds)
  BCRYPT_ROUNDS: z.coerce.number().int().min(8).max(15).default(12),

  // Login rate limiting / brute-force protection
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

  // Password reset token lifetime (minutes)
  PASSWORD_RESET_TTL_MIN: z.coerce.number().int().positive().default(30),

  // --- File storage — readiness only --------------------------------------
  STORAGE_DRIVER: z.enum(['local', 's3', 'gcs']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./storage'),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_REGION: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  STORAGE_MAX_FILE_SIZE: z.coerce.number().int().positive().default(10_485_760),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().optional(),

  // --- WebSocket — readiness only -----------------------------------------
  WS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  WS_PATH: z.string().default('/ws'),
});

export const configurationSchema = envSchema.superRefine((value, ctx) => {
  const issue = (path: string, message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  if (value.APP_PUBLIC_URL) {
    try {
      const url = new URL(value.APP_PUBLIC_URL);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      )
        issue(
          'APP_PUBLIC_URL',
          'Must be an HTTP(S) origin without a path or credentials',
        );
    } catch {
      issue('APP_PUBLIC_URL', 'Must be a valid HTTP(S) origin');
    }
  }
  if (Boolean(value.SMTP_USER) !== Boolean(value.SMTP_PASSWORD))
    issue(
      'SMTP_USER',
      'SMTP_USER and SMTP_PASSWORD must be configured together',
    );
  if (value.SMTP_HOST && !value.MAIL_FROM)
    issue('MAIL_FROM', 'Required when SMTP is configured');
  if (value.COOKIE_SAMESITE === 'none' && value.COOKIE_SECURE === false)
    issue('COOKIE_SECURE', 'SameSite=none requires secure cookies');
  if (value.NODE_ENV !== 'production') return;
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    if (
      value[key].length < 32 ||
      /change.?me|replace.?me|development|your.secret/i.test(value[key])
    )
      issue(
        key,
        'Production secrets must be independently generated, at least 32 characters, without placeholder values',
      );
  }
  if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET)
    issue('JWT_REFRESH_SECRET', 'Access and refresh secrets must differ');
  if (value.COOKIE_SECURE === false)
    issue('COOKIE_SECURE', 'Secure cookies are required in production');
  const origins = (
    value.APP_PUBLIC_URL ||
    (value.RAILWAY_PUBLIC_DOMAIN
      ? 'https://' + value.RAILWAY_PUBLIC_DOMAIN
      : value.CORS_ORIGINS)
  ).split(',');
  const explicitCors = process.env.CORS_ORIGINS
    ? value.CORS_ORIGINS.split(',')
    : [];
  for (const origin of [...origins, ...explicitCors]) {
    try {
      const url = new URL(origin.trim());
      if (
        url.protocol !== 'https:' ||
        url.origin !== origin.trim() ||
        url.username ||
        url.password ||
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      )
        throw Error();
    } catch {
      issue(
        'APP_PUBLIC_URL',
        'Production requires exact public HTTPS origins via APP_PUBLIC_URL / RAILWAY_PUBLIC_DOMAIN / CORS_ORIGINS',
      );
    }
  }
  if (value.STORAGE_DRIVER !== 'local')
    issue(
      'STORAGE_DRIVER',
      'Only local storage is implemented; attach a persistent volume instead of selecting an unsupported driver',
    );
  if (!/^(\/|[A-Za-z]:[\\/])/.test(value.STORAGE_LOCAL_PATH))
    issue(
      'STORAGE_LOCAL_PATH',
      'Production requires an absolute path on persistent storage',
    );
});

const parsed = configurationSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast with a readable message rather than crashing later in some
  // unrelated place because a variable was missing or malformed.
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`\nInvalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
