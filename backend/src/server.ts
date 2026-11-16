import { attachTrackingSockets } from './modules/tracking/tracking.socket';
import { startTrackingMaintenance } from './modules/tracking/tracking.worker';
import type { Server } from 'node:http';
import { createApp } from './app';
import { config } from './config';
import { connectDatabase, disconnectDatabase } from './database/prisma';
import { logger } from './utils/logger';
import { checkStorage } from './utils/storage/readiness';

/**
 * HTTP server bootstrap. Attempts to establish the database connection at
 * startup. Development can report degraded dependencies during local setup;
 * production refuses traffic until its database and upload storage are ready.
 */
async function bootstrap(): Promise<void> {
  const app = createApp();

  try {
    await connectDatabase();
  } catch (error) {
    if (config.app.isProduction) {
      logger.error('Database connection failed; refusing production startup');
      await disconnectDatabase();
      process.exitCode = 1;
      return;
    }
    logger.warn(
      'Could not connect to the database at startup. The API will start in a ' +
        'degraded state; check DATABASE_URL and that PostgreSQL is running.',
      { message: error instanceof Error ? error.message : String(error) },
    );
  }

  if (config.app.isProduction && !(await checkStorage())) {
    logger.error(
      'Persistent upload storage is unavailable or not writable; refusing production startup',
    );
    await disconnectDatabase();
    process.exitCode = 1;
    return;
  }

  const server: Server = app.listen(config.app.port, '0.0.0.0', () => {
    logger.info(
      `${config.app.name} API listening on http://localhost:${config.app.port} ` +
        `(env: ${config.app.env})`,
    );
    logger.info(
      `Health check: http://localhost:${config.app.port}${config.app.apiPrefix}/health`,
    );
  });

  const closeTracking = attachTrackingSockets(server);
  const stopTrackingMaintenance = startTrackingMaintenance();

  // --- Graceful shutdown --------------------------------------------------
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    stopTrackingMaintenance();
    closeTracking();
    server.close(async () => {
      await disconnectDatabase();
      logger.info('Shutdown complete.');
      process.exit(0);
    });
    server.closeIdleConnections();
    // Force-exit if cleanup hangs.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    void shutdown('unhandledRejection');
  });
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { message: error.message });
    process.exit(1);
  });
}

void bootstrap().catch(() => {
  logger.error('Application startup failed');
  process.exit(1);
});
