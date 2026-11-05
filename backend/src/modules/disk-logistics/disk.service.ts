import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { createHash } from "node:crypto";
import { prisma } from "../../database/prisma";
import { ApiError } from "../../utils/ApiError";
import { storage } from "../../utils/storage";
import type { AuthenticatedUser } from "../../types/auth";
import { operation } from "../inventory/inventory.service";
import * as v from "./disk.validators";

type Tx = Prisma.TransactionClient;
type DiskStatus = (typeof v.DISK_STATUSES)[number];
type CustodianType = (typeof v.CUSTODIAN_TYPES)[number];

/**
 * Phase 10 — Disk / Media Logistics service.
 *
 * A standalone module: disks never touch vehicle inventory/dispatch tables.
 * Mutations are atomic + idempotent (reusing the shared `operation` wrapper).
 * Chain-of-custody and movement ledgers are append-only. Shipments require an
 * explicit receiving confirmation — a tracking event never marks delivery.
 * Serious confirmed discrepancies mark a disk DAMAGED/LOST through the same
 * status primitive used everywhere, with full audit.
 */

const ADMIN = ["SUPER_ADMIN", "JSAN_ADMIN"];
const admin = (a: AuthenticatedUser) => ADMIN.includes(a.role.name);
const isVendor = (a: AuthenticatedUser) =>
  a.organizationType === "VEHICLE_VENDOR" || a.organizationType === "TRANSPORT_PARTNER";
const org = (a: AuthenticatedUser) => a.organizationId ?? "__none__";
const can = (a: AuthenticatedUser, p: string) => a.permissions.includes(p);
const requireManage = (a: AuthenticatedUser) => {
  if (!can(a, "disk:manage")) throw ApiError.forbidden("Disk management permission required");
};
const requireReview = (a: AuthenticatedUser) => {
  if (!can(a, "disk:review")) throw ApiError.forbidden("Disk review permission required");
};

/** Inventory-level visibility; vendors/transporters isolated to their custody. */
function diskScope(a: AuthenticatedUser): Prisma.DiskInventoryWhereInput {
  if (admin(a)) return {};
  if (isVendor(a)) return { currentCustodianType: "VENDOR", currentCustodianId: org(a) };
  if (a.role.name === "OPERATIONS_MANAGER") return { currentDepotId: { in: a.depotIds } };
  return { OR: [{ receivedFromOrgId: org(a) }, { currentCustodianType: "ORGANIZATION", currentCustodianId: org(a) }] };
}

function shipmentScope(a: AuthenticatedUser): Prisma.DiskShipmentWhereInput {
  if (admin(a)) return {};
  if (isVendor(a))
    return { OR: [{ sourceOrgId: org(a) }, { destinationOrgId: org(a) }, { transporterId: org(a) }] };
  if (a.role.name === "OPERATIONS_MANAGER")
    return { OR: [{ sourceDepotId: { in: a.depotIds } }, { destinationDepotId: { in: a.depotIds } }, { createdById: a.id }] };
  return { OR: [{ sourceOrgId: org(a) }, { destinationOrgId: org(a) }, { createdById: a.id }] };
}

async function audit(tx: Tx, a: AuthenticatedUser, action: string, entityId: string, metadata: unknown) {
  await tx.auditLog.create({
    data: {
      actorId: a.id,
      action,
      entityType: "DiskLogistics",
      entityId,
      metadata: JSON.parse(JSON.stringify(metadata)),
    },
  });
}

async function nextRef(tx: Tx, counter: string, prefix: string) {
  const c = await tx.counter.upsert({
    where: { name: counter },
    create: { name: counter, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${prefix}-${String(c.value).padStart(6, "0")}`;
}

function assertImage(buffer: Buffer, mime: string) {
  const b = buffer;
  const ok =
    mime === "image/png"
      ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mime === "image/jpeg"
        ? b[0] === 255 && b[1] === 216
        : mime === "image/webp"
          ? b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP"
          : mime === "image/gif"
            ? b.toString("ascii", 0, 3) === "GIF"
            : false;
  if (!ok) throw ApiError.badRequest("Image content does not match its declared type");
}

// Valid disk status transitions (manual + flow). Reconciliation/adjustment may
// force a transition with disk:review.
const TRANSITIONS: Record<DiskStatus, DiskStatus[]> = {
  RECEIVED: ["AVAILABLE", "UNDER_INSPECTION", "DAMAGED", "INACTIVE"],
  AVAILABLE: ["RESERVED", "PACKED", "UNDER_INSPECTION", "DAMAGED", "RETURNED", "INACTIVE"],
  RESERVED: ["AVAILABLE", "PACKED", "DISPATCHED"],
  PACKED: ["DISPATCHED", "RESERVED", "AVAILABLE"],
  DISPATCHED: ["IN_TRANSIT", "DELIVERED", "AT_VENDOR", "DAMAGED", "LOST"],
  IN_TRANSIT: ["DELIVERED", "AT_VENDOR", "DAMAGED", "LOST"],
  DELIVERED: ["AVAILABLE", "AT_VENDOR", "RETURNED", "UNDER_INSPECTION", "DAMAGED"],
  AT_VENDOR: ["RETURNED", "DISPATCHED", "RESERVED", "AVAILABLE", "DAMAGED", "LOST"],
  RETURNED: ["AVAILABLE", "UNDER_INSPECTION", "DAMAGED", "INACTIVE"],
  DAMAGED: ["UNDER_INSPECTION", "AVAILABLE", "INACTIVE"],
  LOST: ["AVAILABLE", "INACTIVE"],
  UNDER_INSPECTION: ["AVAILABLE", "DAMAGED", "INACTIVE"],
  INACTIVE: ["AVAILABLE"],
};

async function lockDisk(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM disks WHERE id = ${id} FOR UPDATE`;
}

async function setStatus(
  tx: Tx,
  id: string,
  status: DiskStatus,
  a: AuthenticatedUser,
  reason: string,
  opts: { force?: boolean } = {},
) {
  const disk = await tx.disk.findUniqueOrThrow({ where: { id } });
  if (disk.status === status) return disk;
  if (!opts.force && !TRANSITIONS[disk.status as DiskStatus]?.includes(status))
    throw ApiError.conflict(`Invalid disk status transition: ${disk.status} → ${status}`);
  const updated = await tx.disk.update({
    where: { id },
    data: { status, isActive: status !== "INACTIVE" },
  });
  await audit(tx, a, "disk.status", id, { from: disk.status, to: status, reason });
  return updated;
}

/** Append a movement + close/open custody rows. Never rewrites history. */
async function recordMovement(
  tx: Tx,
  diskId: string,
  a: AuthenticatedUser,
  m: {
    type: string;
    toDepotId?: string | null;
    toLocation?: string | null;
    custodianType: CustodianType;
    custodianId: string;
    shipmentId?: string | null;
    reason: string;
    reference?: string | null;
    handedOverById?: string | null;
    receivedById?: string | null;
  },
) {
  const inv = await tx.diskInventory.findUnique({ where: { diskId } });
  const movement = await tx.diskMovement.create({
    data: {
      diskId,
      type: m.type as never,
      shipmentId: m.shipmentId ?? null,
      fromDepotId: inv?.currentDepotId ?? null,
      toDepotId: m.toDepotId ?? null,
      fromLocation: inv?.currentLocation ?? null,
      toLocation: m.toLocation ?? null,
      fromCustodianType: inv?.currentCustodianType ?? null,
      fromCustodianId: inv?.currentCustodianId ?? null,
      toCustodianType: m.custodianType as never,
      toCustodianId: m.custodianId,
      occurredAt: new Date(),
      initiatedById: a.id,
      reference: m.reference ?? null,
      reason: m.reason,
    },
  });
  // Close the open custody row and open a new one (append-only).
  await tx.diskCustody.updateMany({
    where: { diskId, toDate: null },
    data: { toDate: new Date() },
  });
  await tx.diskCustody.create({
    data: {
      diskId,
      custodianType: m.custodianType as never,
      custodianId: m.custodianId,
      location: m.toLocation ?? null,
      depotId: m.toDepotId ?? null,
      movementId: movement.id,
      shipmentId: m.shipmentId ?? null,
      handedOverById: m.handedOverById ?? null,
      receivedById: m.receivedById ?? null,
      acknowledged: Boolean(m.receivedById),
      createdById: a.id,
    },
  });
  await tx.diskInventory.update({
    where: { diskId },
    data: {
      currentDepotId: m.toDepotId ?? null,
      currentLocation: m.toLocation ?? null,
      currentCustodianType: m.custodianType as never,
      currentCustodianId: m.custodianId,
      lastMovementId: movement.id,
      lastMovementAt: new Date(),
    },
  });
  return movement;
}

async function scopedDisk(tx: Tx, id: string, a: AuthenticatedUser) {
  const disk = await tx.disk.findFirst({
    where: { id, ...(admin(a) ? {} : { inventory: diskScope(a) }) },
    include: { inventory: true },
  });
  if (!disk) throw ApiError.notFound("Disk not found in your authorized scope");
  return disk;
}

function paginate<T>(data: T[], total: number, q: { page: number; pageSize: number }) {
  return {
    data,
    meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) },
  };
}

async function refActive(tx: Tx, kind: "DEPOT" | "ORG" | "USER", id?: string | null) {
  if (!id) return;
  const found =
    kind === "DEPOT"
      ? await tx.depot.findFirst({ where: { id, status: "ACTIVE" } })
      : kind === "USER"
        ? await tx.user.findFirst({ where: { id, status: "ACTIVE" } })
        : await tx.organization.findFirst({ where: { id, status: "ACTIVE" } });
  if (!found) throw ApiError.badRequest(`${kind} reference ${id} is missing or inactive`);
}

export const diskService = {
  async lookups(a: AuthenticatedUser) {
    const [depots, organizations, transporters] = await Promise.all([
      prisma.depot.findMany({
        where: admin(a) || a.role.name !== "OPERATIONS_MANAGER" ? { status: "ACTIVE" } : { status: "ACTIVE", id: { in: a.depotIds } },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      }),
      prisma.organization.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, type: true }, orderBy: { name: "asc" } }),
      prisma.organization.findMany({ where: { status: "ACTIVE", type: "TRANSPORT_PARTNER" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return {
      depots,
      organizations,
      vendors: organizations.filter((o) => ["VEHICLE_VENDOR", "TRANSPORT_PARTNER"].includes(o.type)),
      transporters,
      mediaTypes: v.MEDIA_TYPES,
      statuses: v.DISK_STATUSES,
      shipmentTypes: v.SHIPMENT_TYPES,
      canManage: can(a, "disk:manage"),
      canReview: can(a, "disk:review"),
    };
  },

  async dashboard(a: AuthenticatedUser) {
    const invScope = diskScope(a);
    const [byStatus, shipmentExceptions] = await Promise.all([
      prisma.disk.groupBy({
        by: ["status"],
        where: admin(a) ? {} : { inventory: invScope },
        _count: true,
      }),
      prisma.diskShipment.count({ where: { AND: [shipmentScope(a), { status: "EXCEPTION" }] } }),
    ]);
    const map = Object.fromEntries((byStatus as { status: string; _count: number }[]).map((r) => [r.status, r._count]));
    const at = (s: string) => map[s] ?? 0;
    return {
      totalDisks: Object.values(map).reduce((x, y) => x + y, 0),
      available: at("AVAILABLE"),
      reserved: at("RESERVED"),
      dispatched: at("DISPATCHED"),
      inTransit: at("IN_TRANSIT"),
      delivered: at("DELIVERED"),
      atVendor: at("AT_VENDOR"),
      returned: at("RETURNED"),
      damaged: at("DAMAGED"),
      lost: at("LOST"),
      openShipmentExceptions: shipmentExceptions,
      byStatus: map,
    };
  },

  // -------------------------------------------------------------------------
  // Disk inventory
  // -------------------------------------------------------------------------
  async listDisks(q: v.Query, a: AuthenticatedUser) {
    const where: Prisma.DiskWhereInput = {
      AND: [
        admin(a) ? {} : { inventory: diskScope(a) },
        q.status ? { status: q.status as never } : {},
        q.mediaType ? { mediaType: q.mediaType as never } : {},
        q.depotId ? { inventory: { currentDepotId: q.depotId } } : {},
        q.vendorId ? { inventory: { currentCustodianType: "VENDOR", currentCustodianId: q.vendorId } } : {},
        q.search
          ? { OR: [{ serialNumber: { contains: q.search, mode: "insensitive" } }, { diskCode: { contains: q.search, mode: "insensitive" } }] }
          : {},
      ],
    };
    const [rows, total] = await prisma.$transaction([
      prisma.disk.findMany({
        where,
        include: { inventory: true },
        orderBy: q.sort === "serialNumber" ? { serialNumber: "asc" } : q.sort === "status" ? { status: "asc" } : { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.disk.count({ where }),
    ]);
    return paginate(rows, total, q);
  },

  async getDisk(id: string, a: AuthenticatedUser) {
    const disk = await prisma.disk.findFirst({
      where: { id, ...(admin(a) ? {} : { inventory: diskScope(a) }) },
      include: {
        inventory: true,
        photos: { orderBy: { createdAt: "desc" } },
        custody: { orderBy: { fromDate: "desc" } },
        movements: { orderBy: { occurredAt: "desc" }, take: 50 },
        shipmentItems: { include: { shipment: { select: { reference: true, status: true, type: true } } } },
        discrepancies: true,
      },
    });
    if (!disk) throw ApiError.notFound("Disk not found in your authorized scope");
    return disk;
  },

  async register(input: v.RegisterInput, a: AuthenticatedUser, key: string) {
    requireManage(a);
    return operation(a, key, "disk.register", input, async (tx) => {
      if (await tx.disk.findUnique({ where: { serialNumber: input.serialNumber } }))
        throw ApiError.conflict("A disk with this serial number already exists");
      await refActive(tx, "DEPOT", input.receivingDepotId);
      await refActive(tx, "ORG", input.sourceOrgId);
      const custodianType = input.custodianType;
      const custodianId =
        input.custodianId ?? (custodianType === "DEPOT" ? input.receivingDepotId : undefined);
      if (!custodianId) throw ApiError.badRequest("A custodian is required");
      const diskCode = await nextRef(tx, "disk", "FG-DISK");
      const disk = await tx.disk.create({
        data: {
          diskCode,
          serialNumber: input.serialNumber,
          mediaType: input.mediaType,
          capacity: input.capacity ?? null,
          make: input.make ?? null,
          model: input.model ?? null,
          condition: input.condition ?? null,
          sourceOrgId: input.sourceOrgId ?? null,
          status: "RECEIVED",
          remarks: input.remarks ?? null,
          createdById: a.id,
        },
      });
      await tx.diskInventory.create({
        data: {
          diskId: disk.id,
          inInventory: true,
          receivedAt: new Date(),
          receivedFromOrgId: input.sourceOrgId ?? null,
          receivingDepotId: input.receivingDepotId ?? null,
          currentDepotId: custodianType === "DEPOT" ? (input.receivingDepotId ?? null) : null,
          currentLocation: input.location ?? null,
          currentCustodianType: custodianType as never,
          currentCustodianId: custodianId,
        },
      });
      await recordMovement(tx, disk.id, a, {
        type: "RECEIPT",
        toDepotId: custodianType === "DEPOT" ? input.receivingDepotId : null,
        toLocation: input.location,
        custodianType,
        custodianId,
        reason: "Disk received into inventory",
        reference: diskCode,
      });
      // Received media becomes AVAILABLE once logged into inventory.
      await setStatus(tx, disk.id, "AVAILABLE", a, "Received and available in inventory");
      await audit(tx, a, "disk.registered", disk.id, { diskCode, serialNumber: input.serialNumber });
      return tx.disk.findUnique({ where: { id: disk.id }, include: { inventory: true } });
    });
  },

  async bulkRegister(input: z.infer<typeof v.bulkSchema>, a: AuthenticatedUser, key: string) {
    requireManage(a);
    return operation(a, key, "disk.bulk", input, async (tx) => {
      await refActive(tx, "DEPOT", input.receivingDepotId);
      await refActive(tx, "ORG", input.sourceOrgId);
      if (!input.receivingDepotId) throw ApiError.badRequest("A receiving depot is required for bulk import");
      const serials = input.disks.map((d) => d.serialNumber);
      if (new Set(serials).size !== serials.length) throw ApiError.badRequest("Duplicate serial numbers in import");
      const existing = await tx.disk.findMany({ where: { serialNumber: { in: serials } }, select: { serialNumber: true } });
      if (existing.length)
        throw ApiError.conflict(`Serial numbers already exist: ${existing.map((e) => e.serialNumber).join(", ")}`);
      const created: string[] = [];
      for (const d of input.disks) {
        const diskCode = await nextRef(tx, "disk", "FG-DISK");
        const disk = await tx.disk.create({
          data: {
            diskCode,
            serialNumber: d.serialNumber,
            mediaType: d.mediaType,
            capacity: d.capacity ?? null,
            make: d.make ?? null,
            model: d.model ?? null,
            condition: d.condition ?? null,
            sourceOrgId: input.sourceOrgId ?? null,
            status: "RECEIVED",
            createdById: a.id,
          },
        });
        await tx.diskInventory.create({
          data: {
            diskId: disk.id,
            inInventory: true,
            receivedAt: new Date(),
            receivedFromOrgId: input.sourceOrgId ?? null,
            receivingDepotId: input.receivingDepotId,
            currentDepotId: input.receivingDepotId,
            currentCustodianType: "DEPOT",
            currentCustodianId: input.receivingDepotId,
          },
        });
        await recordMovement(tx, disk.id, a, {
          type: "RECEIPT",
          toDepotId: input.receivingDepotId,
          custodianType: "DEPOT",
          custodianId: input.receivingDepotId,
          reason: "Bulk receipt into inventory",
          reference: diskCode,
        });
        await setStatus(tx, disk.id, "AVAILABLE", a, "Bulk received and available");
        created.push(disk.id);
      }
      await audit(tx, a, "disk.bulk", input.receivingDepotId, { count: created.length });
      return { created: created.length, diskIds: created };
    });
  },

  async updateStatus(id: string, input: z.infer<typeof v.statusSchema>, a: AuthenticatedUser, key: string) {
    requireManage(a);
    return operation(a, key, "disk.status", { id, input }, async (tx) => {
      await lockDisk(tx, id);
      await scopedDisk(tx, id, a);
      return setStatus(tx, id, input.status, a, input.reason);
    });
  },

  async uploadPhoto(
    id: string,
    file: Express.Multer.File,
    meta: { context: string },
    a: AuthenticatedUser,
    key: string,
  ) {
    requireManage(a);
    if (file.mimetype.startsWith("image/")) assertImage(file.buffer, file.mimetype);
    return operation(a, key, "disk.photo", { id, hash: createHash("sha256").update(file.buffer).digest("hex") }, async (tx) => {
      await scopedDisk(tx, id, a);
      const stored = await storage.save({ buffer: file.buffer, originalName: file.originalname, contentType: file.mimetype, folder: `disks/${id}` });
      try {
        const photo = await tx.diskPhoto.create({
          data: {
            diskId: id,
            context: meta.context || "DISK",
            fileName: file.originalname,
            storageKey: stored.key,
            contentType: file.mimetype,
            size: file.size,
            uploadedById: a.id,
          },
        });
        await audit(tx, a, "disk.photo", id, { photoId: photo.id });
        return photo;
      } catch (e) {
        await storage.remove(stored.key);
        throw e;
      }
    });
  },

  async uploadShipmentPhoto(
    id: string,
    file: Express.Multer.File,
    meta: { context: string },
    a: AuthenticatedUser,
    key: string,
  ) {
    requireManage(a);
    if (file.mimetype.startsWith("image/")) assertImage(file.buffer, file.mimetype);
    return operation(a, key, "disk.shipment.photo", { id, hash: createHash("sha256").update(file.buffer).digest("hex") }, async (tx) => {
      const shipment = await tx.diskShipment.findFirst({ where: { AND: [{ id }, shipmentScope(a)] } });
      if (!shipment) throw ApiError.notFound("Shipment not found in your scope");
      const stored = await storage.save({ buffer: file.buffer, originalName: file.originalname, contentType: file.mimetype, folder: `disk-shipments/${id}` });
      try {
        const photo = await tx.diskPhoto.create({
          data: {
            shipmentId: id,
            context: meta.context || "SHIPMENT",
            fileName: file.originalname,
            storageKey: stored.key,
            contentType: file.mimetype,
            size: file.size,
            uploadedById: a.id,
          },
        });
        await audit(tx, a, "disk.shipment.photo", id, { photoId: photo.id });
        return photo;
      } catch (e) {
        await storage.remove(stored.key);
        throw e;
      }
    });
  },

  async downloadPhoto(id: string, a: AuthenticatedUser) {
    const photo = await prisma.diskPhoto.findUnique({ where: { id } });
    if (!photo) throw ApiError.notFound();
    if (photo.diskId) await this.getDisk(photo.diskId, a);
    else if (photo.shipmentId) await this.getShipment(photo.shipmentId, a);
    return { photo, buffer: await storage.read(photo.storageKey) };
  },

  // -------------------------------------------------------------------------
  // Shipments
  // -------------------------------------------------------------------------
  async listShipments(q: v.Query, a: AuthenticatedUser) {
    const where: Prisma.DiskShipmentWhereInput = {
      AND: [shipmentScope(a), q.status ? { status: q.status as never } : {}, q.search ? { reference: { contains: q.search, mode: "insensitive" } } : {}],
    };
    const [rows, total] = await prisma.$transaction([
      prisma.diskShipment.findMany({
        where,
        include: { items: { select: { id: true, status: true } } },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.diskShipment.count({ where }),
    ]);
    return paginate(rows, total, q);
  },

  async getShipment(id: string, a: AuthenticatedUser) {
    const row = await prisma.diskShipment.findFirst({
      where: { AND: [{ id }, shipmentScope(a)] },
      include: {
        items: { include: { disk: { select: { diskCode: true, serialNumber: true, status: true } } } },
        photos: { orderBy: { createdAt: "desc" } },
        handovers: { orderBy: { createdAt: "asc" } },
        inspections: { orderBy: { createdAt: "asc" } },
        discrepancies: true,
      },
    });
    if (!row) throw ApiError.notFound("Shipment not found in your authorized scope");
    return row;
  },

  async createShipment(input: v.ShipmentInput, a: AuthenticatedUser, key: string) {
    requireManage(a);
    return operation(a, key, "disk.shipment.create", input, async (tx) => {
      await refActive(tx, "DEPOT", input.sourceDepotId);
      await refActive(tx, "DEPOT", input.destinationDepotId);
      await refActive(tx, "ORG", input.sourceOrgId);
      await refActive(tx, "ORG", input.destinationOrgId);
      await refActive(tx, "ORG", input.transporterId);
      if (!input.destinationDepotId && !input.destinationOrgId)
        throw ApiError.badRequest("A destination depot or organization is required");
      const diskIds = [...new Set(input.diskIds)];
      for (const diskId of diskIds.sort()) {
        await lockDisk(tx, diskId);
        const disk = await scopedDisk(tx, diskId, a);
        if (!["AVAILABLE", "RETURNED", "AT_VENDOR"].includes(disk.status))
          throw ApiError.conflict(`Disk ${disk.diskCode} is not available for shipment (status ${disk.status})`);
      }
      const reference = await nextRef(tx, "disk_shipment", "FG-DSHP");
      const shipment = await tx.diskShipment.create({
        data: {
          reference,
          type: input.type,
          status: "PLANNED",
          ticketId: input.ticketId ?? null,
          sourceOrgId: input.sourceOrgId ?? null,
          sourceDepotId: input.sourceDepotId ?? null,
          destinationOrgId: input.destinationOrgId ?? null,
          destinationDepotId: input.destinationDepotId ?? null,
          transporterId: input.transporterId ?? null,
          driverId: input.driverId ?? null,
          plannedDispatchAt: input.plannedDispatchAt ?? null,
          expectedDeliveryAt: input.expectedDeliveryAt ?? null,
          trackingReference: input.trackingReference ?? null,
          remarks: input.remarks ?? null,
          createdById: a.id,
        },
      });
      for (const diskId of diskIds) {
        await tx.diskShipmentItem.create({ data: { shipmentId: shipment.id, diskId } });
        await tx.diskInventory.update({ where: { diskId }, data: { activeShipmentId: shipment.id } });
        await setStatus(tx, diskId, "RESERVED", a, `Reserved for shipment ${reference}`);
      }
      await audit(tx, a, "disk.shipment.created", shipment.id, { reference, disks: diskIds.length });
      return tx.diskShipment.findUnique({ where: { id: shipment.id }, include: { items: true } });
    });
  },

  async dispatchShipment(id: string, input: z.infer<typeof v.dispatchSchema>, a: AuthenticatedUser, key: string) {
    requireManage(a);
    return operation(a, key, "disk.shipment.dispatch", { id, input }, async (tx) => {
      const shipment = await tx.diskShipment.findFirst({ where: { AND: [{ id }, shipmentScope(a)] }, include: { items: true } });
      if (!shipment) throw ApiError.notFound("Shipment not found in your scope");
      if (!["PLANNED", "READY"].includes(shipment.status)) throw ApiError.conflict("Only a planned shipment can be dispatched");
      if (!shipment.transporterId) throw ApiError.badRequest("Assign a transporter before dispatch");
      const conditionByDisk = new Map((input.items ?? []).map((i) => [i.diskId, i.condition]));
      const transporterCustodian = shipment.transporterId;
      for (const item of [...shipment.items].sort((x, y) => x.diskId.localeCompare(y.diskId))) {
        await lockDisk(tx, item.diskId);
        await tx.diskShipmentItem.update({
          where: { id: item.id },
          data: { status: "DISPATCHED", dispatchVerified: true, dispatchCondition: conditionByDisk.get(item.diskId) ?? null },
        });
        await recordMovement(tx, item.diskId, a, {
          type: "SHIPMENT_OUT",
          custodianType: "TRANSPORTER",
          custodianId: transporterCustodian,
          shipmentId: shipment.id,
          reason: `Dispatched on shipment ${shipment.reference}`,
          reference: shipment.reference,
          handedOverById: a.id,
        });
        await setStatus(tx, item.diskId, "DISPATCHED", a, `Dispatched on ${shipment.reference}`);
      }
      // Dispatch handover record.
      await tx.diskHandover.create({
        data: {
          reference: await nextRef(tx, "disk_handover", "FG-DHND"),
          shipmentId: shipment.id,
          type: "DISPATCH",
          handoverByName: input.handoverByName ?? null,
          receivedByName: input.receivedByName ?? null,
          sealNumber: input.sealNumber ?? null,
          packaging: input.packaging ?? null,
          handoverAck: true,
          confirmedById: a.id,
          confirmedAt: new Date(),
          createdById: a.id,
        },
      });
      const updated = await tx.diskShipment.update({
        where: { id },
        data: { status: "DISPATCHED", dispatchedAt: new Date(), dispatchedById: a.id },
      });
      await audit(tx, a, "disk.shipment.dispatched", id, { disks: shipment.items.length });
      return updated;
    });
  },

  async recordTracking(id: string, input: z.infer<typeof v.trackingSchema>, a: AuthenticatedUser, key: string) {
    requireManage(a);
    return operation(a, key, "disk.shipment.tracking", { id, input }, async (tx) => {
      const shipment = await tx.diskShipment.findFirst({ where: { AND: [{ id }, shipmentScope(a)] }, include: { items: true } });
      if (!shipment) throw ApiError.notFound("Shipment not found in your scope");
      if (!["DISPATCHED", "IN_TRANSIT"].includes(shipment.status))
        throw ApiError.conflict("Tracking events apply only to dispatched shipments");
      // A tracking event NEVER marks delivery — it only records transit progress.
      if (input.inTransit)
        for (const item of shipment.items)
          if ((await tx.disk.findUniqueOrThrow({ where: { id: item.diskId } })).status === "DISPATCHED")
            await setStatus(tx, item.diskId, "IN_TRANSIT", a, "In transit (tracking event)");
      const updated = await tx.diskShipment.update({
        where: { id },
        data: {
          status: "IN_TRANSIT",
          remarks: `${shipment.remarks ? shipment.remarks + "\n" : ""}[${new Date().toISOString()}] ${input.event}`,
        },
      });
      await audit(tx, a, "disk.shipment.tracking", id, { event: input.event });
      return { id: updated.id, status: updated.status, note: "Tracking recorded. Delivery still requires explicit receiving confirmation." };
    });
  },

  /** Explicit receiving confirmation — never driven by a tracking event. */
  async receiveShipment(id: string, input: z.infer<typeof v.receiveSchema>, a: AuthenticatedUser, key: string) {
    return operation(a, key, "disk.shipment.receive", { id, input }, async (tx) => {
      const shipment = await tx.diskShipment.findFirst({ where: { AND: [{ id }, shipmentScope(a)] }, include: { items: true } });
      if (!shipment) throw ApiError.notFound("Shipment not found in your scope");
      // Receiving is allowed to internal managers, or to the destination vendor.
      const destVendorReceiver =
        isVendor(a) && shipment.destinationOrgId === a.organizationId && can(a, "disk:read");
      if (!can(a, "disk:manage") && !destVendorReceiver) throw ApiError.forbidden();
      if (!["DISPATCHED", "IN_TRANSIT"].includes(shipment.status))
        throw ApiError.conflict("Only a dispatched/in-transit shipment can be received");

      const destCustodianType: CustodianType = shipment.destinationOrgId ? "VENDOR" : "DEPOT";
      const destCustodianId = shipment.destinationOrgId ?? shipment.destinationDepotId;
      if (!destCustodianId) throw ApiError.badRequest("Shipment has no destination custodian");
      const destDepot = shipment.destinationDepotId ?? null;

      const reported = new Map(input.items.map((i) => [i.diskId, i]));
      const shipmentDiskIds = new Set(shipment.items.map((i) => i.diskId));
      let missing = 0,
        damaged = 0,
        received = 0;
      const discrepancies: string[] = [];

      for (const item of shipment.items) {
        await lockDisk(tx, item.diskId);
        const rep = reported.get(item.diskId);
        const disk = await tx.disk.findUniqueOrThrow({ where: { id: item.diskId } });
        if (!rep || rep.received === false) {
          // Missing on arrival — record discrepancy, mark LOST, keep history.
          missing++;
          await tx.diskShipmentItem.update({ where: { id: item.id }, data: { status: "MISSING" } });
          const ref = await nextRef(tx, "disk_discrepancy", "FG-DDIS");
          await tx.diskDiscrepancy.create({
            data: {
              reference: ref,
              diskId: item.diskId,
              shipmentId: shipment.id,
              category: "MISSING",
              description: `Disk ${disk.diskCode} not received on shipment ${shipment.reference}`,
              severity: "MAJOR",
              status: "REPORTED",
              organizationId: shipment.destinationOrgId ?? null,
              reportedById: a.id,
            },
          });
          await setStatus(tx, item.diskId, "LOST", a, `Missing on receipt of ${shipment.reference}`, { force: true });
          discrepancies.push(ref);
          continue;
        }
        received++;
        const isDamaged = rep.damaged === true;
        await tx.diskShipmentItem.update({
          where: { id: item.id },
          data: { status: isDamaged ? "DAMAGED" : "RECEIVED", receivedVerified: true, receivedCondition: rep.condition ?? null },
        });
        await recordMovement(tx, item.diskId, a, {
          type: "SHIPMENT_IN",
          toDepotId: destDepot,
          custodianType: destCustodianType,
          custodianId: destCustodianId,
          shipmentId: shipment.id,
          reason: `Received on shipment ${shipment.reference}`,
          reference: shipment.reference,
          receivedById: a.id,
        });
        await tx.diskInventory.update({ where: { diskId: item.diskId }, data: { activeShipmentId: null } });
        if (isDamaged) {
          damaged++;
          const ref = await nextRef(tx, "disk_discrepancy", "FG-DDIS");
          await tx.diskDiscrepancy.create({
            data: {
              reference: ref,
              diskId: item.diskId,
              shipmentId: shipment.id,
              category: "DAMAGED",
              description: `Disk ${disk.diskCode} received damaged on ${shipment.reference}: ${rep.condition ?? "no detail"}`,
              severity: "MAJOR",
              status: "REPORTED",
              organizationId: shipment.destinationOrgId ?? null,
              reportedById: a.id,
            },
          });
          await setStatus(tx, item.diskId, "DAMAGED", a, `Damaged on receipt of ${shipment.reference}`);
          discrepancies.push(ref);
        } else {
          await setStatus(tx, item.diskId, destCustodianType === "VENDOR" ? "AT_VENDOR" : "DELIVERED", a, `Received on ${shipment.reference}`);
        }
      }
      // Extra disks reported that were not on the shipment.
      for (const rep of input.items)
        if (!shipmentDiskIds.has(rep.diskId)) {
          const ref = await nextRef(tx, "disk_discrepancy", "FG-DDIS");
          await tx.diskDiscrepancy.create({
            data: {
              reference: ref,
              diskId: rep.diskId,
              shipmentId: shipment.id,
              category: "UNACCOUNTED",
              description: `Unexpected disk presented at receipt of ${shipment.reference}`,
              severity: "MODERATE",
              status: "REPORTED",
              organizationId: shipment.destinationOrgId ?? null,
              reportedById: a.id,
            },
          });
          discrepancies.push(ref);
        }

      // Receiving handover record.
      await tx.diskHandover.create({
        data: {
          reference: await nextRef(tx, "disk_handover", "FG-DHND"),
          shipmentId: shipment.id,
          type: "RECEIVING",
          handoverByName: input.handoverByName ?? null,
          receivedByName: input.receivedByName ?? null,
          receiverAck: true,
          confirmedById: a.id,
          confirmedAt: new Date(),
          createdById: a.id,
        },
      });
      const status = missing || damaged ? "EXCEPTION" : "DELIVERED";
      const updated = await tx.diskShipment.update({
        where: { id },
        data: {
          status,
          deliveredAt: new Date(),
          confirmedById: a.id,
          exception: missing || damaged ? `${missing} missing, ${damaged} damaged` : null,
        },
      });
      await audit(tx, a, "disk.shipment.received", id, { received, missing, damaged, discrepancies });
      return { id: updated.id, status, received, missing, damaged, discrepancies };
    });
  },

  async cancelShipment(id: string, reason: string, a: AuthenticatedUser, key: string) {
    requireManage(a);
    return operation(a, key, "disk.shipment.cancel", { id, reason }, async (tx) => {
      const shipment = await tx.diskShipment.findFirst({ where: { AND: [{ id }, shipmentScope(a)] }, include: { items: true } });
      if (!shipment) throw ApiError.notFound("Shipment not found in your scope");
      if (!["PLANNED", "READY"].includes(shipment.status))
        throw ApiError.conflict("Only an undispatched shipment can be cancelled");
      for (const item of shipment.items) {
        await lockDisk(tx, item.diskId);
        await tx.diskInventory.update({ where: { diskId: item.diskId }, data: { activeShipmentId: null } });
        await setStatus(tx, item.diskId, "AVAILABLE", a, `Shipment ${shipment.reference} cancelled: ${reason}`);
      }
      const updated = await tx.diskShipment.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), remarks: reason } });
      await audit(tx, a, "disk.shipment.cancelled", id, { reason });
      return updated;
    });
  },

  // -------------------------------------------------------------------------
  // Chain of custody
  // -------------------------------------------------------------------------
  async custodyHistory(diskId: string, a: AuthenticatedUser) {
    const disk = await this.getDisk(diskId, a);
    return {
      disk: { id: disk.id, diskCode: disk.diskCode, serialNumber: disk.serialNumber, status: disk.status },
      custody: disk.custody,
      movements: disk.movements,
    };
  },

  async transferCustody(diskId: string, input: z.infer<typeof v.custodySchema>, a: AuthenticatedUser, key: string) {
    requireManage(a);
    return operation(a, key, "disk.custody.transfer", { diskId, input }, async (tx) => {
      await lockDisk(tx, diskId);
      const disk = await scopedDisk(tx, diskId, a);
      if (["DISPATCHED", "IN_TRANSIT"].includes(disk.status))
        throw ApiError.conflict("Cannot manually transfer custody of a disk that is in a shipment");
      if (input.custodianType === "DEPOT" || input.depotId) await refActive(tx, "DEPOT", input.depotId ?? input.custodianId);
      if (["VENDOR", "ORGANIZATION", "TRANSPORTER"].includes(input.custodianType)) await refActive(tx, "ORG", input.custodianId);
      await recordMovement(tx, diskId, a, {
        type: "CUSTODY_CHANGE",
        toDepotId: input.depotId ?? (input.custodianType === "DEPOT" ? input.custodianId : null),
        toLocation: input.location,
        custodianType: input.custodianType,
        custodianId: input.custodianId,
        reason: input.reason,
        handedOverById: a.id,
        receivedById: input.receivedByName ? a.id : null,
      });
      const next: DiskStatus = input.custodianType === "VENDOR" ? "AT_VENDOR" : "AVAILABLE";
      if (TRANSITIONS[disk.status as DiskStatus]?.includes(next)) await setStatus(tx, diskId, next, a, input.reason);
      await audit(tx, a, "disk.custody.transfer", diskId, { to: input.custodianType });
      return tx.diskInventory.findUnique({ where: { diskId } });
    });
  },

  // -------------------------------------------------------------------------
  // Inspections
  // -------------------------------------------------------------------------
  async createInspection(input: z.infer<typeof v.inspectionSchema>, a: AuthenticatedUser, key: string) {
    if (!can(a, "disk:manage") && !can(a, "disk:read")) throw ApiError.forbidden();
    return operation(a, key, "disk.inspection", input, async (tx) => {
      if (input.shipmentId) {
        const s = await tx.diskShipment.findFirst({ where: { AND: [{ id: input.shipmentId }, shipmentScope(a)] } });
        if (!s) throw ApiError.badRequest("Shipment not found in your scope");
      }
      if (input.diskId) await scopedDisk(tx, input.diskId, a);
      const reference = await nextRef(tx, "disk_inspection", "FG-DINS");
      const row = await tx.diskInspection.create({
        data: {
          reference,
          type: input.type,
          shipmentId: input.shipmentId ?? null,
          diskId: input.diskId ?? null,
          condition: input.condition ?? null,
          sealNumber: input.sealNumber ?? null,
          packaging: input.packaging ?? null,
          verified: input.verified,
          remarks: input.remarks ?? null,
          performedById: a.id,
        },
      });
      await audit(tx, a, "disk.inspection", row.id, { type: input.type });
      return row;
    });
  },

  // -------------------------------------------------------------------------
  // Reconciliation
  // -------------------------------------------------------------------------
  async createReconciliation(input: z.infer<typeof v.reconciliationSchema>, a: AuthenticatedUser, key: string) {
    requireManage(a);
    return operation(a, key, "disk.recon.create", input, async (tx) => {
      const reference = await nextRef(tx, "disk_recon", "FG-DREC");
      const row = await tx.diskReconciliation.create({
        data: { reference, scope: input.scope, scopeId: input.scopeId, status: "DRAFT", notes: input.notes ?? null, startedById: a.id },
      });
      await audit(tx, a, "disk.recon.created", row.id, { scope: input.scope });
      return row;
    });
  },

  async setReconciliationItems(id: string, input: z.infer<typeof v.reconciliationItemsSchema>, a: AuthenticatedUser, key: string) {
    requireManage(a);
    return operation(a, key, "disk.recon.items", { id, count: input.items.length }, async (tx) => {
      const recon = await tx.diskReconciliation.findUnique({ where: { id } });
      if (!recon) throw ApiError.notFound("Reconciliation not found");
      if (recon.status !== "DRAFT") throw ApiError.conflict("Only a draft reconciliation can be edited");
      await tx.diskReconciliationItem.deleteMany({ where: { reconciliationId: id } });
      await tx.diskReconciliationItem.createMany({
        data: input.items.map((it) => ({
          reconciliationId: id,
          diskId: it.diskId ?? null,
          diskRef: it.diskRef ?? null,
          result: it.result,
          observedDepotId: it.observedDepotId ?? null,
          observedCustodianId: it.observedCustodianId ?? null,
          discrepancy: it.discrepancy ?? null,
          remarks: it.remarks ?? null,
        })),
      });
      return tx.diskReconciliation.findUnique({ where: { id }, include: { items: true } });
    });
  },

  async submitReconciliation(id: string, a: AuthenticatedUser, key: string) {
    requireManage(a);
    return operation(a, key, "disk.recon.submit", { id }, async (tx) => {
      const recon = await tx.diskReconciliation.findUnique({ where: { id }, include: { items: true } });
      if (!recon) throw ApiError.notFound();
      if (recon.status !== "DRAFT") throw ApiError.conflict("Only a draft reconciliation can be submitted");
      if (!recon.items.length) throw ApiError.badRequest("Add at least one reconciliation item");
      const updated = await tx.diskReconciliation.update({ where: { id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
      await audit(tx, a, "disk.recon.submitted", id, { items: recon.items.length });
      return updated;
    });
  },

  async reviewReconciliation(id: string, input: z.infer<typeof v.reviewSchema>, a: AuthenticatedUser, key: string) {
    requireReview(a);
    return operation(a, key, "disk.recon.review", { id, input }, async (tx) => {
      const recon = await tx.diskReconciliation.findUnique({ where: { id }, include: { items: true } });
      if (!recon) throw ApiError.notFound();
      if (recon.status !== "SUBMITTED") throw ApiError.conflict("Only a submitted reconciliation can be reviewed");
      if (input.decision === "REJECT") {
        const r = await tx.diskReconciliation.update({ where: { id }, data: { status: "REJECTED", reviewedById: a.id, reviewedAt: new Date(), reviewComment: input.comment } });
        await audit(tx, a, "disk.recon.rejected", id, {});
        return r;
      }
      // Approve: apply adjustments to disks with discrepancies, recorded in the ledger + audit.
      let adjusted = 0;
      for (const item of recon.items) {
        if (!item.diskId || item.result === "VERIFIED" || item.result === "PENDING") continue;
        await lockDisk(tx, item.diskId);
        const target: DiskStatus =
          item.result === "MISSING"
            ? "LOST"
            : item.result === "DAMAGED"
              ? "DAMAGED"
              : item.result === "UNACCOUNTED"
                ? "UNDER_INSPECTION"
                : "AVAILABLE"; // MISPLACED → remains usable after location correction
        await recordMovement(tx, item.diskId, a, {
          type: "RECONCILIATION",
          toDepotId: item.observedDepotId ?? null,
          custodianType: item.observedCustodianId ? "VENDOR" : "DEPOT",
          custodianId: item.observedCustodianId ?? item.observedDepotId ?? (await tx.diskInventory.findUniqueOrThrow({ where: { diskId: item.diskId } })).currentCustodianId ?? item.diskId,
          reason: `Reconciliation ${recon.reference} adjustment: ${item.result}`,
          reference: recon.reference,
        });
        await setStatus(tx, item.diskId, target, a, `Reconciliation ${recon.reference}: ${item.result}`, { force: true });
        adjusted++;
      }
      const updated = await tx.diskReconciliation.update({ where: { id }, data: { status: "APPROVED", reviewedById: a.id, reviewedAt: new Date(), reviewComment: input.comment } });
      await audit(tx, a, "disk.recon.approved", id, { adjusted });
      return { ...updated, adjusted };
    });
  },

  async listReconciliations(q: v.Query, a: AuthenticatedUser) {
    const where: Prisma.DiskReconciliationWhereInput = admin(a)
      ? {}
      : a.role.name === "OPERATIONS_MANAGER"
        ? { OR: [{ scope: "DEPOT", scopeId: { in: a.depotIds } }, { startedById: a.id }] }
        : { startedById: a.id };
    const [rows, total] = await prisma.$transaction([
      prisma.diskReconciliation.findMany({ where, include: { items: { select: { id: true, result: true } } }, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.diskReconciliation.count({ where }),
    ]);
    return paginate(rows, total, q);
  },

  async getReconciliation(id: string, a: AuthenticatedUser) {
    const row = await prisma.diskReconciliation.findUnique({ where: { id }, include: { items: true, photos: true } });
    if (!row) throw ApiError.notFound("Reconciliation not found");
    if (!admin(a) && row.startedById !== a.id && !(a.role.name === "OPERATIONS_MANAGER" && row.scope === "DEPOT" && a.depotIds.includes(row.scopeId)))
      throw ApiError.forbidden();
    return row;
  },

  // -------------------------------------------------------------------------
  // Discrepancies
  // -------------------------------------------------------------------------
  async listDiscrepancies(q: v.Query, a: AuthenticatedUser) {
    const scope: Prisma.DiskDiscrepancyWhereInput = admin(a)
      ? {}
      : isVendor(a)
        ? { organizationId: org(a) }
        : { OR: [{ reportedById: a.id }, { organizationId: org(a) }] };
    const where: Prisma.DiskDiscrepancyWhereInput = { AND: [scope, q.status ? { status: q.status as never } : {}] };
    const [rows, total] = await prisma.$transaction([
      prisma.diskDiscrepancy.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.diskDiscrepancy.count({ where }),
    ]);
    return paginate(rows, total, q);
  },

  async createDiscrepancy(input: z.infer<typeof v.discrepancySchema>, a: AuthenticatedUser, key: string) {
    if (!can(a, "disk:manage") && !can(a, "disk:read")) throw ApiError.forbidden();
    return operation(a, key, "disk.discrepancy.create", input, async (tx) => {
      if (input.diskId) await scopedDisk(tx, input.diskId, a);
      const reference = await nextRef(tx, "disk_discrepancy", "FG-DDIS");
      const row = await tx.diskDiscrepancy.create({
        data: {
          reference,
          diskId: input.diskId ?? null,
          shipmentId: input.shipmentId ?? null,
          reconciliationId: input.reconciliationId ?? null,
          category: input.category,
          description: input.description,
          severity: input.severity,
          status: "REPORTED",
          organizationId: isVendor(a) ? org(a) : null,
          reportedById: a.id,
        },
      });
      await audit(tx, a, "disk.discrepancy.created", row.id, { category: input.category });
      return row;
    });
  },

  async transitionDiscrepancy(id: string, input: z.infer<typeof v.discrepancyTransitionSchema>, a: AuthenticatedUser, key: string) {
    return operation(a, key, "disk.discrepancy.transition", { id, input }, async (tx) => {
      const row = await tx.diskDiscrepancy.findUnique({ where: { id } });
      if (!row) throw ApiError.notFound();
      if (!admin(a) && !can(a, "disk:manage") && row.reportedById !== a.id) throw ApiError.forbidden();
      const ALLOWED: Record<string, string[]> = {
        REPORTED: ["UNDER_REVIEW", "CONFIRMED", "DISPUTED"],
        UNDER_REVIEW: ["CONFIRMED", "DISPUTED", "RESOLVED"],
        CONFIRMED: ["RESOLVED", "DISPUTED"],
        DISPUTED: ["UNDER_REVIEW", "CONFIRMED", "RESOLVED"],
        RESOLVED: ["CLOSED"],
        CLOSED: [],
      };
      if (!ALLOWED[row.status]?.includes(input.status)) throw ApiError.conflict(`Cannot move ${row.status} → ${input.status}`);
      if (["CONFIRMED", "RESOLVED", "CLOSED"].includes(input.status)) requireReview(a);
      const updated = await tx.diskDiscrepancy.update({
        where: { id },
        data: {
          status: input.status as never,
          ...(input.status === "RESOLVED" || input.status === "CLOSED"
            ? { resolvedById: a.id, resolvedAt: new Date(), resolutionRemarks: input.remarks }
            : {}),
        },
      });
      // Confirming a serious discrepancy marks the disk DAMAGED/LOST.
      if (input.status === "CONFIRMED" && row.diskId && (row.severity === "MAJOR" || row.severity === "CRITICAL")) {
        await lockDisk(tx, row.diskId);
        await setStatus(tx, row.diskId, row.category === "MISSING" ? "LOST" : "DAMAGED", a, `Confirmed ${row.severity} discrepancy ${row.reference}`, { force: true });
      }
      await audit(tx, a, "disk.discrepancy.transition", id, { from: row.status, to: input.status });
      return updated;
    });
  },
};
