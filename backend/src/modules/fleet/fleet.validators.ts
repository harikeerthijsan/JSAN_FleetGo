import { VehicleStatus } from '@prisma/client';
import { z } from 'zod';
import { receiptSchema } from '../inventory/inventory.validators';

// Accept an ISO date or empty/undefined; coerce to Date or null.
const optionalDate = z
  .union([z.string().datetime(), z.string().length(0), z.null()])
  .optional()
  .transform((v) => (v ? new Date(v) : null));

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

export const listVehiclesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().optional(),
  status: z.nativeEnum(VehicleStatus).optional(),
  typeId: z.string().optional(),
  makeId: z.string().optional(),
  depotId: z.string().optional(),
  organizationId: z.string().optional(),
  vendorId: z.string().optional(),
  // Include soft-deactivated vehicles (default: active only).
  includeInactive: z.enum(['true', 'false']).optional(),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'registrationNumber', 'vehicleCode', 'status'])
    .default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type ListVehiclesQuery = z.infer<typeof listVehiclesQuerySchema>;

export const createVehicleSchema = z.object({
  // Optional — auto-generated when omitted; validated for uniqueness if given.
  vehicleCode: optionalString,
  registrationNumber: z.string().trim().min(1, 'Registration number is required'),
  vin: z
    .string()
    .trim()
    .regex(/^[A-HJ-NPR-Z0-9]{11,17}$/i, 'VIN must be 11–17 chars (no I, O, Q)')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v.toUpperCase() : undefined)),
  engineNumber: optionalString,
  makeId: optionalString,
  modelId: optionalString,
  typeId: optionalString,
  categoryId: optionalString,
  fuelTypeId: optionalString,
  ownershipTypeId: optionalString,
  manufacturingYear: z.coerce
    .number()
    .int()
    .min(1950)
    .max(new Date().getFullYear() + 1)
    .optional(),
  color: optionalString,
  organizationId: z.string().uuid('Choose the assigned organization'),
  vendorId: optionalString,
  depotId: z.string().uuid('Choose the current depot'),
  insuranceProvider: optionalString,
  insurancePolicyNumber: optionalString,
  insuranceExpiry: optionalDate,
  registrationCertNumber: optionalString,
  registrationExpiry: optionalDate,
  status: z.nativeEnum(VehicleStatus).optional(),
  remarks: optionalString,
  metadata: z.record(z.unknown()).optional(),
  receiving: receiptSchema.pick({
    receivedAt: true, receivedFromOrgId: true, custodianType: true,
    custodianId: true, initialCondition: true, odometer: true, accessories: true,
  }),
});
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

// All fields optional on update; registrationNumber kept non-empty if present.
export const updateVehicleSchema = createVehicleSchema
  .omit({ receiving: true })
  .partial()
  .extend({
    registrationNumber: z.string().trim().min(1).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;

export const changeStatusSchema = z.object({
  status: z.nativeEnum(VehicleStatus),
  reason: z.string().trim().max(500).optional(),
});
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;

export const uploadDocumentSchema = z.object({
  kind: z.enum(['DOCUMENT', 'PHOTO']).default('DOCUMENT'),
  documentTypeId: optionalString,
  label: optionalString,
  isSensitive: z.coerce.boolean().optional(),
});
