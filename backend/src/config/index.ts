import { env } from './env';

/**
 * Central, typed application configuration derived from validated environment
 * variables. Import `config` anywhere instead of reading `process.env`
 * directly — this keeps configuration access consistent and testable.
 */
export const config = {
  app: {
    name: env.APP_NAME,
    env: env.NODE_ENV,
    port: env.PORT,
    apiPrefix: env.API_PREFIX,
    isProduction: env.NODE_ENV === 'production',
    isDevelopment: env.NODE_ENV === 'development',
  },
  database: {
    url: env.DATABASE_URL,
  },
  cors: {
    origins: env.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },
  logging: {
    level: env.LOG_LEVEL,
  },
  auth: {
    accessSecret: env.JWT_ACCESS_SECRET,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    refreshSecret: env.JWT_REFRESH_SECRET,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
    bcryptRounds: env.BCRYPT_ROUNDS,
    passwordResetTtlMin: env.PASSWORD_RESET_TTL_MIN,
    rateLimit: {
      windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
      max: env.AUTH_RATE_LIMIT_MAX,
    },
    cookie: {
      name: env.REFRESH_COOKIE_NAME,
      // Secure flag: explicit override wins, otherwise on in production.
      secure:
        env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
      sameSite: env.COOKIE_SAMESITE,
    },
  },
  storage: {
    driver: env.STORAGE_DRIVER,
    localPath: env.STORAGE_LOCAL_PATH,
    bucket: env.STORAGE_BUCKET,
    region: env.STORAGE_REGION,
    accessKey: env.STORAGE_ACCESS_KEY,
    secretKey: env.STORAGE_SECRET_KEY,
    maxFileSize: env.STORAGE_MAX_FILE_SIZE,
  },
  websocket: {
    enabled: env.WS_ENABLED,
    path: env.WS_PATH,
  },
} as const;

export type AppConfig = typeof config;
