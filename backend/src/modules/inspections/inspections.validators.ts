import { z } from "zod";

/**
 * Phase 8 — request validation for Inspection & Digital Handover.
 *
 * Enum literals mirror the Prisma enums exactly. Foreign ids are validated as
 * UUIDs; business-rule checks (existence, scope, lifecycle) are enforced in the
 * service inside row-locked transactions.
 */

export const INSPECTION_TYPES = [
  "INITIAL_RECEIPT",
  "PRE_DISPATCH",
  "RECEIVING",
  "RETURN",
] as const;

export const PHOTO_CATEGORIES = [
  "FRONT",
  "REAR",
  "LEFT",
  "RIGHT",
  "INTERIOR",
  "DASHBOARD",
  "ODOMETER",
  "TYRES",
  "GLASS",
  "LIGHTS",
  "ACCESSORIES",
  "KEYS_DOCUMENTS",
  "EXISTING_DAMAGE",
  "OTHER",
] as const;

export const RECEIVING_OUTCOMES = [
  "FULL",
  "WITH_DISCREPANCIES",
  "DAMAGED",
  "PARTIAL",
  "REJECTED",
] as const;

export const DISCREPANCY_CATEGORIES = [
  "NEW_SCRATCH",
  "DENT",
  "BROKEN_GLASS",
  "TYRE_DAMAGE",
  "MISSING_ACCESSORY",
  "MISSING_DOCUMENT",
  "INTERIOR_DAMAGE",
  "MECHANICAL_ISSUE",
  "ODOMETER_DISCREPANCY",
  "OTHER",
] as const;

export const DISCREPANCY_SEVERITIES = [
  "MINOR",
  "MODERATE",
  "MAJOR",
  "CRITICAL",
] as const;

export const DISCREPANCY_STATUSES = [
  "REPORTED",
  "UNDER_REVIEW",
  "CONFIRMED",
  "DISPUTED",
  "RESOLVED",
  "CLOSED",
] as const;

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal("").transform(() => undefined));

export const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  type: z.enum(INSPECTION_TYPES).optional(),
  status: z.string().trim().max(40).optional(),
  vehicleId: z.string().uuid().optional(),
  dispatchId: z.string().uuid().optional(),
  tripId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
});
export type Query = z.infer<typeof querySchema>;

const conditionFields = {
  odometer: z.coerce.number().int().min(0).max(5_000_000).optional(),
  fuelLevel: z.coerce.number().int().min(0).max(100).optional(),
  exteriorCondition: optionalText(2000),
  interiorCondition: optionalText(2000),
  tyresCondition: optionalText(2000),
  glassCondition: optionalText(2000),
  lightsCondition: optionalText(2000),
  accessories: optionalText(2000),
  keysDocuments: optionalText(2000),
  existingDamage: optionalText(4000),
  missingItems: optionalText(4000),
  newDamage: optionalText(4000),
  generalRemarks: optionalText(4000),
  identityVerified: z.boolean().optional(),
  registrationVerified: z.boolean().optional(),
};

export const createSchema = z.object({
  type: z.enum(INSPECTION_TYPES),
  vehicleId: z.string().uuid(),
  dispatchId: z.string().uuid().optional(),
  tripId: z.string().uuid().optional(),
  ticketId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  depotId: z.string().uuid().optional(),
  receivedFromOrgId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  performedAt: z.coerce.date().optional(),
  receivingOutcome: z.enum(RECEIVING_OUTCOMES).optional(),
  rejectionReason: optionalText(2000),
  ...conditionFields,
});
export type CreateInput = z.infer<typeof createSchema>;

export const updateSchema = z.object({
  ...conditionFields,
  receivingOutcome: z.enum(RECEIVING_OUTCOMES).optional(),
  rejectionReason: optionalText(2000),
  responses: z
    .array(
      z.object({
        checklistItemId: z.string().uuid().optional(),
        label: text(200),
        category: optionalText(80),
        value: optionalText(2000),
        numericValue: z.number().optional(),
        remarks: optionalText(2000),
      }),
    )
    .max(200)
    .optional(),
});
export type UpdateInput = z.infer<typeof updateSchema>;

export const reviewSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  remarks: text(2000),
});

export const photoMetaSchema = z.object({
  category: z.enum(PHOTO_CATEGORIES),
  label: optionalText(200),
  takenAt: z.coerce.date().optional(),
});

export const reusePhotoSchema = z.object({
  dispatchEvidenceId: z.string().uuid(),
  category: z.enum(PHOTO_CATEGORIES),
  label: optionalText(200),
});

export const evidenceMetaSchema = z.object({
  kind: z.enum(["PHOTO", "VIDEO", "DOCUMENT", "SIGNATURE"]).default("DOCUMENT"),
  label: optionalText(200),
});

export const templateSchema = z.object({
  type: z.enum(INSPECTION_TYPES),
  name: text(150),
  description: optionalText(2000),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  items: z
    .array(
      z.object({
        label: text(200),
        category: text(80),
        inputType: z
          .enum(["BOOLEAN", "TEXT", "NUMBER", "CONDITION"])
          .default("CONDITION"),
        required: z.boolean().default(true),
        photoRequired: z.boolean().default(false),
        requiredPhotoCategory: z.enum(PHOTO_CATEGORIES).optional(),
        sortOrder: z.number().int().min(0).max(1000).default(0),
      }),
    )
    .max(100)
    .default([]),
});
export type TemplateInput = z.infer<typeof templateSchema>;

export const discrepancySchema = z.object({
  vehicleId: z.string().uuid(),
  dispatchId: z.string().uuid().optional(),
  tripId: z.string().uuid().optional(),
  ticketId: z.string().uuid().optional(),
  inspectionId: z.string().uuid().optional(),
  category: z.enum(DISCREPANCY_CATEGORIES),
  description: text(4000),
  severity: z.enum(DISCREPANCY_SEVERITIES).default("MINOR"),
  dispatchEvidenceId: z.string().uuid().optional(),
  dispatchPhotoId: z.string().uuid().optional(),
  receivingPhotoId: z.string().uuid().optional(),
  assignedReviewerId: z.string().uuid().optional(),
  aiSuggested: z.boolean().default(false),
});
export type DiscrepancyInput = z.infer<typeof discrepancySchema>;

export const discrepancyTransitionSchema = z.object({
  status: z.enum(DISCREPANCY_STATUSES),
  remarks: text(2000),
});

export const commentSchema = z.object({ body: text(4000) });

export const handoverSchema = z.object({
  type: z.enum(["DISPATCH", "RECEIVING"]),
  vehicleId: z.string().uuid(),
  dispatchId: z.string().uuid().optional(),
  tripId: z.string().uuid().optional(),
  ticketId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  inspectionId: z.string().uuid().optional(),
  handoverByUserId: z.string().uuid().optional(),
  handoverByName: optionalText(150),
  handoverParty: optionalText(200),
  receivedByUserId: z.string().uuid().optional(),
  receivedByName: optionalText(150),
  receivedParty: optionalText(200),
  checklist: z.record(z.unknown()).optional(),
  remarks: optionalText(2000),
});
export type HandoverInput = z.infer<typeof handoverSchema>;

export const acknowledgeSchema = z.object({
  party: z.enum(["HANDOVER", "RECEIVER"]),
  role: optionalText(80),
  name: text(150),
  acknowledged: z.boolean().default(true),
  remarks: optionalText(2000),
  signature: optionalText(100_000),
});

export const podSchema = z.object({
  dispatchId: z.string().uuid(),
  vehicleId: z.string().uuid(),
});
