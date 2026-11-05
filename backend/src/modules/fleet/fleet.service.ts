import {
  inventoryService,
  inventoryScope,
  scopedInventory,
} from "../inventory/inventory.service";
import { randomUUID } from "crypto";
import { Prisma, type VehicleStatus } from "@prisma/client";
import { prisma } from "../../database/prisma";
import type { AuthenticatedUser } from "../../types/auth";
import { ApiError } from "../../utils/ApiError";
import type { PaginationMeta } from "../../utils/ApiResponse";
import { storage } from "../../utils/storage";
import { canTransition } from "./fleet.status";
import type {
  CreateVehicleInput,
  ListVehiclesQuery,
  UpdateVehicleInput,
} from "./fleet.validators";

const vehicleInclude = {
  make: { select: { id: true, name: true } },
  model: { select: { id: true, name: true, variant: true } },
  type: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  fuelType: { select: { id: true, name: true } },
  ownershipType: { select: { id: true, name: true } },
  organization: { select: { id: true, name: true, type: true } },
  vendor: { select: { id: true, name: true, type: true } },
  depot: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, fullName: true, email: true } },
  _count: { select: { documents: true } },
} satisfies Prisma.VehicleInclude;

/** Vehicle fields that may be set on create/update (master FKs + attributes). */
function toVehicleData(input: CreateVehicleInput | UpdateVehicleInput) {
  const data:
    | Prisma.VehicleUncheckedCreateInput
    | Prisma.VehicleUncheckedUpdateInput = {};
  const assign = <K extends string>(key: K, value: unknown) => {
    if (value !== undefined) (data as Record<string, unknown>)[key] = value;
  };
  assign("registrationNumber", input.registrationNumber);
  assign("vin", input.vin);
  assign("engineNumber", input.engineNumber);
  assign("makeId", input.makeId);
  assign("modelId", input.modelId);
  assign("typeId", input.typeId);
  assign("categoryId", input.categoryId);
  assign("fuelTypeId", input.fuelTypeId);
  assign("ownershipTypeId", input.ownershipTypeId);
  assign("manufacturingYear", input.manufacturingYear);
  assign("color", input.color);
  assign("organizationId", input.organizationId);
  assign("vendorId", input.vendorId);
  assign("depotId", input.depotId);
  assign("insuranceProvider", input.insuranceProvider);
  assign("insurancePolicyNumber", input.insurancePolicyNumber);
  assign("insuranceExpiry", input.insuranceExpiry);
  assign("registrationCertNumber", input.registrationCertNumber);
  assign("registrationExpiry", input.registrationExpiry);
  assign("remarks", input.remarks);
  assign("metadata", input.metadata as Prisma.InputJsonValue | undefined);
  return data;
}

/** Map common Prisma constraint errors to friendly ApiErrors. */
function mapPrismaError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = (err.meta?.target as string[] | undefined)?.join(", ");
      throw ApiError.conflict(
        `A vehicle with this ${target ?? "value"} already exists`,
      );
    }
    if (err.code === "P2003") {
      throw ApiError.badRequest(
        "One or more referenced master-data records do not exist",
      );
    }
  }
  throw err;
}

/** True when the actor's access must be limited to their own organization. */
function isVendorScoped(actor: AuthenticatedUser): boolean {
  return (
    actor.organizationType === "VEHICLE_VENDOR" ||
    actor.organizationType === "TRANSPORT_PARTNER"
  );
}

/** Where-clause fragment restricting a vendor to their own vehicles. */
function scopeWhere(actor: AuthenticatedUser): Prisma.VehicleWhereInput {
  if (["SUPER_ADMIN", "JSAN_ADMIN"].includes(actor.role.name)) return {};
  const legacy: Prisma.VehicleWhereInput = isVendorScoped(actor)
    ? {
        OR: [
          { vendorId: actor.organizationId ?? "__none__" },
          { organizationId: actor.organizationId ?? "__none__" },
        ],
      }
    : {};
  return {
    OR: [
      { inventory: { is: null }, ...legacy },
      { inventory: { is: inventoryScope(actor) } },
    ],
  };
}

function canManage(actor: AuthenticatedUser): boolean {
  return actor.permissions.includes("fleet:manage");
}

async function nextVehicleCode(tx: Prisma.TransactionClient): Promise<string> {
  const counter = await tx.counter.upsert({
    where: { name: "vehicle" },
    update: { value: { increment: 1 } },
    create: { name: "vehicle", value: 1 },
  });
  return `FG-VEH-${String(counter.value).padStart(6, "0")}`;
}

export const fleetService = {
  async list(query: ListVehiclesQuery, actor: AuthenticatedUser) {
    const where: Prisma.VehicleWhereInput = { ...scopeWhere(actor) };
    if (query.includeInactive !== "true") where.isActive = true;
    if (query.status) where.status = query.status;
    if (query.typeId) where.typeId = query.typeId;
    if (query.makeId) where.makeId = query.makeId;
    if (query.depotId) where.depotId = query.depotId;
    if (query.organizationId) where.organizationId = query.organizationId;
    if (query.vendorId) where.vendorId = query.vendorId;
    if (query.search) {
      where.AND = [
        {
          OR: [
            { vehicleCode: { contains: query.search, mode: "insensitive" } },
            {
              registrationNumber: {
                contains: query.search,
                mode: "insensitive",
              },
            },
            { vin: { contains: query.search, mode: "insensitive" } },
          ],
        },
      ];
    }

    const [total, data] = await Promise.all([
      prisma.vehicle.count({ where }),
      prisma.vehicle.findMany({
        where,
        include: vehicleInclude,
        orderBy: { [query.sortBy]: query.sortDir },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const meta: PaginationMeta = {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
    return { data, meta };
  },

  async getById(id: string, actor: AuthenticatedUser) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: vehicleInclude,
    });
    if (!vehicle) throw ApiError.notFound("Vehicle not found");
    if (
      isVendorScoped(actor) &&
      vehicle.vendorId !== actor.organizationId &&
      vehicle.organizationId !== actor.organizationId
    ) {
      throw ApiError.forbidden("You cannot access this vehicle");
    }
    if (await prisma.vehicleInventory.findUnique({ where: { vehicleId: id } }))
      await scopedInventory(prisma, id, actor);
    return vehicle;
  },

  async create(input: CreateVehicleInput, actor: AuthenticatedUser) {
    try {
      return await prisma.$transaction(async (tx) => {
        const vehicleCode = input.vehicleCode ?? (await nextVehicleCode(tx));
        const status = input.status ?? "REGISTERED";
        const vehicle = await tx.vehicle.create({
          data: {
            ...(toVehicleData(input) as Prisma.VehicleUncheckedCreateInput),
            vehicleCode,
            registrationNumber: input.registrationNumber,
            status,
            createdById: actor.id,
          },
          include: vehicleInclude,
        });
        await tx.vehicleStatusHistory.create({
          data: {
            vehicleId: vehicle.id,
            fromStatus: null,
            toStatus: status,
            reason: "Vehicle registered",
            changedById: actor.id,
          },
        });
        return vehicle;
      });
    } catch (err) {
      mapPrismaError(err);
    }
  },

  async update(
    id: string,
    input: UpdateVehicleInput,
    actor: AuthenticatedUser,
  ) {
    await this.getById(id, actor);
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM vehicles WHERE id=${id} FOR UPDATE`;
        const current = await tx.vehicle.findUniqueOrThrow({ where: { id } });
        if (
          await tx.vehicleInventory.findUnique({ where: { vehicleId: id } })
        ) {
          await scopedInventory(tx, id, actor);
          if (
            ["depotId", "vendorId", "organizationId", "status"].some(
              (key) =>
                (input as Record<string, unknown>)[key] !== undefined &&
                (input as Record<string, unknown>)[key] !==
                  (current as unknown as Record<string, unknown>)[key],
            )
          )
            throw ApiError.conflict(
              "Use inventory operations for received vehicle location, custody, organization and status changes",
            );
        }
        return tx.vehicle.update({
          where: { id },
          data: toVehicleData(input) as Prisma.VehicleUncheckedUpdateInput,
          include: vehicleInclude,
        });
      });
    } catch (err) {
      mapPrismaError(err);
    }
  },

  async changeStatus(
    id: string,
    status: VehicleStatus,
    reason: string | undefined,
    actor: AuthenticatedUser,
  ) {
    if (
      await prisma.vehicleInventory.findUnique({ where: { vehicleId: id } })
    ) {
      if (!actor.permissions.includes("inventory:manage"))
        throw ApiError.forbidden("Inventory management permission required");
      await inventoryService.changeStatus(
        id,
        status,
        reason ?? "Fleet status update",
        actor,
        randomUUID(),
      );
      return this.getById(id, actor);
    }
    await this.getById(id, actor);
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM vehicles WHERE id=${id} FOR UPDATE`;
      if (await tx.vehicleInventory.findUnique({ where: { vehicleId: id } }))
        throw ApiError.conflict(
          "Vehicle was received into inventory; retry through inventory status controls",
        );
      const vehicle = await tx.vehicle.findUniqueOrThrow({ where: { id } });
      if (!canTransition(vehicle.status, status))
        throw ApiError.badRequest(
          `Invalid status transition: ${vehicle.status} ? ${status}`,
        );
      const updated = await tx.vehicle.update({
        where: { id },
        data: { status },
        include: vehicleInclude,
      });
      await tx.vehicleStatusHistory.create({
        data: {
          vehicleId: id,
          fromStatus: vehicle.status,
          toStatus: status,
          reason,
          changedById: actor.id,
        },
      });
      return updated;
    });
  },

  async deactivate(id: string, actor: AuthenticatedUser) {
    if (
      await prisma.vehicleInventory.findUnique({ where: { vehicleId: id } })
    ) {
      if (!actor.permissions.includes("inventory:manage"))
        throw ApiError.forbidden("Inventory management permission required");
      await inventoryService.changeStatus(
        id,
        "INACTIVE",
        "Vehicle deactivated",
        actor,
        randomUUID(),
      );
      return this.getById(id, actor);
    }
    await this.getById(id, actor);
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM vehicles WHERE id=${id} FOR UPDATE`;
      if (await tx.vehicleInventory.findUnique({ where: { vehicleId: id } }))
        throw ApiError.conflict(
          "Vehicle was received into inventory; retry through inventory status controls",
        );
      const vehicle = await tx.vehicle.findUniqueOrThrow({ where: { id } });
      if (!vehicle.isActive) return vehicle;
      const updated = await tx.vehicle.update({
        where: { id },
        data: { isActive: false, status: "INACTIVE" },
        include: vehicleInclude,
      });
      await tx.vehicleStatusHistory.create({
        data: {
          vehicleId: id,
          fromStatus: vehicle.status,
          toStatus: "INACTIVE",
          reason: "Vehicle deactivated",
          changedById: actor.id,
        },
      });
      return updated;
    });
  },

  async history(id: string, actor: AuthenticatedUser) {
    await this.getById(id, actor);
    const [statusHistory, auditLogs] = await Promise.all([
      prisma.vehicleStatusHistory.findMany({
        where: { vehicleId: id },
        orderBy: { createdAt: "desc" },
        include: { changedBy: { select: { id: true, fullName: true } } },
      }),
      prisma.auditLog.findMany({
        where: { entityType: "Vehicle", entityId: id },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { actor: { select: { id: true, fullName: true } } },
      }),
    ]);
    return { statusHistory, auditLogs };
  },

  async stats(actor: AuthenticatedUser) {
    const where: Prisma.VehicleWhereInput = { ...scopeWhere(actor) };
    const [byStatus, total, active, byType, byDepot] = await Promise.all([
      prisma.vehicle.groupBy({ by: ["status"], where, _count: { _all: true } }),
      prisma.vehicle.count({ where }),
      prisma.vehicle.count({ where: { ...where, isActive: true } }),
      prisma.vehicle.groupBy({ by: ["typeId"], where, _count: { _all: true } }),
      prisma.vehicle.groupBy({
        by: ["depotId"],
        where,
        _count: { _all: true },
      }),
    ]);

    // Resolve type/depot names for the grouped counts.
    const typeIds = byType.map((t) => t.typeId).filter(Boolean) as string[];
    const depotIds = byDepot.map((d) => d.depotId).filter(Boolean) as string[];
    const [types, depots] = await Promise.all([
      prisma.vehicleType.findMany({
        where: { id: { in: typeIds } },
        select: { id: true, name: true },
      }),
      prisma.depot.findMany({
        where: { id: { in: depotIds } },
        select: { id: true, name: true },
      }),
    ]);
    const typeName = new Map(types.map((t) => [t.id, t.name]));
    const depotName = new Map(depots.map((d) => [d.id, d.name]));

    return {
      total,
      active,
      byStatus: byStatus.map((s) => ({
        status: s.status,
        count: s._count._all,
      })),
      byType: byType.map((t) => ({
        label: t.typeId ? (typeName.get(t.typeId) ?? "Unknown") : "Unspecified",
        count: t._count._all,
      })),
      byLocation: byDepot.map((d) => ({
        label: d.depotId
          ? (depotName.get(d.depotId) ?? "Unknown")
          : "Unassigned",
        count: d._count._all,
      })),
    };
  },

  // --- Documents / photos ---------------------------------------------------
  async listDocuments(vehicleId: string, actor: AuthenticatedUser) {
    await this.getById(vehicleId, actor);
    const docs = await prisma.vehicleDocument.findMany({
      where: {
        vehicleId,
        // Hide sensitive documents from users who cannot manage the fleet.
        ...(canManage(actor) ? {} : { isSensitive: false }),
      },
      orderBy: { createdAt: "desc" },
      include: {
        documentType: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, fullName: true } },
      },
    });
    return docs;
  },

  async addDocument(
    vehicleId: string,
    file: {
      buffer: Buffer;
      originalName: string;
      contentType: string;
      size: number;
    },
    meta: {
      kind: "DOCUMENT" | "PHOTO";
      documentTypeId?: string;
      label?: string;
      isSensitive?: boolean;
    },
    actor: AuthenticatedUser,
  ) {
    await this.getById(vehicleId, actor);
    const stored = await storage.save({
      buffer: file.buffer,
      originalName: file.originalName,
      contentType: file.contentType,
      folder: `vehicles/${vehicleId}`,
    });
    return prisma.vehicleDocument.create({
      data: {
        vehicleId,
        kind: meta.kind,
        documentTypeId: meta.documentTypeId ?? null,
        label: meta.label ?? null,
        fileName: file.originalName,
        storageKey: stored.key,
        contentType: file.contentType,
        size: file.size,
        isSensitive: meta.isSensitive ?? false,
        uploadedById: actor.id,
      },
      include: {
        documentType: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, fullName: true } },
      },
    });
  },

  async getDocumentForDownload(
    vehicleId: string,
    documentId: string,
    actor: AuthenticatedUser,
  ) {
    await this.getById(vehicleId, actor);
    const doc = await prisma.vehicleDocument.findFirst({
      where: { id: documentId, vehicleId },
    });
    if (!doc) throw ApiError.notFound("Document not found");
    if (doc.isSensitive && !canManage(actor)) {
      throw ApiError.forbidden("You cannot access this document");
    }
    const buffer = await storage.read(doc.storageKey);
    return { buffer, contentType: doc.contentType, fileName: doc.fileName };
  },

  async removeDocument(
    vehicleId: string,
    documentId: string,
    actor: AuthenticatedUser,
  ) {
    await this.getById(vehicleId, actor);
    const doc = await prisma.vehicleDocument.findFirst({
      where: { id: documentId, vehicleId },
    });
    if (!doc) throw ApiError.notFound("Document not found");
    await prisma.vehicleDocument.delete({ where: { id: documentId } });
    await storage.remove(doc.storageKey);
    return { id: documentId };
  },
};
