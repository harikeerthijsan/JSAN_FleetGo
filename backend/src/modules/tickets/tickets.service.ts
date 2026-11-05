import {inventoryScope,inventoryService} from '../inventory/inventory.service';
import {fleetService} from '../fleet/fleet.service';
import {
  Prisma,
  type ApprovalDecision,
  type TicketStatus,
  type TicketType,
} from '@prisma/client';
import { prisma } from '../../database/prisma';
import type { AuthenticatedUser } from '../../types/auth';
import { ApiError } from '../../utils/ApiError';
import type { PaginationMeta } from '../../utils/ApiResponse';
import { writeAudit } from '../../utils/audit';
import { approvalsService } from './approvals.service';
import { notificationsService } from './notifications.service';
import type {
  CreateTicketInput,
  ListTicketsQuery,
  UpdateTicketInput,
} from './tickets.validators';
import {
  canActOnStep,
  canManualTransition,
  isInternalTicketActor,
  isTerminal,
  ticketScope,
} from './tickets.workflow';

// Types whose non-terminal duplicates (same vehicle, same type) are blocked.
const VEHICLE_DUP_TYPES: TicketType[] = [
  'PICKUP',
  'TRANSFER',
  'RETURN',
  'MAINTENANCE',
];
const NON_TERMINAL: TicketStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'PENDING_APPROVAL',
  'INFO_REQUIRED',
  'APPROVED',
  'IN_PROGRESS',
  'ON_HOLD',
];

async function nextTicketNumber(tx: Prisma.TransactionClient): Promise<string> {
  const counter = await tx.counter.upsert({
    where: { name: 'ticket' },
    update: { value: { increment: 1 } },
    create: { name: 'ticket', value: 1 },
  });
  return `FG-TKT-${String(counter.value).padStart(6, '0')}`;
}

/** Resolve display names for the scalar id references on a set of tickets. */
async function resolveRefs(ticketLike: {
  requesterId?: string | null;
  requestingOrgId?: string | null;
  assignedToId?: string | null;
  sourceDepotId?: string | null;
  destinationDepotId?: string | null;
  requestedTypeId?: string | null;
  vehicleId?: string | null;
}[]) {
  const userIds = new Set<string>();
  const orgIds = new Set<string>();
  const depotIds = new Set<string>();
  const typeIds = new Set<string>();
  const vehicleIds = new Set<string>();
  for (const t of ticketLike) {
    if (t.requesterId) userIds.add(t.requesterId);
    if (t.assignedToId) userIds.add(t.assignedToId);
    if (t.requestingOrgId) orgIds.add(t.requestingOrgId);
    if (t.sourceDepotId) depotIds.add(t.sourceDepotId);
    if (t.destinationDepotId) depotIds.add(t.destinationDepotId);
    if (t.requestedTypeId) typeIds.add(t.requestedTypeId);
    if (t.vehicleId) vehicleIds.add(t.vehicleId);
  }
  const [users, orgs, depots, types, vehicles] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, fullName: true, email: true } }),
    prisma.organization.findMany({ where: { id: { in: [...orgIds] } }, select: { id: true, name: true, type: true } }),
    prisma.depot.findMany({ where: { id: { in: [...depotIds] } }, select: { id: true, name: true, code: true } }),
    prisma.vehicleType.findMany({ where: { id: { in: [...typeIds] } }, select: { id: true, name: true } }),
    prisma.vehicle.findMany({ where: { id: { in: [...vehicleIds] } }, select: { id: true, vehicleCode: true, registrationNumber: true } }),
  ]);
  return {
    user: new Map(users.map((u) => [u.id, u])),
    org: new Map(orgs.map((o) => [o.id, o])),
    depot: new Map(depots.map((d) => [d.id, d])),
    type: new Map(types.map((t) => [t.id, t])),
    vehicle: new Map(vehicles.map((v) => [v.id, v])),
  };
}

function decorate(
  ticket: Record<string, unknown>,
  refs: Awaited<ReturnType<typeof resolveRefs>>,
) {
  const g = (m: Map<string, unknown>, id: unknown) =>
    id ? (m.get(id as string) ?? null) : null;
  const now = Date.now();
  const approvalOverdue =
    ticket.approvalStatus === 'PENDING' &&
    ticket.approvalDueAt != null &&
    new Date(ticket.approvalDueAt as string).getTime() < now;
  const resolutionOverdue =
    !isTerminal(ticket.status as TicketStatus) &&
    ticket.status !== 'COMPLETED' &&
    ticket.resolutionDueAt != null &&
    new Date(ticket.resolutionDueAt as string).getTime() < now;
  return {
    ...ticket,
    requester: g(refs.user, ticket.requesterId),
    assignedTo: g(refs.user, ticket.assignedToId),
    requestingOrg: g(refs.org, ticket.requestingOrgId),
    sourceDepot: g(refs.depot, ticket.sourceDepotId),
    destinationDepot: g(refs.depot, ticket.destinationDepotId),
    requestedType: g(refs.type, ticket.requestedTypeId),
    vehicle: g(refs.vehicle, ticket.vehicleId),
    overdue: approvalOverdue || resolutionOverdue,
  };
}

async function logActivity(
  tx: Prisma.TransactionClient,
  ticketId: string,
  actor: AuthenticatedUser | null,
  type: string,
  summary: string,
  opts: { isInternal?: boolean; metadata?: Record<string, unknown> } = {},
) {
  await tx.ticketActivity.create({
    data: {
      ticketId,
      actorId: actor?.id ?? null,
      type,
      summary,
      isInternal: opts.isInternal ?? false,
      metadata: opts.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

/** Load a ticket enforcing read scope. */
async function loadScoped(id: string, actor: AuthenticatedUser) {
  const ticket = await prisma.ticket.findFirst({
    where: { id, ...ticketScope(actor) },
  });
  if (!ticket) throw ApiError.notFound('Ticket not found');
  return ticket;
}

export const ticketsService = {
  async list(query: ListTicketsQuery, actor: AuthenticatedUser) {
    const clauses: Prisma.TicketWhereInput[] = [ticketScope(actor)];
    if (query.scope === 'mine') clauses.push({ requesterId: actor.id });
    if (query.type) clauses.push({ type: query.type });
    if (query.status) clauses.push({ status: query.status });
    if (query.priority) clauses.push({ priority: query.priority });
    if (query.organizationId) clauses.push({ requestingOrgId: query.organizationId });
    if (query.assignedToId) clauses.push({ assignedToId: query.assignedToId });
    if (query.overdue === 'true') {
      clauses.push({
        OR: [
          { approvalStatus: 'PENDING', approvalDueAt: { lt: new Date() } },
          {
            status: { in: ['APPROVED', 'IN_PROGRESS', 'ON_HOLD'] },
            resolutionDueAt: { lt: new Date() },
          },
        ],
      });
    }
    if (query.search) {
      clauses.push({
        OR: [
          { ticketNumber: { contains: query.search, mode: 'insensitive' } },
          { subject: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    // "approvals" scope narrows to tickets awaiting this user's decision.
    if (query.scope === 'approvals') {
      const inbox = await approvalsService.inbox(actor);
      const ids = inbox.map((t) => t.id);
      clauses.push({ id: { in: ids.length ? ids : ['__none__'] } });
    }

    const where: Prisma.TicketWhereInput = { AND: clauses };
    const orderBy: Prisma.TicketOrderByWithRelationInput =
      query.sortBy === 'priority'
        ? { priority: query.sortDir }
        : { [query.sortBy]: query.sortDir };

    const [total, rows] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({
        where,
        orderBy: [orderBy, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const refs = await resolveRefs(rows);
    const meta: PaginationMeta = {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
    return { data: rows.map((t) => decorate(t, refs)), meta };
  },

  async details(id: string, actor: AuthenticatedUser) {
    const ticket = await loadScoped(id, actor);
    const internal = isInternalTicketActor(actor);
    const [approvals, comments, attachments, activities, assignments] =
      await Promise.all([
        prisma.ticketApproval.findMany({ where: { ticketId: id }, orderBy: { order: 'asc' } }),
        prisma.ticketComment.findMany({
          where: { ticketId: id, ...(internal ? {} : { isInternal: false }) },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.ticketAttachment.findMany({
          where: { ticketId: id, ...(internal ? {} : { isInternal: false }) },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.ticketActivity.findMany({
          where: { ticketId: id, ...(internal ? {} : { isInternal: false }) },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.ticketAssignment.findMany({ where: { ticketId: id }, orderBy: { createdAt: 'desc' } }),
      ]);
    const refs = await resolveRefs([ticket]);
    // Resolve names for approval deciders/comment authors.
    const actorIds = [
      ...new Set([
        ...approvals.map((a) => a.decidedById).filter(Boolean),
        ...comments.map((c) => c.authorId),
        ...activities.map((a) => a.actorId).filter(Boolean),
      ] as string[]),
    ];
    const people = await prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, fullName: true },
    });
    const pmap = new Map(people.map((p) => [p.id, p.fullName]));
    const allocated=await prisma.vehicleAllocationItem.count({where:{allocation:{ticketId:id},cancelledAt:null}});
    const requested=ticket.requestedQuantity??1;
    return {
      allocationSummary:{requested,allocated,pending:Math.max(0,requested-allocated)},
      ...decorate(ticket, refs),
      approvals: approvals.map((a) => ({
        ...a,
        decidedByName: a.decidedById ? pmap.get(a.decidedById) ?? null : null,
      })),
      comments: comments.map((c) => ({ ...c, authorName: pmap.get(c.authorId) ?? null })),
      attachments,
      activities: activities.map((a) => ({
        ...a,
        actorName: a.actorId ? pmap.get(a.actorId) ?? null : null,
      })),
      assignments,
    };
  },

  async create(input: CreateTicketInput, actor: AuthenticatedUser) {
    if(input.vehicleId)await fleetService.getById(input.vehicleId,actor);
    // External users may only raise tickets for their own organization.
    const requestingOrgId = isInternalTicketActor(actor)
      ? input.requestingOrgId ?? actor.organizationId ?? null
      : actor.organizationId ?? null;

    const ticket = await prisma.$transaction(async (tx) => {
      const ticketNumber = await nextTicketNumber(tx);
      const created = await tx.ticket.create({
        data: {
          ticketNumber,
          type: input.type,
          subject: input.subject,
          description: input.description,
          priority: input.priority,
          requesterId: actor.id,
          requestingOrgId,
          requiredDate: input.requiredDate,
          sourceDepotId: input.sourceDepotId,
          destinationDepotId: input.destinationDepotId,
          requestedTypeId: input.requestedTypeId,
          requestedQuantity: input.requestedQuantity,
          vehicleId: input.vehicleId,
          details: input.details as Prisma.InputJsonValue | undefined,
          status: 'DRAFT',
          approvalStatus: 'NOT_SUBMITTED',
        },
      });
      await logActivity(tx, created.id, actor, 'CREATED', `Ticket ${ticketNumber} created`);
      return created;
    });
    await writeAudit({
      actorId: actor.id,
      action: 'TICKET_CREATED',
      entityType: 'Ticket',
      entityId: ticket.id,
      metadata: { ticketNumber: ticket.ticketNumber, type: ticket.type },
    });
    const refs = await resolveRefs([ticket]);
    return decorate(ticket, refs);
  },

  async update(id: string, input: UpdateTicketInput, actor: AuthenticatedUser) {
    const ticket = await loadScoped(id, actor);
    if(input.vehicleId)await fleetService.getById(input.vehicleId,actor);
    if (ticket.status !== 'DRAFT' && ticket.status !== 'INFO_REQUIRED') {
      throw ApiError.badRequest('Only draft or info-required tickets can be edited');
    }
    if (ticket.requesterId !== actor.id && !isInternalTicketActor(actor)) {
      throw ApiError.forbidden('You cannot edit this ticket');
    }
    const updated = await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM tickets WHERE id=${id} FOR UPDATE`;
      const current=await tx.ticket.findUniqueOrThrow({where:{id}});
      if(!['DRAFT','INFO_REQUIRED'].includes(current.status))throw ApiError.conflict('Ticket approval has already started');
      if(current.status==='INFO_REQUIRED'&&await tx.ticketApproval.count({where:{ticketId:id,state:'APPROVED'}}))throw ApiError.conflict('Earlier steps approved this request. Provide information in comments or create a revised ticket for material changes.');
      return tx.ticket.update({
      where: { id },
      data: {
        subject: input.subject,
        description: input.description,
        priority: input.priority,
        requiredDate: input.requiredDate,
        sourceDepotId: input.sourceDepotId,
        destinationDepotId: input.destinationDepotId,
        requestedTypeId: input.requestedTypeId,
        requestedQuantity: input.requestedQuantity,
        vehicleId: input.vehicleId,
        details: input.details as Prisma.InputJsonValue | undefined,
      },
    });
    });
    const refs = await resolveRefs([updated]);
    return decorate(updated, refs);
  },

  /** Prevent a second non-terminal ticket of the same type for a vehicle. */
  async assertNoDuplicate(ticket: { id: string; type: TicketType; vehicleId: string | null }) {
    if (!ticket.vehicleId || !VEHICLE_DUP_TYPES.includes(ticket.type)) return;
    const dup = await prisma.ticket.findFirst({
      where: {
        id: { not: ticket.id },
        type: ticket.type,
        vehicleId: ticket.vehicleId,
        status: { in: NON_TERMINAL },
      },
    });
    if (dup) {
      throw ApiError.conflict(
        `An active ${ticket.type} ticket (${dup.ticketNumber}) already exists for this vehicle`,
      );
    }
  },

  async submit(id: string, actor: AuthenticatedUser) {
    const existing = await loadScoped(id, actor);
    if (existing.status !== 'DRAFT' && existing.status !== 'INFO_REQUIRED') {
      throw ApiError.badRequest('Only draft or info-required tickets can be submitted');
    }
    if (existing.requesterId !== actor.id && !isInternalTicketActor(actor)) {
      throw ApiError.forbidden('You cannot submit this ticket');
    }
    await this.assertNoDuplicate(existing);

    const orgType = existing.requestingOrgId
      ? (await prisma.organization.findUnique({
          where: { id: existing.requestingOrgId },
          select: { type: true },
        }))?.type ?? null
      : null;

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tickets WHERE id=${id} FOR UPDATE`;
      const current=await tx.ticket.findUniqueOrThrow({where:{id}});
      if(current.status!==existing.status || current.updatedAt.getTime()!==existing.updatedAt.getTime())throw ApiError.conflict('Ticket changed; reload before submitting');
      // Resuming from INFO_REQUIRED keeps existing approvals; a fresh submit
      // builds the approval chain from the resolved workflow.
      if (existing.status === 'INFO_REQUIRED') {
        await tx.ticket.update({
          where: { id },
          data: { status: 'PENDING_APPROVAL', approvalStatus: 'PENDING' },
        });
        // Re-open the current step if it was marked INFO_REQUESTED.
        await tx.ticketApproval.updateMany({
          where: { ticketId: id, order: existing.currentStep, state: 'INFO_REQUESTED' },
          data: { state: 'PENDING', decision: null },
        });
        await logActivity(tx, id, actor, 'RESUBMITTED', 'Ticket resubmitted after providing information');
        return tx.ticket.findUniqueOrThrow({ where: { id } });
      }

      const workflow = await approvalsService.resolveWorkflow(existing.type, orgType, tx);
      const sla = await tx.ticketSLA.findUnique({
        where: {
          ticketType_priority: { ticketType: existing.type, priority: existing.priority },
        },
      });
      const now = new Date();
      const approvalDueAt = sla?.firstApprovalHours
        ? new Date(now.getTime() + sla.firstApprovalHours * 3_600_000)
        : null;
      const resolutionDueAt = sla?.resolutionHours
        ? new Date(now.getTime() + sla.resolutionHours * 3_600_000)
        : null;

      if (!workflow) {
        // No approval required — straight to APPROVED.
        const updated = await tx.ticket.update({
          where: { id },
          data: {
            status: 'APPROVED',
            approvalStatus: 'APPROVED',
            workflowId: null,
            currentStep: 0,
            submittedAt: now,
            firstApprovalAt: now,
            finalApprovalAt: now,
            resolutionDueAt,
          },
        });
        await logActivity(tx, id, actor, 'SUBMITTED', 'Ticket submitted (no approval required) and auto-approved');
        return updated;
      }

      await tx.ticketApproval.deleteMany({ where: { ticketId: id } });
      for (const step of workflow.steps) {
        await tx.ticketApproval.create({
          data: {
            ticketId: id,
            order: step.order,
            stepName: step.name,
            approverRoleName: step.approverRoleName,
            state: 'PENDING',
            slaDueAt: step.slaHours
              ? new Date(now.getTime() + step.slaHours * 3_600_000)
              : null,
          },
        });
      }
      const first = workflow.steps[0];
      const updated = await tx.ticket.update({
        where: { id },
        data: {
          status: 'PENDING_APPROVAL',
          approvalStatus: 'PENDING',
          workflowId: workflow.id,
          currentStep: first.order,
          submittedAt: now,
          approvalDueAt,
          resolutionDueAt,
        },
      });
      await logActivity(tx, id, actor, 'SUBMITTED', `Ticket submitted for approval (${workflow.name})`);

      // Notify first-step approvers.
      const approverIds = await approvalsService.approverUserIds(first.approverRoleName, tx);
      await notificationsService.notifyMany(
        approverIds.filter((uid) => uid !== actor.id || workflow.allowSelfApproval),
        {
          type: 'APPROVAL_REQUIRED',
          title: `Approval required: ${updated.ticketNumber}`,
          body: `${updated.subject} — step "${first.name}"`,
          ticketId: id,
        },
        tx,
      );
      return updated;
    });

    await writeAudit({
      actorId: actor.id,
      action: 'TICKET_SUBMITTED',
      entityType: 'Ticket',
      entityId: id,
    });
    const refs = await resolveRefs([result]);
    return decorate(result, refs);
  },

  /** Approve / reject / request-info on the current step (the workflow engine). */
  async decide(
    id: string,
    decision: ApprovalDecision,
    comment: string | undefined,
    actor: AuthenticatedUser,
  ) {
    if (decision === 'REJECTED' && !comment?.trim()) {
      throw ApiError.badRequest('A reason is required to reject a ticket');
    }
    if (decision === 'INFO_REQUESTED' && !comment?.trim()) {
      throw ApiError.badRequest('A message is required when requesting information');
    }

    const result = await prisma.$transaction(async (tx) => {
      // Lock the ticket row to serialize concurrent decisions.
      await tx.$queryRaw`SELECT id FROM tickets WHERE id = ${id} FOR UPDATE`;
      const ticket = await tx.ticket.findUnique({ where: { id } });
      if (!ticket) throw ApiError.notFound('Ticket not found');
      if (ticket.status !== 'PENDING_APPROVAL' || ticket.approvalStatus !== 'PENDING') {
        throw ApiError.badRequest('Ticket is not awaiting approval');
      }
      const workflow = ticket.workflowId
        ? await tx.approvalWorkflow.findUnique({ where: { id: ticket.workflowId } })
        : null;
      // Self-approval guard.
      if (
        ticket.requesterId === actor.id &&
        !workflow?.allowSelfApproval &&
        actor.role.name !== 'SUPER_ADMIN'
      ) {
        throw ApiError.forbidden('You cannot approve your own request');
      }
      const step = await tx.ticketApproval.findFirst({
        where: { ticketId: id, order: ticket.currentStep },
      });
      if (!step || step.state !== 'PENDING') {
        throw ApiError.badRequest('No pending approval step');
      }
      if (!canActOnStep(actor, step)) {
        throw ApiError.forbidden('You are not authorized to act on this approval step');
      }

      const now = new Date();
      const firstApprovalAt = ticket.firstApprovalAt ?? (decision === 'APPROVED' ? now : null);

      if (decision === 'REJECTED') {
        await tx.ticketApproval.update({
          where: { id: step.id },
          data: { state: 'REJECTED', decision, decidedById: actor.id, comment, decidedAt: now },
        });
        const updated = await tx.ticket.update({
          where: { id },
          data: { status: 'REJECTED', approvalStatus: 'REJECTED', firstApprovalAt },
        });
        await logActivity(tx, id, actor, 'APPROVAL_DECISION', `Rejected at step "${step.stepName}": ${comment}`);
        await notificationsService.notify(
          { userId: ticket.requesterId, type: 'TICKET_REJECTED', title: `Ticket ${ticket.ticketNumber} rejected`, body: comment, ticketId: id },
          tx,
        );
        return updated;
      }

      if (decision === 'INFO_REQUESTED') {
        await tx.ticketApproval.update({
          where: { id: step.id },
          data: { state: 'INFO_REQUESTED', decision, decidedById: actor.id, comment, decidedAt: now },
        });
        const updated = await tx.ticket.update({
          where: { id },
          data: { status: 'INFO_REQUIRED', approvalStatus: 'INFO_REQUESTED', firstApprovalAt },
        });
        await logActivity(tx, id, actor, 'INFO_REQUESTED', `Information requested at step "${step.stepName}": ${comment}`);
        await notificationsService.notify(
          { userId: ticket.requesterId, type: 'INFO_REQUESTED', title: `More information needed: ${ticket.ticketNumber}`, body: comment, ticketId: id },
          tx,
        );
        return updated;
      }

      // APPROVED
      await tx.ticketApproval.update({
        where: { id: step.id },
        data: { state: 'APPROVED', decision, decidedById: actor.id, comment, decidedAt: now },
      });
      const nextStep = await tx.ticketApproval.findFirst({
        where: { ticketId: id, order: { gt: ticket.currentStep } },
        orderBy: { order: 'asc' },
      });
      if (nextStep) {
        const updated = await tx.ticket.update({
          where: { id },
          data: { currentStep: nextStep.order, firstApprovalAt },
        });
        await logActivity(tx, id, actor, 'APPROVAL_DECISION', `Approved step "${step.stepName}"`);
        const approverIds = await approvalsService.approverUserIds(nextStep.approverRoleName, tx);
        await notificationsService.notifyMany(
          approverIds,
          { type: 'APPROVAL_REQUIRED', title: `Approval required: ${ticket.ticketNumber}`, body: `Step "${nextStep.stepName}"`, ticketId: id },
          tx,
        );
        return updated;
      }
      // Final approval.
      const updated = await tx.ticket.update({
        where: { id },
        data: { status: 'APPROVED', approvalStatus: 'APPROVED', firstApprovalAt, finalApprovalAt: now },
      });
      await logActivity(tx, id, actor, 'APPROVAL_DECISION', `Final approval granted at step "${step.stepName}"`);
      await notificationsService.notify(
        { userId: ticket.requesterId, type: 'TICKET_APPROVED', title: `Ticket ${ticket.ticketNumber} approved`, body: 'Your request has been fully approved.', ticketId: id },
        tx,
      );
      return updated;
    });

    await writeAudit({
      actorId: actor.id,
      action: `TICKET_${decision}`,
      entityType: 'Ticket',
      entityId: id,
      metadata: { decision },
    });
    const refs = await resolveRefs([result]);
    return decorate(result, refs);
  },

  async reassignApprover(
    id: string,
    approverId: string,
    note: string | undefined,
    actor: AuthenticatedUser,
  ) {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tickets WHERE id = ${id} FOR UPDATE`;
      const ticket = await tx.ticket.findUnique({ where: { id } });
      if (!ticket) throw ApiError.notFound('Ticket not found');
      if (ticket.approvalStatus !== 'PENDING') {
        throw ApiError.badRequest('Only pending approvals can be reassigned');
      }
      const approver = await tx.user.findUnique({
        where: { id: approverId },
        select: { id: true, fullName: true, status: true },
      });
      if (!approver || approver.status !== 'ACTIVE') {
        throw ApiError.badRequest('Approver not found or inactive');
      }
      const step = await tx.ticketApproval.findFirst({
        where: { ticketId: id, order: ticket.currentStep, state: 'PENDING' },
      });
      if (!step) throw ApiError.badRequest('No pending approval step');
      if(!canActOnStep(actor,step))throw ApiError.forbidden('You do not control this approval step');
      const target=await tx.user.findUnique({where:{id:approverId},include:{role:{include:{permissions:{include:{permission:true}}}}}});
      if(target?.role.name!==step.approverRoleName||!target.role.permissions.some(p=>p.permission.key==='tickets:approve'))throw ApiError.forbidden('Replacement approver must hold the required approval role and permission');
      if(approverId===ticket.requesterId)throw ApiError.forbidden('Cannot reassign approval to the requester');
      await tx.ticketApproval.update({
        where: { id: step.id },
        data: { assignedApproverId: approverId },
      });
      await logActivity(tx, id, actor, 'APPROVER_REASSIGNED', `Approval reassigned to ${approver.fullName}${note ? `: ${note}` : ''}`);
      await notificationsService.notify(
        { userId: approverId, type: 'APPROVAL_REQUIRED', title: `Approval assigned to you: ${ticket.ticketNumber}`, body: step.stepName, ticketId: id },
        tx,
      );
      return tx.ticket.findUniqueOrThrow({ where: { id } });
    });
    const refs = await resolveRefs([result]);
    return decorate(result, refs);
  },

  /** Flag/notify an overdue pending approval (escalation). */
  async escalate(id: string, actor: AuthenticatedUser) {
    const ticket = await loadScoped(id, actor);
    if (ticket.approvalStatus !== 'PENDING') {
      throw ApiError.badRequest('Only pending approvals can be escalated');
    }
    const step = await prisma.ticketApproval.findFirst({
      where: { ticketId: id, order: ticket.currentStep, state: 'PENDING' },
    });
    const overdue = step?.slaDueAt ? step.slaDueAt.getTime() < Date.now() : false;
    await prisma.$transaction(async (tx) => {
      await logActivity(tx, id, actor, 'ESCALATED', `Approval escalated${overdue ? ' (SLA breached)' : ''}`, { isInternal: true });
      // Notify admins (JSAN_ADMIN) to intervene.
      const adminIds = await approvalsService.approverUserIds('JSAN_ADMIN', tx);
      await notificationsService.notifyMany(
        adminIds,
        { type: 'TICKET_OVERDUE', title: `Escalation: ${ticket.ticketNumber}`, body: 'An approval has been escalated.', ticketId: id },
        tx,
      );
    });
    return { escalated: true, overdue };
  },

  async assign(
    id: string,
    input: { assignedToId?: string; assignedTeam?: string; note?: string },
    actor: AuthenticatedUser,
  ) {
    const ticket = await loadScoped(id, actor);
    if (input.assignedToId) {
      const u = await prisma.user.findUnique({
        where: { id: input.assignedToId },
        select: { id: true, fullName: true, status: true },
      });
      if (!u || u.status !== 'ACTIVE') throw ApiError.badRequest('Assignee not found or inactive');
    }
    const reassigning = Boolean(ticket.assignedToId);
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.update({
        where: { id },
        data: { assignedToId: input.assignedToId ?? null, assignedTeam: input.assignedTeam ?? null },
      });
      await tx.ticketAssignment.create({
        data: {
          ticketId: id,
          assignedToId: input.assignedToId,
          assignedTeam: input.assignedTeam,
          assignedById: actor.id,
          note: input.note,
        },
      });
      await logActivity(tx, id, actor, reassigning ? 'REASSIGNED' : 'ASSIGNED', `Ticket ${reassigning ? 'reassigned' : 'assigned'}${input.note ? `: ${input.note}` : ''}`, { isInternal: true });
      if (input.assignedToId) {
        await notificationsService.notify(
          { userId: input.assignedToId, type: reassigning ? 'TICKET_REASSIGNED' : 'TICKET_ASSIGNED', title: `Ticket assigned: ${updated.ticketNumber}`, body: updated.subject, ticketId: id },
          tx,
        );
      }
      return updated;
    });
    const refs = await resolveRefs([result]);
    return decorate(result, refs);
  },

  async comment(
    id: string,
    body: string,
    isInternal: boolean,
    actor: AuthenticatedUser,
  ) {
    const ticket = await loadScoped(id, actor);
    // External users cannot post internal comments.
    const internalFlag = isInternal && isInternalTicketActor(actor);
    const created = await prisma.$transaction(async (tx) => {
      const c = await tx.ticketComment.create({
        data: { ticketId: id, authorId: actor.id, body, isInternal: internalFlag },
      });
      await logActivity(tx, id, actor, 'COMMENT', internalFlag ? 'Internal comment added' : 'Comment added', { isInternal: internalFlag });
      // Notify the other party.
      const recipients = internalFlag
        ? (ticket.assignedToId ? [ticket.assignedToId] : [])
        : [ticket.requesterId, ticket.assignedToId].filter((u) => u && u !== actor.id) as string[];
      await notificationsService.notifyMany(
        recipients,
        { type: 'TICKET_COMMENT', title: `New comment on ${ticket.ticketNumber}`, ticketId: id },
        tx,
      );
      return c;
    });
    const author = { id: actor.id, fullName: actor.fullName };
    return { ...created, authorName: author.fullName };
  },

  async changeStatus(
    id: string,
    status: TicketStatus,
    reason: string | undefined,
    actor: AuthenticatedUser,
  ) {
    const ticket = await loadScoped(id, actor);
    const isRequester = ticket.requesterId === actor.id;

    // Cancellation: requester (own ticket) or managers; only while non-terminal.
    if (status === 'CANCELLED') {
      if (!isRequester && !actor.permissions.includes('tickets:manage')) {
        throw ApiError.forbidden('You cannot cancel this ticket');
      }
    } else if (!actor.permissions.includes('tickets:manage')) {
      throw ApiError.forbidden('Managing ticket status requires tickets:manage');
    }
    if (!canManualTransition(ticket.status, status)) {
      throw ApiError.badRequest(`Invalid status transition: ${ticket.status} → ${status}`);
    }
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tickets WHERE id=${id} FOR UPDATE`;
      const current=await tx.ticket.findUniqueOrThrow({where:{id}});
      if(current.status!==ticket.status)throw ApiError.conflict('Ticket changed; reload first');
      if(['CANCELLED','CLOSED','COMPLETED'].includes(status)&&await tx.vehicleAllocationItem.count({where:{allocation:{ticketId:id},cancelledAt:null,...(status==='CANCELLED'?{}:{dispatchVehicles:{none:{dispatch:{trip:{status:'DELIVERED'}}}}})}}))throw ApiError.conflict('Allocated ticket fulfillment must be resolved through allocation and trip operations');
      const updated = await tx.ticket.update({
        where: { id },
        data: {
          status,
          completedAt: status === 'COMPLETED' ? now : ticket.completedAt,
          closedAt: status === 'CLOSED' ? now : ticket.closedAt,
        },
      });
      await logActivity(tx, id, actor, 'STATUS_CHANGED', `Status changed to ${status}${reason ? `: ${reason}` : ''}`);
      const notifType = status === 'COMPLETED' ? 'TICKET_COMPLETED' : 'TICKET_STATUS_CHANGED';
      if (ticket.requesterId !== actor.id) {
        await notificationsService.notify(
          { userId: ticket.requesterId, type: notifType, title: `Ticket ${ticket.ticketNumber}: ${status}`, body: reason, ticketId: id },
          tx,
        );
      }
      return updated;
    });
    await writeAudit({ actorId: actor.id, action: 'TICKET_STATUS_CHANGED', entityType: 'Ticket', entityId: id, metadata: { status } });
    const refs = await resolveRefs([result]);
    return decorate(result, refs);
  },

  /**
   * Inventory availability for a ticket (read-only integration — never
   * reserves). Returns aggregate available counts by depot for the requested
   * type, plus per-vehicle availability when a specific vehicle is referenced.
   */
  async availability(
    opts: { typeId?: string; depotId?: string },
    actor: AuthenticatedUser,
  ) {
    await inventoryService.dashboard(actor); // settle scoped reservation expiry through the central service
    const where: Prisma.VehicleInventoryWhereInput = {
      AND:[inventoryScope(actor)],
      inInventory: true,
      currentDepotId: opts.depotId ? opts.depotId : { not: null },
      currentCustodianType: { not: 'VENDOR' },
      activeReservationId: null,
      vehicle: {
        status: 'AVAILABLE',
        isActive: true,
        ...(opts.typeId ? { typeId: opts.typeId } : {}),
      },
    };
    const rows = await prisma.vehicleInventory.findMany({
      where,
      select: { currentDepotId: true, vehicle: { select: { typeId: true } } },
    });
    const byDepot = new Map<string, number>();
    for (const r of rows) {
      if (!r.currentDepotId) continue;
      byDepot.set(r.currentDepotId, (byDepot.get(r.currentDepotId) ?? 0) + 1);
    }
    const depots = await prisma.depot.findMany({
      where: { id: { in: [...byDepot.keys()] } },
      select: { id: true, name: true, code: true },
    });
    const dmap = new Map(depots.map((d) => [d.id, d]));
    return {
      totalAvailable: rows.length,
      byDepot: [...byDepot.entries()].map(([depotId, count]) => ({
        depotId,
        depotName: dmap.get(depotId)?.name ?? 'Unknown',
        count,
      })),
    };
  },

  // --- Dashboard & SLA ------------------------------------------------------
  async dashboard(actor: AuthenticatedUser) {
    const scope = ticketScope(actor);
    const now = new Date();
    const [byStatus, byType, byPriority, total, overdueApproval, overdueResolution, approvalTimes] =
      await Promise.all([
        prisma.ticket.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
        prisma.ticket.groupBy({ by: ['type'], where: scope, _count: { _all: true } }),
        prisma.ticket.groupBy({ by: ['priority'], where: scope, _count: { _all: true } }),
        prisma.ticket.count({ where: scope }),
        prisma.ticket.count({ where: { AND: [scope, { approvalStatus: 'PENDING', approvalDueAt: { lt: now } }] } }),
        prisma.ticket.count({ where: { AND: [scope, { status: { in: ['APPROVED', 'IN_PROGRESS', 'ON_HOLD'] }, resolutionDueAt: { lt: now } }] } }),
        prisma.ticket.findMany({
          where: { AND: [scope, { submittedAt: { not: null }, finalApprovalAt: { not: null } }] },
          select: { submittedAt: true, finalApprovalAt: true },
          take: 500,
        }),
      ]);

    // Tickets by organization (resolve names).
    const orgGroups = await prisma.ticket.groupBy({
      by: ['requestingOrgId'],
      where: scope,
      _count: { _all: true },
    });
    const orgs = await prisma.organization.findMany({
      where: { id: { in: orgGroups.map((g) => g.requestingOrgId).filter(Boolean) as string[] } },
      select: { id: true, name: true },
    });
    const omap = new Map(orgs.map((o) => [o.id, o.name]));

    const avgApprovalHours =
      approvalTimes.length > 0
        ? approvalTimes.reduce((sum, t) => sum + (t.finalApprovalAt!.getTime() - t.submittedAt!.getTime()), 0) /
          approvalTimes.length / 3_600_000
        : 0;

    const count = (key: string) =>
      byStatus.find((s) => s.status === key)?._count._all ?? 0;

    return {
      total,
      cards: {
        total,
        pendingApproval: count('PENDING_APPROVAL'),
        approved: count('APPROVED'),
        inProgress: count('IN_PROGRESS'),
        completed: count('COMPLETED'),
        rejected: count('REJECTED'),
        overdue: overdueApproval + overdueResolution,
      },
      byStatus: byStatus.map((s) => ({ label: s.status, count: s._count._all })),
      byType: byType.map((t) => ({ label: t.type, count: t._count._all })),
      byPriority: byPriority.map((p) => ({ label: p.priority, count: p._count._all })),
      byOrganization: orgGroups.map((g) => ({
        label: g.requestingOrgId ? omap.get(g.requestingOrgId) ?? 'Unknown' : 'Unassigned',
        count: g._count._all,
      })),
      avgApprovalHours: Math.round(avgApprovalHours * 10) / 10,
    };
  },

  async slaReport(actor: AuthenticatedUser) {
    const scope = ticketScope(actor);
    const now = new Date();
    const tickets = await prisma.ticket.findMany({
      where: { AND: [scope, { submittedAt: { not: null } }] },
      orderBy: { submittedAt: 'desc' },
      take: 500,
    });
    const refs = await resolveRefs(tickets);
    const rows = tickets.map((t) => {
      const approvalBreach =
        t.approvalDueAt != null &&
        (t.finalApprovalAt
          ? t.finalApprovalAt > t.approvalDueAt
          : t.approvalStatus === 'PENDING' && t.approvalDueAt < now);
      const resolutionBreach =
        t.resolutionDueAt != null &&
        (t.completedAt
          ? t.completedAt > t.resolutionDueAt
          : !isTerminal(t.status) && t.resolutionDueAt < now);
      return {
        ...decorate(t, refs),
        approvalBreach,
        resolutionBreach,
        approvalHours:
          t.submittedAt && t.finalApprovalAt
            ? Math.round(((t.finalApprovalAt.getTime() - t.submittedAt.getTime()) / 3_600_000) * 10) / 10
            : null,
      };
    });
    return {
      total: rows.length,
      approvalBreaches: rows.filter((r) => r.approvalBreach).length,
      resolutionBreaches: rows.filter((r) => r.resolutionBreach).length,
      rows,
    };
  },
};
