import { Router } from 'express';
import { authenticate, authorize, validate } from '../../middlewares';
import { idParamSchema } from '../../validators/common.validators';
import { organizationsController } from './organizations.controller';
import {
  createOrganizationSchema,
  listOrganizationsQuerySchema,
  updateOrganizationSchema,
} from './organizations.validators';

const router = Router();

// All organization routes require authentication.
router.use(authenticate);

router.get(
  '/',
  authorize('organizations:read'),
  validate({ query: listOrganizationsQuerySchema }),
  organizationsController.list,
);

router.get(
  '/:id',
  authorize('organizations:read'),
  validate({ params: idParamSchema }),
  organizationsController.getById,
);

router.post(
  '/',
  authorize('organizations:create'),
  validate({ body: createOrganizationSchema }),
  organizationsController.create,
);

router.put(
  '/:id',
  authorize('organizations:update'),
  validate({ params: idParamSchema, body: updateOrganizationSchema }),
  organizationsController.update,
);

export const organizationsRoutes = router;
