import {
  ApprovalDecision,
  TicketPriority,
  TicketStatus,
  TicketType,
} from '@prisma/client';
import { z } from 'zod';

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

const optionalDate = z
  .union([z.string().datetime(), z.string().length(0), z.null()])
  .optional()
  .transform((v) => (v ? new Date(v) : undefined));

export const listTicketsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().optional(),
  type: z.nativeEnum(TicketType).optional(),
  status: z.nativeEnum(TicketStatus).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  organizationId: z.string().optional(),
  assignedToId: z.string().optional(),
  // "mine" = tickets I requested; "approvals" = awaiting my approval.
  scope: z.enum(['all', 'mine', 'approvals']).optional(),
  overdue: z.enum(['true', 'false']).optional(),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'requiredDate', 'priority', 'ticketNumber'])
    .default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;

export const createTicketSchema = z.object({
  type: z.nativeEnum(TicketType),
  subject: z.string().trim().min(3, 'Subject is required'),
  description: optionalString,
  priority: z.nativeEnum(TicketPriority).default('MEDIUM'),
  requestingOrgId: optionalString,
  requiredDate: optionalDate,
  sourceDepotId: optionalString,
  destinationDepotId: optionalString,
  requestedTypeId: optionalString,
  requestedQuantity: z.coerce.number().int().min(1).max(1000).optional(),
  vehicleId: optionalString,
  // Type-specific fields (incident details, severity, contact, instructions…).
  details: z.record(z.unknown()).optional(),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = createTicketSchema
  .partial()
  .omit({ type: true })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const commentSchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty').max(5000),
  isInternal: z.boolean().optional().default(false),
});

export const assignSchema = z.object({
  assignedToId: optionalString,
  assignedTeam: optionalString,
  note: optionalString,
});

export const statusSchema = z.object({
  status: z.nativeEnum(TicketStatus),
  reason: optionalString,
});

export const decisionSchema = z.object({
  decision: z.nativeEnum(ApprovalDecision),
  comment: optionalString,
});
export type DecisionInput = z.infer<typeof decisionSchema>;

export const reassignApproverSchema = z.object({
  approverId: z.string().min(1, 'An approver is required'),
  note: optionalString,
});

// --- Approval workflow configuration ---------------------------------------
export const workflowStepSchema = z.object({
  name: z.string().trim().min(1),
  approverRoleName: z.string().trim().min(1),
  slaHours: z.coerce.number().int().min(1).max(8760).optional(),
});

export const workflowSchema = z.object({
  name: z.string().trim().min(2),
  description: optionalString,
  ticketType: z.nativeEnum(TicketType).nullable().optional(),
  organizationType: z
    .enum(['CTS', 'JSAN', 'VEHICLE_VENDOR', 'TRANSPORT_PARTNER'])
    .nullable()
    .optional(),
  allowSelfApproval: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  isDefault: z.boolean().optional().default(false),
  steps: z.array(workflowStepSchema).min(1, 'At least one step is required'),
});
export type WorkflowInput = z.infer<typeof workflowSchema>;

export const slaSchema = z.object({
  ticketType: z.nativeEnum(TicketType),
  priority: z.nativeEnum(TicketPriority),
  firstApprovalHours: z.coerce.number().int().min(1).max(8760).optional(),
  resolutionHours: z.coerce.number().int().min(1).max(8760).optional(),
  isActive: z.boolean().optional().default(true),
});
export type SlaInput = z.infer<typeof slaSchema>;

export const availabilityQuerySchema = z.object({
  typeId: z.string().optional(),
  depotId: z.string().optional(),
});
