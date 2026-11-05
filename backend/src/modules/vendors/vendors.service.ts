import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";
import type { AuthenticatedUser } from "../../types/auth";
import { ApiError } from "../../utils/ApiError";
import { storage } from "../../utils/storage";
import type { PaginationMeta } from "../../utils/ApiResponse";
import type {
  ListQuery,
  RegisterInput,
  UpdateInput,
} from "./vendors.validators";

/**
 * Phase 11 — Vendor Management service.
 *
 * A vendor is an Organization of type VEHICLE_VENDOR or TRANSPORT_PARTNER; this
 * service never creates a second vendor identity. It adds the richer vendor
 * profile, contacts, locations and assigned-user management on top, plus
 * vendor-scoped aggregation of vehicles and disks that reuse the existing
 * cross-module custody fields.
 *
 * Data isolation: a VENDOR/TRANSPORT user is restricted to their own
 * organization for every read; all writes require `vendors:manage` (held only
 * by administrators), so vendor users are inherently read-only on their own
 * record.
 */

type Tx = Prisma.TransactionClient;

const VENDOR_TYPES: Prisma.OrganizationWhereInput["type"] = {
  in: ["VEHICLE_VENDOR", "TRANSPORT_PARTNER"],
};

const isVendorActor = (a: AuthenticatedUser) =>
  a.organizationType === "VEHICLE_VENDOR" || a.organizationType === "TRANSPORT_PARTNER";

/** Throw unless the actor may see this vendor org. Vendor users: own org only. */
function assertScope(a: AuthenticatedUser, orgId: string) {
  if (isVendorActor(a) && a.organizationId !== orgId)
    throw ApiError.notFound("Vendor not found in your authorized scope");
}

async function nextVendorCode(tx: Tx) {
  const c = await tx.counter.upsert({
    where: { name: "vendor" },
    create: { name: "vendor", value: 1 },
    update: { value: { increment: 1 } },
  });
  return `FG-VEND-${String(c.value).padStart(6, "0")}`;
}

/** Load a vendor org (type-guarded + scoped) or throw 404. */
async function loadVendor(id: string, a: AuthenticatedUser) {
  assertScope(a, id);
  const org = await prisma.organization.findFirst({
    where: { id, type: VENDOR_TYPES },
  });
  if (!org) throw ApiError.notFound("Vendor not found");
  return org;
}

export const vendorsService = {
  async lookups(a: AuthenticatedUser) {
    return {
      types: ["VEHICLE_VENDOR", "TRANSPORT_PARTNER"],
      statuses: ["ACTIVE", "INACTIVE"],
      canManage: a.permissions.includes("vendors:manage"),
    };
  },

  async list(q: ListQuery, a: AuthenticatedUser) {
    const where: Prisma.OrganizationWhereInput = { type: q.type ? q.type : VENDOR_TYPES };
    if (isVendorActor(a)) where.id = a.organizationId ?? "__none__";
    if (q.status) where.status = q.status;
    if (q.search) where.name = { contains: q.search, mode: "insensitive" };

    const [total, orgs] = await Promise.all([
      prisma.organization.count({ where }),
      prisma.organization.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          vendorProfile: { select: { code: true, category: true } },
          _count: { select: { users: true, vendorVehicles: true, vendorLocations: true } },
        },
      }),
    ]);
    const meta: PaginationMeta = {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    };
    return { data: orgs, meta };
  },

  async getById(id: string, a: AuthenticatedUser) {
    await loadVendor(id, a);
    const [org, assignedVehicles, custodyVehicles, disks, allocations, dispatches, inspections, openTickets] =
      await Promise.all([
        prisma.organization.findUnique({
          where: { id },
          include: {
            vendorProfile: true,
            vendorContacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
            vendorLocations: { orderBy: [{ isPrimary: "desc" }, { label: "asc" }] },
            vendorDocuments: { orderBy: { createdAt: "desc" } },
            users: {
              select: { id: true, fullName: true, email: true, status: true, role: { select: { name: true, displayName: true } } },
            },
          },
        }),
        prisma.vehicle.count({ where: { organizationId: id } }),
        prisma.vehicle.count({ where: { vendorId: id } }),
        prisma.diskInventory.count({ where: { currentCustodianType: "VENDOR", currentCustodianId: id } }),
        prisma.vehicleAllocation.count({ where: { OR: [{ receivingOrgId: id }, { transporterId: id }] } }),
        prisma.dispatch.count({ where: { transporterId: id } }),
        prisma.vehicleInspection.count({ where: { OR: [{ organizationId: id }, { receivedFromOrgId: id }] } }),
        prisma.ticket.count({ where: { requestingOrgId: id } }),
      ]);

    return {
      ...org,
      summary: {
        assignedVehicles,
        custodyVehicles,
        disksInCustody: disks,
        allocations,
        dispatches,
        inspections,
        openTickets,
        users: org?.users.length ?? 0,
      },
    };
  },

  async register(input: RegisterInput, _a: AuthenticatedUser) {
    const dupe = await prisma.organization.findFirst({ where: { name: input.name, type: input.type } });
    if (dupe) throw ApiError.conflict("A vendor with this name and type already exists");

    return prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: input.name,
          type: input.type,
          contactName: input.contactName ?? null,
          contactEmail: input.contactEmail ?? null,
          contactPhone: input.contactPhone ?? null,
          status: "ACTIVE",
        },
      });
      const profile = await tx.vendorProfile.create({
        data: {
          organizationId: org.id,
          code: await nextVendorCode(tx),
          registrationNumber: input.registrationNumber ?? null,
          category: input.category ?? null,
          addressLine: input.addressLine ?? null,
          city: input.city ?? null,
          region: input.region ?? null,
          website: input.website ?? null,
          onboardedAt: new Date(),
          notes: input.notes ?? null,
        },
      });
      return { ...org, vendorProfile: profile };
    });
  },

  async update(id: string, input: UpdateInput, a: AuthenticatedUser) {
    await loadVendor(id, a);
    if (input.name) {
      const org = await prisma.organization.findUniqueOrThrow({ where: { id } });
      const dupe = await prisma.organization.findFirst({
        where: { name: input.name, type: org.type, NOT: { id } },
      });
      if (dupe) throw ApiError.conflict("A vendor with this name and type already exists");
    }
    return prisma.$transaction(async (tx) => {
      const org = await tx.organization.update({
        where: { id },
        data: {
          name: input.name,
          contactName: input.contactName,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone,
        },
      });
      const profileData = {
        registrationNumber: input.registrationNumber,
        category: input.category,
        addressLine: input.addressLine,
        city: input.city,
        region: input.region,
        website: input.website,
        notes: input.notes,
      };
      const profile = await tx.vendorProfile.upsert({
        where: { organizationId: id },
        update: profileData,
        create: { organizationId: id, code: await nextVendorCode(tx), ...profileData },
      });
      return { ...org, vendorProfile: profile };
    });
  },

  async setStatus(id: string, status: "ACTIVE" | "INACTIVE", a: AuthenticatedUser) {
    await loadVendor(id, a);
    if (status === "INACTIVE") {
      const [vehicles, disks] = await Promise.all([
        prisma.vehicle.count({ where: { vendorId: id } }),
        prisma.diskInventory.count({ where: { currentCustodianType: "VENDOR", currentCustodianId: id } }),
      ]);
      if (vehicles > 0 || disks > 0)
        throw ApiError.conflict(
          `Cannot deactivate a vendor that currently holds ${vehicles} vehicle(s) and ${disks} disk(s) in custody`,
        );
    }
    return prisma.organization.update({ where: { id }, data: { status } });
  },

  // --- contacts -------------------------------------------------------------
  async addContact(id: string, input: { name: string; title?: string; email?: string; phone?: string; isPrimary: boolean }, a: AuthenticatedUser) {
    await loadVendor(id, a);
    return prisma.$transaction(async (tx) => {
      if (input.isPrimary) await tx.vendorContact.updateMany({ where: { organizationId: id }, data: { isPrimary: false } });
      return tx.vendorContact.create({
        data: {
          organizationId: id,
          name: input.name,
          title: input.title ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          isPrimary: input.isPrimary,
        },
      });
    });
  },
  async updateContact(id: string, contactId: string, input: { name: string; title?: string; email?: string; phone?: string; isPrimary: boolean }, a: AuthenticatedUser) {
    await loadVendor(id, a);
    const existing = await prisma.vendorContact.findFirst({ where: { id: contactId, organizationId: id } });
    if (!existing) throw ApiError.notFound("Contact not found");
    return prisma.$transaction(async (tx) => {
      if (input.isPrimary) await tx.vendorContact.updateMany({ where: { organizationId: id, NOT: { id: contactId } }, data: { isPrimary: false } });
      return tx.vendorContact.update({
        where: { id: contactId },
        data: { name: input.name, title: input.title ?? null, email: input.email ?? null, phone: input.phone ?? null, isPrimary: input.isPrimary },
      });
    });
  },
  async deleteContact(id: string, contactId: string, a: AuthenticatedUser) {
    await loadVendor(id, a);
    const existing = await prisma.vendorContact.findFirst({ where: { id: contactId, organizationId: id } });
    if (!existing) throw ApiError.notFound("Contact not found");
    await prisma.vendorContact.delete({ where: { id: contactId } });
    return { id: contactId, deleted: true };
  },

  // --- locations ------------------------------------------------------------
  async addLocation(id: string, input: { label: string; addressLine?: string; city?: string; region?: string; contactName?: string; contactPhone?: string; isPrimary: boolean }, a: AuthenticatedUser) {
    await loadVendor(id, a);
    return prisma.$transaction(async (tx) => {
      if (input.isPrimary) await tx.vendorLocation.updateMany({ where: { organizationId: id }, data: { isPrimary: false } });
      return tx.vendorLocation.create({
        data: {
          organizationId: id,
          label: input.label,
          addressLine: input.addressLine ?? null,
          city: input.city ?? null,
          region: input.region ?? null,
          contactName: input.contactName ?? null,
          contactPhone: input.contactPhone ?? null,
          isPrimary: input.isPrimary,
        },
      });
    });
  },
  async updateLocation(id: string, locationId: string, input: { label: string; addressLine?: string; city?: string; region?: string; contactName?: string; contactPhone?: string; isPrimary: boolean }, a: AuthenticatedUser) {
    await loadVendor(id, a);
    const existing = await prisma.vendorLocation.findFirst({ where: { id: locationId, organizationId: id } });
    if (!existing) throw ApiError.notFound("Location not found");
    return prisma.$transaction(async (tx) => {
      if (input.isPrimary) await tx.vendorLocation.updateMany({ where: { organizationId: id, NOT: { id: locationId } }, data: { isPrimary: false } });
      return tx.vendorLocation.update({
        where: { id: locationId },
        data: {
          label: input.label,
          addressLine: input.addressLine ?? null,
          city: input.city ?? null,
          region: input.region ?? null,
          contactName: input.contactName ?? null,
          contactPhone: input.contactPhone ?? null,
          isPrimary: input.isPrimary,
        },
      });
    });
  },
  async deleteLocation(id: string, locationId: string, a: AuthenticatedUser) {
    await loadVendor(id, a);
    const existing = await prisma.vendorLocation.findFirst({ where: { id: locationId, organizationId: id } });
    if (!existing) throw ApiError.notFound("Location not found");
    await prisma.vendorLocation.delete({ where: { id: locationId } });
    return { id: locationId, deleted: true };
  },

  // --- assigned users -------------------------------------------------------
  async listUsers(id: string, a: AuthenticatedUser) {
    await loadVendor(id, a);
    return prisma.user.findMany({
      where: { organizationId: id },
      select: { id: true, fullName: true, email: true, status: true, role: { select: { name: true, displayName: true } } },
      orderBy: { fullName: "asc" },
    });
  },
  async assignUser(id: string, userId: string, a: AuthenticatedUser) {
    await loadVendor(id, a);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw ApiError.notFound("User not found");
    if (user.organizationId && user.organizationId !== id)
      throw ApiError.conflict("User already belongs to another organization; unassign them first");
    return prisma.user.update({
      where: { id: userId },
      data: { organizationId: id },
      select: { id: true, fullName: true, email: true, organizationId: true },
    });
  },
  async unassignUser(id: string, userId: string, a: AuthenticatedUser) {
    await loadVendor(id, a);
    const user = await prisma.user.findFirst({ where: { id: userId, organizationId: id } });
    if (!user) throw ApiError.notFound("User is not assigned to this vendor");
    await prisma.user.update({ where: { id: userId }, data: { organizationId: null } });
    return { id: userId, unassigned: true };
  },

  // --- vendor-wise inventory ------------------------------------------------
  async vehicles(id: string, q: ListQuery, a: AuthenticatedUser) {
    await loadVendor(id, a);
    const where: Prisma.VehicleWhereInput = { OR: [{ organizationId: id }, { vendorId: id }] };
    const [total, data] = await Promise.all([
      prisma.vehicle.count({ where }),
      prisma.vehicle.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: { id: true, vehicleCode: true, registrationNumber: true, status: true, organizationId: true, vendorId: true },
      }),
    ]);
    const meta: PaginationMeta = { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
    return { data, meta };
  },
  async disks(id: string, q: ListQuery, a: AuthenticatedUser) {
    await loadVendor(id, a);
    const where: Prisma.DiskInventoryWhereInput = { currentCustodianType: "VENDOR", currentCustodianId: id };
    const [total, inv] = await Promise.all([
      prisma.diskInventory.count({ where }),
      prisma.diskInventory.findMany({
        where,
        orderBy: { lastMovementAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { disk: { select: { id: true, diskCode: true, serialNumber: true, status: true, mediaType: true } } },
      }),
    ]);
    const data = inv.map((r) => r.disk);
    const meta: PaginationMeta = { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
    return { data, meta };
  },

  // --- documents (agreements, consent forms, supporting files) --------------
  async listDocuments(id: string, a: AuthenticatedUser) {
    await loadVendor(id, a);
    return prisma.vendorDocument.findMany({ where: { organizationId: id }, orderBy: { createdAt: "desc" } });
  },
  async addDocument(
    id: string,
    file: Express.Multer.File,
    input: { category: "CONSENT" | "AGREEMENT" | "OTHER"; title?: string },
    a: AuthenticatedUser,
  ) {
    await loadVendor(id, a);
    const stored = await storage.save({
      buffer: file.buffer,
      originalName: file.originalname,
      contentType: file.mimetype,
      folder: `vendors/${id}`,
    });
    try {
      return await prisma.vendorDocument.create({
        data: {
          organizationId: id,
          category: input.category,
          title: input.title?.trim() || file.originalname,
          fileName: file.originalname,
          storageKey: stored.key,
          contentType: file.mimetype,
          size: file.size,
          uploadedById: a.id,
        },
      });
    } catch (e) {
      await storage.remove(stored.key).catch(() => {});
      throw e;
    }
  },
  async downloadDocument(id: string, docId: string, a: AuthenticatedUser) {
    await loadVendor(id, a);
    const doc = await prisma.vendorDocument.findFirst({ where: { id: docId, organizationId: id } });
    if (!doc) throw ApiError.notFound("Document not found");
    return { doc, buffer: await storage.read(doc.storageKey) };
  },
  async deleteDocument(id: string, docId: string, a: AuthenticatedUser) {
    await loadVendor(id, a);
    const doc = await prisma.vendorDocument.findFirst({ where: { id: docId, organizationId: id } });
    if (!doc) throw ApiError.notFound("Document not found");
    await prisma.vendorDocument.delete({ where: { id: docId } });
    await storage.remove(doc.storageKey).catch(() => {});
    return { id: docId, deleted: true };
  },
};
