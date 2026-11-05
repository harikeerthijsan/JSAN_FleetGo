import { Router } from 'express';
import { authenticate, authorize, validate } from '../../middlewares';
import { idParamSchema } from '../../validators/common.validators';
import { rolesController } from './roles.controller';
import { createRoleSchema, updateRoleSchema } from './roles.validators';

// Roles router (mounted at /api/v1/roles)
const rolesRouter = Router();
rolesRouter.use(authenticate);

rolesRouter.get('/', authorize('roles:read'), rolesController.list);
rolesRouter.get(
  '/:id',
  authorize('roles:read'),
  validate({ params: idParamSchema }),
  rolesController.getById,
);
rolesRouter.post(
  '/',
  authorize('roles:manage'),
  validate({ body: createRoleSchema }),
  rolesController.create,
);
rolesRouter.put(
  '/:id',
  authorize('roles:manage'),
  validate({ params: idParamSchema, body: updateRoleSchema }),
  rolesController.update,
);

// Permissions router (mounted at /api/v1/permissions)
const permissionsRouter = Router();
permissionsRouter.use(authenticate);
permissionsRouter.get(
  '/',
  authorize('permissions:read'),
  rolesController.listPermissions,
);

export const rolesRoutes = rolesRouter;
export const permissionsRoutes = permissionsRouter;
