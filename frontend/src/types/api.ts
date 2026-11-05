/** Shared API contract types mirroring the backend's standard envelope. */

export interface PaginatedMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
  meta?: Record<string, unknown>;
  timestamp: string;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: number;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

export type HealthStatus = 'ok' | 'degraded' | 'down';
export type DatabaseStatus = 'connected' | 'disconnected';

export interface HealthCheck {
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
