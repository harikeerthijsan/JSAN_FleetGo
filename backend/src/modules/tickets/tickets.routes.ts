import { Router } from 'express';
import { z } from 'zod';
import {
  authenticate,
  authorize,
  uploadMediaSingle,
  validate,
} from '../../middlewares';
import { ticketsController } from './tickets.controller';
import {
  assignSchema,
  availabilityQuerySchema,
  commentSchema,
  createTicketSchema,
  decisionSchema,
  listTicketsQuerySchema,
  reassignApproverSchema,
  statusSchema,
  updateTicketSchema,
} from './tickets.validators';

const idParam = z.object({ id: z.string().uuid() });

/**
 * Ticketing routes (mounted at /api/v1/tickets). All require authentication.
 * Reads require tickets:read; creation tickets:create; approvals
 * tickets:approve; assignment/status/escalation tickets:manage.
 */
const router = Router();
router.use(authenticate);

const read = authorize('tickets:read');
const manage = authorize('tickets:manage');
const approve = authorize('tickets:approve');

// Dashboard / reports / notifications / availability
router.get('/dashboard', read, ticketsController.dashboard);
router.get('/sla-report', read, ticketsController.slaReport);
router.get('/availability', read, validate({ query: availabilityQuerySchema }), ticketsController.availability);
router.get('/notifications', ticketsController.notifications);
router.post('/notifications/read-all', ticketsController.markAllNotificationsRead);
router.post('/notifications/:id/read', validate({ params: idParam }), ticketsController.markNotificationRead);

// Ticket CRUD
router.get('/', read, validate({ query: listTicketsQuerySchema }), ticketsController.list);
router.post('/', authorize('tickets:create'), validate({ body: createTicketSchema }), ticketsController.create);
router.get('/:id', read, validate({ params: idParam }), ticketsController.getById);
router.put('/:id', authorize('tickets:create'), validate({ params: idParam, body: updateTicketSchema }), ticketsController.update);

// Lifecycle
router.post('/:id/submit', authorize('tickets:create'), validate({ params: idParam }), ticketsController.submit);
router.post('/:id/decision', approve, validate({ params: idParam, body: decisionSchema }), ticketsController.decide);
router.post('/:id/reassign-approver', approve, validate({ params: idParam, body: reassignApproverSchema }), ticketsController.reassignApprover);
router.post('/:id/escalate', manage, validate({ params: idParam }), ticketsController.escalate);
router.post('/:id/assign', manage, validate({ params: idParam, body: assignSchema }), ticketsController.assign);
router.post('/:id/status', read, validate({ params: idParam, body: statusSchema }), ticketsController.changeStatus);

// Comments
router.post('/:id/comments', read, validate({ params: idParam, body: commentSchema }), ticketsController.comment);

// Attachments
router.get('/:id/attachments', read, validate({ params: idParam }), ticketsController.listAttachments);
router.post('/:id/attachments', read, uploadMediaSingle('file'), ticketsController.uploadAttachment);
router.get('/:id/attachments/:attachmentId/download', read, ticketsController.downloadAttachment);

export const ticketsRoutes = router;
