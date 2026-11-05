import { createHash } from "crypto";
import {
  Prisma,
  VehicleStatus,
  CustodianType,
  MovementType,
} from "@prisma/client";
import { prisma } from "../../database/prisma";
import { ApiError } from "../../utils/ApiError";
import type { AuthenticatedUser } from "../../types/auth";
import type {
  InventoryQuery,
  ReceiptInput,
  TransferInput,
} from "./inventory.validators";

type Tx = Prisma.TransactionClient;
const vehicleInclude = {
  make: true,
  model: true,
  type: true,
  depot: true,
  vendor: true,
  organization: true,
} satisfies Prisma.VehicleInclude;
const admin = (a: AuthenticatedUser) =>
  ["SUPER_ADMIN", "JSAN_ADMIN"].includes(a.role.name);
export function inventoryScope(
  a: AuthenticatedUser,
): Prisma.VehicleInventoryWhereInput {
  if (admin(a)) return {};
  if (
    a.organizationType === "VEHICLE_VENDOR" ||
    a.organizationType === "TRANSPORT_PARTNER"
  )
    return {
      currentCustodianType: "VENDOR",
      currentCustodianId: a.organizationId ?? "__none__",
    };
  if (a.role.name === "OPERATIONS_MANAGER")
    return { currentDepotId: { in: a.depotIds } };
  return {
    OR: [
      { vehicle: { organizationId: a.organizationId ?? "__none__" } },
      { receivedFromOrgId: a.organizationId ?? "__none__" },
    ],
  };
}
export async function lockVehicle(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM vehicles WHERE id = ${id} FOR UPDATE`;
}
async function audit(
  tx: Tx,
  actor: AuthenticatedUser,
  action: string,
  entityId: string,
  metadata: unknown,
) {
  await tx.auditLog.create({
    data: {
      actorId: actor.id,
      action,
      entityType: "Inventory",
      entityId,
      metadata: JSON.parse(JSON.stringify(metadata)),
    },
  });
}
export async function scopedInventory(
  tx: Tx,
  id: string,
  actor: AuthenticatedUser,
) {
  const row = await tx.vehicleInventory.findFirst({
    where: { AND: [{ vehicleId: id }, inventoryScope(actor)] },
    include: { vehicle: { include: vehicleInclude } },
  });
  if (!row)
    throw ApiError.notFound(
      "Inventory vehicle not found in your authorized scope",
    );
  return row;
}
async function ref(tx: Tx, kind: string, id: string) {
  const found =
    kind === "DEPOT"
      ? await tx.depot.findFirst({ where: { id, status: "ACTIVE" } })
      : kind === "USER"
        ? await tx.user.findFirst({ where: { id, status: "ACTIVE" } })
        : await tx.organization.findFirst({ where: { id, status: "ACTIVE" } });
  if (!found)
    throw ApiError.badRequest(`${kind} reference is missing or inactive`);
  if (
    kind === "VENDOR" &&
    "type" in found &&
    !["VEHICLE_VENDOR", "TRANSPORT_PARTNER"].includes(found.type)
  )
    throw ApiError.badRequest(
      "Custodian must be a vendor or transport organization",
    );
}
async function destination(
  tx: Tx,
  depotId: string,
  type: CustodianType,
  custodianId: string,
  actor: AuthenticatedUser,
) {
  await ref(tx, "DEPOT", depotId);
  await ref(tx, type, custodianId);
  if (type === "DEPOT" && custodianId !== depotId)
    throw ApiError.badRequest("Depot custodian must match the current depot");
  if (!admin(actor)) {
    if (actor.role.name === "OPERATIONS_MANAGER") {
      if (!actor.depotIds.includes(depotId))
        throw ApiError.forbidden("Destination is outside your assigned depots");
    } else if (
      actor.organizationType === "VEHICLE_VENDOR" ||
      actor.organizationType === "TRANSPORT_PARTNER"
    ) {
      if (type !== "VENDOR" || custodianId !== actor.organizationId)
        throw ApiError.forbidden(
          "You may only operate within your own custody",
        );
    } else if (type !== "ORGANIZATION" || custodianId !== actor.organizationId)
      throw ApiError.forbidden("Destination is outside your organization");
  }
}
/** Every public mutation is atomic and idempotent; vehicle locks serialize competing operations. */
export async function operation<T>(
  actor: AuthenticatedUser,
  key: string,
  action: string,
  body: unknown,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!key || key.length > 160)
    throw ApiError.badRequest(
      "An Idempotency-Key header (1–160 characters) is required",
    );
  const hash = createHash("sha256")
    .update(JSON.stringify({ action, body }))
    .digest("hex");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.id + ":" + key}))::text`;
          const old = await tx.inventoryOperation.findUnique({
            where: { actorId_key: { actorId: actor.id, key } },
          });
          if (old) {
            if (old.requestHash !== hash)
              throw ApiError.conflict(
                "Idempotency key was already used for different input",
              );
            return old.result as T;
          }
          const result = await fn(tx);
          const json = JSON.parse(JSON.stringify(result));
          await tx.inventoryOperation.create({
            data: {
              actorId: actor.id,
              key,
              action,
              requestHash: hash,
              result: json,
            },
          });
          return result;
        },
        { isolationLevel: "ReadCommitted", maxWait: 15000, timeout: 30000 },
      );
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2034" && attempt < 2) continue;
        if (e.code === "P2002")
          throw ApiError.conflict(
            "A duplicate vehicle, receipt or reservation already exists",
          );
        if (e.code === "P2003")
          throw ApiError.badRequest("A referenced record does not exist");
      }
      throw e;
    }
  }
  throw ApiError.conflict("Concurrent update; please retry");
}
async function setStatus(
  tx: Tx,
  id: string,
  status: VehicleStatus,
  actor: AuthenticatedUser,
  reason: string,
) {
  const v = await tx.vehicle.findUniqueOrThrow({ where: { id } });
  if (v.status === status) return;
  await tx.vehicle.update({
    where: { id },
    data: { status, isActive: status !== "INACTIVE" },
  });
  await tx.vehicleInventory.updateMany({
    where: { vehicleId: id },
    data: { updatedAt: new Date() },
  });
  await tx.vehicleStatusHistory.create({
    data: {
      vehicleId: id,
      fromStatus: v.status,
      toStatus: status,
      reason,
      changedById: actor.id,
    },
  });
  await audit(tx, actor, "inventory.status", id, {
    from: v.status,
    to: status,
    reason,
  });
}
async function expireLocked(tx: Tx, id: string, actor: AuthenticatedUser) {
  const ended = await tx.vehicleReservation.updateMany({
    where: { vehicleId: id, status: "ACTIVE", endDate: { lte: new Date() } },
    data: { status: "EXPIRED" },
  });
  if (ended.count) {
    const inv = await tx.vehicleInventory.findUnique({
      where: { vehicleId: id },
    });
    await tx.vehicleInventory.update({
      where: { vehicleId: id },
      data: { activeReservationId: null },
    });
    const v = await tx.vehicle.findUniqueOrThrow({ where: { id } });
    if (v.status === "RESERVED")
      await setStatus(
        tx,
        id,
        inv?.currentCustodianType === "VENDOR" ? "AT_VENDOR" : "AVAILABLE",
        actor,
        "Reservation expired",
      );
    await audit(tx, actor, "inventory.reservation.expired", id, {
      count: ended.count,
    });
  }
}
async function expireScope(actor: AuthenticatedUser) {
  const rows = await prisma.vehicleInventory.findMany({
    where: {
      AND: [inventoryScope(actor), { activeReservationId: { not: null } }],
    },
    select: { vehicleId: true },
  });
  for (const row of rows)
    await prisma.$transaction(async (tx) => {
      await lockVehicle(tx, row.vehicleId);
      await expireLocked(tx, row.vehicleId, actor);
    });
}
async function available(
  tx: Tx,
  id: string,
  actor: AuthenticatedUser,
  start?: string,
  end?: string,
  depotId?: string,
) {
  const inv = await scopedInventory(tx, id, actor);
  const reasons: string[] = [];
  if (
    !inv.inInventory ||
    !inv.vehicle.isActive ||
    inv.vehicle.status !== "AVAILABLE"
  )
    reasons.push(`Vehicle status is ${inv.vehicle.status}`);
  if (
    !inv.currentCustodianId ||
    !inv.currentDepotId ||
    inv.currentCustodianType === "VENDOR"
  )
    reasons.push("Vehicle is not in available depot custody");
  if (depotId && inv.currentDepotId !== depotId)
    reasons.push("Vehicle is at a different depot");
  const reservations = await tx.vehicleReservation.findMany({
    where: {
      vehicleId: id,
      status: "ACTIVE",
      endDate: { gt: new Date() },
      ...(start && end
        ? { startDate: { lt: new Date(end) }, endDate: { gt: new Date(start) } }
        : {}),
    },
  });
  if (reservations.length || inv.activeReservationId)
    reasons.push("An active reservation exists");
  if (
    await tx.inventoryAllocation.count({
      where: { vehicleId: id, releasedAt: null },
    })
  )
    reasons.push("An active allocation exists");
  return {
    available: reasons.length === 0,
    reasons,
    vehicleId: id,
    status: inv.vehicle.status,
    depotId: inv.currentDepotId,
    custodianType: inv.currentCustodianType,
    custodianId: inv.currentCustodianId,
  };
}
async function movement(
  tx: Tx,
  id: string,
  actor: AuthenticatedUser,
  input: {
    type: MovementType;
    toDepotId: string;
    custodianType: CustodianType;
    custodianId: string;
    occurredAt: Date;
    reason: string;
    reference?: string;
    remarks?: string;
  },
) {
  const inv = await tx.vehicleInventory.findUniqueOrThrow({
    where: { vehicleId: id },
  });
  if (inv.lastMovementAt && input.occurredAt < inv.lastMovementAt)
    throw ApiError.badRequest("Movement cannot predate the latest movement");
  if (input.occurredAt.getTime() > Date.now() + 60000)
    throw ApiError.badRequest("Movement cannot be in the future");
  const row = await tx.vehicleMovement.create({
    data: {
      vehicleId: id,
      type: input.type,
      fromDepotId: inv.currentDepotId,
      toDepotId: input.toDepotId,
      fromCustodianType: inv.currentCustodianType,
      fromCustodianId: inv.currentCustodianId,
      toCustodianType: input.custodianType,
      toCustodianId: input.custodianId,
      occurredAt: input.occurredAt,
      initiatedById: actor.id,
      reason: input.reason,
      reference: input.reference,
      remarks: input.remarks,
    },
  });
  await tx.vehicleCustody.updateMany({
    where: { vehicleId: id, toDate: null },
    data: { toDate: input.occurredAt },
  });
  await tx.vehicleCustody.create({
    data: {
      vehicleId: id,
      custodianType: input.custodianType,
      custodianId: input.custodianId,
      fromDate: input.occurredAt,
      movementId: row.id,
      createdById: actor.id,
    },
  });
  await tx.vehicleInventory.update({
    where: { vehicleId: id },
    data: {
      currentDepotId: input.toDepotId,
      currentCustodianType: input.custodianType,
      currentCustodianId: input.custodianId,
      lastMovementId: row.id,
      lastMovementAt: input.occurredAt,
    },
  });
  await tx.vehicle.update({
    where: { id },
    data: {
      depotId: input.toDepotId,
      vendorId: input.custodianType === "VENDOR" ? input.custodianId : null,
    },
  });
  await audit(tx, actor, "inventory.movement", id, row);
  return row;
}
export async function receiveTx(
  tx: Tx,
  input: ReceiptInput,
  actor: AuthenticatedUser,
) {
  await destination(
    tx,
    input.receivingDepotId,
    input.custodianType,
    input.custodianId,
    actor,
  );
  await ref(tx, "ORGANIZATION", input.organizationId);
  await ref(tx, "ORGANIZATION", input.receivedFromOrgId);
  if (
    !admin(actor) &&
    actor.role.name !== "OPERATIONS_MANAGER" &&
    input.organizationId !== actor.organizationId
  )
    throw ApiError.forbidden("Organization is outside your scope");
  if (new Date(input.receivedAt).getTime() > Date.now() + 60000)
    throw ApiError.badRequest("Receipt cannot be in the future");
  for (const [key, delegate] of [
    ["makeId", tx.vehicleMake],
    ["modelId", tx.vehicleModel],
    ["typeId", tx.vehicleType],
  ] as const) {
    if (
      input[key] &&
      !(await (delegate as typeof tx.vehicleMake).findFirst({
        where: { id: input[key], isActive: true },
      }))
    )
      throw ApiError.badRequest(`Invalid ${key}`);
  }
  if (input.modelId) {
    const model = await tx.vehicleModel.findUniqueOrThrow({
      where: { id: input.modelId },
    });
    if (model.makeId !== input.makeId)
      throw ApiError.badRequest("Model does not belong to the selected make");
  }
  const registration = input.registrationNumber.trim().toUpperCase();
  let vehicle = input.vehicleId
    ? await tx.vehicle.findUnique({ where: { id: input.vehicleId } })
    : await tx.vehicle.findFirst({
        where: {
          registrationNumber: { equals: registration, mode: "insensitive" },
        },
      });
  if (input.vehicleId && !vehicle)
    throw ApiError.notFound("Existing vehicle not found");
  if (vehicle) {
    await lockVehicle(tx, vehicle.id);
    if (
      vehicle.registrationNumber.toUpperCase() !== registration ||
      (input.vin &&
        vehicle.vin &&
        input.vin.toUpperCase() !== vehicle.vin.toUpperCase())
    )
      throw ApiError.conflict(
        "Vehicle identity does not match the existing record",
      );
    for (const field of [
      "vehicleCode",
      "vin",
      "makeId",
      "modelId",
      "typeId",
    ] as const) {
      if (input[field] && vehicle[field] && input[field] !== vehicle[field])
        throw ApiError.conflict(
          `Existing vehicle ${field} does not match; update its fleet record first`,
        );
    }
    if (
      await tx.vehicleInventory.findUnique({ where: { vehicleId: vehicle.id } })
    )
      throw ApiError.conflict(
        "Vehicle has already been received into inventory",
      );
    if (
      !vehicle.isActive ||
      !["REGISTERED", "RECEIVED", "AVAILABLE", "RETURNED"].includes(
        vehicle.status,
      )
    )
      throw ApiError.conflict(
        "Existing vehicle is not eligible for initial receipt",
      );
    if (
      !admin(actor) &&
      actor.role.name === "OPERATIONS_MANAGER" &&
      (!vehicle.depotId || !actor.depotIds.includes(vehicle.depotId))
    )
      throw ApiError.forbidden("Existing vehicle is outside your depot scope");
  } else {
    const counter = await tx.counter.upsert({
      where: { name: "vehicle" },
      create: { name: "vehicle", value: 1 },
      update: { value: { increment: 1 } },
    });
    vehicle = await tx.vehicle.create({
      data: {
        vehicleCode:
          input.vehicleCode ??
          `FG-VEH-${String(counter.value).padStart(6, "0")}`,
        registrationNumber: registration,
        vin: input.vin?.toUpperCase(),
        makeId: input.makeId,
        modelId: input.modelId,
        typeId: input.typeId,
        organizationId: input.organizationId,
        createdById: actor.id,
      },
    });
  }
  const receipt = await tx.vehicleReceipt.create({
    data: {
      vehicleId: vehicle.id,
      receivedAt: new Date(input.receivedAt),
      receivedFromOrgId: input.receivedFromOrgId,
      receivingDepotId: input.receivingDepotId,
      initialCondition: input.initialCondition,
      odometer: input.odometer,
      accessories: input.accessories,
      remarks: input.remarks,
      receivedById: actor.id,
    },
  });
  await tx.vehicleInventory.create({
    data: {
      vehicleId: vehicle.id,
      receiptId: receipt.id,
      receivedAt: receipt.receivedAt,
      receivedFromOrgId: input.receivedFromOrgId,
      receivingDepotId: input.receivingDepotId,
      initialCondition: input.initialCondition,
      odometer: input.odometer,
      accessories: input.accessories,
      remarks: input.remarks,
    },
  });
  await tx.vehicle.update({
    where: { id: vehicle.id },
    data: { organizationId: input.organizationId },
  });
  await setStatus(
    tx,
    vehicle.id,
    "RECEIVED",
    actor,
    "Initial receipt recorded",
  );
  await movement(tx, vehicle.id, actor, {
    type: "RECEIPT",
    toDepotId: input.receivingDepotId,
    custodianType: input.custodianType,
    custodianId: input.custodianId,
    occurredAt: receipt.receivedAt,
    reason: "Initial receipt",
    remarks: input.remarks,
  });
  const status =
    input.initialCondition === "DAMAGED"
      ? "DAMAGED"
      : input.initialCondition === "MAINTENANCE"
        ? "UNDER_MAINTENANCE"
        : input.custodianType === "VENDOR"
          ? "AT_VENDOR"
          : "AVAILABLE";
  await setStatus(
    tx,
    vehicle.id,
    status,
    actor,
    "Receiving condition verified",
  );
  await audit(tx, actor, "inventory.receipt", vehicle.id, receipt);
  return { vehicleId: vehicle.id, receiptId: receipt.id, status };
}
export const inventoryService = {
  receive: (input: ReceiptInput, actor: AuthenticatedUser, key: string) =>
    operation(actor, key, "receipt", input, (tx) =>
      receiveTx(tx, input, actor),
    ),
  async availability(
    id: string,
    query: { startDate?: string; endDate?: string; depotId?: string },
    actor: AuthenticatedUser,
  ) {
    return prisma.$transaction(async (tx) => {
      await lockVehicle(tx, id);
      await scopedInventory(tx, id, actor);
      await expireLocked(tx, id, actor);
      return available(
        tx,
        id,
        actor,
        query.startDate,
        query.endDate,
        query.depotId,
      );
    });
  },
  async list(query: InventoryQuery, actor: AuthenticatedUser) {
    await expireScope(actor);
    const clauses: Prisma.VehicleInventoryWhereInput[] = [
      inventoryScope(actor),
    ];
    if (query.depotId) clauses.push({ currentDepotId: query.depotId });
    if (query.vendorId)
      clauses.push({
        currentCustodianType: "VENDOR",
        currentCustodianId: query.vendorId,
      });
    if (query.organizationId)
      clauses.push({ vehicle: { organizationId: query.organizationId } });
    if (query.typeId) clauses.push({ vehicle: { typeId: query.typeId } });
    if (query.status) clauses.push({ vehicle: { status: query.status } });
    if (query.available)
      clauses.push(
        query.available === "true"
          ? {
              inInventory: true,
              currentDepotId: { not: null },
              currentCustodianType: { not: "VENDOR" },
              activeReservationId: null,
              vehicle: { status: "AVAILABLE", isActive: true },
            }
          : { vehicle: { status: { not: "AVAILABLE" } } },
      );
    if (query.receivedFrom || query.receivedTo)
      clauses.push({
        receivedAt: {
          gte: query.receivedFrom ? new Date(query.receivedFrom) : undefined,
          lte: query.receivedTo ? new Date(query.receivedTo) : undefined,
        },
      });
    if (query.search)
      clauses.push({
        vehicle: {
          OR: ["vehicleCode", "registrationNumber", "vin"].map((field) => ({
            [field]: { contains: query.search, mode: "insensitive" },
          })),
        },
      });
    const where = { AND: clauses };
    const order: Prisma.VehicleInventoryOrderByWithRelationInput = [
      "vehicleCode",
      "registrationNumber",
      "status",
    ].includes(query.sortBy)
      ? { vehicle: { [query.sortBy]: query.sortDir } }
      : { [query.sortBy]: query.sortDir };
    const [total, rows] = await prisma.$transaction([
      prisma.vehicleInventory.count({ where }),
      prisma.vehicleInventory.findMany({
        where,
        include: { vehicle: { include: vehicleInclude } },
        orderBy: [order, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const labels = await this.lookups(actor);
    const name = (type: string | null, id: string | null) =>
      (type === "DEPOT"
        ? labels.depots
        : type === "USER"
          ? labels.users
          : labels.organizations
      ).find((x) => x.id === id)?.name ?? id;
    return {
      data: rows.map((row) => ({
        ...row,
        currentDepotName: labels.depots.find((x) => x.id === row.currentDepotId)
          ?.name,
        currentCustodianName: name(
          row.currentCustodianType,
          row.currentCustodianId,
        ),
      })),
      meta: {
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  },
  async lookups(actor: AuthenticatedUser) {
    const [depots, organizations, makes, models, types, users] =
      await Promise.all([
        prisma.depot.findMany({
          where: admin(actor)
            ? { status: "ACTIVE" }
            : actor.role.name === "OPERATIONS_MANAGER"
              ? { id: { in: actor.depotIds }, status: "ACTIVE" }
              : { status: "ACTIVE" },
          select: { id: true, name: true, code: true },
        }),
        prisma.organization.findMany({
          where: { status: "ACTIVE" },
          select: { id: true, name: true, type: true },
        }),
        prisma.vehicleMake.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
        }),
        prisma.vehicleModel.findMany({
          where: { isActive: true },
          select: { id: true, name: true, makeId: true },
        }),
        prisma.vehicleType.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
        }),
        prisma.user.findMany({
          where: {
            status: "ACTIVE",
            ...(!admin(actor)
              ? { organizationId: actor.organizationId ?? "__none__" }
              : {}),
          },
          select: { id: true, fullName: true },
        }),
      ]);
    return {
      depots,
      organizations,
      makes,
      models,
      types,
      users: users.map((u) => ({ id: u.id, name: u.fullName })),
    };
  },
  async dashboard(actor: AuthenticatedUser) {
    await expireScope(actor);
    const rows = await prisma.vehicleInventory.findMany({
      where: inventoryScope(actor),
      include: { vehicle: { include: vehicleInclude } },
    });
    const labels = await this.lookups(actor);
    const group = (fn: (r: (typeof rows)[number]) => string) =>
      Object.entries(
        rows.reduce<Record<string, number>>((out, r) => {
          const k = fn(r);
          out[k] = (out[k] ?? 0) + 1;
          return out;
        }, {}),
      ).map(([label, count]) => ({ label, count }));
    const movements = await prisma.vehicleMovement.groupBy({
      by: ["type"],
      where: { vehicleId: { in: rows.map((r) => r.vehicleId) } },
      _count: { _all: true },
    });
    return {
      total: rows.length,
      byStatus: group((r) => r.vehicle.status),
      byDepot: group(
        (r) =>
          labels.depots.find((d) => d.id === r.currentDepotId)?.name ??
          "Unassigned",
      ),
      byVendor: group((r) =>
        r.currentCustodianType === "VENDOR"
          ? (labels.organizations.find((o) => o.id === r.currentCustodianId)
              ?.name ?? "Unknown vendor")
          : "Not at vendor",
      ),
      byType: group((r) => r.vehicle.type?.name ?? "Unspecified"),
      movements: movements.map((m) => ({
        label: m.type,
        count: m._count._all,
      })),
      atVendors: rows.filter((r) => r.currentCustodianType === "VENDOR").length,
    };
  },
  async details(id: string, actor: AuthenticatedUser) {
    await this.availability(id, {}, actor);
    const inv = await scopedInventory(prisma, id, actor);
    const [
      receipt,
      reservations,
      movements,
      custody,
      adjustments,
      reconciliationItems,
      photos,
      documents,
      allocations,
      labels,
    ] = await Promise.all([
      prisma.vehicleReceipt.findUnique({ where: { vehicleId: id } }),
      prisma.vehicleReservation.findMany({
        where: { vehicleId: id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.vehicleMovement.findMany({
        where: { vehicleId: id },
        orderBy: { occurredAt: "desc" },
      }),
      prisma.vehicleCustody.findMany({
        where: { vehicleId: id },
        orderBy: { fromDate: "desc" },
      }),
      prisma.inventoryAdjustment.findMany({
        where: { vehicleId: id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.reconciliationItem.findMany({
        where: { vehicleId: id },
        include: { reconciliation: true },
      }),
      prisma.inventoryPhoto.findMany({ where: { vehicleId: id } }),
      prisma.vehicleDocument.findMany({
        where: { vehicleId: id, isSensitive: false },
        select: { id: true, fileName: true, kind: true, createdAt: true },
      }),
      prisma.inventoryAllocation.findMany({
        where: { vehicleId: id },
        orderBy: { createdAt: "desc" },
      }),
      this.lookups(actor),
    ]);
    return {
      ...inv,
      receipt,
      reservations,
      movements,
      custody,
      adjustments,
      reconciliationItems,
      photos,
      documents,
      allocations,
      labels,
    };
  },
  async reserve(
    input: {
      vehicleId: string;
      requestingOrgId: string;
      depotId: string;
      startDate: string;
      endDate: string;
      purpose: string;
      reference?: string;
    },
    actor: AuthenticatedUser,
    key: string,
  ) {
    return operation(actor, key, "reserve", input, async (tx) => {
      await lockVehicle(tx, input.vehicleId);
      await scopedInventory(tx, input.vehicleId, actor);
      await expireLocked(tx, input.vehicleId, actor);
      await ref(tx, "ORGANIZATION", input.requestingOrgId);
      await ref(tx, "DEPOT", input.depotId);
      if (
        !admin(actor) &&
        actor.role.name !== "OPERATIONS_MANAGER" &&
        input.requestingOrgId !== actor.organizationId
      )
        throw ApiError.forbidden(
          "Requesting organization is outside your scope",
        );
      const check = await available(
        tx,
        input.vehicleId,
        actor,
        input.startDate,
        input.endDate,
        input.depotId,
      );
      if (!check.available) throw ApiError.conflict(check.reasons.join("; "));
      const row = await tx.vehicleReservation.create({
        data: {
          ...input,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          createdById: actor.id,
        },
      });
      await tx.vehicleInventory.update({
        where: { vehicleId: input.vehicleId },
        data: { activeReservationId: row.id },
      });
      await setStatus(
        tx,
        input.vehicleId,
        "RESERVED",
        actor,
        "Inventory reservation created",
      );
      await audit(
        tx,
        actor,
        "inventory.reservation.created",
        input.vehicleId,
        row,
      );
      return row;
    });
  },
  async reservations(actor: AuthenticatedUser) {
    await expireScope(actor);
    const ids = await prisma.vehicleInventory.findMany({
      where: inventoryScope(actor),
      select: { vehicleId: true },
    });
    return prisma.vehicleReservation.findMany({
      where: { vehicleId: { in: ids.map((i) => i.vehicleId) } },
      orderBy: { createdAt: "desc" },
    });
  },
  async cancel(
    id: string,
    reason: string,
    actor: AuthenticatedUser,
    key: string,
  ) {
    return operation(actor, key, "cancel", { id, reason }, async (tx) => {
      const r = await tx.vehicleReservation.findUnique({ where: { id } });
      if (!r) throw ApiError.notFound();
      await lockVehicle(tx, r.vehicleId);
      await scopedInventory(tx, r.vehicleId, actor);
      await expireLocked(tx, r.vehicleId, actor);
      const current = await tx.vehicleReservation.findUniqueOrThrow({
        where: { id },
      });
      if (current.status !== "ACTIVE")
        throw ApiError.conflict("Only active reservations may be cancelled");
      await tx.vehicleReservation.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancelReason: reason,
          cancelledAt: new Date(),
        },
      });
      await tx.vehicleInventory.update({
        where: { vehicleId: r.vehicleId },
        data: { activeReservationId: null },
      });
      await setStatus(tx, r.vehicleId, "AVAILABLE", actor, reason);
      await audit(tx, actor, "inventory.reservation.cancelled", r.vehicleId, {
        id,
        reason,
      });
      return { id, status: "CANCELLED" };
    });
  },
  async transfer(input: TransferInput, actor: AuthenticatedUser, key: string) {
    return operation(actor, key, "transfer", input, async (tx) => {
      await lockVehicle(tx, input.vehicleId);
      let inv = await scopedInventory(tx, input.vehicleId, actor);
      await expireLocked(tx, input.vehicleId, actor);
      inv = await scopedInventory(tx, input.vehicleId, actor);
      if (
        [
          "RESERVED",
          "ALLOCATED",
          "DISPATCHED",
          "IN_TRANSIT",
          "INACTIVE",
        ].includes(inv.vehicle.status)
      )
        throw ApiError.conflict(
          "Vehicle cannot be transferred in its current status",
        );
      if (
        await tx.inventoryAllocation.count({
          where: { vehicleId: input.vehicleId, releasedAt: null },
        })
      )
        throw ApiError.conflict("Vehicle has an active allocation");
      await destination(
        tx,
        input.toDepotId,
        input.custodianType,
        input.custodianId,
        actor,
      );
      if (input.type === "DEPOT_TO_VENDOR" && input.custodianType !== "VENDOR")
        throw ApiError.badRequest("Vendor transfer requires vendor custody");
      if (
        input.type === "VENDOR_TO_DEPOT" &&
        (inv.currentCustodianType !== "VENDOR" ||
          input.custodianType !== "DEPOT")
      )
        throw ApiError.badRequest(
          "Vendor return requires vendor source and depot destination",
        );
      const row = await movement(tx, input.vehicleId, actor, {
        ...input,
        occurredAt: new Date(input.occurredAt),
      });
      const restricted = ["DAMAGED", "UNDER_MAINTENANCE"].includes(
        inv.vehicle.status,
      );
      const next =
        input.type === "MAINTENANCE"
          ? "UNDER_MAINTENANCE"
          : restricted
            ? inv.vehicle.status
            : input.custodianType === "VENDOR"
              ? "AT_VENDOR"
              : "AVAILABLE";
      await setStatus(tx, input.vehicleId, next, actor, input.reason);
      return row;
    });
  },
  async changeStatus(
    id: string,
    status: VehicleStatus,
    reason: string,
    actor: AuthenticatedUser,
    key: string,
  ) {
    return operation(
      actor,
      key,
      "status",
      { id, status, reason },
      async (tx) => {
        await lockVehicle(tx, id);
        await expireLocked(tx, id, actor);
        const inv = await scopedInventory(tx, id, actor);
        const allowed: Partial<Record<VehicleStatus, VehicleStatus[]>> = {
          RECEIVED: ["AVAILABLE", "DAMAGED", "UNDER_MAINTENANCE"],
          AVAILABLE: ["UNDER_MAINTENANCE", "DAMAGED", "INACTIVE"],
          AT_VENDOR: ["DAMAGED", "UNDER_MAINTENANCE", "INACTIVE"],
          UNDER_MAINTENANCE: ["AVAILABLE", "DAMAGED", "INACTIVE"],
          DAMAGED: ["UNDER_MAINTENANCE", "INACTIVE"],
          INACTIVE: ["RECEIVED"],
          RETURNED: ["AVAILABLE", "DAMAGED", "UNDER_MAINTENANCE"],
        };
        if (!allowed[inv.vehicle.status]?.includes(status))
          throw ApiError.badRequest(
            "Invalid inventory status transition; reservations and allocations require their dedicated operations",
          );
        if (status === "AVAILABLE" && inv.currentCustodianType === "VENDOR")
          throw ApiError.badRequest("Return vehicle to depot custody first");
        await setStatus(tx, id, status, actor, reason);
        return { id, status };
      },
    );
  },
};

/** Future modules must call these contracts rather than update Vehicle directly. */
export const inventoryIntegration = {
  async allocate(
    vehicleId: string,
    organizationId: string,
    reference: string,
    actor: AuthenticatedUser,
    key: string,
  ) {
    if (!actor.permissions.includes("allocation:manage"))
      throw ApiError.forbidden();
    return operation(
      actor,
      key,
      "integration.allocate",
      { vehicleId, organizationId, reference },
      async (tx) => {
        await lockVehicle(tx, vehicleId);
        await expireLocked(tx, vehicleId, actor);
        const inv = await scopedInventory(tx, vehicleId, actor);
        await ref(tx, "ORGANIZATION", organizationId);
        if (inv.vehicle.status === "RESERVED") {
          const r = await tx.vehicleReservation.findFirst({
            where: {
              id: inv.activeReservationId ?? "",
              requestingOrgId: organizationId,
              status: "ACTIVE",
              startDate: { lte: new Date() },
              endDate: { gt: new Date() },
            },
          });
          if (!r)
            throw ApiError.conflict(
              "No current reservation for this requesting organization",
            );
          await tx.vehicleReservation.update({
            where: { id: r.id },
            data: { status: "FULFILLED" },
          });
          await tx.vehicleInventory.update({
            where: { vehicleId },
            data: { activeReservationId: null },
          });
        } else {
          const check = await available(tx, vehicleId, actor);
          if (!check.available)
            throw ApiError.conflict(check.reasons.join("; "));
        }
        const row = await tx.inventoryAllocation.create({
          data: {
            vehicleId,
            organizationId,
            reference,
            allocatedById: actor.id,
          },
        });
        await setStatus(tx, vehicleId, "ALLOCATED", actor, reference);
        return row;
      },
    );
  },
  async dispatch(
    vehicleId: string,
    allocationId: string,
    toDepotId: string,
    custodianType: CustodianType,
    custodianId: string,
    actor: AuthenticatedUser,
    key: string,
  ) {
    if (!actor.permissions.includes("dispatch:manage"))
      throw ApiError.forbidden();
    return operation(
      actor,
      key,
      "integration.dispatch",
      { vehicleId, allocationId, toDepotId, custodianType, custodianId },
      async (tx) => {
        await lockVehicle(tx, vehicleId);
        const inv = await scopedInventory(tx, vehicleId, actor);
        const a = await tx.inventoryAllocation.findFirst({
          where: { id: allocationId, vehicleId, releasedAt: null },
        });
        if (!a || inv.vehicle.status !== "ALLOCATED")
          throw ApiError.conflict(
            "Dispatch requires a valid active allocation",
          );
        await destination(tx, toDepotId, custodianType, custodianId, actor);
        await movement(tx, vehicleId, actor, {
          type: "DISPATCH",
          toDepotId,
          custodianType,
          custodianId,
          occurredAt: new Date(),
          reason: a.reference,
        });
        await setStatus(tx, vehicleId, "DISPATCHED", actor, a.reference);
        return { vehicleId, status: "DISPATCHED" };
      },
    );
  },
};
/** Explicit receiving contract for a future dispatch/inspection orchestrator; no workflow UI is created here. */
export async function confirmInventoryReceiving(
  input: {
    vehicleId: string;
    allocationId: string;
    depotId: string;
    custodianType: CustodianType;
    custodianId: string;
    condition: "GOOD" | "DAMAGED" | "MAINTENANCE";
    reference: string;
  },
  actor: AuthenticatedUser,
  key: string,
) {
  if (!actor.permissions.includes("dispatch:manage"))
    throw ApiError.forbidden();
  return operation(actor, key, "integration.receiving", input, async (tx) => {
    await lockVehicle(tx, input.vehicleId);
    const inv = await scopedInventory(tx, input.vehicleId, actor);
    const allocation = await tx.inventoryAllocation.findFirst({
      where: {
        id: input.allocationId,
        vehicleId: input.vehicleId,
        releasedAt: null,
      },
    });
    if (
      !allocation ||
      !["DISPATCHED", "IN_TRANSIT"].includes(inv.vehicle.status)
    )
      throw ApiError.conflict(
        "Receiving requires a dispatched vehicle with a valid allocation",
      );
    await destination(
      tx,
      input.depotId,
      input.custodianType,
      input.custodianId,
      actor,
    );
    await movement(tx, input.vehicleId, actor, {
      type: "DELIVERY",
      toDepotId: input.depotId,
      custodianType: input.custodianType,
      custodianId: input.custodianId,
      occurredAt: new Date(),
      reason: "Receiving confirmed",
      reference: input.reference,
    });
    await tx.inventoryAllocation.update({
      where: { id: allocation.id },
      data: { releasedAt: new Date() },
    });
    const status =
      input.condition === "DAMAGED"
        ? "DAMAGED"
        : input.condition === "MAINTENANCE"
          ? "UNDER_MAINTENANCE"
          : input.custodianType === "VENDOR"
            ? "AT_VENDOR"
            : "AVAILABLE";
    await setStatus(tx, input.vehicleId, status, actor, input.reference);
    return { vehicleId: input.vehicleId, status };
  });
}
export { setStatus, movement, destination, audit, expireLocked, available };
