import { z } from "zod";
import { TrackingMode } from "@prisma/client";
const id = z.string().uuid(),
  label = z.string().trim().min(1).max(150),
  date = z.string().datetime({ offset: true });
export const coordinate = z.tuple([
  z.number().finite().min(-90).max(90),
  z.number().finite().min(-180).max(180),
]);
export const observation = z
  .object({
    eventId: z.string().trim().min(1).max(160),
    deviceExternalId: z.string().trim().min(1).max(160),
    tripId: id.optional(),
    latitude: z.number().finite().min(-90).max(90).nullable().optional(),
    longitude: z.number().finite().min(-180).max(180).nullable().optional(),
    speedKph: z.number().finite().min(0).max(500).optional(),
    heading: z.number().finite().min(0).lt(360).optional(),
    gpsAt: date,
    quality: z.enum(["VALID", "LOW", "NO_FIX"]).default("VALID"),
    address: z.string().trim().max(300).optional(),
    eta: date.optional(),
  })
  .strict()
  .refine(
    (v) => (v.latitude == null) === (v.longitude == null),
    "Supply both coordinates",
  )
  .refine(
    (v) =>
      v.quality === "NO_FIX" || (v.latitude != null && v.longitude != null),
    "Valid fixes require coordinates",
  );
export const providerSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]{2,60}$/),
    name: label,
    mode: z.nativeEnum(TrackingMode),
    adapter: z.enum(["SIMULATION", "GENERIC_WEBHOOK", "GENERIC_API"]),
    isActive: z.boolean().default(true),
    webhookSecretEnv: z
      .string()
      .regex(/^GPS_[A-Z0-9_]{1,80}$/)
      .nullable()
      .optional(),
    apiUrlEnv: z
      .string()
      .regex(/^GPS_[A-Z0-9_]{1,80}$/)
      .nullable()
      .optional(),
    apiTokenEnv: z
      .string()
      .regex(/^GPS_[A-Z0-9_]{1,80}$/)
      .nullable()
      .optional(),
  })
  .refine(
    (v) =>
      v.mode === "REAL"
        ? v.adapter !== "SIMULATION"
        : v.adapter !== "GENERIC_API",
    "Real mode requires a real adapter; simulated webhook fixtures retain simulation labels",
  );
export const deviceSchema = z.object({
  providerId: id,
  externalId: label,
  name: label,
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});
export const mappingSchema = z.object({ vehicleId: id });
export const startSchema = z.object({
  tripId: id,
  vehicleId: id,
  mode: z.nativeEnum(TrackingMode),
});
export const manualSchema = z.object({ deviceId: id, observation });
export const policySchema = z
  .object({
    staleSeconds: z.number().int().min(5).max(86400),
    offlineSeconds: z.number().int().min(10).max(86400),
    stationarySeconds: z.number().int().min(5).max(86400),
    movingSpeedKph: z.number().min(0).max(30),
    routeDeviationMeters: z.number().int().min(20).max(50000),
    approachMeters: z.number().int().min(20).max(50000),
    retentionDays: z.number().int().min(1).max(3650),
    alertsEnabled: z.boolean(),
  })
  .refine(
    (v) => v.offlineSeconds > v.staleSeconds,
    "Offline threshold must exceed stale threshold",
  );
export const geofenceSchema = z
  .object({
    name: label,
    kind: z.enum(["DEPOT", "VENDOR", "DESTINATION", "PICKUP"]),
    shape: z.enum(["CIRCLE", "POLYGON"]),
    centerLat: z.number().min(-90).max(90).nullable().optional(),
    centerLon: z.number().min(-180).max(180).nullable().optional(),
    radiusMeters: z.number().min(10).max(100000).nullable().optional(),
    polygon: z.array(coordinate).min(4).max(200).nullable().optional(),
    depotId: id.nullable().optional(),
    organizationId: id.nullable().optional(),
    tripId: id.nullable().optional(),
    alertOnEntry: z.boolean().default(true),
    alertOnExit: z.boolean().default(true),
    isActive: z.boolean().default(true),
  })
  .refine(
    (v) =>
      v.shape === "CIRCLE"
        ? v.centerLat != null && v.centerLon != null && v.radiusMeters != null
        : Boolean(
            v.polygon &&
            v.polygon[0][0] === v.polygon.at(-1)![0] &&
            v.polygon[0][1] === v.polygon.at(-1)![1],
          ),
    "Circle needs center/radius; polygon must be a closed ring",
  )
  .refine(
    (v) => Boolean(v.depotId || v.organizationId || v.tripId),
    "Bind the geofence to an existing depot, organization or trip",
  );
export const querySchema = z
  .object({
    mode: z.enum(["REAL", "SIMULATED", "ALL"]).default("REAL"),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(1000).default(100),
    from: date.optional(),
    to: date.optional(),
    depotId: id.optional(),
    tripId: id.optional(),
  })
  .refine(
    (v) => !v.from || !v.to || new Date(v.from) <= new Date(v.to),
    "Invalid date range",
  );
export const routeSchema = z.object({
  points: z.array(coordinate).min(2).max(1000),
  reason: z.string().trim().min(1).max(2000),
});
export type Observation = z.infer<typeof observation>;
export type Query = z.infer<typeof querySchema>;
