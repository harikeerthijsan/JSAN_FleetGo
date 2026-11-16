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

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required (see backend/.env.example)'),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'http', 'debug'])
    .default('debug'),

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
    .enum(['true', 'false'])
    .optional()
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

  // --- WebSocket — readiness only -----------------------------------------
  WS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  WS_PATH: z.string().default('/ws'),
});

const parsed = envSchema.safeParse(process.env);

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
