import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares';
import { masterDataController } from './masterdata.controller';

/**
 * Master-data routes (mounted at /api/v1/master-data).
 *
 * Generic across all lookups via the `:resource` segment, e.g.
 *   /master-data/makes, /master-data/models, /master-data/types,
 *   /master-data/categories, /master-data/fuel-types,
 *   /master-data/ownership-types, /master-data/document-types,
 *   /master-data/depots
 *
 * Reading requires `masterdata:read`; mutations require `masterdata:manage`.
 */
const router = Router();
router.use(authenticate);

router.get('/:resource', authorize('masterdata:read'), masterDataController.list);
router.post('/:resource', authorize('masterdata:manage'), masterDataController.create);
router.put('/:resource/:id', authorize('masterdata:manage'), masterDataController.update);
router.patch('/:resource/:id/status', authorize('masterdata:manage'), masterDataController.setStatus);
router.delete('/:resource/:id', authorize('masterdata:manage'), masterDataController.remove);

export const masterDataRoutes = router;
