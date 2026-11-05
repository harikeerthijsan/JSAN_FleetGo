import type { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError';
import { ApiResponse } from '../../utils/ApiResponse';
import { writeAudit, requestContext } from '../../utils/audit';
import { asyncHandler } from '../../utils/asyncHandler';
import { organizationsService } from './organizations.service';

export const organizationsController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { data, meta } = await organizationsService.list(
      req.query as never,
      req.user!,
    );
    ApiResponse.success(res, data, 'Organizations', 200, meta);
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const org = await organizationsService.getById(req.params.id, req.user!);
    ApiResponse.success(res, org, 'Organization');
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const org = await organizationsService.create(req.body);
    await writeAudit({
      actorId: req.user!.id,
      action: 'ORGANIZATION_CREATED',
      entityType: 'Organization',
      entityId: org.id,
      metadata: { name: org.name, type: org.type },
      ...requestContext(req),
    });
    ApiResponse.success(res, org, 'Organization created', 201);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    if (!req.params.id) throw ApiError.badRequest('id is required');
    const org = await organizationsService.update(req.params.id, req.body);
    await writeAudit({
      actorId: req.user!.id,
      action: 'ORGANIZATION_UPDATED',
      entityType: 'Organization',
      entityId: org.id,
      ...requestContext(req),
    });
    ApiResponse.success(res, org, 'Organization updated');
  }),
};
