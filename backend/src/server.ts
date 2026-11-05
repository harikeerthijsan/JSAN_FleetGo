import {attachTrackingSockets} from './modules/tracking/tracking.socket';
import {startTrackingMaintenance} from './modules/tracking/tracking.worker';
import type { Server } from 'node:http';
import { createApp } from './app';
import { config } from './config';
import {
  connectDatabase,
  disconnectDatabase,
} from './database/prisma';
import { logger } from './utils/logger';

/**
 * HTTP server bootstrap. Attempts to establish the database connection at
 * startup but does NOT abort if it fails — the API still starts and reports
 * `degraded` via the health endpoint, which is useful during local setup
 * before PostgreSQL is available.
 */
async function bootstrap(): Promise<void> {
  const app = createApp();

  try {
    await connectDatabase();
  } catch (error) {
    logger.warn(
      'Could not connect to the database at startup. The API will start in a ' +
        'degraded state; check DATABASE_URL and that PostgreSQL is running.',
      { message: error instanceof Error ? error.message : String(error) },
    );
  }

  const server: Server = app.listen(config.app.port, () => {
    logger.info(
      `${config.app.name} API listening on http://localhost:${config.app.port} ` +
        `(env: ${config.app.env})`,
    );
    logger.info(
      `Health check: http://localhost:${config.app.port}${config.app.apiPrefix}/health`,
    );
  });

  const closeTracking=attachTrackingSockets(server);
  const stopTrackingMaintenance=startTrackingMaintenance();

  // --- Graceful shutdown --------------------------------------------------
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    stopTrackingMaintenance();closeTracking();
    server.close(async () => {
      await disconnectDatabase();
      logger.info('Shutdown complete.');
      process.exit(0);
    });
    // Force-exit if cleanup hangs.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
  });
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { message: error.message });
    process.exit(1);
  });
}

void bootstrap();
