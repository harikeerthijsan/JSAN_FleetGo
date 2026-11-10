import { z } from "zod";

/** Insurance Claims request validation. */

export const INCIDENT_TYPES = ["ACCIDENT", "THEFT", "FIRE", "VANDALISM", "NATURAL_DISASTER", "THIRD_PARTY", "OTHER"] as const;
export const DAMAGE_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export const CLAIM_STATUSES = ["OPEN", "WIP", "CLOSED"] as const;
export const INSURANCE_STATUSES = ["NOT_SUBMITTED", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "PARTIALLY_APPROVED", "REJECTED", "SETTLED"] as const;

const opt = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal("").transform(() => undefined));

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  status: z.enum(CLAIM_STATUSES).optional(),
  incidentType: z.enum(INCIDENT_TYPES).optional(),
  damageLevel: z.enum(DAMAGE_LEVELS).optional(),
  vehicleId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

// --- Vendor-reported incident --------------------------------------------
export const createSchema = z.object({
  vehicleId: z.string().uuid(),
  incidentType: z.enum(INCIDENT_TYPES),
  category: z.string().trim().min(1, "Category is required").max(80),
  incidentDate: z.preprocess((v) => v === "" || v === null ? undefined : v, z.coerce.date()),
  city: z.string().trim().min(1, "City is required").max(80),
  location: z.string().trim().min(1, "Location is required").max(200),
  damageLevel: z.enum(DAMAGE_LEVELS),
  description: z.string().trim().min(3, "Describe what happened").max(4000),
  policeComplaint: z.preprocess((v) => v === "true" ? true : v === "false" ? false : v, z.boolean().default(false)),
  policeComplaintNumber: opt(80),
  policeStation: opt(120),
});
export type CreateInput = z.infer<typeof createSchema>;

export const updateSchema = createSchema
  .partial()
  .omit({ vehicleId: true })
  .refine((d) => Object.keys(d).length > 0, { message: "At least one field must be provided" });
export type UpdateInput = z.infer<typeof updateSchema>;

// --- Receiver / insurer processing ---------------------------------------
export const processSchema = z
  .object({
    status: z.enum(CLAIM_STATUSES).optional(),
    insuranceStatus: z.enum(INSURANCE_STATUSES).optional(),
    insurerName: opt(150),
    policyNumber: opt(80),
    insurerClaimRef: opt(80),
    currency: opt(8),
    estimatedAmount: z.coerce.number().min(0).max(1_000_000_000).optional(),
    approvedPercentage: z.coerce.number().min(0).max(100).optional(),
    payableAmount: z.coerce.number().min(0).max(1_000_000_000).optional(),
    note: opt(1000),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "At least one field must be provided" });
export type ProcessInput = z.infer<typeof processSchema>;
