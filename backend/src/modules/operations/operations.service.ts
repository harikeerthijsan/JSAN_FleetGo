import { Prisma, TripState, VehicleStatus } from "@prisma/client";
import { prisma } from "../../database/prisma";
import { ApiError } from "../../utils/ApiError";
import type { AuthenticatedUser } from "../../types/auth";
import { settingsService } from "../settings/settings.service";
import {
  inventoryScope,
  operation,
  expireLocked,
  lockVehicle,
} from "../inventory/inventory.service";
import {
  allocateInventoryTx,
  releaseInventoryTx,
  dispatchInventoryTx,
  transitInventoryTx,
  deliveryInventoryTx,
} from "../inventory/operations.integration";
import { notificationsService } from "../tickets/notifications.service";
import type {
  AllocationInput,
  DispatchInput,
  Query,
} from "./operations.validators";
type Tx = Prisma.TransactionClient;
const globalActor = (a: AuthenticatedUser) =>
  ["SUPER_ADMIN", "JSAN_ADMIN"].includes(a.role.name);
const allocator = (a: AuthenticatedUser) =>
  a.permissions.includes("allocation:manage");
const dispatcher = (a: AuthenticatedUser) =>
  a.permissions.includes("dispatch:manage");
const allocationInclude = {
  ticket: true,
  items: true,
  dispatches: { include: { trip: true } },
} satisfies Prisma.VehicleAllocationInclude;
const dispatchInclude = {
  allocation: { include: { ticket: true } },
  driver: true,
  vehicles: { include: { allocationItem: true } },
  evidence: true,
  assignments: { orderBy: { createdAt: "desc" } },
  trip: {
    include: { events: { orderBy: { occurredAt: "asc" } }, exceptions: true },
  },
} satisfies Prisma.DispatchInclude;
async function audit(
  tx: Tx,
  a: AuthenticatedUser,
  action: string,
  id: string,
  data: unknown,
) {
  await tx.auditLog.create({
    data: {
      actorId: a.id,
      action,
      entityType: "Operations",
      entityId: id,
      metadata: JSON.parse(JSON.stringify(data)),
    },
  });
}
async function code(tx: Tx, name: string, prefix: string) {
  const c = await tx.counter.upsert({
    where: { name },
    create: { name, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${prefix}-${String(c.value).padStart(6, "0")}`;
}
function sourceAllowed(a: AuthenticatedUser, depot: string) {
  if (
    !globalActor(a) &&
    (!a.depotIds.includes(depot) ||
      !["OPERATIONS_MANAGER"].includes(a.role.name))
  )
    throw ApiError.forbidden("Source depot is outside your operational scope");
}
export async function allocationScope(
  a: AuthenticatedUser,
): Promise<Prisma.VehicleAllocationWhereInput> {
  if (globalActor(a)) return {};
  if (a.role.name === "OPERATIONS_MANAGER")
    return { sourceDepotId: { in: a.depotIds } };
  if (a.role.name === "TRANSPORTER_DRIVER") return { id: "__none__" };
  if (a.organizationType === "TRANSPORT_PARTNER")
    return { transporterId: a.organizationId ?? "__none__" };
  return {
    OR: [
      { receivingOrgId: a.organizationId ?? "__none__" },
      { ticket: { requestingOrgId: a.organizationId ?? "__none__" } },
    ],
  };
}
export async function dispatchScope(
  a: AuthenticatedUser,
): Promise<Prisma.DispatchWhereInput> {
  if (a.role.name === "TRANSPORTER_DRIVER") return { driver: { userId: a.id } };
  if (a.organizationType === "TRANSPORT_PARTNER" && !globalActor(a))
    return { transporterId: a.organizationId ?? "__none__" };
  return { allocation: await allocationScope(a) };
}
async function getAllocation(tx: Tx, id: string, a: AuthenticatedUser) {
  const r = await tx.vehicleAllocation.findFirst({
    where: { id, AND: await allocationScope(a) },
    include: allocationInclude,
  });
  if (!r) throw ApiError.notFound("Allocation not found in your scope");
  return r;
}
async function getDispatch(tx: Tx, id: string, a: AuthenticatedUser) {
  const r = await tx.dispatch.findFirst({
    where: { id, AND: await dispatchScope(a) },
    include: dispatchInclude,
  });
  if (!r) throw ApiError.notFound("Dispatch not found in your scope");
  const vehicleDetails = await tx.vehicle.findMany({
    where: { id: { in: r.vehicles.map((v) => v.vehicleId) } },
    select: {
      id: true,
      vehicleCode: true,
      registrationNumber: true,
      vin: true,
    },
  });
  return { ...r, vehicleDetails };
}
async function lockAllocation(tx: Tx, id: string, a: AuthenticatedUser) {
  const existing = await getAllocation(tx, id, a);
  await tx.$queryRaw`SELECT id FROM tickets WHERE id=${existing.ticketId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM vehicle_allocations WHERE id=${id} FOR UPDATE`;
  return getAllocation(tx, id, a);
}
async function lockDispatch(tx: Tx, id: string, a: AuthenticatedUser) {
  const existing = await getDispatch(tx, id, a);
  await tx.$queryRaw`SELECT id FROM tickets WHERE id=${existing.allocation.ticketId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM vehicle_allocations WHERE id=${existing.allocationId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM dispatches WHERE id=${id} FOR UPDATE`;
  return getDispatch(tx, id, a);
}
async function approved(tx: Tx, id: string) {
  const t = await tx.ticket.findUnique({ where: { id } });
  if (
    !t ||
    t.approvalStatus !== "APPROVED" ||
    !["APPROVED", "IN_PROGRESS", "ON_HOLD"].includes(t.status)
  )
    throw ApiError.conflict(
      "Allocation/dispatch requires a currently approved operational ticket",
    );
  if (
    await tx.ticketApproval.count({
      where: { ticketId: id, state: { not: "APPROVED" } },
    })
  )
    throw ApiError.conflict("Ticket has incomplete approval steps");
  return t;
}
async function activeOrg(tx: Tx, id: string, type?: "TRANSPORT_PARTNER") {
  const r = await tx.organization.findFirst({
    where: { id, status: "ACTIVE", ...(type ? { type } : {}) },
  });
  if (!r)
    throw ApiError.badRequest(
      type
        ? "Active transport partner required"
        : "Active receiving organization required",
    );
  return r;
}
async function validDriver(
  tx: Tx,
  id: string,
  transporterId: string,
  through: Date,
) {
  await activeOrg(tx, transporterId, "TRANSPORT_PARTNER");
  const d = await tx.driver.findUnique({ where: { id } });
  if (
    !d ||
    d.status !== "ACTIVE" ||
    d.transporterId !== transporterId ||
    d.licenseExpiry < through ||
    d.licenseExpiry < new Date()
  )
    throw ApiError.badRequest(
      "Driver must be active, belong to this transporter and hold a license valid through delivery",
    );
  return d;
}
async function event(
  tx: Tx,
  tripId: string,
  a: AuthenticatedUser,
  type: string,
  description: string,
  fromStatus?: TripState,
  toStatus?: TripState,
) {
  return tx.tripEvent.create({
    data: { tripId, actorId: a.id, type, description, fromStatus, toStatus },
  });
}
async function notifyOps(
  tx: Tx,
  a: AuthenticatedUser,
  sourceDepotId: string,
  title: string,
  ticketId: string,
) {
  const users = await tx.user.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { role: { name: { in: ["SUPER_ADMIN", "JSAN_ADMIN"] } } },
        {
          role: { name: "OPERATIONS_MANAGER" },
          depots: { some: { depotId: sourceDepotId } },
        },
      ],
    },
    select: { id: true },
  });
  await notificationsService.notifyMany(
    users.map((u) => u.id).filter((id) => id !== a.id),
    { type: "TICKET_STATUS_CHANGED", title, ticketId },
    tx,
  );
}
export const operationsService = {
  async lookups(a: AuthenticatedUser) {
    const [depots, organizations, drivers, types, makes, models, users] =
      await Promise.all([
        prisma.depot.findMany({
          where: { status: "ACTIVE" },
          select: { id: true, name: true },
        }),
        prisma.organization.findMany({
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            contactName: true,
            contactEmail: true,
            contactPhone: true,
          },
        }),
        dispatcher(a) ? prisma.driver.findMany() : Promise.resolve([]),
        prisma.vehicleType.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
        }),
        prisma.vehicleMake.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
        }),
        prisma.vehicleModel.findMany({
          where: { isActive: true },
          select: { id: true, name: true, makeId: true },
        }),
        dispatcher(a)
          ? prisma.user.findMany({
              where: {
                status: "ACTIVE",
                organization: { type: "TRANSPORT_PARTNER" },
              },
              select: { id: true, fullName: true, organizationId: true },
            })
          : Promise.resolve([]),
      ]);
    return { depots, organizations, drivers, types, makes, models, users };
  },
  async queue(a: AuthenticatedUser) {
    if (!allocator(a)) throw ApiError.forbidden();
    const tickets = await prisma.ticket.findMany({
      where: {
        approvalStatus: "APPROVED",
        status: { in: ["APPROVED", "IN_PROGRESS", "ON_HOLD"] },
        ...(globalActor(a)
          ? {}
          : {
              OR: [
                { sourceDepotId: { in: a.depotIds } },
                { sourceDepotId: null },
              ],
            }),
      },
      include: { allocations: { include: { items: true } } },
      orderBy: { createdAt: "asc" },
    });
    return tickets.map((t) => {
      const allocated = t.allocations.flatMap((g) =>
        g.items.filter((i) => !i.cancelledAt),
      ).length;
      return {
        ...t,
        requested: t.requestedQuantity ?? 1,
        allocated,
        pending: Math.max(0, (t.requestedQuantity ?? 1) - allocated),
      };
    });
  },
  async available(q: Query, a: AuthenticatedUser) {
    if (!allocator(a)) throw ApiError.forbidden();
    const scope = inventoryScope(a);
    const expired = await prisma.vehicleInventory.findMany({
      where: { AND: [scope, { activeReservationId: { not: null } }] },
      select: { vehicleId: true },
    });
    for (const r of expired)
      await prisma.$transaction(async (tx) => {
        await lockVehicle(tx, r.vehicleId);
        await expireLocked(tx, r.vehicleId, a);
      });
    const status=q.status??"AVAILABLE";
    if(!Object.values(VehicleStatus).includes(status as VehicleStatus))throw ApiError.badRequest("Invalid vehicle status filter");
    const eligibleOnly=status==="AVAILABLE";
    const where: Prisma.VehicleInventoryWhereInput = {
      AND: [
        scope,
        {
          inInventory: true,
          currentDepotId: q.depotId ?? { not: null },
          ...(eligibleOnly?{currentCustodianType:{not:"VENDOR" as const},activeReservationId:null}:{}),
          vehicle: {
            ...(eligibleOnly?{isActive:true}:{}),
            status: status as VehicleStatus,
            ...(q.typeId ? { typeId: q.typeId } : {}),
            ...(q.makeId ? { makeId: q.makeId } : {}),
            ...(q.modelId ? { modelId: q.modelId } : {}),
            ...(q.search
              ? {
                  OR: [
                    {
                      vehicleCode: { contains: q.search, mode: "insensitive" },
                    },
                    {
                      registrationNumber: {
                        contains: q.search,
                        mode: "insensitive",
                      },
                    },
                  ],
                }
              : {}),
          },
        },
      ],
    };
    const [rows, total] = await prisma.$transaction([
      prisma.vehicleInventory.findMany({
        where,
        include: {
          vehicle: {
            include: { make: true, model: true, type: true, depot: true },
          },
        },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { vehicleId: "asc" },
      }),
      prisma.vehicleInventory.count({ where }),
    ]);
    const active = await prisma.inventoryAllocation.findMany({
      where: {
        vehicleId: { in: rows.map((r) => r.vehicleId) },
        releasedAt: null,
      },
      select: { vehicleId: true },
    });
    return {
      data: rows.map(r=>({...r,eligible:r.vehicle.status==="AVAILABLE"&&r.vehicle.isActive&&r.currentCustodianType!=="VENDOR"&&!r.activeReservationId&&!active.some(x=>x.vehicleId===r.vehicleId)})),
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      },
    };
  },
  async allocate(input: AllocationInput, a: AuthenticatedUser, key: string) {
    if (!allocator(a)) throw ApiError.forbidden();
    return operation(a, key, "allocation.create", input, async (tx) => {
      await tx.$queryRaw`SELECT id FROM tickets WHERE id=${input.ticketId} FOR UPDATE`;
      const t = await approved(tx, input.ticketId);
      sourceAllowed(a, input.sourceDepotId);
      if (t.sourceDepotId && t.sourceDepotId !== input.sourceDepotId)
        throw ApiError.badRequest("Source does not match the approved ticket");
      if (
        t.destinationDepotId &&
        t.destinationDepotId !== input.destinationDepotId
      )
        throw ApiError.badRequest("Destination does not match approved ticket");
      if (
        t.vehicleId &&
        (input.vehicleIds.length !== 1 || input.vehicleIds[0] !== t.vehicleId)
      )
        throw ApiError.badRequest("This ticket requires its specified vehicle");
      const used = await tx.vehicleAllocationItem.count({
        where: { allocation: { ticketId: t.id }, cancelledAt: null },
      });
      if (used + input.vehicleIds.length > (t.requestedQuantity ?? 1))
        throw ApiError.conflict(
          "Selected quantity exceeds the ticket’s remaining approved quantity",
        );
      await activeOrg(tx, input.receivingOrgId);
      await activeOrg(tx, input.transporterId, "TRANSPORT_PARTNER");
      for (const id of [input.sourceDepotId, input.destinationDepotId])
        if (!(await tx.depot.findFirst({ where: { id, status: "ACTIVE" } })))
          throw ApiError.badRequest("Active source/destination depot required");
      const reference = await code(tx, "allocation", "FG-ALC");
      const row = await tx.vehicleAllocation.create({
        data: {
          ticketId: input.ticketId,
          sourceDepotId: input.sourceDepotId,
          destinationDepotId: input.destinationDepotId,
          receivingOrgId: input.receivingOrgId,
          transporterId: input.transporterId,
          reference,
          allocatedById: a.id,
          plannedDispatchAt: new Date(input.plannedDispatchAt),
          expectedDeliveryAt: new Date(input.expectedDeliveryAt),
        } as unknown as Prisma.VehicleAllocationUncheckedCreateInput,
      });
      for (const id of [...input.vehicleIds].sort()) {
        const v = await tx.vehicle.findUnique({ where: { id } });
        if (t.requestedTypeId && v?.typeId !== t.requestedTypeId)
          throw ApiError.badRequest(
            "Selected vehicle type does not match approved request",
          );
        const ledger = await allocateInventoryTx(
          tx,
          id,
          input.receivingOrgId,
          input.sourceDepotId,
          `${reference}:${id}`,
          a,
        );
        await tx.vehicleAllocationItem.create({
          data: {
            allocationId: row.id,
            vehicleId: id,
            inventoryAllocationId: ledger.id,
          },
        });
      }
      await audit(tx, a, "allocation.created", row.id, input);
      return tx.vehicleAllocation.findUniqueOrThrow({
        where: { id: row.id },
        include: allocationInclude,
      });
    });
  },
  async listAllocations(q: Query, a: AuthenticatedUser) {
    const where: Prisma.VehicleAllocationWhereInput = {
      AND: [
        await allocationScope(a),
        ...(q.search
          ? [
              {
                reference: { contains: q.search, mode: "insensitive" as const },
              },
            ]
          : []),
      ],
    };
    const [data, total] = await prisma.$transaction([
      prisma.vehicleAllocation.findMany({
        where,
        include: allocationInclude,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.vehicleAllocation.count({ where }),
    ]);
    return {
      data,
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      },
    };
  },
  async allocation(id: string, a: AuthenticatedUser) {
    const r = await getAllocation(prisma, id, a);
    const vehicles = await prisma.vehicle.findMany({
      where: { id: { in: r.items.map((i) => i.vehicleId) } },
      include: { make: true, model: true, type: true, depot: true },
    });
    return { ...r, vehicles };
  },
  async cancelAllocation(
    id: string,
    reason: string,
    a: AuthenticatedUser,
    key: string,
  ) {
    if (!allocator(a)) throw ApiError.forbidden();
    return operation(
      a,
      key,
      "allocation.cancel",
      { id, reason },
      async (tx) => {
        const r = await lockAllocation(tx, id, a);
        sourceAllowed(a, r.sourceDepotId);
        if (r.state !== "CONFIRMED")
          throw ApiError.conflict("Allocation is already cancelled");
        if (
          await tx.dispatchVehicle.count({
            where: { allocationItem: { allocationId: id }, releasedAt: null },
          })
        )
          throw ApiError.conflict(
            "Cancel associated dispatch plans before cancelling this allocation",
          );
        for (const item of [...r.items].sort((x, y) =>
          x.vehicleId.localeCompare(y.vehicleId),
        )) {
          if (item.cancelledAt) continue;
          await releaseInventoryTx(
            tx,
            item.vehicleId,
            item.inventoryAllocationId,
            reason,
            a,
          );
          await tx.vehicleAllocationItem.update({
            where: { id: item.id },
            data: { cancelledAt: new Date() },
          });
        }
        await tx.vehicleAllocation.update({
          where: { id },
          data: {
            state: "CANCELLED",
            cancelledAt: new Date(),
            cancelReason: reason,
          },
        });
        await audit(tx, a, "allocation.cancelled", id, { reason });
        return { id, state: "CANCELLED" };
      },
    );
  },
  async createDispatch(
    input: DispatchInput,
    a: AuthenticatedUser,
    key: string,
  ) {
    if (!dispatcher(a)) throw ApiError.forbidden();
    return operation(a, key, "dispatch.create", input, async (tx) => {
      const alloc = await lockAllocation(tx, input.allocationId, a);
      sourceAllowed(a, alloc.sourceDepotId);
      await approved(tx, alloc.ticketId);
      if (alloc.state !== "CONFIRMED")
        throw ApiError.conflict("Allocation is not active");
      await validDriver(
        tx,
        input.driverId,
        alloc.transporterId,
        alloc.expectedDeliveryAt,
      );
      const items = alloc.items.filter(
        (i) => input.allocationItemIds.includes(i.id) && !i.cancelledAt,
      );
      if (items.length !== input.allocationItemIds.length)
        throw ApiError.badRequest("Select active items from this allocation");
      if (
        await tx.dispatchVehicle.count({
          where: {
            allocationItemId: { in: input.allocationItemIds },
            releasedAt: null,
          },
        })
      )
        throw ApiError.conflict(
          "A selected item already belongs to a dispatch",
        );
      const ref = await code(tx, "dispatch", "FG-DSP"),
        tripRef = await code(tx, "trip", "FG-TRP");
      const d = await tx.dispatch.create({
        data: {
          reference: ref,
          allocationId: alloc.id,
          driverId: input.driverId,
          transporterId: alloc.transporterId,
          sourceDepotId: alloc.sourceDepotId,
          destinationDepotId: alloc.destinationDepotId,
          destinationAddress: input.destinationAddress,
          plannedDispatchAt: alloc.plannedDispatchAt,
          expectedDeliveryAt: alloc.expectedDeliveryAt,
          transportVehicle: input.transportVehicle,
          instructions: input.instructions,
          createdById: a.id,
          vehicles: {
            create: items.map((i) => ({
              allocationItemId: i.id,
              vehicleId: i.vehicleId,
            })),
          },
          trip: { create: { reference: tripRef } },
        },
        include: dispatchInclude,
      });
      await tx.transportAssignment.create({
        data: {
          dispatchId: d.id,
          driverId: d.driverId,
          transporterId: d.transporterId,
          assignedById: a.id,
          reason: "Initial transport assignment",
        },
      });
      await event(tx, d.trip!.id, a, "CREATED", "Trip planned with dispatch");
      await audit(tx, a, "dispatch.created", d.id, input);
      return d;
    });
  },
  async listDispatches(q: Query, a: AuthenticatedUser) {
    const where: Prisma.DispatchWhereInput = {
      AND: [
        await dispatchScope(a),
        ...(q.search
          ? [
              {
                reference: { contains: q.search, mode: "insensitive" as const },
              },
            ]
          : []),
      ],
    };
    const [data, total] = await prisma.$transaction([
      prisma.dispatch.findMany({
        where,
        include: dispatchInclude,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.dispatch.count({ where }),
    ]);
    return {
      data,
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      },
    };
  },
  dispatch: (id: string, a: AuthenticatedUser) => getDispatch(prisma, id, a),
  async checklist(
    id: string,
    vehicleId: string,
    input: Prisma.DispatchVehicleUpdateInput,
    a: AuthenticatedUser,
    key: string,
  ) {
    if (!dispatcher(a)) throw ApiError.forbidden();
    return operation(
      a,
      key,
      "dispatch.checklist",
      { id, vehicleId, input },
      async (tx) => {
        const d = await lockDispatch(tx, id, a);
        sourceAllowed(a, d.sourceDepotId);
        if (!["PLANNED", "READY"].includes(d.state))
          throw ApiError.conflict(
            "Checklist is locked after departure/cancellation",
          );
        const item = d.vehicles.find((v) => v.vehicleId === vehicleId);
        if (!item) throw ApiError.notFound("Dispatch vehicle not found");
        const out = await tx.dispatchVehicle.update({
          where: { id: item.id },
          data: { ...input, checkedById: a.id, checkedAt: new Date() },
        });
        await tx.dispatch.update({ where: { id }, data: { state: "PLANNED" } });
        await tx.trip.update({
          where: { dispatchId: id },
          data: { status: "PLANNED" },
        });
        await event(
          tx,
          d.trip!.id,
          a,
          "CHECKLIST",
          "Dispatch checklist saved; ready state requires validation again",
        );
        await audit(tx, a, "dispatch.checklist", id, { vehicleId, input });
        return out;
      },
    );
  },
  async assignDriver(
    id: string,
    input: { driverId: string; transporterId: string; reason: string },
    a: AuthenticatedUser,
    key: string,
  ) {
    if (!dispatcher(a)) throw ApiError.forbidden();
    return operation(
      a,
      key,
      "dispatch.assignment",
      { id, input },
      async (tx) => {
        const d = await lockDispatch(tx, id, a);
        sourceAllowed(a, d.sourceDepotId);
        if (!["PLANNED", "READY"].includes(d.state))
          throw ApiError.conflict(
            "Transport assignment is locked after departure",
          );
        await validDriver(
          tx,
          input.driverId,
          input.transporterId,
          d.expectedDeliveryAt,
        );
        await tx.dispatch.update({
          where: { id },
          data: {
            driverId: input.driverId,
            transporterId: input.transporterId,
            state: "PLANNED",
          },
        });
        await tx.trip.update({
          where: { dispatchId: id },
          data: { status: "PLANNED" },
        });
        await tx.transportAssignment.create({
          data: { dispatchId: id, ...input, assignedById: a.id },
        });
        await event(tx, d.trip!.id, a, "ASSIGNMENT", input.reason);
        await audit(tx, a, "dispatch.assignment", id, input);
        return { id, driverId: input.driverId };
      },
    );
  },
  async readiness(tx: Tx, d: Awaited<ReturnType<typeof getDispatch>>) {
    await validDriver(tx, d.driverId, d.transporterId, d.expectedDeliveryAt);
    if (!d.vehicles.length)
      throw ApiError.badRequest("Dispatch has no vehicles");
    for (const v of d.vehicles) {
      if (
        !v.identityVerified ||
        !v.registrationVerified ||
        !v.keysHandedOver ||
        !v.documentsHandedOver ||
        v.odometer === null ||
        v.fuelLevel === null ||
        !v.accessories
      )
        throw ApiError.badRequest(
          "Complete every required checklist field for every vehicle",
        );
      const categories = new Set(
        d.evidence
          .filter(
            (e) =>
              e.vehicleId === v.vehicleId &&
              e.contentType.startsWith("image/") &&
              !e.exceptionId,
          )
          .map((e) => e.category),
      );
      if (!categories.has("FRONT") || !categories.has("REAR"))
        throw ApiError.badRequest(
          "Front and rear photographs are required for every vehicle",
        );
      const inv = await tx.vehicleInventory.findUnique({
        where: { vehicleId: v.vehicleId },
        include: { vehicle: true },
      });
      if (
        !inv ||
        inv.currentDepotId !== d.sourceDepotId ||
        inv.vehicle.status !== "ALLOCATED" ||
        !(await tx.inventoryAllocation.findFirst({
          where: {
            id: v.allocationItem.inventoryAllocationId,
            releasedAt: null,
          },
        }))
      )
        throw ApiError.conflict(
          "A vehicle is no longer allocated at this source",
        );
    }
    if (
      await tx.operationalException.count({
        where: {
          tripId: d.trip!.id,
          status: "OPEN",
          severity: { in: ["HIGH", "CRITICAL"] },
        },
      })
    )
      throw ApiError.conflict(
        "Resolve high/critical operational exceptions before departure",
      );

    // Phase 8 — pre-dispatch inspection gate. A pre-dispatch inspection that
    // has been started must be completed (SUBMITTED/APPROVED/COMPLETED) before
    // the dispatch can be confirmed; a REJECTED inspection blocks dispatch. When
    // INSPECTION_PREDISPATCH_REQUIRED=true a completed inspection must EXIST for
    // every vehicle. This reuses existing dispatch condition photos/checklist and
    // is additive (default off), so earlier phases remain functional.
    // Driven by the Settings registry (Phase 12), falling back to the env flag
    // when the setting is unset. Lets an administrator toggle the requirement.
    const strict = await settingsService.getBool(
      "inspections.preDispatchRequired",
      process.env.INSPECTION_PREDISPATCH_REQUIRED === "true",
    );
    for (const v of d.vehicles) {
      const inspections = await tx.vehicleInspection.findMany({
        where: { vehicleId: v.vehicleId, dispatchId: d.id, type: "PRE_DISPATCH" },
        select: { status: true },
      });
      const done = inspections.some((i) =>
        ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "COMPLETED"].includes(i.status),
      );
      const blocked = inspections.some((i) =>
        ["PENDING", "IN_PROGRESS", "REJECTED"].includes(i.status),
      );
      if (blocked && !done)
        throw ApiError.conflict(
          "A pre-dispatch inspection for this dispatch is incomplete or rejected; complete it before confirmation",
        );
      if (strict && !done)
        throw ApiError.conflict(
          "A completed pre-dispatch inspection is required before dispatch confirmation",
        );
    }
  },
  async ready(id: string, a: AuthenticatedUser, key: string) {
    if (!dispatcher(a)) throw ApiError.forbidden();
    return operation(a, key, "dispatch.ready", { id }, async (tx) => {
      const d = await lockDispatch(tx, id, a);
      sourceAllowed(a, d.sourceDepotId);
      if (d.state !== "PLANNED")
        throw ApiError.conflict("Only planned dispatches may become ready");
      await approved(tx, d.allocation.ticketId);
      await this.readiness(tx, d);
      await tx.dispatch.update({ where: { id }, data: { state: "READY" } });
      await tx.trip.update({
        where: { dispatchId: id },
        data: { status: "READY_FOR_DISPATCH" },
      });
      await event(
        tx,
        d.trip!.id,
        a,
        "READY",
        "Dispatch validations completed",
        d.trip!.status,
        "READY_FOR_DISPATCH",
      );
      return { id, state: "READY" };
    });
  },
  async confirm(id: string, a: AuthenticatedUser, key: string) {
    if (!dispatcher(a)) throw ApiError.forbidden();
    return operation(a, key, "dispatch.confirm", { id }, async (tx) => {
      const d = await lockDispatch(tx, id, a);
      sourceAllowed(a, d.sourceDepotId);
      await approved(tx, d.allocation.ticketId);
      if (!["PLANNED", "READY"].includes(d.state))
        throw ApiError.conflict("Dispatch is already confirmed or cancelled");
      await tx.$queryRaw`SELECT id FROM drivers WHERE id=${d.driverId} FOR UPDATE`;
      if (
        await tx.trip.count({
          where: {
            dispatch: { driverId: d.driverId },
            status: {
              in: [
                "DISPATCHED",
                "IN_TRANSIT",
                "DELAYED",
                "DELIVERY_ATTEMPTED",
                "FAILED_DELIVERY",
              ],
            },
          },
        })
      )
        throw ApiError.conflict(
          "Driver is already assigned to an active departed trip",
        );
      for (const v of [...d.vehicles].sort((x, y) =>
        x.vehicleId.localeCompare(y.vehicleId),
      ))
        await lockVehicle(tx, v.vehicleId);
      await this.readiness(tx, d);
      for (const v of [...d.vehicles].sort((x, y) =>
        x.vehicleId.localeCompare(y.vehicleId),
      ))
        await dispatchInventoryTx(
          tx,
          v.vehicleId,
          v.allocationItem.inventoryAllocationId,
          d.sourceDepotId,
          d.transporterId,
          d.reference,
          a,
        );
      const now = new Date();
      await tx.dispatch.update({
        where: { id },
        data: { state: "CONFIRMED", confirmedAt: now, confirmedById: a.id },
      });
      await tx.trip.update({
        where: { dispatchId: id },
        data: { status: "DISPATCHED", actualStartAt: now },
      });
      await event(
        tx,
        d.trip!.id,
        a,
        "DISPATCHED",
        "Dispatch confirmed and transporter custody recorded",
        d.trip!.status,
        "DISPATCHED",
      );
      await tx.ticket.update({
        where: { id: d.allocation.ticketId },
        data: { status: "IN_PROGRESS" },
      });
      await tx.ticketActivity.create({
        data: {
          ticketId: d.allocation.ticketId,
          actorId: a.id,
          type: "DISPATCHED",
          summary: `${d.reference} dispatched; ticket in progress`,
        },
      });
      await audit(tx, a, "dispatch.confirmed", id, {
        vehicles: d.vehicles.map((v) => v.vehicleId),
      });
      await notifyOps(
        tx,
        a,
        d.sourceDepotId,
        `${d.reference} dispatched`,
        d.allocation.ticketId,
      );
      return { id, tripId: d.trip!.id, status: "DISPATCHED" };
    });
  },
  async tripList(q: Query, a: AuthenticatedUser, trackingOnly = false) {
    const statuses = Object.values(TripState);
    if (q.status && !statuses.includes(q.status as TripState))
      throw ApiError.badRequest("Invalid trip status");
    const where: Prisma.TripWhereInput = {
      dispatch: {
        AND: [
          await dispatchScope(a),
          ...(q.transporterId ? [{ transporterId: q.transporterId }] : []),
          ...(trackingOnly ? [{ state: "CONFIRMED" as const }] : []),
        ],
      },
      ...(trackingOnly
        ? { status: { notIn: ["DELIVERED", "CANCELLED"] as TripState[] } }
        : q.status
          ? { status: q.status as TripState }
          : {}),
      ...(q.search
        ? { reference: { contains: q.search, mode: "insensitive" } }
        : {}),
    };
    const [data, total] = await prisma.$transaction([
      prisma.trip.findMany({
        where,
        include: {
          dispatch: {
            include: {
              driver: true,
              allocation: { include: { ticket: true } },
              vehicles: true,
            },
          },
          events: { orderBy: { occurredAt: "asc" } },
          exceptions: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.trip.count({ where }),
    ]);
    return {
      data,
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      },
    };
  },
  async trip(id: string, a: AuthenticatedUser) {
    const r = await prisma.trip.findUnique({ where: { id } });
    if (!r) throw ApiError.notFound("Trip not found");
    const d = await getDispatch(prisma, r.dispatchId, a);
    return {
      ...d.trip!,
      dispatch: d,
      trackingReady:
        d.state === "CONFIRMED" &&
        !["DELIVERED", "CANCELLED"].includes(d.trip!.status),
    };
  },
  async tripStatus(
    id: string,
    input: { status: TripState; reason: string; delayMinutes: number },
    a: AuthenticatedUser,
    key: string,
  ) {
    if (!dispatcher(a) && !a.permissions.includes("trips:update"))
      throw ApiError.forbidden();
    return operation(a, key, "trip.status", { id, input }, async (tx) => {
      const original = await tx.trip.findUnique({ where: { id } });
      if (!original) throw ApiError.notFound();
      const d = await lockDispatch(tx, original.dispatchId, a);
      const t = d.trip!;
      if (dispatcher(a)) sourceAllowed(a, d.sourceDepotId);
      else if (d.driver.userId !== a.id)
        throw ApiError.forbidden(
          "Only the assigned driver may report trip milestones",
        );
      if (!dispatcher(a) && input.status === "CANCELLED")
        throw ApiError.forbidden("Only operations may cancel a trip");
      const map: Record<TripState, TripState[]> = {
        PLANNED: ["CANCELLED"],
        READY_FOR_DISPATCH: ["CANCELLED"],
        DISPATCHED: [
          "IN_TRANSIT",
          "DELAYED",
          "DELIVERY_ATTEMPTED",
          "FAILED_DELIVERY",
          "DELIVERED",
          "CANCELLED",
        ],
        IN_TRANSIT: [
          "DELAYED",
          "DELIVERY_ATTEMPTED",
          "FAILED_DELIVERY",
          "DELIVERED",
          "CANCELLED",
        ],
        DELAYED: [
          "IN_TRANSIT",
          "DELIVERY_ATTEMPTED",
          "FAILED_DELIVERY",
          "DELIVERED",
          "CANCELLED",
        ],
        DELIVERY_ATTEMPTED: [
          "IN_TRANSIT",
          "DELAYED",
          "DELIVERED",
          "FAILED_DELIVERY",
          "CANCELLED",
        ],
        FAILED_DELIVERY: ["IN_TRANSIT", "CANCELLED"],
        DELIVERED: [],
        CANCELLED: [],
      };
      if (!map[t.status].includes(input.status))
        throw ApiError.badRequest("Invalid trip status transition");
      if (input.status === "DELIVERED") {
        for (const v of [...d.vehicles].sort((x, y) =>
          x.vehicleId.localeCompare(y.vehicleId),
        ))
          await deliveryInventoryTx(
            tx,
            v.vehicleId,
            v.allocationItem.inventoryAllocationId,
            d.destinationDepotId,
            d.allocation.receivingOrgId,
            d.reference,
            a,
          );
      } else if (
        [
          "IN_TRANSIT",
          "DELAYED",
          "DELIVERY_ATTEMPTED",
          "FAILED_DELIVERY",
        ].includes(input.status)
      ) {
        for (const v of [...d.vehicles].sort((x, y) =>
          x.vehicleId.localeCompare(y.vehicleId),
        ))
          await transitInventoryTx(tx, v.vehicleId, a, d.reference);
      } else if (input.status === "CANCELLED" && d.state !== "CONFIRMED") {
        await tx.dispatch.update({
          where: { id: d.id },
          data: { state: "CANCELLED", cancelledAt: new Date() },
        });
        await tx.dispatchVehicle.updateMany({
          where: { dispatchId: d.id },
          data: { releasedAt: new Date() },
        });
      }
      const now = new Date();
      const delay =
        input.status === "DELIVERED"
          ? Math.max(
              input.delayMinutes,
              Math.ceil(
                (now.getTime() - d.expectedDeliveryAt.getTime()) / 60000,
              ),
              0,
            )
          : input.delayMinutes;
      const result = await tx.trip.update({
        where: { id },
        data: {
          status: input.status,
          remarks: input.reason,
          delayMinutes: Math.max(t.delayMinutes, delay),
          ...(input.status === "DELIVERED" ? { actualArrivalAt: now } : {}),
        },
      });
      if (input.status === "DELIVERED") {
        const ticket = d.allocation.ticket;
        const fulfilled = await tx.vehicleAllocationItem.count({
          where: {
            allocation: { ticketId: ticket.id },
            cancelledAt: null,
            dispatchVehicles: {
              some: { dispatch: { trip: { status: "DELIVERED" } } },
            },
          },
        });
        const outstanding = await tx.vehicleAllocationItem.count({
          where: {
            allocation: { ticketId: ticket.id },
            cancelledAt: null,
            dispatchVehicles: {
              none: { dispatch: { trip: { status: "DELIVERED" } } },
            },
          },
        });
        if (fulfilled >= (ticket.requestedQuantity ?? 1) && outstanding === 0) {
          await tx.ticket.update({
            where: { id: ticket.id },
            data: { status: "COMPLETED", completedAt: now },
          });
          await tx.ticketActivity.create({
            data: {
              ticketId: ticket.id,
              actorId: a.id,
              type: "FULFILLED",
              summary:
                "All requested vehicles delivered; receiving verification remains separate",
            },
          });
        }
      }
      await event(tx, id, a, "STATUS", input.reason, t.status, input.status);
      await audit(tx, a, "trip.status", id, input);
      if (input.status === "CANCELLED" && d.state === "CONFIRMED") {
        await tx.operationalException.create({
          data: {
            tripId: id,
            type: "TRIP_CANCELLATION",
            description:
              "Cancelled after departure; inventory remains in recorded transport custody until explicitly recovered",
            severity: "HIGH",
            reportedById: a.id,
          },
        });
      }
      await notifyOps(
        tx,
        a,
        d.sourceDepotId,
        `${t.reference}: ${input.status}`,
        d.allocation.ticketId,
      );
      return result;
    });
  },
  async drivers(a: AuthenticatedUser) {
    if (!dispatcher(a)) throw ApiError.forbidden();
    return prisma.driver.findMany({ orderBy: { name: "asc" } });
  },
  async saveDriver(
    id: string | undefined,
    input: Prisma.DriverUncheckedCreateInput,
    a: AuthenticatedUser,
    key: string,
  ) {
    if (!dispatcher(a)) throw ApiError.forbidden();
    return operation(a, key, "driver.save", { id, input }, async (tx) => {
      await activeOrg(tx, input.transporterId, "TRANSPORT_PARTNER");
      if (
        input.userId &&
        !(await tx.user.findFirst({
          where: {
            id: input.userId,
            organizationId: input.transporterId,
            status: "ACTIVE",
          },
        }))
      )
        throw ApiError.badRequest(
          "Driver account must belong to the transport partner",
        );
      const data = { ...input, licenseExpiry: new Date(input.licenseExpiry) };
      const row = id
        ? await tx.driver.update({ where: { id }, data })
        : await tx.driver.create({ data });
      await audit(tx, a, "driver.saved", row.id, {
        name: row.name,
        status: row.status,
      });
      return row;
    });
  },
  async exceptions(a: AuthenticatedUser) {
    return prisma.operationalException.findMany({
      where: { trip: { dispatch: await dispatchScope(a) } },
      include: { trip: true },
      orderBy: { createdAt: "desc" },
    });
  },
  async exception(
    input: {
      tripId: string;
      type: string;
      description: string;
      severity: string;
    },
    a: AuthenticatedUser,
    key: string,
  ) {
    if (!dispatcher(a) && !a.permissions.includes("trips:update"))
      throw ApiError.forbidden();
    return operation(a, key, "exception.create", input, async (tx) => {
      const t = await tx.trip.findUnique({ where: { id: input.tripId } });
      if (!t) throw ApiError.notFound();
      const d = await lockDispatch(tx, t.dispatchId, a);
      if (!dispatcher(a) && d.driver.userId !== a.id)
        throw ApiError.forbidden();
      const row = await tx.operationalException.create({
        data: { ...input, reportedById: a.id },
      });
      await event(
        tx,
        t.id,
        a,
        "EXCEPTION",
        `${input.type}: ${input.description}`,
      );
      await audit(tx, a, "exception.created", row.id, input);
      await notifyOps(
        tx,
        a,
        d.sourceDepotId,
        `${d.trip!.reference}: ${input.type}`,
        d.allocation.ticketId,
      );
      return row;
    });
  },
  async resolveException(
    id: string,
    notes: string,
    a: AuthenticatedUser,
    key: string,
  ) {
    if (!dispatcher(a)) throw ApiError.forbidden();
    return operation(a, key, "exception.resolve", { id, notes }, async (tx) => {
      const row = await tx.operationalException.findUnique({
        where: { id },
        include: { trip: true },
      });
      if (!row) throw ApiError.notFound();
      const d = await lockDispatch(tx, row.trip.dispatchId, a);
      sourceAllowed(a, d.sourceDepotId);
      if (row.status !== "OPEN")
        throw ApiError.conflict("Exception already resolved");
      await tx.operationalException.update({
        where: { id },
        data: {
          status: "RESOLVED",
          resolutionNotes: notes,
          resolvedById: a.id,
          resolvedAt: new Date(),
        },
      });
      await event(tx, row.tripId, a, "EXCEPTION_RESOLVED", notes);
      await audit(tx, a, "exception.resolved", id, { notes });
      return { id, status: "RESOLVED" };
    });
  },
  async dashboard(a: AuthenticatedUser) {
    const scope = await allocationScope(a),
      ds = await dispatchScope(a);
    const [allocs, dispatches, trips, queue] = await Promise.all([
      prisma.vehicleAllocation.findMany({
        where: scope,
        include: { items: true },
      }),
      prisma.dispatch.findMany({ where: ds }),
      prisma.trip.findMany({
        where: { dispatch: ds },
        include: { dispatch: true },
      }),
      allocator(a) ? this.queue(a) : Promise.resolve([]),
    ]);
    const group = (rows: unknown[], fn: (row: unknown) => string) =>
      Object.entries(
        rows.reduce<Record<string, number>>((out, r) => {
          const k = fn(r);
          out[k] = (out[k] ?? 0) + 1;
          return out;
        }, {}),
      ).map(([label, count]) => ({ label, count }));
    const day = (date: Date) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
        date,
      );
    const today = day(new Date());
    return {
      totalAllocations: allocs.length,
      pendingAllocations: queue.reduce((n, t) => n + t.pending, 0),
      ready: dispatches.filter((d) => d.state === "READY").length,
      dispatchedToday: dispatches.filter(
        (d) => d.confirmedAt && day(d.confirmedAt) === today,
      ).length,
      inTransit: trips.filter((t) => t.status === "IN_TRANSIT").length,
      delayed: trips.filter((t) => t.status === "DELAYED").length,
      delivered: trips.filter((t) => t.status === "DELIVERED").length,
      failed: trips.filter((t) => t.status === "FAILED_DELIVERY").length,
      byStatus: group(trips, (r) => (r as (typeof trips)[number]).status),
      byDepot: group(
        dispatches,
        (r) => (r as (typeof dispatches)[number]).sourceDepotId,
      ),
      byTransporter: group(
        trips,
        (r) => (r as (typeof trips)[number]).dispatch.transporterId,
      ),
      deliveryTiming: [
        {
          label: "On time",
          count: trips.filter(
            (t) =>
              t.status === "DELIVERED" &&
              t.actualArrivalAt! <= t.dispatch.expectedDeliveryAt,
          ).length,
        },
        {
          label: "Delayed",
          count: trips.filter(
            (t) =>
              t.status === "DELIVERED" &&
              t.actualArrivalAt! > t.dispatch.expectedDeliveryAt,
          ).length,
        },
      ],
    };
  },
};
export { getDispatch, lockDispatch, audit, event };
