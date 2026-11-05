import type { AuthenticatedUser } from '../../types/auth';
import type { Prisma, TicketStatus } from '@prisma/client';

/**
 * Operational ticket status transitions (kept separate from approval state).
 *
 * Approval-driven statuses (SUBMITTED, PENDING_APPROVAL, INFO_REQUIRED,
 * APPROVED, REJECTED) are set by the submit/approve/reject/request-info flows,
 * NOT by the manual status endpoint. The manual endpoint only permits the
 * operational transitions below.
 */
export const MANUAL_STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  DRAFT: ['CANCELLED'],
  SUBMITTED: ['CANCELLED'],
  PENDING_APPROVAL: ['CANCELLED'],
  INFO_REQUIRED: ['CANCELLED'],
  APPROVED: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED', 'CLOSED'],
  IN_PROGRESS: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
  ON_HOLD: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  COMPLETED: ['CLOSED'],
  REJECTED: ['CLOSED'],
  CANCELLED: [],
  CLOSED: [],
};

export function canManualTransition(
  from: TicketStatus,
  to: TicketStatus,
): boolean {
  return MANUAL_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Terminal statuses can no longer change. */
export const TERMINAL_STATUSES: TicketStatus[] = [
  'CANCELLED',
  'CLOSED',
  'REJECTED',
];

export function isTerminal(status: TicketStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Internal staff (anyone who can approve or manage tickets) see every ticket so
 * they can review/act. External users (CTS requesters, vendors) are restricted
 * to tickets they raised or that belong to their organization — this is the
 * organization-level isolation boundary (a vendor can never see another
 * vendor's tickets).
 */
export function isInternalTicketActor(actor: AuthenticatedUser): boolean {
  return (
    actor.permissions.includes('tickets:manage') ||
    actor.permissions.includes('tickets:approve')
  );
}

export function ticketScope(actor: AuthenticatedUser): Prisma.TicketWhereInput {
  if (isInternalTicketActor(actor)) return {};
  return {
    OR: [
      { requesterId: actor.id },
      ...(actor.organizationId
        ? [{ requestingOrgId: actor.organizationId }]
        : []),
    ],
  };
}

/** Super admins may act on any approval step; others must match the role. */
export function canActOnStep(
  actor: AuthenticatedUser,
  step: { approverRoleName: string; assignedApproverId: string | null },
): boolean {
  if (actor.role.name === 'SUPER_ADMIN') return true;
  if (step.assignedApproverId) return step.assignedApproverId === actor.id;
  return actor.role.name === step.approverRoleName;
}
