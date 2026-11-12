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
export const thirdPartySchema = z.object({
  type: z.enum(['TWO_WHEELER', 'CAR', 'COMMERCIAL_VEHICLE', 'OTHER_VEHICLE', 'PEDESTRIAN', 'PROPERTY', 'OTHER']),
  name: z.string().trim().min(1, 'Third-party name is required').max(150),
  phone: z.string().trim().min(5, 'Third-party contact number is required').max(40),
  address: opt(300),
  registrationNumber: opt(40),
  damageDescription: z.string().trim().min(3, 'Describe third-party damage or injuries').max(2000),
  insurerName: opt(150),
  policyNumber: opt(80),
}).superRefine((party, ctx) => {
  if (['TWO_WHEELER', 'CAR', 'COMMERCIAL_VEHICLE', 'OTHER_VEHICLE'].includes(party.type) && !party.registrationNumber)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['registrationNumber'], message: 'Third-party vehicle registration is required' });
});
const thirdParties = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}, z.array(thirdPartySchema).max(10).default([]));

const createFields = z.object({
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
  thirdParties,
  thirdPartyFileCounts: z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return value; }
  }, z.array(z.number().int().min(0).max(10)).max(10).default([])),
});
export const createSchema = createFields.superRefine((input, ctx) => {
  if (input.incidentType === 'THIRD_PARTY' && !input.thirdParties.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['thirdParties'], message: 'Add at least one third party for this incident type' });
});
export type CreateInput = z.infer<typeof createSchema>;

export const updateSchema = createFields
  .partial()
  .omit({ vehicleId: true, thirdPartyFileCounts: true })
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
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Choose a three-letter currency code').optional(),
    estimatedAmount: z.coerce.number().min(0).max(1_000_000_000).optional(),
    approvedPercentage: z.coerce.number().min(0).max(100).optional(),
    payableAmount: z.coerce.number().min(0).max(1_000_000_000).optional(),
    note: opt(1000),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "At least one field must be provided" });
export type ProcessInput = z.infer<typeof processSchema>;
