import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Single shared PrismaClient instance.
 *
 * In development the module can be re-evaluated on hot reload, which would
 * otherwise create a new client (and a new connection pool) every time. We
 * cache the instance on `globalThis` to avoid exhausting database connections.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.app.isDevelopment
      ? ['query', 'warn', 'error']
      : ['warn', 'error'],
  });

if (config.app.isDevelopment) {
  globalForPrisma.prisma = prisma;
}

/** Establish the initial connection. Safe to call at startup. */
export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('Database connection established');
}

/** Gracefully close the connection pool (used on shutdown). */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Database connection closed');
}

/**
 * Lightweight connectivity probe used by the health-check endpoint.
 * Runs `SELECT 1` which requires no application tables to exist.
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Database connectivity check failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
