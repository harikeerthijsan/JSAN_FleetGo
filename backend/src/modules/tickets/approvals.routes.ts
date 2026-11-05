import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize, requireRole, validate } from '../../middlewares';
import { approvalsController } from './approvals.controller';
import { decisionSchema, slaSchema, workflowSchema } from './tickets.validators';

const idParam = z.object({ id: z.string().uuid() });

/**
 * Approvals routes (mounted at /api/v1/approvals).
 * Inbox requires tickets:approve; workflow/SLA configuration requires
 * tickets:manage.
 */
const router = Router();
router.use(authenticate);

const approve = authorize('tickets:approve');
// Workflow configuration is an administrative authority, separate from operational ticket management.
const manage = [authorize('tickets:manage'), requireRole('SUPER_ADMIN','JSAN_ADMIN')];

// Approver inbox
router.get('/inbox', approve, approvalsController.inbox);

// Decision by ticket id (alias of /tickets/:id/decision)
router.post('/:id/decision', approve, validate({ params: idParam, body: decisionSchema }), approvalsController.decide);

// Workflow configuration
router.get('/workflows', manage, approvalsController.listWorkflows);
router.post('/workflows', manage, validate({ body: workflowSchema }), approvalsController.createWorkflow);
router.get('/workflows/:id', manage, validate({ params: idParam }), approvalsController.getWorkflow);
router.put('/workflows/:id', manage, validate({ params: idParam, body: workflowSchema }), approvalsController.updateWorkflow);

// SLA configuration
router.get('/slas', manage, approvalsController.listSlas);
router.post('/slas', manage, validate({ body: slaSchema }), approvalsController.upsertSla);

// Ticket type configs (reference)
router.get('/type-configs', approve, approvalsController.typeConfigs);

export const approvalsRoutes = router;
