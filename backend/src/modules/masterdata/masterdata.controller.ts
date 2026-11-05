import type { Request, Response } from 'express';
import { ApiResponse } from '../../utils/ApiResponse';
import { requestContext, writeAudit } from '../../utils/audit';
import { asyncHandler } from '../../utils/asyncHandler';
import { masterDataService } from './masterdata.service';
import { listQuerySchema, statusSchema } from './masterdata.validators';

export const masterDataController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = listQuerySchema.parse(req.query);
    const { data, meta } = await masterDataService.list(
      req.params.resource,
      query,
    );
    ApiResponse.success(res, data, 'Master data', 200, meta);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const record = await masterDataService.create(req.params.resource, req.body);
    await writeAudit({
      actorId: req.user!.id,
      action: 'MASTERDATA_CREATED',
      entityType: req.params.resource,
      entityId: record.id as string,
      ...requestContext(req),
    });
    ApiResponse.success(res, record, 'Created', 201);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const record = await masterDataService.update(
      req.params.resource,
      req.params.id,
      req.body,
    );
    await writeAudit({
      actorId: req.user!.id,
      action: 'MASTERDATA_UPDATED',
      entityType: req.params.resource,
      entityId: req.params.id,
      ...requestContext(req),
    });
    ApiResponse.success(res, record, 'Updated');
  }),

  setStatus: asyncHandler(async (req: Request, res: Response) => {
    const { active } = statusSchema.parse(req.body);
    const record = await masterDataService.setStatus(
      req.params.resource,
      req.params.id,
      active,
    );
    await writeAudit({
      actorId: req.user!.id,
      action: active ? 'MASTERDATA_ACTIVATED' : 'MASTERDATA_DEACTIVATED',
      entityType: req.params.resource,
      entityId: req.params.id,
      ...requestContext(req),
    });
    ApiResponse.success(res, record, 'Status updated');
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const result = await masterDataService.remove(
      req.params.resource,
      req.params.id,
    );
    await writeAudit({
      actorId: req.user!.id,
      action: 'MASTERDATA_DELETED',
      entityType: req.params.resource,
      entityId: req.params.id,
      ...requestContext(req),
    });
    ApiResponse.success(res, result, 'Deleted');
  }),
};
