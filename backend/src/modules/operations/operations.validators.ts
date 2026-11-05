import { z } from "zod";
import { TripState, EntityStatus } from "@prisma/client";
const id = z.string().uuid(),
  text = z.string().trim().min(1).max(2000),
  date = z.string().datetime({ offset: true });
export const allocationSchema = z
  .object({
    ticketId: id,
    vehicleIds: z
      .array(id)
      .min(1)
      .max(100)
      .refine((v) => new Set(v).size === v.length, "Duplicate vehicles"),
    sourceDepotId: id,
    destinationDepotId: id,
    receivingOrgId: id,
    transporterId: id,
    plannedDispatchAt: date,
    expectedDeliveryAt: date,
  })
  .refine(
    (v) => new Date(v.expectedDeliveryAt) > new Date(v.plannedDispatchAt),
    "Delivery must follow planned dispatch",
  );
export const dispatchSchema = z.object({
  allocationId: id,
  allocationItemIds: z
    .array(id)
    .min(1)
    .max(100)
    .refine((v) => new Set(v).size === v.length, "Duplicate allocation items"),
  driverId: id,
  destinationAddress: text,
  transportVehicle: text.optional(),
  instructions: text.optional(),
});
export const driverSchema = z.object({
  name: text,
  phone: z.string().trim().min(7).max(30),
  licenseNumber: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .transform((v) => v.toUpperCase()),
  licenseExpiry: date,
  transporterId: id,
  userId: id.nullable().optional(),
  status: z.nativeEnum(EntityStatus).default("ACTIVE"),
});
export const assignmentSchema = z.object({
  driverId: id,
  transporterId: id,
  reason: text,
});
export const checklistSchema = z.object({
  identityVerified: z.boolean(),
  registrationVerified: z.boolean(),
  odometer: z.coerce.number().int().min(0).max(10000000),
  fuelLevel: z.coerce.number().int().min(0).max(100),
  accessories: text,
  keysHandedOver: z.boolean(),
  documentsHandedOver: z.boolean(),
  remarks: z.string().trim().max(2000).optional(),
});
export const reasonSchema = z.object({ reason: text });
export const tripStatusSchema = z.object({
  status: z.nativeEnum(TripState),
  reason: text,
  delayMinutes: z.coerce.number().int().min(0).max(100000).default(0),
});
export const exceptionSchema = z.object({
  tripId: id,
  type: z.enum([
    "DISPATCH_DELAY",
    "DRIVER_UNAVAILABLE",
    "TRANSPORTER_UNAVAILABLE",
    "VEHICLE_UNAVAILABLE",
    "BREAKDOWN",
    "TRIP_CANCELLATION",
    "FAILED_DELIVERY",
    "INCORRECT_DESTINATION",
    "MISSING_DOCUMENTS",
  ]),
  description: text,
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
});
export const resolutionSchema = z.object({ resolutionNotes: text });
export const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().max(100).optional(),
  depotId: id.optional(),
  transporterId: id.optional(),
  typeId: id.optional(),
  makeId: id.optional(),
  modelId: id.optional(),
  status: z.string().max(50).optional(),
});
export type AllocationInput = z.infer<typeof allocationSchema>;
export type DispatchInput = z.infer<typeof dispatchSchema>;
export type Query = z.infer<typeof querySchema>;
