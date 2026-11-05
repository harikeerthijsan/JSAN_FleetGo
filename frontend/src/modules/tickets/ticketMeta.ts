import type { BadgeTone } from '@/components';
import type {
  ApprovalStatus,
  TicketPriority,
  TicketStatus,
  TicketType,
} from '@/types/ticket';

export const TYPE_LABELS: Record<TicketType, string> = {
  NEW_VEHICLE: 'New Vehicle',
  DELIVERY: 'Delivery',
  PICKUP: 'Pickup',
  TRANSFER: 'Transfer',
  RETURN: 'Return',
  MAINTENANCE: 'Maintenance',
  DAMAGE_INCIDENT: 'Damage / Incident',
  REPLACEMENT: 'Replacement',
  GENERAL: 'General',
};

export const STATUS_META: Record<TicketStatus, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SUBMITTED: { label: 'Submitted', tone: 'info' },
  PENDING_APPROVAL: { label: 'Pending Approval', tone: 'warning' },
  INFO_REQUIRED: { label: 'Info Required', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  IN_PROGRESS: { label: 'In Progress', tone: 'info' },
  ON_HOLD: { label: 'On Hold', tone: 'neutral' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
};

export const APPROVAL_META: Record<ApprovalStatus, { label: string; tone: BadgeTone }> = {
  NOT_SUBMITTED: { label: 'Not Submitted', tone: 'neutral' },
  PENDING: { label: 'Pending', tone: 'warning' },
  INFO_REQUESTED: { label: 'Info Requested', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
};

export const PRIORITY_META: Record<TicketPriority, { label: string; tone: BadgeTone }> = {
  LOW: { label: 'Low', tone: 'neutral' },
  MEDIUM: { label: 'Medium', tone: 'info' },
  HIGH: { label: 'High', tone: 'warning' },
  CRITICAL: { label: 'Critical', tone: 'danger' },
};

export function typeLabel(t: TicketType): string {
  return TYPE_LABELS[t] ?? t;
}
