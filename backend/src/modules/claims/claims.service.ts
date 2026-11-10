import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "../../database/prisma";
import type { AuthenticatedUser } from "../../types/auth";
import { ApiError } from "../../utils/ApiError";
import { storage } from "../../utils/storage";
import type { PaginationMeta } from "../../utils/ApiResponse";
import type { CreateInput, ListQuery, ProcessInput, UpdateInput } from "./claims.validators";

/**
 * Insurance Claims service.
 *
 * A vendor reports a vehicle incident (accident / theft / …) with photo and
 * video evidence; a receiver (operations / admin) processes it with the insurer
 * and records the status, acknowledgement, approved % and payable amount.
 *
 * Data isolation: a VENDOR / CTS user is restricted to their own organization's
 * claims; operations managers and administrators see all. Reporting requires
 * `claims:report`; receiver processing requires `claims:manage`.
 */

type Tx = Prisma.TransactionClient;

const isScopedActor = (a: AuthenticatedUser) =>
  a.organizationType === "VEHICLE_VENDOR" ||
  a.organizationType === "TRANSPORT_PARTNER" ||
  a.organizationType === "CTS";

/** Claims a scoped actor may see: only their own organization's. */
function scopeWhere(a: AuthenticatedUser): Prisma.InsuranceClaimWhereInput {
  if (isScopedActor(a)) return { organizationId: a.organizationId ?? "__none__" };
  return {};
}

async function nextReference(tx: Tx) {
  const c = await tx.counter.upsert({
    where: { name: "insurance_claim" },
    create: { name: "insurance_claim", value: 1 },
    update: { value: { increment: 1 } },
  });
  return `FG-CLM-${String(c.value).padStart(6, "0")}`;
}

const attachmentKind = (contentType: string) =>
  contentType.startsWith("video/") ? "VIDEO" : contentType.startsWith("image/") ? "PHOTO" : "DOCUMENT";

const include = {
  vehicle: { select: { id: true, vehicleCode: true, registrationNumber: true, status: true } },
  attachments: { orderBy: { createdAt: "asc" } },
  events: { orderBy: { createdAt: "desc" } },
} satisfies Prisma.InsuranceClaimInclude;

async function load(id: string, a: AuthenticatedUser) {
  const claim = await prisma.insuranceClaim.findFirst({ where: { id, ...scopeWhere(a) }, include });
  if (!claim) throw ApiError.notFound("Claim not found in your authorized scope");
  return claim;
}

async function logEvent(tx: Tx, claimId: string, type: string, note: string | undefined, actorId: string | undefined) {
  await tx.claimEvent.create({ data: { claimId, type, note: note ?? null, actorId: actorId ?? null } });
}

export const claimsService = {
  async lookups(a: AuthenticatedUser) {
    return {
      incidentTypes: ["ACCIDENT", "THEFT", "FIRE", "VANDALISM", "NATURAL_DISASTER", "THIRD_PARTY", "OTHER"],
      damageLevels: ["LOW", "MEDIUM", "HIGH"],
      statuses: ["OPEN", "WIP", "CLOSED"],
      insuranceStatuses: ["NOT_SUBMITTED", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "PARTIALLY_APPROVED", "REJECTED", "SETTLED"],
      canReport: a.permissions.includes("claims:report"),
      canManage: a.permissions.includes("claims:manage"),
    };
  },

  async dashboard(a: AuthenticatedUser) {
    const where = scopeWhere(a);
    const [total, open, wip, closed, byLevel, byType] = await Promise.all([
      prisma.insuranceClaim.count({ where }),
      prisma.insuranceClaim.count({ where: { ...where, status: "OPEN" } }),
      prisma.insuranceClaim.count({ where: { ...where, status: "WIP" } }),
      prisma.insuranceClaim.count({ where: { ...where, status: "CLOSED" } }),
      prisma.insuranceClaim.groupBy({ by: ["damageLevel"], where, _count: true }),
      prisma.insuranceClaim.groupBy({ by: ["incidentType"], where, _count: true }),
    ]);
    const payable = await prisma.insuranceClaim.aggregate({ where, _sum: { payableAmount: true, estimatedAmount: true } });
    return {
      total,
      open,
      wip,
      closed,
      totalEstimated: payable._sum.estimatedAmount ?? 0,
      totalPayable: payable._sum.payableAmount ?? 0,
      byDamageLevel: Object.fromEntries(byLevel.map((r) => [r.damageLevel, r._count])),
      byIncidentType: Object.fromEntries(byType.map((r) => [r.incidentType, r._count])),
    };
  },

  async list(q: ListQuery, a: AuthenticatedUser) {
    const where: Prisma.InsuranceClaimWhereInput = { ...scopeWhere(a) };
    if (q.status) where.status = q.status;
    if (q.incidentType) where.incidentType = q.incidentType;
    if (q.damageLevel) where.damageLevel = q.damageLevel;
    if (q.vehicleId) where.vehicleId = q.vehicleId;
    if (q.search)
      where.OR = [
        { reference: { contains: q.search, mode: "insensitive" } },
        { city: { contains: q.search, mode: "insensitive" } },
        { vehicle: { registrationNumber: { contains: q.search, mode: "insensitive" } } },
      ];

    const [total, data] = await Promise.all([
      prisma.insuranceClaim.count({ where }),
      prisma.insuranceClaim.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { vehicle: { select: { id: true, vehicleCode: true, registrationNumber: true } }, _count: { select: { attachments: true } } },
      }),
    ]);
    const meta: PaginationMeta = { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
    return { data, meta };
  },

  getById: (id: string, a: AuthenticatedUser) => load(id, a),

  async create(input: CreateInput, a: AuthenticatedUser, files: Express.Multer.File[]) {
    if (!files.some((f) => f.mimetype.startsWith("image/")) || !files.some((f) => f.mimetype.startsWith("video/"))) {
      throw ApiError.badRequest("At least one photo and one video are required before submitting a claim");
    }
    const vehicle = await prisma.vehicle.findUnique({ where: { id: input.vehicleId }, select: { id: true, vendorId: true } });
    if (!vehicle) throw ApiError.badRequest("Vehicle not found");
    // Claimant organization: the reporter's own org, else the vehicle's vendor.
    const organizationId = a.organizationId ?? vehicle.vendorId ?? null;

    const storedFiles: { file: Express.Multer.File; key: string }[] = [];
    try {
      const folder = `claims/${randomUUID()}`;
      for (const file of files) {
        const saved = await storage.save({ buffer: file.buffer, originalName: file.originalname, contentType: file.mimetype, folder });
        storedFiles.push({ file, key: saved.key });
      }
      return await prisma.$transaction(async (tx) => {
        const claim = await tx.insuranceClaim.create({
          data: {
            reference: await nextReference(tx),
            vehicleId: input.vehicleId,
            organizationId,
            incidentType: input.incidentType,
            category: input.category ?? null,
            incidentDate: input.incidentDate ?? null,
            city: input.city ?? null,
            location: input.location ?? null,
            damageLevel: input.damageLevel,
            description: input.description,
            policeComplaint: input.policeComplaint,
            policeComplaintNumber: input.policeComplaintNumber ?? null,
            policeStation: input.policeStation ?? null,
            reportedById: a.id,
            attachments: { create: storedFiles.map(({ file, key }) => ({
              kind: file.mimetype.startsWith("image/") ? "PHOTO" as const : "VIDEO" as const,
              fileName: file.originalname, storageKey: key, contentType: file.mimetype,
              size: file.size, uploadedById: a.id,
            })) },
          },
          include,
        });
        await logEvent(tx, claim.id, "CREATED", `Incident reported (${input.incidentType})`, a.id);
        await logEvent(tx, claim.id, "EVIDENCE", `${files.length} required evidence files attached`, a.id);
        return claim;
      });
    } catch (error) {
      await Promise.allSettled(storedFiles.map(({ key }) => storage.remove(key)));
      throw error;
    }
  },

  async update(id: string, input: UpdateInput, a: AuthenticatedUser) {
    const claim = await load(id, a);
    if (claim.status === "CLOSED") throw ApiError.conflict("A closed claim cannot be edited");
    return prisma.$transaction(async (tx) => {
      const updated = await tx.insuranceClaim.update({
        where: { id },
        data: {
          incidentType: input.incidentType,
          category: input.category,
          incidentDate: input.incidentDate,
          city: input.city,
          location: input.location,
          damageLevel: input.damageLevel,
          description: input.description,
          policeComplaint: input.policeComplaint,
          policeComplaintNumber: input.policeComplaintNumber,
          policeStation: input.policeStation,
        },
        include,
      });
      await logEvent(tx, id, "UPDATED", "Report details updated", a.id);
      return updated;
    });
  },

  /** Receiver processing: insurer status, acknowledgement, amounts, Open/WIP/Closed. */
  async process(id: string, input: ProcessInput, a: AuthenticatedUser) {
    const claim = await load(id, a);
    if (claim.status === "CLOSED" && input.status !== "WIP" && input.status !== "OPEN")
      throw ApiError.conflict("Reopen the claim before processing it further");

    return prisma.$transaction(async (tx) => {
      const data: Prisma.InsuranceClaimUpdateInput = {
        status: input.status,
        insuranceStatus: input.insuranceStatus,
        insurerName: input.insurerName,
        policyNumber: input.policyNumber,
        insurerClaimRef: input.insurerClaimRef,
        currency: input.currency,
        estimatedAmount: input.estimatedAmount,
        approvedPercentage: input.approvedPercentage,
        payableAmount: input.payableAmount,
      };
      const updated = await tx.insuranceClaim.update({ where: { id }, data, include });

      const parts: string[] = [];
      if (input.status) parts.push(`status → ${input.status}`);
      if (input.insuranceStatus) parts.push(`insurance → ${input.insuranceStatus}`);
      if (input.approvedPercentage !== undefined) parts.push(`${input.approvedPercentage}% approved`);
      if (input.payableAmount !== undefined) parts.push(`payable ${updated.currency} ${input.payableAmount}`);
      await logEvent(tx, id, "PROCESSED", input.note ?? (parts.join(", ") || "Claim processed"), a.id);
      return updated;
    });
  },

  /** Receiver acknowledges receipt of the claim. */
  async acknowledge(id: string, a: AuthenticatedUser) {
    const claim = await load(id, a);
    if (claim.acknowledged) return claim;
    return prisma.$transaction(async (tx) => {
      const updated = await tx.insuranceClaim.update({
        where: { id },
        data: { acknowledged: true, acknowledgedById: a.id, acknowledgedAt: new Date(), status: claim.status === "OPEN" ? "WIP" : claim.status },
        include,
      });
      await logEvent(tx, id, "ACKNOWLEDGED", "Claim received and acknowledged", a.id);
      return updated;
    });
  },

  // --- Evidence -------------------------------------------------------------
  async addAttachment(id: string, file: Express.Multer.File, caption: string | undefined, a: AuthenticatedUser) {
    await load(id, a);
    const stored = await storage.save({ buffer: file.buffer, originalName: file.originalname, contentType: file.mimetype, folder: `claims/${id}` });
    try {
      const row = await prisma.claimAttachment.create({
        data: {
          claimId: id,
          kind: attachmentKind(file.mimetype) as "PHOTO" | "VIDEO" | "DOCUMENT",
          fileName: file.originalname,
          storageKey: stored.key,
          contentType: file.mimetype,
          size: file.size,
          caption: caption ?? null,
          uploadedById: a.id,
        },
      });
      await logEvent(prisma, id, "EVIDENCE", `${row.kind.toLowerCase()} added: ${file.originalname}`, a.id);
      return row;
    } catch (e) {
      await storage.remove(stored.key).catch(() => {});
      throw e;
    }
  },

  async downloadAttachment(id: string, attachmentId: string, a: AuthenticatedUser) {
    await load(id, a);
    const att = await prisma.claimAttachment.findFirst({ where: { id: attachmentId, claimId: id } });
    if (!att) throw ApiError.notFound("Attachment not found");
    return { att, buffer: await storage.read(att.storageKey) };
  },

  async deleteAttachment(id: string, attachmentId: string, a: AuthenticatedUser) {
    await load(id, a);
    const att = await prisma.claimAttachment.findFirst({ where: { id: attachmentId, claimId: id } });
    if (!att) throw ApiError.notFound("Attachment not found");
    await prisma.claimAttachment.delete({ where: { id: attachmentId } });
    await storage.remove(att.storageKey).catch(() => {});
    return { id: attachmentId, deleted: true };
  },
};
