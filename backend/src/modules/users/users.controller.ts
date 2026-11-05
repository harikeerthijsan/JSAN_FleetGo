import type { Request, Response } from 'express';
import { ApiResponse } from '../../utils/ApiResponse';
import { requestContext, writeAudit } from '../../utils/audit';
import { asyncHandler } from '../../utils/asyncHandler';
import { usersService } from './users.service';

export const usersController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { data, meta } = await usersService.list(req.query as never);
    ApiResponse.success(res, data, 'Users', 200, meta);
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const user = await usersService.getById(req.params.id);
    ApiResponse.success(res, user, 'User');
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const result = await usersService.create(req.body, req.user!);
    await writeAudit({
      actorId: req.user!.id,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: result.user.id,
      metadata: { email: result.user.email, role: result.user.role.name },
      ...requestContext(req),
    });
    ApiResponse.success(res, result, 'User created', 201);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const user = await usersService.update(req.params.id, req.body, req.user!);
    await writeAudit({
      actorId: req.user!.id,
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: user.id,
      ...requestContext(req),
    });
    ApiResponse.success(res, user, 'User updated');
  }),

  updateStatus: asyncHandler(async (req: Request, res: Response) => {
    const user = await usersService.updateStatus(
      req.params.id,
      req.body.status,
      req.user!,
    );
    await writeAudit({
      actorId: req.user!.id,
      action: 'USER_STATUS_CHANGED',
      entityType: 'User',
      entityId: user.id,
      metadata: { status: user.status },
      ...requestContext(req),
    });
    ApiResponse.success(res, user, 'User status updated');
  }),

  resetPassword: asyncHandler(async (req: Request, res: Response) => {
    const result = await usersService.adminResetPassword(req.params.id);
    await writeAudit({
      actorId: req.user!.id,
      action: 'USER_PASSWORD_RESET_ISSUED',
      entityType: 'User',
      entityId: req.params.id,
      ...requestContext(req),
    });
    ApiResponse.success(res, result, 'Password reset issued');
  }),
};
