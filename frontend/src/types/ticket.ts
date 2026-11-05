/** Ticketing & Approvals types mirroring the backend contracts. */

export type TicketType =
  | 'NEW_VEHICLE'
  | 'DELIVERY'
  | 'PICKUP'
  | 'TRANSFER'
  | 'RETURN'
  | 'MAINTENANCE'
  | 'DAMAGE_INCIDENT'
  | 'REPLACEMENT'
  | 'GENERAL';

export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type TicketStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING_APPROVAL'
  | 'INFO_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'IN_PROGRESS'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'CLOSED';

export type ApprovalStatus =
  | 'NOT_SUBMITTED'
  | 'PENDING'
  | 'INFO_REQUESTED'
  | 'APPROVED'
  | 'REJECTED';

export type ApprovalDecision = 'APPROVED' | 'REJECTED' | 'INFO_REQUESTED';

export const TICKET_TYPES: TicketType[] = [
  'NEW_VEHICLE', 'DELIVERY', 'PICKUP', 'TRANSFER', 'RETURN',
  'MAINTENANCE', 'DAMAGE_INCIDENT', 'REPLACEMENT', 'GENERAL',
];
export const TICKET_PRIORITIES: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

interface NamedRef { id: string; name?: string; fullName?: string; vehicleCode?: string; code?: string }

export interface Ticket {
  id: string;
  ticketNumber: string;
  type: TicketType;
  subject: string;
  description: string | null;
  priority: TicketPriority;
  requesterId: string;
  requestingOrgId: string | null;
  requestDate: string;
  requiredDate: string | null;
  sourceDepotId: string | null;
  destinationDepotId: string | null;
  requestedTypeId: string | null;
  requestedQuantity: number | null;
  vehicleId: string | null;
  details: Record<string, unknown> | null;
  status: TicketStatus;
  approvalStatus: ApprovalStatus;
  workflowId: string | null;
  currentStep: number;
  assignedToId: string | null;
  assignedTeam: string | null;
  approvalDueAt: string | null;
  resolutionDueAt: string | null;
  firstApprovalAt: string | null;
  finalApprovalAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  overdue?: boolean;
  requester?: NamedRef | null;
  assignedTo?: NamedRef | null;
  requestingOrg?: NamedRef | null;
  sourceDepot?: NamedRef | null;
  destinationDepot?: NamedRef | null;
  requestedType?: NamedRef | null;
  vehicle?: NamedRef | null;
}

export interface TicketApproval {
  id: string;
  order: number;
  stepName: string;
  approverRoleName: string;
  assignedApproverId: string | null;
  state: 'PENDING' | 'APPROVED' | 'REJECTED' | 'INFO_REQUESTED' | 'SKIPPED';
  decision: ApprovalDecision | null;
  decidedById: string | null;
  decidedByName: string | null;
  comment: string | null;
  decidedAt: string | null;
  slaDueAt: string | null;
}

export interface TicketComment {
  id: string;
  authorId: string;
  authorName: string | null;
  body: string;
  isInternal: boolean;
  createdAt: string;
}

export interface TicketActivity {
  id: string;
  type: string;
  actorId: string | null;
  actorName: string | null;
  summary: string;
  isInternal: boolean;
  createdAt: string;
}

export interface TicketAttachment {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  isInternal: boolean;
  createdAt: string;
}

export interface TicketDetails extends Ticket {
  allocationSummary?: {requested:number;allocated:number;pending:number};
  approvals: TicketApproval[];
  comments: TicketComment[];
  attachments: TicketAttachment[];
  activities: TicketActivity[];
  assignments: { id: string; assignedToId: string | null; assignedTeam: string | null; note: string | null; createdAt: string }[];
}

export interface TicketDashboard {
  total: number;
  cards: {
    total: number;
    pendingApproval: number;
    approved: number;
    inProgress: number;
    completed: number;
    rejected: number;
    overdue: number;
  };
  byStatus: { label: string; count: number }[];
  byType: { label: string; count: number }[];
  byPriority: { label: string; count: number }[];
  byOrganization: { label: string; count: number }[];
  avgApprovalHours: number;
}

export interface WorkflowStep {
  id?: string;
  order?: number;
  name: string;
  approverRoleName: string;
  slaHours?: number | null;
}

export interface ApprovalWorkflow {
  id: string;
  name: string;
  description: string | null;
  ticketType: TicketType | null;
  organizationType: string | null;
  allowSelfApproval: boolean;
  isActive: boolean;
  isDefault: boolean;
  steps: WorkflowStep[];
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  ticketId: string | null;
  isRead: boolean;
  createdAt: string;
}
