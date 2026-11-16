import { config } from '../../config';
import { checkDatabaseConnection } from '../../database/prisma';
import type { HealthCheckResult } from '../../types';

/**
 * Health service — assembles application and dependency status. The overall
 * status is `ok` when the database is reachable and `degraded` when the API is
 * up but the database is not (the process is still serving requests).
 */
export const healthService = {
  async getHealth(): Promise<HealthCheckResult> {
    const dbConnected = await checkDatabaseConnection();

    return {
      application: config.app.name,
      status: dbConnected ? 'ok' : 'degraded',
      environment: config.app.env,
      version: process.env.npm_package_version ?? '1.0.0',
      uptimeSeconds: Math.round(process.uptime()),
      database: {
        status: dbConnected ? 'connected' : 'disconnected',
      },
      timestamp: new Date().toISOString(),
    };
  },
};
