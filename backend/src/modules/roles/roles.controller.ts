import type { Request, Response } from 'express';
import { ApiResponse } from '../../utils/ApiResponse';
import { requestContext, writeAudit } from '../../utils/audit';
import { asyncHandler } from '../../utils/asyncHandler';
import { rolesService } from './roles.service';

export const rolesController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    const roles = await rolesService.list();
    ApiResponse.success(res, roles, 'Roles');
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const role = await rolesService.getById(req.params.id);
    ApiResponse.success(res, role, 'Role');
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const role = await rolesService.create(req.body);
    await writeAudit({
      actorId: req.user!.id,
      action: 'ROLE_CREATED',
      entityType: 'Role',
      entityId: role.id,
      metadata: { name: role.name },
      ...requestContext(req),
    });
    ApiResponse.success(res, role, 'Role created', 201);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const role = await rolesService.update(req.params.id, req.body);
    await writeAudit({
      actorId: req.user!.id,
      action: 'ROLE_UPDATED',
      entityType: 'Role',
      entityId: role.id,
      ...requestContext(req),
    });
    ApiResponse.success(res, role, 'Role updated');
  }),

  listPermissions: asyncHandler(async (_req: Request, res: Response) => {
    const result = await rolesService.listPermissions();
    ApiResponse.success(res, result, 'Permissions');
  }),
};
