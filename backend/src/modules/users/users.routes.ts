import { Router } from 'express';
import { authenticate, authorize, validate } from '../../middlewares';
import { idParamSchema } from '../../validators/common.validators';
import { usersController } from './users.controller';
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  updateUserStatusSchema,
} from './users.validators';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  authorize('users:read'),
  validate({ query: listUsersQuerySchema }),
  usersController.list,
);

router.get(
  '/:id',
  authorize('users:read'),
  validate({ params: idParamSchema }),
  usersController.getById,
);

router.post(
  '/',
  authorize('users:create'),
  validate({ body: createUserSchema }),
  usersController.create,
);

router.put(
  '/:id',
  authorize('users:update'),
  validate({ params: idParamSchema, body: updateUserSchema }),
  usersController.update,
);

router.patch(
  '/:id/status',
  authorize('users:status'),
  validate({ params: idParamSchema, body: updateUserStatusSchema }),
  usersController.updateStatus,
);

router.post(
  '/:id/reset-password',
  authorize('users:reset_password'),
  validate({ params: idParamSchema }),
  usersController.resetPassword,
);

export const usersRoutes = router;
