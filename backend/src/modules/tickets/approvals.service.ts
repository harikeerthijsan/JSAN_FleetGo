import type {
  OrganizationType,
  Prisma,
  PrismaClient,
  TicketType,
} from '@prisma/client';
import { prisma } from '../../database/prisma';
import type { AuthenticatedUser } from '../../types/auth';
import { ApiError } from '../../utils/ApiError';
import type { SlaInput, WorkflowInput } from './tickets.validators';

type Tx = Prisma.TransactionClient | PrismaClient;

const workflowInclude = {
  steps: { orderBy: { order: 'asc' } },
} satisfies Prisma.ApprovalWorkflowInclude;

export const approvalsService = {
  // --- Workflow configuration ----------------------------------------------
  async listWorkflows() {
    return prisma.approvalWorkflow.findMany({
      include: workflowInclude,
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  },

  async getWorkflow(id: string) {
    const wf = await prisma.approvalWorkflow.findUnique({
      where: { id },
      include: workflowInclude,
    });
    if (!wf) throw ApiError.notFound('Workflow not found');
    return wf;
  },

  async createWorkflow(input: WorkflowInput, actor: AuthenticatedUser) {
    return prisma.approvalWorkflow.create({
      data: {
        name: input.name,
        description: input.description,
        ticketType: input.ticketType ?? null,
        organizationType: (input.organizationType ?? null) as OrganizationType | null,
        allowSelfApproval: input.allowSelfApproval ?? false,
        isActive: input.isActive ?? true,
        isDefault: input.isDefault ?? false,
        createdById: actor.id,
        steps: {
          create: input.steps.map((s, i) => ({
            order: i + 1,
            name: s.name,
            approverRoleName: s.approverRoleName,
            slaHours: s.slaHours,
          })),
        },
      },
      include: workflowInclude,
    });
  },

  async updateWorkflow(id: string, input: WorkflowInput) {
    await this.getWorkflow(id);
    // Replace steps wholesale to keep ordering coherent.
    return prisma.$transaction(async (tx) => {
      await tx.approvalWorkflowStep.deleteMany({ where: { workflowId: id } });
      return tx.approvalWorkflow.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description,
          ticketType: input.ticketType ?? null,
          organizationType: (input.organizationType ?? null) as OrganizationType | null,
          allowSelfApproval: input.allowSelfApproval ?? false,
          isActive: input.isActive ?? true,
          isDefault: input.isDefault ?? false,
          steps: {
            create: input.steps.map((s, i) => ({
              order: i + 1,
              name: s.name,
              approverRoleName: s.approverRoleName,
              slaHours: s.slaHours,
            })),
          },
        },
        include: workflowInclude,
      });
    });
  },

  /**
   * Resolve the workflow that applies to a ticket: the most specific active
   * workflow matching the ticket type (and requesting organization type when
   * the workflow constrains it), falling back to a type-agnostic default.
   * Returns null when no workflow applies (ticket needs no approval).
   */
  async resolveWorkflow(
    type: TicketType,
    orgType: OrganizationType | null,
    tx: Tx = prisma,
  ) {
    const candidates = await tx.approvalWorkflow.findMany({
      where: {
        isActive: true,
        OR: [{ ticketType: type }, { ticketType: null }],
      },
      include: workflowInclude,
    });
    const applies = candidates.filter(
      (w) => !w.organizationType || w.organizationType === orgType,
    );
    // Prefer type-specific, then org-specific, then default, then any.
    const score = (w: (typeof applies)[number]) =>
      (w.ticketType === type ? 2 : 0) +
      (w.organizationType === orgType && orgType ? 1 : 0) +
      (w.isDefault ? 0.5 : 0);
    applies.sort((a, b) => score(b) - score(a));
    const chosen = applies[0];
    return chosen && chosen.steps.length > 0 ? chosen : null;
  },

  // --- SLA configuration ----------------------------------------------------
  async listSlas() {
    return prisma.ticketSLA.findMany({
      orderBy: [{ ticketType: 'asc' }, { priority: 'asc' }],
    });
  },

  async upsertSla(input: SlaInput) {
    return prisma.ticketSLA.upsert({
      where: {
        ticketType_priority: {
          ticketType: input.ticketType,
          priority: input.priority,
        },
      },
      update: {
        firstApprovalHours: input.firstApprovalHours,
        resolutionHours: input.resolutionHours,
        isActive: input.isActive ?? true,
      },
      create: {
        ticketType: input.ticketType,
        priority: input.priority,
        firstApprovalHours: input.firstApprovalHours,
        resolutionHours: input.resolutionHours,
        isActive: input.isActive ?? true,
      },
    });
  },

  async typeConfigs() {
    return prisma.ticketTypeConfig.findMany({ orderBy: { type: 'asc' } });
  },

  /** Active users holding the step's approver role (for notifications). */
  async approverUserIds(
    roleName: string,
    tx: Tx = prisma,
  ): Promise<string[]> {
    const users = await tx.user.findMany({
      where: { status: 'ACTIVE', role: { name: roleName } },
      select: { id: true },
    });
    return users.map((u) => u.id);
  },

  /**
   * Approval inbox: tickets whose CURRENT pending step this user may act on.
   */
  async inbox(actor: AuthenticatedUser) {
    const pending = await prisma.ticket.findMany({
      where: { approvalStatus: 'PENDING', status: 'PENDING_APPROVAL' },
      include: {
        approvals: { orderBy: { order: 'asc' } },
      },
      orderBy: { submittedAt: 'asc' },
    });
    const isSuper = actor.role.name === 'SUPER_ADMIN';
    return pending.filter((t) => {
      const step = t.approvals.find(
        (a) => a.order === t.currentStep && a.state === 'PENDING',
      );
      if (!step) return false;
      if (isSuper) return true;
      if (step.assignedApproverId) return step.assignedApproverId === actor.id;
      return step.approverRoleName === actor.role.name;
    });
  },
};
