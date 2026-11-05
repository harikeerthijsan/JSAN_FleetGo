import { config } from '../config';

/**
 * Minimal, dependency-free centralized logger.
 *
 * Levels are ordered by severity. Messages below the configured LOG_LEVEL are
 * suppressed. Output is structured (timestamp + level + message + optional
 * metadata) so it can later be swapped for a transport-based logger (e.g.
 * Winston/Pino) without changing call sites.
 */
const LEVELS = ['error', 'warn', 'info', 'http', 'debug'] as const;
type LogLevel = (typeof LEVELS)[number];

const activeThreshold = LEVELS.indexOf(config.logging.level as LogLevel);

function shouldLog(level: LogLevel): boolean {
  return LEVELS.indexOf(level) <= activeThreshold;
}

function format(level: LogLevel, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  if (meta === undefined) return base;
  try {
    return `${base} ${typeof meta === 'string' ? meta : JSON.stringify(meta)}`;
  } catch {
    return `${base} [unserializable meta]`;
  }
}

function write(level: LogLevel, message: string, meta?: unknown): void {
  if (!shouldLog(level)) return;
  const line = format(level, message, meta);
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(line);
  } else if (level === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

export const logger = {
  error: (message: string, meta?: unknown) => write('error', message, meta),
  warn: (message: string, meta?: unknown) => write('warn', message, meta),
  info: (message: string, meta?: unknown) => write('info', message, meta),
  http: (message: string, meta?: unknown) => write('http', message, meta),
  debug: (message: string, meta?: unknown) => write('debug', message, meta),
  /** Stream adapter so morgan can pipe HTTP logs through this logger. */
  stream: {
    write: (message: string) => write('http', message.trim()),
  },
};
