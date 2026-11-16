import { z } from "zod";
import {
  CustodianType,
  MovementType,
  VehicleStatus,
  ReconciliationScope,
  ReconciliationItemResult,
} from "@prisma/client";
const id = z.string().uuid();
const text = z.string().trim().max(2000);
const date = z.string().datetime({ offset: true });
export const receiptSchema = z.object({
  vehicleId: id.optional(),
  vehicleCode: z.string().trim().min(1).max(80).optional(),
  registrationNumber: z.string().trim().min(1).max(80),
  vin: z
    .string()
    .trim()
    .regex(/^[A-HJ-NPR-Z0-9]{11,17}$/i)
    .optional(),
  makeId: id.optional(),
  modelId: id.optional(),
  typeId: id.optional(),
  organizationId: id,
  receivedAt: date,
  receivedFromOrgId: id,
  receivingDepotId: id,
  custodianType: z.nativeEnum(CustodianType),
  custodianId: id,
  initialCondition: z.enum(["GOOD", "DAMAGED", "MAINTENANCE"]),
  odometer: z.coerce.number().int().min(0).max(10000000).optional(),
  accessories: text.optional(),
  remarks: text.optional(),
});
export const listSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(20),
    search: text.optional(),
    depotId: id.optional(),
    vendorId: id.optional(),
    organizationId: id.optional(),
    typeId: id.optional(),
    status: z.nativeEnum(VehicleStatus).optional(),
    receivedFrom: date.optional(),
    receivedTo: date.optional(),
    available: z.enum(["true", "false"]).optional(),
    sortBy: z
      .enum([
        "updatedAt",
        "receivedAt",
        "lastMovementAt",
        "registrationNumber",
        "vehicleCode",
        "status",
      ])
      .default("updatedAt"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine(
    (v) =>
      !v.receivedFrom ||
      !v.receivedTo ||
      new Date(v.receivedFrom) <= new Date(v.receivedTo),
    "Invalid received date range",
  );
export const availabilitySchema = z
  .object({
    startDate: date.optional(),
    endDate: date.optional(),
    depotId: id.optional(),
  })
  .refine(
    (v) => Boolean(v.startDate) === Boolean(v.endDate),
    "Supply both reservation dates",
  )
  .refine(
    (v) =>
      !v.startDate || !v.endDate || new Date(v.startDate) < new Date(v.endDate),
    "End must follow start",
  );
export const reservationSchema = z
  .object({
    vehicleId: id,
    requestingOrgId: id,
    depotId: id,
    startDate: date,
    endDate: date,
    purpose: text.min(1),
    reference: text.optional(),
  })
  .refine(
    (v) => new Date(v.startDate) < new Date(v.endDate),
    "End must follow start",
  )
  .refine(
    (v) => new Date(v.endDate) > new Date(),
    "Reservation must end in the future",
  );
export const reasonSchema = z.object({ reason: text.min(1) });
export const transferSchema = z.object({
  vehicleId: id,
  toDepotId: id,
  custodianType: z.nativeEnum(CustodianType),
  custodianId: id,
  type: z
    .nativeEnum(MovementType)
    .refine((v) =>
      [
        "DEPOT_TRANSFER",
        "DEPOT_TO_VENDOR",
        "VENDOR_TO_DEPOT",
        "MAINTENANCE",
        "CUSTODY_CHANGE",
        "RETURN",
      ].includes(v),
    ),
  occurredAt: date,
  reference: text.optional(),
  reason: text.min(1),
  remarks: text.optional(),
});
export const statusSchema = z.object({
  status: z.nativeEnum(VehicleStatus),
  reason: text.min(1),
});
export const reconciliationSchema = z.object({
  scope: z.nativeEnum(ReconciliationScope),
  scopeId: id,
  notes: text.optional(),
});
export const itemSchema = z
  .object({
    vehicleId: id.optional(),
    vehicleRef: text.min(1).optional(),
    observedDepotId: id.optional(),
    result: z.nativeEnum(ReconciliationItemResult),
    discrepancy: text.optional(),
    remarks: text.optional(),
  })
  .refine(
    (v) => v.result !== "UNEXPECTED" || v.vehicleId || v.vehicleRef,
    "Identify unexpected vehicle",
  )
  .refine(
    (v) =>
      !["MISSING", "MISPLACED", "DAMAGED", "UNEXPECTED"].includes(v.result) ||
      Boolean(v.discrepancy?.trim()),
    "Explain the discrepancy",
  );
export const reviewSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: text.min(1),
});
export const importSchema = z.object({
  rows: z.array(z.record(z.unknown())).min(1).max(1000),
});
export type ReceiptInput = z.infer<typeof receiptSchema>;
export type InventoryQuery = z.infer<typeof listSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
