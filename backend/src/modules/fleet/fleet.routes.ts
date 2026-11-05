import { Router } from 'express';
import {
  authenticate,
  authorize,
  uploadSingle,
  validate,
} from '../../middlewares';
import { idParamSchema } from '../../validators/common.validators';
import { fleetController } from './fleet.controller';
import {
  changeStatusSchema,
  createVehicleSchema,
  listVehiclesQuerySchema,
  updateVehicleSchema,
} from './fleet.validators';

/**
 * Fleet routes (mounted at /api/v1/fleet). All require authentication.
 * Reads require `fleet:read`; mutations require `fleet:manage`. Vendor-scoped
 * users only ever see/act on vehicles belonging to their organization
 * (enforced in the service, not just the UI).
 */
const router = Router();
router.use(authenticate);

// Dashboard + reference data
router.get('/stats', authorize('fleet:read'), fleetController.stats);
router.get('/status-transitions', authorize('fleet:read'), fleetController.statusTransitions);

// Vehicles
router.get(
  '/vehicles',
  authorize('fleet:read'),
  validate({ query: listVehiclesQuerySchema }),
  fleetController.list,
);
router.post(
  '/vehicles',
  authorize('fleet:manage'),
  validate({ body: createVehicleSchema }),
  fleetController.create,
);
router.get(
  '/vehicles/:id',
  authorize('fleet:read'),
  validate({ params: idParamSchema }),
  fleetController.getById,
);
router.put(
  '/vehicles/:id',
  authorize('fleet:manage'),
  validate({ params: idParamSchema, body: updateVehicleSchema }),
  fleetController.update,
);
router.patch(
  '/vehicles/:id/status',
  authorize('fleet:manage'),
  validate({ params: idParamSchema, body: changeStatusSchema }),
  fleetController.changeStatus,
);
router.delete(
  '/vehicles/:id',
  authorize('fleet:manage'),
  validate({ params: idParamSchema }),
  fleetController.deactivate,
);
router.get(
  '/vehicles/:id/history',
  authorize('fleet:read'),
  validate({ params: idParamSchema }),
  fleetController.history,
);

// Documents & photos
router.get(
  '/vehicles/:id/documents',
  authorize('fleet:read'),
  fleetController.listDocuments,
);
router.post(
  '/vehicles/:id/documents',
  authorize('fleet:manage'),
  uploadSingle('file'),
  fleetController.uploadDocument,
);
router.get(
  '/vehicles/:id/documents/:documentId/download',
  authorize('fleet:read'),
  fleetController.downloadDocument,
);
router.delete(
  '/vehicles/:id/documents/:documentId',
  authorize('fleet:manage'),
  fleetController.removeDocument,
);

export const fleetRoutes = router;
