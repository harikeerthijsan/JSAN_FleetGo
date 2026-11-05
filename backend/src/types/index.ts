/**
 * Shared backend type definitions. Module-specific types live within each
 * module; this file holds only cross-cutting contracts.
 */

export type HealthStatus = 'ok' | 'degraded' | 'down';
export type DatabaseStatus = 'connected' | 'disconnected';

export interface HealthCheckResult {
  application: string;
  status: HealthStatus;
  environment: string;
  version: string;
  uptimeSeconds: number;
  database: {
    status: DatabaseStatus;
  };
  timestamp: string;
}
