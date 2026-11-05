import { Router } from 'express';
import { healthController } from './health.controller';

const router = Router();

/**
 * @route   GET /api/v1/health
 * @desc    Application + database connectivity health check
 * @access  Public
 */
router.get('/', healthController.check);

export const healthRoutes = router;
