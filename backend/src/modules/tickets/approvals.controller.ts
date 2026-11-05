import type { Request, Response } from 'express';
import { ApiResponse } from '../../utils/ApiResponse';
import { requestContext, writeAudit } from '../../utils/audit';
import { asyncHandler } from '../../utils/asyncHandler';
import { approvalsService } from './approvals.service';
import { ticketsService } from './tickets.service';

export const approvalsController = {
  inbox: asyncHandler(async (req: Request, res: Response) => {
    ApiResponse.success(res, await approvalsService.inbox(req.user!), 'Approval inbox');
  }),

  // --- Workflow configuration ----------------------------------------------
  listWorkflows: asyncHandler(async (_req: Request, res: Response) => {
    ApiResponse.success(res, await approvalsService.listWorkflows(), 'Workflows');
  }),

  getWorkflow: asyncHandler(async (req: Request, res: Response) => {
    ApiResponse.success(res, await approvalsService.getWorkflow(req.params.id), 'Workflow');
  }),

  createWorkflow: asyncHandler(async (req: Request, res: Response) => {
    const wf = await approvalsService.createWorkflow(req.body, req.user!);
    await writeAudit({
      actorId: req.user!.id,
      action: 'APPROVAL_WORKFLOW_CREATED',
      entityType: 'ApprovalWorkflow',
      entityId: wf.id,
      ...requestContext(req),
    });
    ApiResponse.success(res, wf, 'Workflow created', 201);
  }),

  updateWorkflow: asyncHandler(async (req: Request, res: Response) => {
    const wf = await approvalsService.updateWorkflow(req.params.id, req.body);
    await writeAudit({
      actorId: req.user!.id,
      action: 'APPROVAL_WORKFLOW_UPDATED',
      entityType: 'ApprovalWorkflow',
      entityId: wf.id,
      ...requestContext(req),
    });
    ApiResponse.success(res, wf, 'Workflow updated');
  }),

  // --- SLA configuration ----------------------------------------------------
  listSlas: asyncHandler(async (_req: Request, res: Response) => {
    ApiResponse.success(res, await approvalsService.listSlas(), 'SLA rules');
  }),

  upsertSla: asyncHandler(async (req: Request, res: Response) => {
    const sla = await approvalsService.upsertSla(req.body);
    await writeAudit({
      actorId: req.user!.id,
      action: 'TICKET_SLA_UPSERTED',
      entityType: 'TicketSLA',
      entityId: sla.id,
      ...requestContext(req),
    });
    ApiResponse.success(res, sla, 'SLA saved');
  }),

  typeConfigs: asyncHandler(async (_req: Request, res: Response) => {
    ApiResponse.success(res, await approvalsService.typeConfigs(), 'Ticket type configs');
  }),

  // Decisions are also reachable under /approvals for convenience.
  decide: asyncHandler(async (req: Request, res: Response) => {
    ApiResponse.success(
      res,
      await ticketsService.decide(req.params.id, req.body.decision, req.body.comment, req.user!),
      'Decision recorded',
    );
  }),
};
