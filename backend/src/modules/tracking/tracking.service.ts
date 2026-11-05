import { createHash } from "crypto";
import { logger } from "../../utils/logger";

import {
  Prisma,
  TrackingMode,
  type TrackingSession,
  type GPSLocation,
} from "@prisma/client";

import { prisma } from "../../database/prisma";

import type { AuthenticatedUser } from "../../types/auth";

import { ApiError } from "../../utils/ApiError";

import { dispatchScope } from "../operations/operations.service";

import { operation } from "../inventory/inventory.service";

import { notificationsService } from "../tickets/notifications.service";

import { providerAdapter, providerPublic } from "./tracking.providers";

import {
  distance,
  insidePolygon,
  polygonValid,
  routeDistance,
  type Point,
} from "./tracking.geometry";

import type { Observation, Query } from "./tracking.validators";

import { EventEmitter } from "events";

export const trackingEvents = new EventEmitter();
trackingEvents.setMaxListeners(2000);

export const terminal = ["DELIVERED", "CANCELLED"];

type Tx = Prisma.TransactionClient;

export const isTrackingAdmin = (a: AuthenticatedUser) =>
  ["SUPER_ADMIN", "JSAN_ADMIN"].includes(a.role.name);

const manage = (a: AuthenticatedUser) => {
  if (!a.permissions.includes("tracking:manage"))
    throw ApiError.forbidden("Tracking management permission required");
};

export const simulationEnabled = () =>
  process.env.TRACKING_SIMULATION_ENABLED === "true" ||
  (process.env.NODE_ENV !== "production" &&
    process.env.TRACKING_SIMULATION_ENABLED !== "false");

async function tripAllowed(tx: Tx, tripId: string, a: AuthenticatedUser) {
  const t = await tx.trip.findFirst({
    where: { id: tripId, dispatch: await dispatchScope(a) },
    include: {
      dispatch: { include: { allocation: true, vehicles: true, driver: true } },
    },
  });
  if (!t) throw ApiError.notFound("Trip not found in your tracking scope");
  return t;
}

async function audit(
  tx: Tx,
  a: AuthenticatedUser | null,
  action: string,
  id: string,
  metadata: unknown = {},
) {
  await tx.auditLog.create({
    data: {
      actorId: a?.id ?? null,
      action,
      entityType: "Tracking",
      entityId: id,
      metadata: JSON.parse(JSON.stringify(metadata)),
    },
  });
}

export async function sessionAllowed(tx: Tx, id: string, a: AuthenticatedUser) {
  const s = await tx.trackingSession.findUnique({
    where: { id },
    include: { latestLocation: true },
  });
  if (!s) throw ApiError.notFound("Tracking session not found");
  await tripAllowed(tx, s.tripId, a);
  return s;
}

async function sessionWhere(
  a: AuthenticatedUser,
  query?: Query,
): Promise<Prisma.TrackingSessionWhereInput> {
  const trips = await prisma.trip.findMany({
    where: {
      dispatch: await dispatchScope(a),
      ...(query?.depotId
        ? {
            dispatch: {
              AND: [
                await dispatchScope(a),
                {
                  OR: [
                    { sourceDepotId: query.depotId },
                    { destinationDepotId: query.depotId },
                  ],
                },
              ],
            },
          }
        : {}),
    },
    select: { id: true },
  });
  return {
    tripId: query?.tripId
      ? { in: trips.filter((t) => t.id === query.tripId).map((t) => t.id) }
      : { in: trips.map((t) => t.id) },
    ...(query && query.mode !== "ALL" ? { mode: query.mode } : {}),
  };
}

async function policy(tx: Tx = prisma) {
  return tx.trackingPolicy.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
}

async function relatedFences(tx: Tx, s: TrackingSession) {
  const trip = await tx.trip.findUniqueOrThrow({
    where: { id: s.tripId },
    include: { dispatch: { include: { allocation: true } } },
  });
  return tx.geofence.findMany({
    where: {
      isActive: true,
      OR: [
        { tripId: s.tripId },
        {
          tripId: null,
          depotId: {
            in: [trip.dispatch.sourceDepotId, trip.dispatch.destinationDepotId],
          },
        },
        {
          tripId: null,
          organizationId: trip.dispatch.allocation.receivingOrgId,
        },
      ],
    },
  });
}

function inside(
  f: {
    shape: string;
    centerLat: number | null;
    centerLon: number | null;
    radiusMeters: number | null;
    polygon: unknown;
  },
  p: Point,
) {
  return f.shape === "CIRCLE"
    ? distance(p, [f.centerLat!, f.centerLon!]) <= f.radiusMeters!
    : insidePolygon(p, f.polygon as Point[]);
}

async function raise(
  tx: Tx,
  s: TrackingSession,
  type: string,
  severity: string,
  description: string,
  conditionKey = "default",
) {
  const prior = await tx.trackingAlert.findFirst({
    where: {
      sessionId: s.id,
      type,
      conditionKey,
      status: { in: ["OPEN", "ACKNOWLEDGED"] },
    },
  });
  if (prior) {
    if (prior.recoveredAt)
      await tx.trackingAlert.update({
        where: { id: prior.id },
        data: { recoveredAt: null },
      });
    return prior;
  }

  const alert = await tx.trackingAlert.create({
    data: { sessionId: s.id, type, severity, description, conditionKey },
  });

  const trip = await tx.trip.findUniqueOrThrow({
    where: { id: s.tripId },
    include: { dispatch: { include: { allocation: true } } },
  });

  const users = await tx.user.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { role: { name: { in: ["SUPER_ADMIN", "JSAN_ADMIN"] } } },
        {
          role: { name: "OPERATIONS_MANAGER" },
          depots: { some: { depotId: trip.dispatch.sourceDepotId } },
        },
      ],
    },
    select: { id: true },
  });

  await notificationsService.notifyMany(
    users.map((u) => u.id),
    {
      type: "TICKET_STATUS_CHANGED",
      title: `${s.mode === "SIMULATED" ? "SIMULATION · " : ""}${type}`,
      body: description,
      ticketId: trip.dispatch.allocation.ticketId,
    },
    tx,
  );
  await audit(tx, null, "tracking.alert.created", alert.id, {
    type,
    mode: s.mode,
    sessionId: s.id,
  });
  return alert;
}

async function evaluateTx(
  tx: Tx,
  s: TrackingSession & { latestLocation: GPSLocation | null },
) {
  const p = await policy(tx);
  const trip = await tx.trip.findUniqueOrThrow({
    where: { id: s.tripId },
    include: { dispatch: true },
  });
  const now = Date.now();
  const age = (now - (s.lastGPSAt ?? s.createdAt).getTime()) / 1000;

  if (terminal.includes(trip.status) && s.state !== "CLOSED") {
    await tx.trackingSession.update({
      where: { id: s.id },
      data: {
        state: "CLOSED",
        closedAt: trip.actualArrivalAt ?? trip.updatedAt,
      },
    });
    if (trip.status === "DELIVERED" && p.alertsEnabled)
      await raise(
        tx,
        s,
        "TRIP_COMPLETED",
        "INFO",
        "Operational workflow confirmed delivery; GPS did not confirm it",
      );
  }

  if (!p.alertsEnabled || terminal.includes(trip.status)) return;

  const conditions: {
    type: string;
    active: boolean;
    severity: string;
    description: string;
  }[] = [
    {
      type: "GPS_SIGNAL_LOST",
      active: s.signalLost,
      severity: "HIGH",
      description: "Provider reports no valid GPS fix",
    },

    {
      type: "NO_UPDATE",
      active: age >= p.staleSeconds,
      severity: "MEDIUM",
      description:
        "No fresh valid location within the configured stale interval",
    },

    {
      type: "GPS_OFFLINE",
      active: age >= p.offlineSeconds,
      severity: "HIGH",
      description:
        "GPS location is offline; the marker is last known, not current",
    },

    {
      type: "LONG_STOP",
      active: Boolean(
        s.stationarySince &&
        now - s.stationarySince.getTime() >= p.stationarySeconds * 1000 &&
        age < p.offlineSeconds,
      ),
      severity: "MEDIUM",
      description:
        "Vehicle has remained stationary beyond the configured duration",
    },

    {
      type: "DELAYED_TRIP",
      active:
        trip.status === "DELAYED" ||
        (now > trip.dispatch.expectedDeliveryAt.getTime() &&
          !terminal.includes(trip.status)),
      severity: "HIGH",
      description: "Trip is operationally delayed or past expected delivery",
    },
  ];

  const loc = s.latestLocation;
  const fresh = Boolean(
    loc &&
    age < p.staleSeconds &&
    loc.latitude !== null &&
    loc.longitude !== null,
  );

  conditions.push({
    type: "OUTSIDE_WINDOW",
    active: Boolean(
      fresh &&
      loc!.speedKph !== null &&
      loc!.speedKph > p.movingSpeedKph &&
      (loc!.gpsAt < trip.dispatch.plannedDispatchAt ||
        loc!.gpsAt > trip.dispatch.expectedDeliveryAt),
    ),
    severity: "MEDIUM",
    description: "Observed movement is outside the planned transport window",
  });

  conditions.push({
    type: "ROUTE_DEVIATION",
    active: Boolean(
      fresh &&
      s.routeApprovedById &&
      s.plannedRoute &&
      routeDistance(
        [loc!.latitude!, loc!.longitude!],
        s.plannedRoute as Point[],
      ) > p.routeDeviationMeters,
    ),
    severity: "HIGH",
    description: "Observed GPS point is outside the approved route tolerance",
  });

  const destinations = (await relatedFences(tx, s)).filter(
    (f) => f.kind === "DESTINATION",
  );

  conditions.push({
    type: "APPROACHING_DESTINATION",
    active: Boolean(
      fresh &&
      destinations.some(
        (f) =>
          inside(f, [loc!.latitude!, loc!.longitude!]) ||
          (f.shape === "CIRCLE" &&
            distance(
              [loc!.latitude!, loc!.longitude!],
              [f.centerLat!, f.centerLon!],
            ) <=
              f.radiusMeters! + p.approachMeters),
      ),
    ),
    severity: "INFO",
    description:
      "GPS suggests proximity to a configured destination geofence; delivery still requires operational confirmation",
  });

  for (const c of conditions) {
    if (c.active) await raise(tx, s, c.type, c.severity, c.description);
    else
      await tx.trackingAlert.updateMany({
        where: {
          sessionId: s.id,
          type: c.type,
          status: { in: ["OPEN", "ACKNOWLEDGED"] },
          recoveredAt: null,
        },
        data: { recoveredAt: new Date() },
      });
  }
}

export const trackingService = {
  async settings(a: AuthenticatedUser) {
    return {
      policy: await policy(),
      providers: (
        await prisma.gPSProviderConfiguration.findMany({
          orderBy: { name: "asc" },
        })
      ).map((p) => providerPublic(p, isTrackingAdmin(a))),
      simulationEnabled: simulationEnabled(),
      websocketPath: "/api/v1/tracking/ws",
    };
  },

  async saveProvider(
    id: string | undefined,
    input: Prisma.GPSProviderConfigurationUncheckedCreateInput,
    a: AuthenticatedUser,
    key: string,
  ) {
    manage(a);
    if (!isTrackingAdmin(a))
      throw ApiError.forbidden(
        "Provider credentials/configuration require an administrator",
      );
    return operation(a, key, "tracking.provider", { id, input }, async (tx) => {
      if (id) {
        const old = await tx.gPSProviderConfiguration.findUniqueOrThrow({
          where: { id },
        });
        if (
          old.mode !== input.mode &&
          (await tx.gPSDevice.count({ where: { providerId: id } }))
        )
          throw ApiError.conflict(
            "Cannot change provider mode after devices are registered",
          );
      }
      const out = id
        ? await tx.gPSProviderConfiguration.update({
            where: { id },
            data: input,
          })
        : await tx.gPSProviderConfiguration.create({ data: input });
      await audit(tx, a, "tracking.provider.saved", out.id, {
        slug: out.slug,
        mode: out.mode,
        adapter: out.adapter,
      });
      return providerPublic(out, true);
    });
  },

  async savePolicy(
    input: Prisma.TrackingPolicyUpdateInput,
    a: AuthenticatedUser,
    key: string,
  ) {
    manage(a);
    if (!isTrackingAdmin(a)) throw ApiError.forbidden();
    return operation(a, key, "tracking.policy", input, async (tx) => {
      const out = await tx.trackingPolicy.upsert({
        where: { id: "default" },
        create: { id: "default" },
        update: input,
      });
      await audit(tx, a, "tracking.policy.saved", "default", input);
      return out;
    });
  },

  async devices(a: AuthenticatedUser) {
    manage(a);
    const devices = await prisma.gPSDevice.findMany({
      include: { provider: true, mappings: { orderBy: { startedAt: "desc" } } },
      orderBy: { name: "asc" },
    });
    const allowedTrips = await prisma.trip.findMany({
      where: { dispatch: await dispatchScope(a) },
      include: { dispatch: { include: { vehicles: true } } },
    });
    const ids = new Set(
      allowedTrips.flatMap((t) => t.dispatch.vehicles.map((v) => v.vehicleId)),
    );
    return devices
      .filter(
        (d) =>
          isTrackingAdmin(a) ||
          !d.mappings.some((m) => !m.endedAt) ||
          d.mappings.some((m) => !m.endedAt && ids.has(m.vehicleId)),
      )
      .map((d) => ({
        ...d,
        mappings: isTrackingAdmin(a)
          ? d.mappings
          : d.mappings.filter((m) => ids.has(m.vehicleId)),
        provider: providerPublic(d.provider),
      }));
  },

  async saveDevice(
    id: string | undefined,
    input: {
      providerId: string;
      externalId: string;
      name: string;
      status: "ACTIVE" | "INACTIVE";
    },
    a: AuthenticatedUser,
    key: string,
  ) {
    manage(a);
    return operation(a, key, "tracking.device", { id, input }, async (tx) => {
      if (
        !(await tx.gPSProviderConfiguration.findFirst({
          where: { id: input.providerId, isActive: true },
        }))
      )
        throw ApiError.badRequest("Active GPS provider is required");
      if (id) {
        const existing = (await this.devices(a)).find((d) => d.id === id);
        if (!existing)
          throw ApiError.notFound("Device not found in your scope");
        if (
          existing.providerId !== input.providerId ||
          existing.externalId !== input.externalId
        )
          throw ApiError.conflict(
            "Device identity/provider cannot be edited; create a new device instead",
          );
      }
      const out = id
        ? await tx.gPSDevice.update({ where: { id }, data: input })
        : await tx.gPSDevice.create({ data: input });
      await audit(tx, a, "tracking.device.saved", out.id, {
        name: out.name,
        status: out.status,
      });
      return out;
    });
  },

  async mapDevice(
    deviceId: string,
    vehicleId: string,
    a: AuthenticatedUser,
    key: string,
  ) {
    manage(a);
    return operation(
      a,
      key,
      "tracking.mapping",
      { deviceId, vehicleId },
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM gps_devices WHERE id=${deviceId} FOR UPDATE`;

        const d = await tx.gPSDevice.findUnique({
          where: { id: deviceId },
          include: { provider: true },
        });
        if (!d || d.status !== "ACTIVE" || !d.provider.isActive)
          throw ApiError.badRequest("Active device and provider required");

        const trip = await tx.trip.findFirst({
          where: {
            dispatch: {
              AND: [
                await dispatchScope(a),
                { vehicles: { some: { vehicleId } } },
                { state: "CONFIRMED" },
              ],
            },
            status: { notIn: ["DELIVERED", "CANCELLED"] },
          },
        });
        if (!trip)
          throw ApiError.notFound(
            "Vehicle must belong to an active authorized dispatched trip",
          );

        const old = await tx.vehicleGPSMapping.findFirst({
          where: { deviceId, endedAt: null },
        });
        if (old && old.vehicleId !== vehicleId)
          throw ApiError.conflict(
            "Unmap this device before assigning another vehicle",
          );
        if (old) return old;

        const row = await tx.vehicleGPSMapping.create({
          data: {
            deviceId,
            vehicleId,
            mode: d.provider.mode,
            createdById: a.id,
          },
        });
        await audit(tx, a, "tracking.device.mapped", row.id, {
          vehicleId,
          deviceId,
          mode: row.mode,
        });
        return row;
      },
    );
  },

  async unmap(deviceId: string, a: AuthenticatedUser, key: string) {
    manage(a);
    return operation(a, key, "tracking.unmap", { deviceId }, async (tx) => {
      if (!(await this.devices(a)).some((d) => d.id === deviceId))
        throw ApiError.notFound();
      await tx.$queryRaw`SELECT id FROM gps_devices WHERE id=${deviceId} FOR UPDATE`;
      const out = await tx.vehicleGPSMapping.updateMany({
        where: { deviceId, endedAt: null },
        data: { endedAt: new Date() },
      });
      await audit(tx, a, "tracking.device.unmapped", deviceId, {});
      return out;
    });
  },

  async start(
    input: { tripId: string; vehicleId: string; mode: TrackingMode },
    a: AuthenticatedUser,
    key: string,
  ) {
    manage(a);
    if (input.mode === "SIMULATED" && !simulationEnabled())
      throw ApiError.forbidden("Simulation is disabled");
    return operation(a, key, "tracking.start", input, async (tx) => {
      const trip = await tripAllowed(tx, input.tripId, a);
      if (
        trip.dispatch.state !== "CONFIRMED" ||
        terminal.includes(trip.status) ||
        !trip.dispatch.vehicles.some((v) => v.vehicleId === input.vehicleId)
      )
        throw ApiError.badRequest(
          "Tracking requires this vehicle on an active dispatched trip",
        );
      if (
        !(await tx.vehicleGPSMapping.findFirst({
          where: {
            vehicleId: input.vehicleId,
            mode: input.mode,
            endedAt: null,
            device: { status: "ACTIVE", provider: { isActive: true } },
          },
        }))
      )
        throw ApiError.badRequest(
          "Map an active device for the selected source mode first",
        );
      const row = await tx.trackingSession.upsert({
        where: { tripId_vehicleId_mode: input },
        create: input,
        update: {},
      });
      await audit(tx, a, "tracking.session.started", row.id, {
        tripId: row.tripId,
        mode: row.mode,
      });
      trackingEvents.emit("changed", "tracking.lifecycle");
      return row;
    });
  },

  async ingest(
    providerId: string,
    values: Observation[],
    a?: AuthenticatedUser,
  ) {
    const results = [];
    for (const value of values) {
      try {
        const result = await prisma.$transaction(
          async (tx) => {
            const provider = await tx.gPSProviderConfiguration.findUnique({
              where: { id: providerId },
            });
            if (!provider || !provider.isActive)
              throw ApiError.badRequest("Provider is inactive");
            if (provider.mode === "SIMULATED" && !simulationEnabled())
              throw ApiError.forbidden("Simulation is disabled");

            const payloadHash = createHash("sha256")
              .update(JSON.stringify(value))
              .digest("hex");
            const duplicate = await tx.gPSLocation.findUnique({
              where: {
                providerId_eventId: { providerId, eventId: value.eventId },
              },
            });
            if (duplicate) {
              if (duplicate.payloadHash !== payloadHash)
                throw ApiError.conflict(
                  "Provider event ID was reused with different data",
                );
              if (a) await sessionAllowed(tx, duplicate.sessionId, a);
              return {
                id: duplicate.id,
                sessionId: duplicate.sessionId,
                duplicate: true,
                mode: duplicate.mode,
              };
            }

            const gpsAt = new Date(value.gpsAt);
            if (gpsAt.getTime() > Date.now() + 60000)
              throw ApiError.badRequest(
                "GPS timestamp is too far in the future",
              );

            const d = await tx.gPSDevice.findUnique({
              where: {
                providerId_externalId: {
                  providerId,
                  externalId: value.deviceExternalId,
                },
              },
            });
            if (!d || d.status !== "ACTIVE")
              throw ApiError.badRequest("Unknown or inactive GPS device");

            await tx.$queryRaw`SELECT id FROM gps_devices WHERE id=${d.id} FOR UPDATE`;

            const already = await tx.gPSLocation.findUnique({
              where: {
                providerId_eventId: { providerId, eventId: value.eventId },
              },
            });
            if (already) {
              if (already.payloadHash !== payloadHash)
                throw ApiError.conflict(
                  "Provider event ID was reused with different data",
                );
              if (a) await sessionAllowed(tx, already.sessionId, a);
              return {
                id: already.id,
                sessionId: already.sessionId,
                duplicate: true,
                mode: already.mode,
              };
            }

            const mapping = await tx.vehicleGPSMapping.findFirst({
              where: {
                deviceId: d.id,
                startedAt: { lte: gpsAt },
                OR: [{ endedAt: null }, { endedAt: { gt: gpsAt } }],
              },
              orderBy: { startedAt: "desc" },
            });
            if (!mapping)
              throw ApiError.badRequest(
                "Device has no vehicle mapping at the GPS timestamp",
              );

            const candidates = await tx.trip.findMany({
              where: {
                ...(value.tripId
                  ? { id: value.tripId }
                  : { status: { notIn: ["DELIVERED", "CANCELLED"] } }),
                dispatch: {
                  state: "CONFIRMED",
                  vehicles: { some: { vehicleId: mapping.vehicleId } },
                },
              },
              include: { dispatch: true },
            });
            if (candidates.length !== 1)
              throw ApiError.conflict(
                "No unique dispatched trip for this device; supply the correct trip ID",
              );
            const trip = candidates[0];

            await tx.$queryRaw`SELECT id FROM trips WHERE id=${trip.id} FOR UPDATE`;

            const currentTrip = await tx.trip.findUniqueOrThrow({
              where: { id: trip.id },
            });
            const end =
              currentTrip.actualArrivalAt ??
              (terminal.includes(currentTrip.status)
                ? currentTrip.updatedAt
                : null);

            if (
              !currentTrip.actualStartAt ||
              gpsAt < currentTrip.actualStartAt ||
              (end && gpsAt > end)
            )
              throw ApiError.badRequest(
                "GPS timestamp is outside the actual trip window",
              );

            let session = await tx.trackingSession.findUnique({
              where: {
                tripId_vehicleId_mode: {
                  tripId: trip.id,
                  vehicleId: mapping.vehicleId,
                  mode: provider.mode,
                },
              },
            });
            if (!session) {
              if (terminal.includes(currentTrip.status))
                throw ApiError.badRequest(
                  "Closed trips cannot start new tracking sessions",
                );
              session = await tx.trackingSession.create({
                data: {
                  tripId: trip.id,
                  vehicleId: mapping.vehicleId,
                  mode: provider.mode,
                },
              });
            }

            await tx.$queryRaw`SELECT id FROM tracking_sessions WHERE id=${session.id} FOR UPDATE`;

            session = await tx.trackingSession.findUniqueOrThrow({
              where: { id: session.id },
            });
            if (a) await sessionAllowed(tx, session.id, a);

            const fp = createHash("sha256")
              .update(
                JSON.stringify({
                  providerId,
                  deviceId: d.id,
                  sessionId: session.id,
                  gpsAt: value.gpsAt,
                  latitude: value.latitude,
                  longitude: value.longitude,
                  quality: value.quality,
                  speedKph: value.speedKph,
                  heading: value.heading,
                  address: value.address,
                  eta: value.eta,
                }),
              )
              .digest("hex");
            const same = await tx.gPSLocation.findUnique({
              where: { fingerprint: fp },
            });
            if (same)
              return {
                id: same.id,
                sessionId: session.id,
                duplicate: true,
                mode: same.mode,
              };

            const late = Boolean(
              session.lastObservedAt && gpsAt <= session.lastObservedAt,
            );
            const row = await tx.gPSLocation.create({
              data: {
                sessionId: session.id,
                vehicleId: mapping.vehicleId,
                tripId: trip.id,
                deviceId: d.id,
                providerId,
                mode: provider.mode,
                eventId: value.eventId,
                payloadHash,
                fingerprint: fp,
                latitude: value.latitude ?? null,
                longitude: value.longitude ?? null,
                speedKph: value.speedKph,
                heading: value.heading,
                address: value.address,
                eta: value.eta ? new Date(value.eta) : undefined,
                gpsAt,
                quality: value.quality,
                isLate: late,
              },
            });

            if (!late) {
              const p = await policy(tx);
              const valid = value.quality !== "NO_FIX";
              await tx.trackingSession.update({
                where: { id: session.id },
                data: {
                  lastObservedAt: gpsAt,
                  signalLost: !valid,
                  ...(valid
                    ? {
                        latestLocationId: row.id,
                        lastGPSAt: gpsAt,
                        stationarySince:
                          value.speedKph !== undefined &&
                          value.speedKph <= p.movingSpeedKph
                            ? (session.stationarySince ?? gpsAt)
                            : null,
                      }
                    : {}),
                },
              });

              if (valid) {
                const fences = await relatedFences(tx, session);
                for (const f of fences) {
                  const isInside = inside(f, [
                    value.latitude!,
                    value.longitude!,
                  ]);
                  const old = await tx.geofenceState.findUnique({
                    where: {
                      sessionId_geofenceId: {
                        sessionId: session.id,
                        geofenceId: f.id,
                      },
                    },
                  });
                  const changed =
                    old && old.revision === f.revision
                      ? old.inside !== isInside
                      : isInside;

                  await tx.geofenceState.upsert({
                    where: {
                      sessionId_geofenceId: {
                        sessionId: session.id,
                        geofenceId: f.id,
                      },
                    },
                    create: {
                      sessionId: session.id,
                      geofenceId: f.id,
                      inside: isInside,
                      revision: f.revision,
                      gpsAt,
                    },
                    update: { inside: isInside, revision: f.revision, gpsAt },
                  });

                  if (changed) {
                    const type = isInside ? "ENTRY" : "EXIT";
                    await tx.geofenceEvent.create({
                      data: {
                        sessionId: session.id,
                        geofenceId: f.id,
                        type,
                        gpsAt,
                      },
                    });
                    if (
                      p.alertsEnabled &&
                      (isInside ? f.alertOnEntry : f.alertOnExit)
                    )
                      await raise(
                        tx,
                        session,
                        "GEOFENCE_" + type,
                        "INFO",
                        `${type === "ENTRY" ? "Entered" : "Exited"} configured geofence ${f.name}; this is an observation only`,
                        `${f.id}:${type}`,
                      );
                  }
                }
              }
            }

            const refreshed = await tx.trackingSession.findUniqueOrThrow({
              where: { id: session.id },
              include: { latestLocation: true },
            });
            await evaluateTx(tx, refreshed);
            return {
              id: row.id,
              sessionId: session.id,
              duplicate: false,
              isLate: late,
              mode: provider.mode,
            };
          },
          { timeout: 30000, maxWait: 15000 },
        );
        results.push({ eventId: value.eventId, success: true, ...result });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        ) {
          results.push({
            eventId: value.eventId,
            success: false,
            error: "Concurrent duplicate update; retry the identical event",
          });
        } else if (e instanceof ApiError) {
          results.push({
            eventId: value.eventId,
            success: false,
            status: e.statusCode,
            error: e.message,
          });
        } else throw e;
      }
    }

    trackingEvents.emit("changed", "tracking.location");
    return results;
  },

  async manual(
    input: { deviceId: string; observation: Observation },
    a: AuthenticatedUser,
  ) {
    manage(a);
    const d = await prisma.gPSDevice.findUnique({
      where: { id: input.deviceId },
      include: { provider: true },
    });
    if (!d || d.provider.mode !== "SIMULATED")
      throw ApiError.badRequest(
        "Manual updates require a SIMULATED device/provider",
      );
    if (input.observation.deviceExternalId !== d.externalId)
      throw ApiError.badRequest("Device identity does not match");
    return this.ingest(d.providerId, [input.observation], a);
  },

  async maintain(a?: AuthenticatedUser) {
    const where = a ? await sessionWhere(a) : {};
    const rows = await prisma.trackingSession.findMany({
      where: { AND: [where, { state: "ACTIVE" }] },
      select: { id: true },
    });
    for (const s of rows)
      await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM tracking_sessions WHERE id=${s.id} FOR UPDATE`;
          const row = await tx.trackingSession.findUniqueOrThrow({
            where: { id: s.id },
            include: { latestLocation: true },
          });
          await evaluateTx(tx, row);
        },
        { timeout: 15000 },
      );
    trackingEvents.emit("changed", "tracking.alert");
    return { evaluated: rows.length };
  },

  async sessions(query: Query, a: AuthenticatedUser, vehicleId?:string) {
    await this.maintain(a);
    const where = {...await sessionWhere(a, query),...(vehicleId?{vehicleId}:{})};
    const [data, total] = await prisma.$transaction([
      prisma.trackingSession.findMany({
        where,
        include: { latestLocation: true },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.trackingSession.count({ where }),
    ]);
    const ids = [...new Set(data.map((s) => s.tripId))];
    const trips = await prisma.trip.findMany({
      where: { id: { in: ids } },
      include: {
        dispatch: {
          include: { driver: true, allocation: { include: { ticket: true } } },
        },
      },
    });
    const vehicles = await prisma.vehicle.findMany({
      where: { id: { in: data.map((s) => s.vehicleId) } },
      select: { id: true, vehicleCode: true, registrationNumber: true },
    });
    return {
      data: data.map((s) => ({
        ...s,
        trip: trips.find((t) => t.id === s.tripId),
        vehicle: vehicles.find((v) => v.id === s.vehicleId),
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  },

  async snapshot(query: Query, a: AuthenticatedUser) {
    const p = await policy();
    const where = await sessionWhere(a, query);
    const data = await prisma.trackingSession.findMany({
      where: { AND: [where, { state: "ACTIVE" }] },
      include: { latestLocation: true },
      orderBy: { createdAt: "asc" },
    });
    const trips = await prisma.trip.findMany({
      where: { dispatch: await dispatchScope(a) },
      include: {
        dispatch: {
          include: {
            driver: true,
            allocation: { include: { ticket: true } },
            vehicles: true,
          },
        },
      },
    });
    const vehicles = await prisma.vehicle.findMany({
      where: {
        id: {
          in: trips.flatMap((t) => t.dispatch.vehicles.map((v) => v.vehicleId)),
        },
      },
      select: { id: true, vehicleCode: true, registrationNumber: true },
    });
    const activeTrips = trips.filter(
      (t) =>
        t.dispatch.state === "CONFIRMED" &&
        !terminal.includes(t.status) &&
        (!query.tripId || t.id === query.tripId) &&
        (!query.depotId ||
          [t.dispatch.sourceDepotId, t.dispatch.destinationDepotId].includes(
            query.depotId,
          )),
    );

    const items = data
      .filter((s) => activeTrips.some((t) => t.id === s.tripId))
      .map((s) => {
        const age =
          (Date.now() - (s.lastGPSAt ?? s.createdAt).getTime()) / 1000;
        const stale = age >= p.staleSeconds;
        const offline = age >= p.offlineSeconds || s.signalLost;
        const trip = activeTrips.find((t) => t.id === s.tripId)!;
        const moving = Boolean(
          !stale &&
          !offline &&
          s.latestLocation?.speedKph !== null &&
          s.latestLocation?.speedKph !== undefined &&
          s.latestLocation.speedKph > p.movingSpeedKph,
        );
        return {
          id: s.id,
          vehicleId: s.vehicleId,
          tripId: s.tripId,
          mode: s.mode,
          state: s.state,
          createdAt: s.createdAt,
          lastGPSAt: s.lastGPSAt,
          lastObservedAt: s.lastObservedAt,
          latestLocation: s.latestLocation,
          trip: {
            id: trip.id,
            reference: trip.reference,
            status: trip.status,
            actualStartAt: trip.actualStartAt,
            dispatch: {
              id: trip.dispatch.id,
              reference: trip.dispatch.reference,
              sourceDepotId: trip.dispatch.sourceDepotId,
              destinationDepotId: trip.dispatch.destinationDepotId,
              plannedDispatchAt: trip.dispatch.plannedDispatchAt,
              expectedDeliveryAt: trip.dispatch.expectedDeliveryAt,
              driver: { name: trip.dispatch.driver.name },
              ticketNumber: trip.dispatch.allocation.ticket.ticketNumber,
            },
          },
          vehicle: vehicles.find((v) => v.id === s.vehicleId),
          signal: offline
            ? "OFFLINE"
            : stale
              ? "STALE"
              : s.latestLocation
                ? "ONLINE"
                : "WAITING",
          motion:
            offline || stale
              ? "UNKNOWN"
              : moving
                ? "MOVING"
                : s.latestLocation?.speedKph != null
                  ? "STATIONARY"
                  : "UNKNOWN",
          markerStyle: offline
            ? "OFFLINE"
            : trip.status === "DELAYED"
              ? "DELAYED"
              : moving
                ? "MOVING"
                : "STATIONARY",
          simulated: s.mode === "SIMULATED",
        };
      });

    const untracked = activeTrips.flatMap((t) =>
      t.dispatch.vehicles
        .filter(
          (v) =>
            !items.some(
              (s) => s.tripId === t.id && s.vehicleId === v.vehicleId,
            ),
        )
        .map((v) => ({
          tripId: t.id,
          tripReference: t.reference,
          vehicle: vehicles.find((x) => x.id === v.vehicleId),
        })),
    );

    return {
      mode: query.mode,
      items,
      untracked,
      summary: {
        activeTrips: activeTrips.length,
        inTransit: activeTrips.reduce(
          (n, t) => n + t.dispatch.vehicles.length,
          0,
        ),
        moving: items.filter((s) => s.motion === "MOVING").length,
        stationary: items.filter((s) => s.motion === "STATIONARY").length,
        delayedTrips: activeTrips.filter(
          (t) =>
            t.status === "DELAYED" ||
            t.dispatch.expectedDeliveryAt < new Date(),
        ).length,
        gpsOffline: items.filter((s) => s.signal === "OFFLINE").length,
        completedTrips: trips.filter((t) => t.status === "DELIVERED").length,
      },
      policy: {
        staleSeconds: p.staleSeconds,
        offlineSeconds: p.offlineSeconds,
      },
    };
  },

  async details(id: string, a: AuthenticatedUser) {
    await this.maintain(a);
    const s = await sessionAllowed(prisma, id, a);
    const trip = await tripAllowed(prisma, s.tripId, a);
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: s.vehicleId },
      select: { id: true, vehicleCode: true, registrationNumber: true },
    });
    const fences = await relatedFences(prisma, s);
    const alerts = await prisma.trackingAlert.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: "desc" },
    });
    const events = await prisma.geofenceEvent.findMany({
      where: { sessionId: id },
      include: { geofence: { select: { name: true, kind: true } } },
      orderBy: { gpsAt: "asc" },
    });
    const depots = await prisma.depot.findMany({
      where: {
        id: {
          in: [trip.dispatch.sourceDepotId, trip.dispatch.destinationDepotId],
        },
      },
      select: { id: true, name: true },
    });
    await audit(prisma, a, "tracking.location.read", id, {
      tripId: s.tripId,
      mode: s.mode,
    });
    return {
      ...s,
      trip,
      vehicle,
      fences,
      alerts,
      geofenceEvents: events,
      depots,
    };
  },

  async history(id: string, query: Query, a: AuthenticatedUser) {
    const s = await sessionAllowed(prisma, id, a);
    const where: Prisma.GPSLocationWhereInput = {
      sessionId: id,
      ...(query.from || query.to
        ? {
            gpsAt: {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            },
          }
        : {}),
    };
    const [data, total] = await prisma.$transaction([
      prisma.gPSLocation.findMany({
        where,
        orderBy: [{ gpsAt: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.gPSLocation.count({ where }),
    ]);
    await audit(prisma, a, "tracking.history.read", id, {
      mode: s.mode,
      from: query.from,
      to: query.to,
    });
    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  },

  async alerts(query: Query, a: AuthenticatedUser) {
    await this.maintain(a);
    const where: Prisma.TrackingAlertWhereInput = {
      session: await sessionWhere(a, query),
    };
    const [data, total] = await prisma.$transaction([
      prisma.trackingAlert.findMany({
        where,
        include: {
          session: { select: { tripId: true, vehicleId: true, mode: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.trackingAlert.count({ where }),
    ]);
    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  },

  async alertAction(
    id: string,
    action: "acknowledge" | "resolve",
    remarks: string,
    a: AuthenticatedUser,
    key: string,
  ) {
    manage(a);
    return operation(
      a,
      key,
      "tracking.alert." + action,
      { id, remarks },
      async (tx) => {
        const row = await tx.trackingAlert.findUnique({ where: { id } });
        if (!row) throw ApiError.notFound();
        await sessionAllowed(tx, row.sessionId, a);
        await tx.$queryRaw`SELECT id FROM tracking_alerts WHERE id=${id} FOR UPDATE`;
        const current = await tx.trackingAlert.findUniqueOrThrow({
          where: { id },
        });
        if (current.status === "RESOLVED")
          throw ApiError.conflict("Alert is already resolved");
        const out = await tx.trackingAlert.update({
          where: { id },
          data:
            action === "acknowledge"
              ? {
                  status: "ACKNOWLEDGED",
                  acknowledgedById: a.id,
                  acknowledgedAt: new Date(),
                }
              : {
                  status: "RESOLVED",
                  resolutionRemarks: remarks,
                  resolvedById: a.id,
                  resolvedAt: new Date(),
                },
        });
        await audit(tx, a, "tracking.alert." + action, id, { remarks });
        trackingEvents.emit("changed", "tracking.alert");
        return out;
      },
    );
  },

  async geofences(a: AuthenticatedUser) {
    manage(a);
    if (isTrackingAdmin(a))
      return prisma.geofence.findMany({ orderBy: { name: "asc" } });
    const trips = await prisma.trip.findMany({
      where: { dispatch: await dispatchScope(a) },
      select: { id: true },
    });
    return prisma.geofence.findMany({
      where: {
        OR: [
          { depotId: { in: a.depotIds } },
          { tripId: { in: trips.map((t) => t.id) } },
        ],
      },
      orderBy: { name: "asc" },
    });
  },

  async saveGeofence(
    id: string | undefined,
    input: Prisma.GeofenceUncheckedCreateInput,
    a: AuthenticatedUser,
    key: string,
  ) {
    manage(a);
    return operation(a, key, "tracking.geofence", { id, input }, async (tx) => {
      if (id && !(await this.geofences(a)).some((f) => f.id === id))
        throw ApiError.notFound();
      if (input.tripId) await tripAllowed(tx, input.tripId, a);
      if (
        input.depotId &&
        !(await tx.depot.findUnique({ where: { id: input.depotId } }))
      )
        throw ApiError.badRequest("Depot not found");
      if (
        input.organizationId &&
        !(await tx.organization.findUnique({
          where: { id: input.organizationId },
        }))
      )
        throw ApiError.badRequest("Organization not found");
      if (
        !isTrackingAdmin(a) &&
        !((input.depotId && a.depotIds.includes(input.depotId)) || input.tripId)
      )
        throw ApiError.forbidden(
          "Geofence must be bound to an assigned depot or authorized trip",
        );
      if (input.shape === "POLYGON" && !polygonValid(input.polygon as Point[]))
        throw ApiError.badRequest(
          "Polygon must be non-self-intersecting with distinct vertices and nonzero area",
        );
      const out = id
        ? await tx.geofence.update({
            where: { id },
            data: { ...input, revision: { increment: 1 } },
          })
        : await tx.geofence.create({ data: { ...input, createdById: a.id } });
      await audit(tx, a, "tracking.geofence.saved", out.id, {
        name: out.name,
        revision: out.revision,
      });
      return out;
    });
  },

  async plannedRoute(
    id: string,
    points: Point[],
    reason: string,
    a: AuthenticatedUser,
    key: string,
  ) {
    manage(a);
    return operation(
      a,
      key,
      "tracking.route",
      { id, points, reason },
      async (tx) => {
        await sessionAllowed(tx, id, a);
        await tx.$queryRaw`SELECT id FROM tracking_sessions WHERE id=${id} FOR UPDATE`;
        const row = await tx.trackingSession.update({
          where: { id },
          data: { plannedRoute: points, routeApprovedById: a.id },
        });
        await audit(tx, a, "tracking.route.approved", id, {
          reason,
          points: points.length,
        });
        return row;
      },
    );
  },

  async retention() {
    const p = await policy();
    const cutoff = new Date(Date.now() - p.retentionDays * 86400000);
    const keep = await prisma.trackingSession.findMany({
      where: { state: "ACTIVE", latestLocationId: { not: null } },
      select: { latestLocationId: true },
    });
    const removed = await prisma.gPSLocation.deleteMany({
      where: {
        receivedAt: { lt: cutoff },
        id: { notIn: keep.map((s) => s.latestLocationId!) },
      },
    });
    return { deleted: removed.count, retentionDays: p.retentionDays };
  },

  async pull(id: string, a: AuthenticatedUser) {
    manage(a);
    if (!isTrackingAdmin(a)) throw ApiError.forbidden();
    const p = await prisma.gPSProviderConfiguration.findUnique({
      where: { id },
    });
    if (!p || !p.isActive || p.mode !== "REAL" || p.adapter !== "GENERIC_API")
      throw ApiError.badRequest("Active real API provider is required");
    try {
      const adapter = providerAdapter(p.adapter);
      if (!adapter.pull)
        throw ApiError.badRequest("Adapter does not support polling");
      return await this.ingest(id, await adapter.pull(p));
    } catch (e) {
      await prisma.gPSProviderConfiguration.update({
        where: { id },
        data: { lastErrorAt: new Date(), lastErrorCode: "PULL_FAILED" },
      });
      logger.warn("GPS provider communication failed", {
        provider: p.slug,
        code: "PULL_FAILED",
      });
      throw ApiError.badRequest(
        "GPS provider communication failed; verify backend configuration and provider availability",
      );
    }
  },
};
