import { z } from "zod";

/** Phase 10 — Disk / Media Logistics request validation. */

export const MEDIA_TYPES = ["HDD", "SSD", "TAPE", "OPTICAL", "FLASH", "OTHER"] as const;
export const DISK_STATUSES = [
  "RECEIVED",
  "AVAILABLE",
  "RESERVED",
  "PACKED",
  "DISPATCHED",
  "IN_TRANSIT",
  "DELIVERED",
  "AT_VENDOR",
  "RETURNED",
  "DAMAGED",
  "LOST",
  "UNDER_INSPECTION",
  "INACTIVE",
] as const;
export const SHIPMENT_TYPES = [
  "CTS_TO_DEPOT",
  "DEPOT_TO_VENDOR",
  "VENDOR_TO_DEPOT",
  "DEPOT_TO_CTS",
  "VENDOR_TO_VENDOR",
  "RETURN",
] as const;
export const CUSTODIAN_TYPES = ["DEPOT", "VENDOR", "ORGANIZATION", "TRANSPORTER", "USER"] as const;
export const DISCREPANCY_CATEGORIES = [
  "MISSING",
  "DAMAGED",
  "UNACCOUNTED",
  "WRONG_LOCATION",
  "WRONG_CUSTODIAN",
  "SERIAL_MISMATCH",
  "OTHER",
] as const;
export const DISCREPANCY_SEVERITIES = ["MINOR", "MODERATE", "MAJOR", "CRITICAL"] as const;
export const DISCREPANCY_STATUSES = [
  "REPORTED",
  "UNDER_REVIEW",
  "CONFIRMED",
  "DISPUTED",
  "RESOLVED",
  "CLOSED",
] as const;

const opt = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal("").transform(() => undefined));

export const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
  status: z.string().trim().max(40).optional(),
  mediaType: z.string().trim().max(20).optional(),
  depotId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  sort: z.enum(["createdAt", "serialNumber", "status"]).optional(),
});
export type Query = z.infer<typeof querySchema>;

export const registerSchema = z.object({
  serialNumber: z.string().trim().min(1).max(120),
  mediaType: z.enum(MEDIA_TYPES).default("HDD"),
  capacity: opt(60),
  make: opt(120),
  model: opt(120),
  condition: opt(500),
  sourceOrgId: z.string().uuid().optional(),
  receivingDepotId: z.string().uuid().optional(),
  custodianType: z.enum(CUSTODIAN_TYPES).default("DEPOT"),
  custodianId: z.string().uuid().optional(),
  location: opt(200),
  remarks: opt(2000),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const bulkSchema = z.object({
  receivingDepotId: z.string().uuid().optional(),
  sourceOrgId: z.string().uuid().optional(),
  disks: z
    .array(
      z.object({
        serialNumber: z.string().trim().min(1).max(120),
        mediaType: z.enum(MEDIA_TYPES).default("HDD"),
        capacity: opt(60),
        make: opt(120),
        model: opt(120),
        condition: opt(500),
      }),
    )
    .min(1)
    .max(1000),
});

export const statusSchema = z.object({
  status: z.enum(DISK_STATUSES),
  reason: z.string().trim().min(1).max(500),
});

export const shipmentSchema = z.object({
  type: z.enum(SHIPMENT_TYPES),
  ticketId: z.string().uuid().optional(),
  sourceOrgId: z.string().uuid().optional(),
  sourceDepotId: z.string().uuid().optional(),
  destinationOrgId: z.string().uuid().optional(),
  destinationDepotId: z.string().uuid().optional(),
  transporterId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  plannedDispatchAt: z.coerce.date().optional(),
  expectedDeliveryAt: z.coerce.date().optional(),
  trackingReference: opt(120),
  remarks: opt(2000),
  diskIds: z.array(z.string().uuid()).min(1).max(500),
});
export type ShipmentInput = z.infer<typeof shipmentSchema>;

export const dispatchSchema = z.object({
  sealNumber: opt(120),
  packaging: opt(500),
  handoverByName: opt(150),
  receivedByName: opt(150),
  items: z
    .array(z.object({ diskId: z.string().uuid(), condition: opt(500) }))
    .max(500)
    .optional(),
  remarks: opt(2000),
});

export const receiveSchema = z.object({
  handoverByName: opt(150),
  receivedByName: opt(150),
  items: z
    .array(
      z.object({
        diskId: z.string().uuid(),
        received: z.boolean().default(true),
        condition: opt(500),
        damaged: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(500),
  remarks: opt(2000),
});

export const trackingSchema = z.object({
  event: z.string().trim().min(1).max(200),
  inTransit: z.boolean().default(true),
});

export const custodySchema = z.object({
  custodianType: z.enum(CUSTODIAN_TYPES),
  custodianId: z.string().uuid(),
  depotId: z.string().uuid().optional(),
  location: opt(200),
  handedOverByName: opt(150),
  receivedByName: opt(150),
  reason: z.string().trim().min(1).max(500),
});

export const inspectionSchema = z.object({
  type: z.enum(["RECEIPT", "PRE_DISPATCH", "RECEIVING", "RECONCILIATION"]),
  shipmentId: z.string().uuid().optional(),
  diskId: z.string().uuid().optional(),
  condition: opt(2000),
  sealNumber: opt(120),
  packaging: opt(500),
  verified: z.boolean().default(false),
  remarks: opt(2000),
});

export const reconciliationSchema = z.object({
  scope: z.enum(["DEPOT", "VENDOR", "ORGANIZATION"]),
  scopeId: z.string().uuid(),
  notes: opt(2000),
});

export const reconciliationItemsSchema = z.object({
  items: z
    .array(
      z.object({
        diskId: z.string().uuid().optional(),
        diskRef: opt(120),
        result: z.enum(["PENDING", "VERIFIED", "MISSING", "MISPLACED", "DAMAGED", "UNACCOUNTED"]),
        observedDepotId: z.string().uuid().optional(),
        observedCustodianId: z.string().uuid().optional(),
        discrepancy: opt(1000),
        remarks: opt(1000),
      }),
    )
    .min(1)
    .max(1000),
});

export const reviewSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().trim().min(1).max(2000),
});

export const discrepancySchema = z.object({
  diskId: z.string().uuid().optional(),
  shipmentId: z.string().uuid().optional(),
  reconciliationId: z.string().uuid().optional(),
  category: z.enum(DISCREPANCY_CATEGORIES),
  description: z.string().trim().min(1).max(4000),
  severity: z.enum(DISCREPANCY_SEVERITIES).default("MINOR"),
});

export const discrepancyTransitionSchema = z.object({
  status: z.enum(DISCREPANCY_STATUSES),
  remarks: z.string().trim().min(1).max(2000),
});
