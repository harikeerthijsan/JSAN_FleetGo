import { apiClient } from './apiClient';
import type { ApiSuccess, HealthCheck } from '@/types/api';

/**
 * Health service.
 *
 * The backend returns 200 when healthy and 503 when degraded (API up, DB
 * down). In BOTH cases the body carries the full HealthCheck payload, so we
 * treat 503 as a valid response (via `validateStatus`) and read the payload
 * instead of throwing. Any other status is a genuine failure.
 */
export const healthService = {
  async getHealth(): Promise<HealthCheck> {
    const res = await apiClient.get<ApiSuccess<HealthCheck>>('/health', {
      validateStatus: (status) => status === 200 || status === 503,
    });
    return res.data.data;
  },
};
