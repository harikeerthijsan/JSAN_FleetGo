import type { Request, Response } from 'express';
import { ApiResponse } from '../../utils/ApiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { healthService } from './health.service';

export const healthController = {
  /**
   * GET /api/v1/health
   * Returns application status and database connectivity status. Responds 200
   * when healthy and 503 when degraded (DB unreachable) so that load balancers
   * and uptime monitors can react appropriately.
   */
  check: asyncHandler(async (_req: Request, res: Response) => {
    const health = await healthService.getHealth();
    const statusCode = health.status === 'ok' ? 200 : 503;
    ApiResponse.success(
      res,
      health,
      health.status === 'ok'
        ? 'FleetGo API is healthy'
        : 'FleetGo API is running but a dependency is unavailable',
      statusCode,
    );
  }),
};
