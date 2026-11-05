import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "../../database/prisma";
import { ApiError } from "../../utils/ApiError";
import { storage } from "../../utils/storage";
import type { AuthenticatedUser } from "../../types/auth";
import { operation, setStatus } from "../inventory/inventory.service";

type Tx = Prisma.TransactionClient;

/**
 * Phase 8 — Inspection & Digital Handover service.
 *
 * All mutations are atomic + idempotent (reusing the inventory `operation`
 * wrapper keyed by actor + Idempotency-Key). Submitted inspections are
 * immutable; a correction is a NEW version that supersedes the previous one and
 * original photographs are always retained. GPS/geofence proximity never
 * confirms delivery or changes custody here, and serious CONFIRMED damage marks
 * a vehicle unavailable ONLY through the centralized Inventory service.
 */

const ADMIN_ROLES = ["SUPER_ADMIN", "JSAN_ADMIN"];
const admin = (a: AuthenticatedUser) => ADMIN_ROLES.includes(a.role.name);
const isVendor = (a: AuthenticatedUser) =>
  a.organizationType === "VEHICLE_VENDOR" ||
  a.organizationType === "TRANSPORT_PARTNER";
const can = (a: AuthenticatedUser, p: string) => a.permissions.includes(p);
const requireManage = (a: AuthenticatedUser) => {
  if (!can(a, "inspections:manage")) throw ApiError.forbidden();
};
const requireReview = (a: AuthenticatedUser) => {
  if (!can(a, "inspections:review")) throw ApiError.forbidden();
};

/** Row-level visibility. Vendors/transporters are isolated to their own org. */
export function inspectionScope(
  a: AuthenticatedUser,
): Prisma.VehicleInspectionWhereInput {
  if (admin(a)) return {};
  if (isVendor(a))
    return { organizationId: a.organizationId ?? "__none__" };
  if (a.role.name === "OPERATIONS_MANAGER")
    return {
      OR: [
        { depotId: { in: a.depotIds } },
        { createdById: a.id },
        { performedById: a.id },
      ],
    };
  return {
    OR: [
      { organizationId: a.organizationId ?? "__none__" },
      { receivedFromOrgId: a.organizationId ?? "__none__" },
      { createdById: a.id },
      { performedById: a.id },
    ],
  };
}

function discrepancyScope(
  a: AuthenticatedUser,
): Prisma.VehicleDiscrepancyWhereInput {
  if (admin(a)) return {};
  if (isVendor(a)) return { organizationId: a.organizationId ?? "__none__" };
  if (a.role.name === "OPERATIONS_MANAGER")
    return {
      OR: [
        { reportedById: a.id },
        { assignedReviewerId: a.id },
        { inspection: { depotId: { in: a.depotIds } } },
      ],
    };
  return {
    OR: [
      { organizationId: a.organizationId ?? "__none__" },
      { reportedById: a.id },
    ],
  };
}

function handoverScope(a: AuthenticatedUser): Prisma.DigitalHandoverWhereInput {
  if (admin(a)) return {};
  if (isVendor(a)) return { organizationId: a.organizationId ?? "__none__" };
  if (a.role.name === "OPERATIONS_MANAGER")
    return {
      OR: [
        { createdById: a.id },
        { handoverByUserId: a.id },
        { receivedByUserId: a.id },
      ],
    };
  return {
    OR: [
      { organizationId: a.organizationId ?? "__none__" },
      { handoverByUserId: a.id },
      { receivedByUserId: a.id },
    ],
  };
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
      entityType: "Inspection",
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

/** Magic-byte check so a declared image really is that image (matches dispatch). */
function assertImage(buffer: Buffer, mime: string) {
  const b = buffer;
  const ok =
    mime === "image/png"
      ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mime === "image/jpeg"
        ? b[0] === 255 && b[1] === 216
        : mime === "image/webp"
          ? b.toString("ascii", 0, 4) === "RIFF" &&
            b.toString("ascii", 8, 12) === "WEBP"
          : mime === "image/gif"
            ? b.toString("ascii", 0, 3) === "GIF"
            : false;
  if (!ok)
    throw ApiError.badRequest(
      "Image content does not match its declared type",
    );
}

/** Resolve display names for the ids referenced by an inspection/discrepancy. */
async function resolveNames(ids: {
  vehicleIds?: (string | null | undefined)[];
  depotIds?: (string | null | undefined)[];
  orgIds?: (string | null | undefined)[];
  userIds?: (string | null | undefined)[];
}) {
  const uniq = (xs?: (string | null | undefined)[]) =>
    [...new Set((xs ?? []).filter((x): x is string => !!x))];
  const [vehicles, depots, orgs, users] = await Promise.all([
    prisma.vehicle.findMany({
      where: { id: { in: uniq(ids.vehicleIds) } },
      select: { id: true, vehicleCode: true, registrationNumber: true, vin: true, status: true },
    }),
    prisma.depot.findMany({
      where: { id: { in: uniq(ids.depotIds) } },
      select: { id: true, name: true, code: true },
    }),
    prisma.organization.findMany({
      where: { id: { in: uniq(ids.orgIds) } },
      select: { id: true, name: true, type: true },
    }),
    prisma.user.findMany({
      where: { id: { in: uniq(ids.userIds) } },
      select: { id: true, fullName: true, email: true },
    }),
  ]);
  return {
    vehicles: Object.fromEntries(vehicles.map((v) => [v.id, v])),
    depots: Object.fromEntries(depots.map((d) => [d.id, d])),
    orgs: Object.fromEntries(orgs.map((o) => [o.id, o])),
    users: Object.fromEntries(users.map((u) => [u.id, u])),
  };
}

/** A vehicle must be visible in the actor's inventory scope before inspecting. */
async function assertVehicleInScope(tx: Tx, vehicleId: string, a: AuthenticatedUser) {
  const vehicle = await tx.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) throw ApiError.notFound("Vehicle not found");
  if (admin(a)) return vehicle;
  const inv = await tx.vehicleInventory.findUnique({ where: { vehicleId } });
  if (isVendor(a)) {
    if (
      !inv ||
      inv.currentCustodianType !== "VENDOR" ||
      inv.currentCustodianId !== a.organizationId
    )
      throw ApiError.forbidden("Vehicle is not in your custody");
  } else if (a.role.name === "OPERATIONS_MANAGER") {
    if (!inv || !a.depotIds.includes(inv.currentDepotId ?? "__none__"))
      throw ApiError.forbidden("Vehicle is outside your assigned depots");
  } else if (
    vehicle.organizationId !== a.organizationId &&
    inv?.receivedFromOrgId !== a.organizationId
  )
    throw ApiError.forbidden("Vehicle is outside your organization");
  return vehicle;
}

const SUBMITTED_OR_LATER = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "COMPLETED"];

const inspectionInclude = {
  template: { include: { items: { orderBy: { sortOrder: "asc" as const } } } },
  responses: true,
  photos: { orderBy: { createdAt: "asc" as const } },
  evidence: { orderBy: { createdAt: "asc" as const } },
  discrepancies: true,
} satisfies Prisma.VehicleInspectionInclude;

function paginate<T>(data: T[], total: number, q: { page: number; pageSize: number }) {
  return {
    data,
    meta: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    },
  };
}

type CreateInput = import("./inspections.validators").CreateInput;
type UpdateInput = import("./inspections.validators").UpdateInput;
type TemplateInput = import("./inspections.validators").TemplateInput;
type DiscrepancyInput = import("./inspections.validators").DiscrepancyInput;
type HandoverInput = import("./inspections.validators").HandoverInput;
type Query = import("./inspections.validators").Query;

export const inspectionsService = {
  async lookups(a: AuthenticatedUser) {
    const [depots, organizations, templates] = await Promise.all([
      prisma.depot.findMany({
        where:
          admin(a) || a.role.name !== "OPERATIONS_MANAGER"
            ? { status: "ACTIVE" }
            : { status: "ACTIVE", id: { in: a.depotIds } },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      }),
      prisma.organization.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true, type: true },
        orderBy: { name: "asc" },
      }),
      prisma.inspectionTemplate.findMany({
        where: { isActive: true },
        select: { id: true, name: true, type: true, isDefault: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      depots,
      organizations,
      templates,
      photoCategories: [
        "FRONT",
        "REAR",
        "LEFT",
        "RIGHT",
        "INTERIOR",
        "DASHBOARD",
        "ODOMETER",
        "TYRES",
        "GLASS",
        "LIGHTS",
        "ACCESSORIES",
        "KEYS_DOCUMENTS",
        "EXISTING_DAMAGE",
        "OTHER",
      ],
      canManage: can(a, "inspections:manage"),
      canReview: can(a, "inspections:review"),
      canConfirm: can(a, "inspections:confirm"),
    };
  },

  async dashboard(a: AuthenticatedUser) {
    const scope = inspectionScope(a);
    const [byType, byStatus, discrepancyOpen, pendingHandovers, pods] =
      await Promise.all([
        prisma.vehicleInspection.groupBy({
          by: ["type"],
          where: scope,
          _count: true,
        }),
        prisma.vehicleInspection.groupBy({
          by: ["status"],
          where: scope,
          _count: true,
        }),
        prisma.vehicleDiscrepancy.count({
          where: {
            AND: [
              discrepancyScope(a),
              { status: { notIn: ["RESOLVED", "CLOSED"] } },
            ],
          },
        }),
        prisma.digitalHandover.count({
          where: { AND: [handoverScope(a), { status: "PENDING" }] },
        }),
        prisma.proofOfDelivery.count({
          where: admin(a)
            ? {}
            : { organizationId: a.organizationId ?? "__none__" },
        }),
      ]);
    const map = (rows: { _count: unknown; [k: string]: unknown }[], key: string) =>
      Object.fromEntries(
        rows.map((r) => [r[key] as string, (r as { _count: number })._count]),
      );
    return {
      byType: map(byType, "type"),
      byStatus: map(byStatus, "status"),
      openDiscrepancies: discrepancyOpen,
      pendingHandovers,
      proofsOfDelivery: pods,
    };
  },

  async list(q: Query, a: AuthenticatedUser) {
    const where: Prisma.VehicleInspectionWhereInput = {
      AND: [
        inspectionScope(a),
        q.type ? { type: q.type } : {},
        q.status ? { status: q.status as never } : {},
        q.vehicleId ? { vehicleId: q.vehicleId } : {},
        q.dispatchId ? { dispatchId: q.dispatchId } : {},
        q.tripId ? { tripId: q.tripId } : {},
        q.search
          ? {
              OR: [
                { reference: { contains: q.search, mode: "insensitive" } },
                {
                  registrationNumber: {
                    contains: q.search,
                    mode: "insensitive",
                  },
                },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await prisma.$transaction([
      prisma.vehicleInspection.findMany({
        where,
        include: { photos: { select: { id: true, category: true } } },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.vehicleInspection.count({ where }),
    ]);
    const names = await resolveNames({
      vehicleIds: rows.map((r) => r.vehicleId),
      depotIds: rows.map((r) => r.depotId),
    });
    return paginate(
      rows.map((r) => ({
        ...r,
        vehicle: names.vehicles[r.vehicleId] ?? null,
        depot: r.depotId ? (names.depots[r.depotId] ?? null) : null,
      })),
      total,
      q,
    );
  },

  async get(id: string, a: AuthenticatedUser) {
    const row = await prisma.vehicleInspection.findFirst({
      where: { AND: [{ id }, inspectionScope(a)] },
      include: inspectionInclude,
    });
    if (!row) throw ApiError.notFound("Inspection not found in your scope");
    const names = await resolveNames({
      vehicleIds: [row.vehicleId],
      depotIds: [row.depotId],
      orgIds: [row.organizationId, row.receivedFromOrgId],
      userIds: [row.performedById, row.receivedById, row.reviewedById, row.createdById],
    });
    return {
      ...row,
      vehicle: names.vehicles[row.vehicleId] ?? null,
      depot: row.depotId ? (names.depots[row.depotId] ?? null) : null,
      organization: row.organizationId
        ? (names.orgs[row.organizationId] ?? null)
        : null,
      receivedFromOrg: row.receivedFromOrgId
        ? (names.orgs[row.receivedFromOrgId] ?? null)
        : null,
      people: names.users,
    };
  },

  async create(input: CreateInput, a: AuthenticatedUser, key: string) {
    // Receiving inspections may be submitted by a vendor under custody with
    // inspections:confirm; every other inspection type requires manage.
    if (input.type === "RECEIVING") {
      if (!can(a, "inspections:confirm") && !can(a, "inspections:manage"))
        throw ApiError.forbidden();
    } else requireManage(a);

    return operation(a, key, "inspection.create", input, async (tx) => {
      const vehicle = await assertVehicleInScope(tx, input.vehicleId, a);

      // Validate referenced dispatch/trip/ticket when supplied.
      let dispatch: {
        id: string;
        sourceDepotId: string;
        destinationDepotId: string;
        tripId: string | null;
        allocation: { ticketId: string };
      } | null = null;
      if (input.dispatchId) {
        const d = await tx.dispatch.findUnique({
          where: { id: input.dispatchId },
          include: { allocation: true, vehicles: true, trip: true },
        });
        if (!d) throw ApiError.badRequest("Dispatch does not exist");
        if (!d.vehicles.some((v) => v.vehicleId === input.vehicleId))
          throw ApiError.badRequest("Vehicle is not part of this dispatch");
        dispatch = {
          id: d.id,
          sourceDepotId: d.sourceDepotId,
          destinationDepotId: d.destinationDepotId,
          tripId: d.trip?.id ?? null,
          allocation: { ticketId: d.allocation.ticketId },
        };
        if (
          input.type === "RECEIVING" &&
          !["PLANNED", "READY", "CONFIRMED"].includes(d.state)
        )
          throw ApiError.conflict("Dispatch is not in a receivable state");
      } else if (input.type === "RECEIVING") {
        throw ApiError.badRequest(
          "A receiving inspection must be linked to a valid dispatch",
        );
      }
      if (input.tripId) {
        const t = await tx.trip.findUnique({ where: { id: input.tripId } });
        if (!t) throw ApiError.badRequest("Trip does not exist");
      }

      const dispatchVehicle = input.dispatchId
        ? await tx.dispatchVehicle.findFirst({
            where: { dispatchId: input.dispatchId, vehicleId: input.vehicleId },
          })
        : null;

      const organizationId =
        input.organizationId ??
        (input.type === "RECEIVING" && isVendor(a) ? a.organizationId : null) ??
        (input.type === "RECEIVING" ? null : vehicle.organizationId) ??
        null;

      const reference = await nextRef(tx, "inspection", "FG-INS");
      const row = await tx.vehicleInspection.create({
        data: {
          reference,
          type: input.type,
          status: "IN_PROGRESS",
          vehicleId: vehicle.id,
          registrationNumber: vehicle.registrationNumber,
          vin: vehicle.vin,
          dispatchId: input.dispatchId ?? null,
          dispatchVehicleId: dispatchVehicle?.id ?? null,
          tripId: input.tripId ?? dispatch?.tripId ?? null,
          ticketId: input.ticketId ?? dispatch?.allocation.ticketId ?? null,
          organizationId,
          depotId:
            input.depotId ??
            (input.type === "PRE_DISPATCH"
              ? (dispatch?.sourceDepotId ?? null)
              : input.type === "RECEIVING"
                ? (dispatch?.destinationDepotId ?? null)
                : null),
          receivedFromOrgId: input.receivedFromOrgId ?? null,
          templateId: input.templateId ?? null,
          odometer: input.odometer ?? null,
          fuelLevel: input.fuelLevel ?? null,
          exteriorCondition: input.exteriorCondition ?? null,
          interiorCondition: input.interiorCondition ?? null,
          tyresCondition: input.tyresCondition ?? null,
          glassCondition: input.glassCondition ?? null,
          lightsCondition: input.lightsCondition ?? null,
          accessories: input.accessories ?? null,
          keysDocuments: input.keysDocuments ?? null,
          existingDamage: input.existingDamage ?? null,
          missingItems: input.missingItems ?? null,
          newDamage: input.newDamage ?? null,
          generalRemarks: input.generalRemarks ?? null,
          identityVerified: input.identityVerified ?? false,
          registrationVerified: input.registrationVerified ?? false,
          receivingOutcome:
            input.type === "RECEIVING" ? (input.receivingOutcome ?? null) : null,
          rejectionReason:
            input.type === "RECEIVING" ? (input.rejectionReason ?? null) : null,
          performedAt: input.performedAt ?? new Date(),
          performedById: a.id,
          receivedById: input.type === "INITIAL_RECEIPT" || input.type === "RECEIVING" ? a.id : null,
          createdById: a.id,
        },
      });
      await audit(tx, a, "inspection.created", row.id, {
        type: row.type,
        vehicleId: row.vehicleId,
        reference,
      });
      return row;
    });
  },

  async update(id: string, input: UpdateInput, a: AuthenticatedUser, key: string) {
    return operation(a, key, "inspection.update", { id, input }, async (tx) => {
      const row = await tx.vehicleInspection.findFirst({
        where: { AND: [{ id }, inspectionScope(a)] },
      });
      if (!row) throw ApiError.notFound("Inspection not found in your scope");
      if (SUBMITTED_OR_LATER.includes(row.status))
        throw ApiError.conflict(
          "A submitted inspection is immutable; create an amendment instead",
        );
      if (row.type !== "RECEIVING" && !can(a, "inspections:manage"))
        throw ApiError.forbidden();
      const { responses, ...fields } = input;
      const updated = await tx.vehicleInspection.update({
        where: { id },
        data: {
          ...Object.fromEntries(
            Object.entries(fields).filter(([, v]) => v !== undefined),
          ),
        },
      });
      if (responses) {
        await tx.inspectionResponse.deleteMany({ where: { inspectionId: id } });
        if (responses.length)
          await tx.inspectionResponse.createMany({
            data: responses.map((r) => ({
              inspectionId: id,
              checklistItemId: r.checklistItemId ?? null,
              label: r.label,
              category: r.category ?? null,
              value: r.value ?? null,
              numericValue: r.numericValue ?? null,
              remarks: r.remarks ?? null,
            })),
          });
      }
      await audit(tx, a, "inspection.updated", id, { fields: Object.keys(fields) });
      return updated;
    });
  },

  async submit(id: string, a: AuthenticatedUser, key: string) {
    return operation(a, key, "inspection.submit", { id }, async (tx) => {
      const row = await tx.vehicleInspection.findFirst({
        where: { AND: [{ id }, inspectionScope(a)] },
        include: {
          template: { include: { items: true } },
          photos: true,
          responses: true,
        },
      });
      if (!row) throw ApiError.notFound("Inspection not found in your scope");
      if (row.type !== "RECEIVING" && !can(a, "inspections:manage"))
        throw ApiError.forbidden();
      if (row.status !== "IN_PROGRESS" && row.status !== "PENDING")
        throw ApiError.conflict("Only a draft inspection can be submitted");

      // Enforce mandatory checklist items and photos from the template.
      if (row.template) {
        const answered = new Set(
          row.responses
            .filter((r) => (r.value && r.value.trim()) || r.numericValue != null)
            .map((r) => r.checklistItemId),
        );
        const photoCats = new Set(row.photos.map((p) => p.category));
        for (const item of row.template.items) {
          if (item.required && !answered.has(item.id))
            throw ApiError.badRequest(
              `Checklist item "${item.label}" is mandatory`,
            );
          if (
            item.photoRequired &&
            item.requiredPhotoCategory &&
            !photoCats.has(item.requiredPhotoCategory)
          )
            throw ApiError.badRequest(
              `A ${item.requiredPhotoCategory} photograph is mandatory for "${item.label}"`,
            );
        }
      }

      // Receiving with a damaged/discrepant outcome must record a discrepancy.
      if (
        row.type === "RECEIVING" &&
        (row.receivingOutcome === "DAMAGED" ||
          row.receivingOutcome === "WITH_DISCREPANCIES") &&
        (await tx.vehicleDiscrepancy.count({ where: { inspectionId: id } })) === 0
      )
        throw ApiError.badRequest(
          "Record at least one discrepancy before submitting a damaged/discrepant receiving inspection",
        );
      if (
        row.type === "RECEIVING" &&
        row.receivingOutcome === "REJECTED" &&
        !row.rejectionReason
      )
        throw ApiError.badRequest("A rejected delivery requires a reason");

      const updated = await tx.vehicleInspection.update({
        where: { id },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
          submittedById: a.id,
        },
      });
      await audit(tx, a, "inspection.submitted", id, {
        type: row.type,
        outcome: row.receivingOutcome,
      });
      return updated;
    });
  },

  async review(
    id: string,
    input: { decision: "APPROVE" | "REJECT"; remarks: string },
    a: AuthenticatedUser,
    key: string,
  ) {
    requireReview(a);
    return operation(a, key, "inspection.review", { id, input }, async (tx) => {
      const row = await tx.vehicleInspection.findFirst({
        where: { AND: [{ id }, inspectionScope(a)] },
      });
      if (!row) throw ApiError.notFound("Inspection not found in your scope");
      if (!["SUBMITTED", "UNDER_REVIEW"].includes(row.status))
        throw ApiError.conflict("Only a submitted inspection can be reviewed");
      const updated = await tx.vehicleInspection.update({
        where: { id },
        data: {
          status: input.decision === "APPROVE" ? "APPROVED" : "REJECTED",
          reviewedById: a.id,
          reviewedAt: new Date(),
          reviewRemarks: input.remarks,
        },
      });
      await audit(tx, a, "inspection.reviewed", id, input);
      return updated;
    });
  },

  async complete(id: string, a: AuthenticatedUser, key: string) {
    requireManage(a);
    return operation(a, key, "inspection.complete", { id }, async (tx) => {
      const row = await tx.vehicleInspection.findFirst({
        where: { AND: [{ id }, inspectionScope(a)] },
      });
      if (!row) throw ApiError.notFound("Inspection not found in your scope");
      if (row.status !== "APPROVED")
        throw ApiError.conflict("Only an approved inspection can be completed");
      // Guard: do not complete a receiving inspection with unresolved discrepancies.
      if (
        row.type === "RECEIVING" &&
        (await tx.vehicleDiscrepancy.count({
          where: { inspectionId: id, status: { notIn: ["RESOLVED", "CLOSED"] } },
        }))
      )
        throw ApiError.conflict(
          "Resolve or close outstanding discrepancies before completing the receiving inspection",
        );
      const updated = await tx.vehicleInspection.update({
        where: { id },
        data: { status: "COMPLETED" },
      });
      await audit(tx, a, "inspection.completed", id, {});
      return updated;
    });
  },

  /** Immutable correction: a new version superseding the original. */
  async amend(id: string, a: AuthenticatedUser, key: string) {
    requireManage(a);
    return operation(a, key, "inspection.amend", { id }, async (tx) => {
      const row = await tx.vehicleInspection.findFirst({
        where: { AND: [{ id }, inspectionScope(a)] },
      });
      if (!row) throw ApiError.notFound("Inspection not found in your scope");
      if (!SUBMITTED_OR_LATER.includes(row.status))
        throw ApiError.conflict("Only a submitted inspection can be amended");
      if (await tx.vehicleInspection.findFirst({ where: { supersedesId: id } }))
        throw ApiError.conflict("This inspection already has an amendment");
      const reference = await nextRef(tx, "inspection", "FG-INS");
      const clone = await tx.vehicleInspection.create({
        data: {
          reference,
          type: row.type,
          status: "IN_PROGRESS",
          vehicleId: row.vehicleId,
          registrationNumber: row.registrationNumber,
          vin: row.vin,
          dispatchId: row.dispatchId,
          dispatchVehicleId: row.dispatchVehicleId,
          tripId: row.tripId,
          ticketId: row.ticketId,
          organizationId: row.organizationId,
          depotId: row.depotId,
          receivedFromOrgId: row.receivedFromOrgId,
          templateId: row.templateId,
          odometer: row.odometer,
          fuelLevel: row.fuelLevel,
          exteriorCondition: row.exteriorCondition,
          interiorCondition: row.interiorCondition,
          tyresCondition: row.tyresCondition,
          glassCondition: row.glassCondition,
          lightsCondition: row.lightsCondition,
          accessories: row.accessories,
          keysDocuments: row.keysDocuments,
          existingDamage: row.existingDamage,
          missingItems: row.missingItems,
          newDamage: row.newDamage,
          generalRemarks: row.generalRemarks,
          identityVerified: row.identityVerified,
          registrationVerified: row.registrationVerified,
          receivingOutcome: row.receivingOutcome,
          performedById: a.id,
          performedAt: new Date(),
          version: row.version + 1,
          supersedesId: row.id,
          createdById: a.id,
        },
      });
      // Carry forward responses; original photographs are RETAINED on the prior version.
      const responses = await tx.inspectionResponse.findMany({
        where: { inspectionId: id },
      });
      if (responses.length)
        await tx.inspectionResponse.createMany({
          data: responses.map((r) => ({
            inspectionId: clone.id,
            checklistItemId: r.checklistItemId,
            label: r.label,
            category: r.category,
            value: r.value,
            numericValue: r.numericValue,
            remarks: r.remarks,
          })),
        });
      await audit(tx, a, "inspection.amended", clone.id, { supersedes: id });
      return clone;
    });
  },

  async uploadPhoto(
    id: string,
    file: Express.Multer.File,
    meta: { category: string; label?: string; takenAt?: Date },
    a: AuthenticatedUser,
    key: string,
  ) {
    if (!file.mimetype.startsWith("image/"))
      throw ApiError.badRequest("A condition photo must be an image");
    assertImage(file.buffer, file.mimetype);
    return operation(
      a,
      key,
      "inspection.photo",
      {
        id,
        category: meta.category,
        hash: createHash("sha256").update(file.buffer).digest("hex"),
      },
      async (tx) => {
        const row = await tx.vehicleInspection.findFirst({
          where: { AND: [{ id }, inspectionScope(a)] },
        });
        if (!row) throw ApiError.notFound("Inspection not found in your scope");
        if (row.type !== "RECEIVING" && !can(a, "inspections:manage"))
          throw ApiError.forbidden();
        if (SUBMITTED_OR_LATER.includes(row.status))
          throw ApiError.conflict("Photos are locked after submission");
        const stored = await storage.save({
          buffer: file.buffer,
          originalName: file.originalname,
          contentType: file.mimetype,
          folder: `inspections/${row.id}`,
        });
        try {
          const photo = await tx.inspectionPhoto.create({
            data: {
              inspectionId: row.id,
              category: meta.category as never,
              label: meta.label ?? null,
              fileName: file.originalname,
              storageKey: stored.key,
              contentType: file.mimetype,
              size: file.size,
              uploadedById: a.id,
              takenAt: meta.takenAt ?? new Date(),
            },
          });
          await audit(tx, a, "inspection.photo", row.id, {
            photoId: photo.id,
            category: photo.category,
          });
          return photo;
        } catch (e) {
          await storage.remove(stored.key);
          throw e;
        }
      },
    );
  },

  /** Reuse an existing dispatch-evidence photo instead of re-uploading. */
  async reusePhoto(
    id: string,
    input: { dispatchEvidenceId: string; category: string; label?: string },
    a: AuthenticatedUser,
    key: string,
  ) {
    return operation(a, key, "inspection.reuse", { id, input }, async (tx) => {
      const row = await tx.vehicleInspection.findFirst({
        where: { AND: [{ id }, inspectionScope(a)] },
      });
      if (!row) throw ApiError.notFound("Inspection not found in your scope");
      if (row.type !== "RECEIVING" && !can(a, "inspections:manage"))
        throw ApiError.forbidden();
      if (SUBMITTED_OR_LATER.includes(row.status))
        throw ApiError.conflict("Photos are locked after submission");
      const ev = await tx.dispatchEvidence.findUnique({
        where: { id: input.dispatchEvidenceId },
      });
      if (!ev || !ev.contentType.startsWith("image/"))
        throw ApiError.badRequest("Dispatch evidence image not found");
      if (row.dispatchId && ev.dispatchId !== row.dispatchId)
        throw ApiError.badRequest(
          "Evidence belongs to a different dispatch",
        );
      const photo = await tx.inspectionPhoto.create({
        data: {
          inspectionId: row.id,
          category: input.category as never,
          label: input.label ?? ev.remarks ?? "Reused dispatch evidence",
          fileName: ev.fileName,
          storageKey: ev.storageKey,
          contentType: ev.contentType,
          size: ev.size,
          sourceEvidenceId: ev.id,
          reused: true,
          uploadedById: a.id,
          takenAt: ev.createdAt,
        },
      });
      await audit(tx, a, "inspection.photo.reused", row.id, {
        photoId: photo.id,
        dispatchEvidenceId: ev.id,
      });
      return photo;
    });
  },

  async uploadEvidence(
    id: string,
    file: Express.Multer.File,
    meta: { kind: string; label?: string },
    a: AuthenticatedUser,
    key: string,
  ) {
    if (file.mimetype.startsWith("image/")) assertImage(file.buffer, file.mimetype);
    return operation(
      a,
      key,
      "inspection.evidence",
      {
        id,
        hash: createHash("sha256").update(file.buffer).digest("hex"),
      },
      async (tx) => {
        const row = await tx.vehicleInspection.findFirst({
          where: { AND: [{ id }, inspectionScope(a)] },
        });
        if (!row) throw ApiError.notFound("Inspection not found in your scope");
        const stored = await storage.save({
          buffer: file.buffer,
          originalName: file.originalname,
          contentType: file.mimetype,
          folder: `inspections/${row.id}/evidence`,
        });
        try {
          const ev = await tx.inspectionEvidence.create({
            data: {
              inspectionId: row.id,
              kind: meta.kind as never,
              label: meta.label ?? null,
              fileName: file.originalname,
              storageKey: stored.key,
              contentType: file.mimetype,
              size: file.size,
              uploadedById: a.id,
            },
          });
          await audit(tx, a, "inspection.evidence", row.id, { evidenceId: ev.id });
          return ev;
        } catch (e) {
          await storage.remove(stored.key);
          throw e;
        }
      },
    );
  },

  async downloadPhoto(id: string, a: AuthenticatedUser) {
    const photo = await prisma.inspectionPhoto.findUnique({ where: { id } });
    if (!photo) throw ApiError.notFound();
    await this.get(photo.inspectionId, a); // scope check
    return { photo, buffer: await storage.read(photo.storageKey) };
  },

  async downloadEvidence(id: string, a: AuthenticatedUser) {
    const ev = await prisma.inspectionEvidence.findUnique({ where: { id } });
    if (!ev) throw ApiError.notFound();
    if (ev.inspectionId) await this.get(ev.inspectionId, a);
    else if (ev.discrepancyId) await this.getDiscrepancy(ev.discrepancyId, a);
    return { evidence: ev, buffer: await storage.read(ev.storageKey) };
  },

  /**
   * Dispatch-vs-receiving photo comparison baseline for one vehicle (optionally
   * scoped to a dispatch). Returns photos grouped by standard category across
   * INITIAL_RECEIPT, PRE_DISPATCH and RECEIVING inspections, plus metadata. Image
   * differences are NEVER auto-classified as damage.
   */
  async comparison(
    vehicleId: string,
    dispatchId: string | undefined,
    a: AuthenticatedUser,
  ) {
    const inspections = await prisma.vehicleInspection.findMany({
      where: {
        AND: [
          inspectionScope(a),
          { vehicleId },
          dispatchId
            ? { OR: [{ dispatchId }, { type: "INITIAL_RECEIPT" }] }
            : {},
        ],
      },
      include: { photos: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
    if (!inspections.length)
      throw ApiError.notFound("No inspections for this vehicle in your scope");
    const names = await resolveNames({
      vehicleIds: [vehicleId],
      userIds: inspections.flatMap((i) => i.photos.map((p) => p.uploadedById)),
    });
    const stages: Record<string, unknown[]> = {
      INITIAL_RECEIPT: [],
      PRE_DISPATCH: [],
      RECEIVING: [],
      RETURN: [],
    };
    for (const i of inspections)
      for (const p of i.photos)
        stages[i.type].push({
          id: p.id,
          inspectionId: i.id,
          inspectionReference: i.reference,
          inspectionType: i.type,
          category: p.category,
          label: p.label,
          takenAt: p.takenAt,
          uploadedAt: p.createdAt,
          reused: p.reused,
          sourceEvidenceId: p.sourceEvidenceId,
          uploadedBy: p.uploadedById
            ? (names.users[p.uploadedById]?.fullName ?? null)
            : null,
          downloadPath: `/inspections/photos/${p.id}/download`,
        });
    return {
      vehicle: names.vehicles[vehicleId] ?? null,
      inspections: inspections.map((i) => ({
        id: i.id,
        reference: i.reference,
        type: i.type,
        status: i.status,
        performedAt: i.performedAt,
      })),
      stages,
      note: "Image differences are not automatically treated as damage. An authorized inspector must classify any discrepancy.",
    };
  },

  // -------------------------------------------------------------------------
  // Discrepancies
  // -------------------------------------------------------------------------
  async listDiscrepancies(q: Query, a: AuthenticatedUser) {
    const where: Prisma.VehicleDiscrepancyWhereInput = {
      AND: [
        discrepancyScope(a),
        q.vehicleId ? { vehicleId: q.vehicleId } : {},
        q.dispatchId ? { dispatchId: q.dispatchId } : {},
        q.status ? { status: q.status as never } : {},
      ],
    };
    const [rows, total] = await prisma.$transaction([
      prisma.vehicleDiscrepancy.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.vehicleDiscrepancy.count({ where }),
    ]);
    const names = await resolveNames({
      vehicleIds: rows.map((r) => r.vehicleId),
      userIds: rows.flatMap((r) => [r.reportedById, r.assignedReviewerId]),
    });
    return paginate(
      rows.map((r) => ({ ...r, vehicle: names.vehicles[r.vehicleId] ?? null })),
      total,
      q,
    );
  },

  async getDiscrepancy(id: string, a: AuthenticatedUser) {
    const row = await prisma.vehicleDiscrepancy.findFirst({
      where: { AND: [{ id }, discrepancyScope(a)] },
      include: {
        comments: { orderBy: { createdAt: "asc" } },
        evidence: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!row) throw ApiError.notFound("Discrepancy not found in your scope");
    const names = await resolveNames({
      vehicleIds: [row.vehicleId],
      userIds: [
        row.reportedById,
        row.assignedReviewerId,
        row.resolvedById,
        ...row.comments.map((c) => c.authorId),
      ],
    });
    return { ...row, vehicle: names.vehicles[row.vehicleId] ?? null, people: names.users };
  },

  async createDiscrepancy(input: DiscrepancyInput, a: AuthenticatedUser, key: string) {
    if (!can(a, "inspections:confirm") && !can(a, "inspections:manage"))
      throw ApiError.forbidden();
    return operation(a, key, "discrepancy.create", input, async (tx) => {
      const vehicle = await assertVehicleInScope(tx, input.vehicleId, a);
      let organizationId = isVendor(a) ? a.organizationId : null;
      if (input.inspectionId) {
        const insp = await tx.vehicleInspection.findFirst({
          where: { AND: [{ id: input.inspectionId }, inspectionScope(a)] },
        });
        if (!insp)
          throw ApiError.badRequest("Linked inspection not found in your scope");
        if (insp.vehicleId !== input.vehicleId)
          throw ApiError.badRequest("Inspection is for a different vehicle");
        organizationId = organizationId ?? insp.organizationId;
      }
      const reference = await nextRef(tx, "discrepancy", "FG-DISC");
      const row = await tx.vehicleDiscrepancy.create({
        data: {
          reference,
          vehicleId: vehicle.id,
          dispatchId: input.dispatchId ?? null,
          tripId: input.tripId ?? null,
          ticketId: input.ticketId ?? null,
          inspectionId: input.inspectionId ?? null,
          organizationId: input.inspectionId ? organizationId : (organizationId ?? vehicle.organizationId),
          category: input.category,
          description: input.description,
          severity: input.severity,
          status: "REPORTED",
          dispatchEvidenceId: input.dispatchEvidenceId ?? null,
          dispatchPhotoId: input.dispatchPhotoId ?? null,
          receivingPhotoId: input.receivingPhotoId ?? null,
          aiSuggested: input.aiSuggested,
          reportedById: a.id,
          assignedReviewerId: input.assignedReviewerId ?? null,
        },
      });
      await tx.discrepancyComment.create({
        data: {
          discrepancyId: row.id,
          authorId: a.id,
          body: `Discrepancy reported: ${input.category} (${input.severity}).`,
          toStatus: "REPORTED",
        },
      });
      await audit(tx, a, "discrepancy.created", row.id, {
        category: input.category,
        severity: input.severity,
        reference,
      });
      return row;
    });
  },

  async transitionDiscrepancy(
    id: string,
    input: { status: string; remarks: string },
    a: AuthenticatedUser,
    key: string,
  ) {
    return operation(a, key, "discrepancy.transition", { id, input }, async (tx) => {
      const row = await tx.vehicleDiscrepancy.findFirst({
        where: { AND: [{ id }, discrepancyScope(a)] },
      });
      if (!row) throw ApiError.notFound("Discrepancy not found in your scope");

      const ALLOWED: Record<string, string[]> = {
        REPORTED: ["UNDER_REVIEW", "CONFIRMED", "DISPUTED"],
        UNDER_REVIEW: ["CONFIRMED", "DISPUTED", "RESOLVED"],
        CONFIRMED: ["RESOLVED", "DISPUTED"],
        DISPUTED: ["UNDER_REVIEW", "CONFIRMED", "RESOLVED"],
        RESOLVED: ["CLOSED"],
        CLOSED: [],
      };
      if (!ALLOWED[row.status]?.includes(input.status))
        throw ApiError.conflict(
          `Cannot move a ${row.status} discrepancy to ${input.status}`,
        );
      // Confirming/closing a discrepancy is a reviewer action.
      if (["CONFIRMED", "RESOLVED", "CLOSED"].includes(input.status))
        requireReview(a);

      const updated = await tx.vehicleDiscrepancy.update({
        where: { id },
        data: {
          status: input.status as never,
          ...(input.status === "RESOLVED" || input.status === "CLOSED"
            ? {
                resolvedById: a.id,
                resolvedAt: new Date(),
                resolutionRemarks: input.remarks,
              }
            : {}),
          ...(row.aiSuggested && input.status === "CONFIRMED"
            ? { aiConfirmed: true }
            : {}),
        },
      });
      await tx.discrepancyComment.create({
        data: {
          discrepancyId: id,
          authorId: a.id,
          body: input.remarks,
          fromStatus: row.status,
          toStatus: input.status as never,
        },
      });

      // Serious CONFIRMED damage marks the vehicle unavailable ONLY via the
      // centralized Inventory service. Custody/location are not changed here.
      if (
        input.status === "CONFIRMED" &&
        (row.severity === "MAJOR" || row.severity === "CRITICAL")
      ) {
        const inv = await tx.vehicleInventory.findUnique({
          where: { vehicleId: row.vehicleId },
        });
        if (inv) {
          const { lockVehicle } = await import("../inventory/inventory.service");
          await lockVehicle(tx, row.vehicleId);
          await setStatus(
            tx,
            row.vehicleId,
            "DAMAGED",
            a,
            `Confirmed ${row.severity} discrepancy ${row.reference}`,
          );
        }
      }
      await audit(tx, a, "discrepancy.transition", id, {
        from: row.status,
        to: input.status,
      });
      return updated;
    });
  },

  async uploadDiscrepancyEvidence(
    id: string,
    file: Express.Multer.File,
    meta: { kind: string; label?: string },
    a: AuthenticatedUser,
    key: string,
  ) {
    if (file.mimetype.startsWith("image/")) assertImage(file.buffer, file.mimetype);
    return operation(
      a,
      key,
      "discrepancy.evidence",
      { id, hash: createHash("sha256").update(file.buffer).digest("hex") },
      async (tx) => {
        const row = await tx.vehicleDiscrepancy.findFirst({
          where: { AND: [{ id }, discrepancyScope(a)] },
        });
        if (!row) throw ApiError.notFound("Discrepancy not found in your scope");
        const stored = await storage.save({
          buffer: file.buffer,
          originalName: file.originalname,
          contentType: file.mimetype,
          folder: `discrepancies/${row.id}`,
        });
        try {
          const ev = await tx.inspectionEvidence.create({
            data: {
              discrepancyId: row.id,
              kind: meta.kind as never,
              label: meta.label ?? null,
              fileName: file.originalname,
              storageKey: stored.key,
              contentType: file.mimetype,
              size: file.size,
              uploadedById: a.id,
            },
          });
          await audit(tx, a, "discrepancy.evidence", row.id, { evidenceId: ev.id });
          return ev;
        } catch (e) {
          await storage.remove(stored.key);
          throw e;
        }
      },
    );
  },

  async commentDiscrepancy(
    id: string,
    body: string,
    a: AuthenticatedUser,
  ) {
    const row = await prisma.vehicleDiscrepancy.findFirst({
      where: { AND: [{ id }, discrepancyScope(a)] },
    });
    if (!row) throw ApiError.notFound("Discrepancy not found in your scope");
    return prisma.discrepancyComment.create({
      data: { discrepancyId: id, authorId: a.id, body },
    });
  },

  // -------------------------------------------------------------------------
  // Digital handover
  // -------------------------------------------------------------------------
  async listHandovers(q: Query, a: AuthenticatedUser) {
    const where: Prisma.DigitalHandoverWhereInput = {
      AND: [
        handoverScope(a),
        q.vehicleId ? { vehicleId: q.vehicleId } : {},
        q.dispatchId ? { dispatchId: q.dispatchId } : {},
      ],
    };
    const [rows, total] = await prisma.$transaction([
      prisma.digitalHandover.findMany({
        where,
        include: { acknowledgements: true },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.digitalHandover.count({ where }),
    ]);
    const names = await resolveNames({ vehicleIds: rows.map((r) => r.vehicleId) });
    return paginate(
      rows.map((r) => ({ ...r, vehicle: names.vehicles[r.vehicleId] ?? null })),
      total,
      q,
    );
  },

  async getHandover(id: string, a: AuthenticatedUser) {
    const row = await prisma.digitalHandover.findFirst({
      where: { AND: [{ id }, handoverScope(a)] },
      include: { acknowledgements: { orderBy: { acknowledgedAt: "asc" } } },
    });
    if (!row) throw ApiError.notFound("Handover not found in your scope");
    const names = await resolveNames({
      vehicleIds: [row.vehicleId],
      userIds: [row.handoverByUserId, row.receivedByUserId, row.confirmedById],
    });
    return { ...row, vehicle: names.vehicles[row.vehicleId] ?? null, people: names.users };
  },

  async createHandover(input: HandoverInput, a: AuthenticatedUser, key: string) {
    if (!can(a, "inspections:confirm") && !can(a, "inspections:manage"))
      throw ApiError.forbidden();
    return operation(a, key, "handover.create", input, async (tx) => {
      const vehicle = await assertVehicleInScope(tx, input.vehicleId, a);
      let ticketId = input.ticketId ?? null;
      let organizationId = input.organizationId ?? (isVendor(a) ? a.organizationId : null);
      if (input.dispatchId) {
        const d = await tx.dispatch.findUnique({
          where: { id: input.dispatchId },
          include: { allocation: true, vehicles: true },
        });
        if (!d) throw ApiError.badRequest("Dispatch does not exist");
        if (!d.vehicles.some((v) => v.vehicleId === input.vehicleId))
          throw ApiError.badRequest("Vehicle is not part of this dispatch");
        ticketId = ticketId ?? d.allocation.ticketId;
      }
      if (input.inspectionId) {
        const insp = await tx.vehicleInspection.findFirst({
          where: { AND: [{ id: input.inspectionId }, inspectionScope(a)] },
        });
        if (!insp) throw ApiError.badRequest("Linked inspection not in scope");
        organizationId = organizationId ?? insp.organizationId;
      }
      const reference = await nextRef(tx, "handover", "FG-HND");
      const row = await tx.digitalHandover.create({
        data: {
          reference,
          type: input.type,
          status: "PENDING",
          vehicleId: vehicle.id,
          dispatchId: input.dispatchId ?? null,
          tripId: input.tripId ?? null,
          ticketId,
          organizationId,
          inspectionId: input.inspectionId ?? null,
          handoverByUserId: input.handoverByUserId ?? null,
          handoverByName: input.handoverByName ?? null,
          handoverParty: input.handoverParty ?? null,
          receivedByUserId: input.receivedByUserId ?? null,
          receivedByName: input.receivedByName ?? null,
          receivedParty: input.receivedParty ?? null,
          checklist: (input.checklist as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          remarks: input.remarks ?? null,
          createdById: a.id,
        },
      });
      await audit(tx, a, "handover.created", row.id, { type: input.type, reference });
      return row;
    });
  },

  async acknowledgeHandover(
    id: string,
    input: {
      party: string;
      role?: string;
      name: string;
      acknowledged: boolean;
      remarks?: string;
      signature?: string;
    },
    a: AuthenticatedUser,
    key: string,
  ) {
    if (!can(a, "inspections:confirm") && !can(a, "inspections:manage"))
      throw ApiError.forbidden();
    return operation(a, key, "handover.ack", { id, party: input.party }, async (tx) => {
      const row = await tx.digitalHandover.findFirst({
        where: { AND: [{ id }, handoverScope(a)] },
      });
      if (!row) throw ApiError.notFound("Handover not found in your scope");
      if (row.status === "CONFIRMED")
        throw ApiError.conflict("Handover is already confirmed");
      let signatureKey: string | null = null;
      if (input.signature) {
        const match = input.signature.match(
          /^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/=]+)$/,
        );
        if (!match) throw ApiError.badRequest("Invalid signature image data");
        const buffer = Buffer.from(match[2], "base64");
        if (buffer.length > 500_000)
          throw ApiError.badRequest("Signature image too large");
        const stored = await storage.save({
          buffer,
          originalName: `signature.${match[1] === "jpeg" ? "jpg" : match[1]}`,
          contentType: `image/${match[1]}`,
          folder: `handovers/${row.id}`,
        });
        signatureKey = stored.key;
      }
      const ack = await tx.handoverAcknowledgement.create({
        data: {
          handoverId: row.id,
          party: input.party,
          role: input.role ?? null,
          userId: a.id,
          name: input.name,
          acknowledged: input.acknowledged,
          signatureKey,
          remarks: input.remarks ?? null,
        },
      });
      await audit(tx, a, "handover.acknowledged", row.id, { party: input.party });
      return ack;
    });
  },

  async confirmHandover(id: string, a: AuthenticatedUser, key: string) {
    if (!can(a, "inspections:confirm") && !can(a, "inspections:manage"))
      throw ApiError.forbidden();
    return operation(a, key, "handover.confirm", { id }, async (tx) => {
      const row = await tx.digitalHandover.findFirst({
        where: { AND: [{ id }, handoverScope(a)] },
        include: { acknowledgements: true },
      });
      if (!row) throw ApiError.notFound("Handover not found in your scope");
      if (row.status === "CONFIRMED")
        throw ApiError.conflict("Handover is already confirmed");
      if (!row.acknowledgements.length)
        throw ApiError.badRequest(
          "At least one acknowledgement is required before confirmation",
        );
      const updated = await tx.digitalHandover.update({
        where: { id },
        data: { status: "CONFIRMED", confirmedById: a.id, confirmedAt: new Date() },
      });
      await audit(tx, a, "handover.confirmed", id, {});
      return updated;
    });
  },

  // -------------------------------------------------------------------------
  // Proof of Delivery
  // -------------------------------------------------------------------------
  async listPods(q: Query, a: AuthenticatedUser) {
    const where: Prisma.ProofOfDeliveryWhereInput = {
      AND: [
        admin(a) ? {} : { organizationId: a.organizationId ?? "__none__" },
        q.vehicleId ? { vehicleId: q.vehicleId } : {},
        q.dispatchId ? { dispatchId: q.dispatchId } : {},
      ],
    };
    const [rows, total] = await prisma.$transaction([
      prisma.proofOfDelivery.findMany({
        where,
        orderBy: { generatedAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.proofOfDelivery.count({ where }),
    ]);
    return paginate(rows, total, q);
  },

  async getPod(id: string, a: AuthenticatedUser) {
    const row = await prisma.proofOfDelivery.findFirst({
      where: {
        AND: [
          { id },
          admin(a) ? {} : { organizationId: a.organizationId ?? "__none__" },
        ],
      },
    });
    if (!row) throw ApiError.notFound("Proof of delivery not found in your scope");
    return row;
  },

  async generatePod(
    input: { dispatchId: string; vehicleId: string },
    a: AuthenticatedUser,
    key: string,
  ) {
    requireManage(a);
    return operation(a, key, "pod.generate", input, async (tx) => {
      const dispatch = await tx.dispatch.findUnique({
        where: { id: input.dispatchId },
        include: {
          allocation: { include: { ticket: true } },
          vehicles: true,
          trip: true,
          driver: true,
        },
      });
      if (!dispatch) throw ApiError.notFound("Dispatch not found");
      const dv = dispatch.vehicles.find((v) => v.vehicleId === input.vehicleId);
      if (!dv) throw ApiError.badRequest("Vehicle is not part of this dispatch");

      const vehicle = await tx.vehicle.findUniqueOrThrow({
        where: { id: input.vehicleId },
      });
      const receiving = await tx.vehicleInspection.findFirst({
        where: {
          vehicleId: input.vehicleId,
          dispatchId: input.dispatchId,
          type: "RECEIVING",
        },
        orderBy: { createdAt: "desc" },
        include: { photos: true },
      });
      const dispatchInspection = await tx.vehicleInspection.findFirst({
        where: {
          vehicleId: input.vehicleId,
          dispatchId: input.dispatchId,
          type: "PRE_DISPATCH",
        },
        orderBy: { createdAt: "desc" },
        include: { photos: true },
      });
      const handovers = await tx.digitalHandover.findMany({
        where: { vehicleId: input.vehicleId, dispatchId: input.dispatchId },
        include: { acknowledgements: true },
      });
      const discrepancies = await tx.vehicleDiscrepancy.findMany({
        where: { vehicleId: input.vehicleId, dispatchId: input.dispatchId },
      });
      const [source, destination] = await Promise.all([
        tx.depot.findUnique({ where: { id: dispatch.sourceDepotId } }),
        tx.depot.findUnique({ where: { id: dispatch.destinationDepotId } }),
      ]);

      const dispatchHandover = handovers.find((h) => h.type === "DISPATCH");
      const receivingHandover = handovers.find((h) => h.type === "RECEIVING");
      const organizationId =
        receiving?.organizationId ?? receivingHandover?.organizationId ?? null;

      const summary = {
        generatedAt: new Date().toISOString(),
        vehicle: {
          id: vehicle.id,
          vehicleCode: vehicle.vehicleCode,
          registrationNumber: vehicle.registrationNumber,
          vin: vehicle.vin,
        },
        ticketReference: dispatch.allocation.ticket.ticketNumber ?? null,
        dispatchReference: dispatch.reference,
        tripReference: dispatch.trip?.reference ?? null,
        source: source ? { name: source.name, code: source.code } : null,
        destination: destination
          ? { name: destination.name, code: destination.code }
          : null,
        destinationAddress: dispatch.destinationAddress,
        dispatchedAt: dispatch.confirmedAt?.toISOString() ?? null,
        receivedAt: receiving?.performedAt?.toISOString() ?? null,
        handoverParties: {
          dispatch: dispatchHandover
            ? {
                reference: dispatchHandover.reference,
                handedOverBy:
                  dispatchHandover.handoverByName ?? dispatchHandover.handoverParty,
                receivedBy:
                  dispatchHandover.receivedByName ?? dispatchHandover.receivedParty,
                acknowledgements: dispatchHandover.acknowledgements.map((x) => ({
                  party: x.party,
                  name: x.name,
                  acknowledged: x.acknowledged,
                  at: x.acknowledgedAt.toISOString(),
                })),
              }
            : null,
          receiving: receivingHandover
            ? {
                reference: receivingHandover.reference,
                handedOverBy:
                  receivingHandover.handoverByName ??
                  receivingHandover.handoverParty,
                receivedBy:
                  receivingHandover.receivedByName ??
                  receivingHandover.receivedParty,
                acknowledgements: receivingHandover.acknowledgements.map((x) => ({
                  party: x.party,
                  name: x.name,
                  acknowledged: x.acknowledged,
                  at: x.acknowledgedAt.toISOString(),
                })),
              }
            : null,
        },
        inspectionSummary: {
          preDispatch: dispatchInspection
            ? {
                reference: dispatchInspection.reference,
                status: dispatchInspection.status,
                odometer: dispatchInspection.odometer,
                photoCount: dispatchInspection.photos.length,
              }
            : null,
          receiving: receiving
            ? {
                reference: receiving.reference,
                status: receiving.status,
                outcome: receiving.receivingOutcome,
                odometer: receiving.odometer,
                photoCount: receiving.photos.length,
              }
            : null,
        },
        photoEvidence: {
          preDispatch:
            dispatchInspection?.photos.map((p) => ({
              id: p.id,
              category: p.category,
              downloadPath: `/inspections/photos/${p.id}/download`,
            })) ?? [],
          receiving:
            receiving?.photos.map((p) => ({
              id: p.id,
              category: p.category,
              downloadPath: `/inspections/photos/${p.id}/download`,
            })) ?? [],
        },
        discrepancies: discrepancies.map((d) => ({
          reference: d.reference,
          category: d.category,
          severity: d.severity,
          status: d.status,
          description: d.description,
        })),
        unresolvedDiscrepancies: discrepancies.filter(
          (d) => !["RESOLVED", "CLOSED"].includes(d.status),
        ).length,
      };

      const existing = await tx.proofOfDelivery.findUnique({
        where: {
          dispatchId_vehicleId: {
            dispatchId: input.dispatchId,
            vehicleId: input.vehicleId,
          },
        },
      });
      const reference = existing?.reference ?? (await nextRef(tx, "pod", "FG-POD"));
      const row = await tx.proofOfDelivery.upsert({
        where: {
          dispatchId_vehicleId: {
            dispatchId: input.dispatchId,
            vehicleId: input.vehicleId,
          },
        },
        create: {
          reference,
          dispatchId: input.dispatchId,
          vehicleId: input.vehicleId,
          tripId: dispatch.trip?.id ?? null,
          ticketId: dispatch.allocation.ticketId,
          organizationId,
          sourceDepotId: dispatch.sourceDepotId,
          destinationDepotId: dispatch.destinationDepotId,
          dispatchHandoverId: dispatchHandover?.id ?? null,
          receivingHandoverId: receivingHandover?.id ?? null,
          receivingInspectionId: receiving?.id ?? null,
          dispatchedAt: dispatch.confirmedAt,
          receivedAt: receiving?.performedAt ?? null,
          summary: summary as Prisma.InputJsonValue,
          generatedById: a.id,
        },
        update: {
          summary: summary as Prisma.InputJsonValue,
          organizationId,
          dispatchHandoverId: dispatchHandover?.id ?? null,
          receivingHandoverId: receivingHandover?.id ?? null,
          receivingInspectionId: receiving?.id ?? null,
          receivedAt: receiving?.performedAt ?? null,
          generatedById: a.id,
          generatedAt: new Date(),
        },
      });
      await audit(tx, a, "pod.generated", row.id, { reference: row.reference });
      return row;
    });
  },

  // -------------------------------------------------------------------------
  // Templates
  // -------------------------------------------------------------------------
  async templates(a: AuthenticatedUser) {
    if (!can(a, "inspections:read") && !can(a, "inspections:manage"))
      throw ApiError.forbidden();
    return prisma.inspectionTemplate.findMany({
      include: { items: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
  },

  async saveTemplate(
    id: string | undefined,
    input: TemplateInput,
    a: AuthenticatedUser,
    key: string,
  ) {
    requireManage(a);
    return operation(a, key, "template.save", { id, input }, async (tx) => {
      if (input.isDefault)
        await tx.inspectionTemplate.updateMany({
          where: { type: input.type, isDefault: true, ...(id ? { id: { not: id } } : {}) },
          data: { isDefault: false },
        });
      const data = {
        type: input.type,
        name: input.name,
        description: input.description ?? null,
        isActive: input.isActive,
        isDefault: input.isDefault,
      };
      let template;
      if (id) {
        template = await tx.inspectionTemplate.update({ where: { id }, data });
        await tx.inspectionChecklistItem.deleteMany({ where: { templateId: id } });
      } else {
        template = await tx.inspectionTemplate.create({
          data: { ...data, createdById: a.id },
        });
      }
      if (input.items.length)
        await tx.inspectionChecklistItem.createMany({
          data: input.items.map((it, i) => ({
            templateId: template.id,
            label: it.label,
            category: it.category,
            inputType: it.inputType,
            required: it.required,
            photoRequired: it.photoRequired,
            requiredPhotoCategory: it.requiredPhotoCategory ?? null,
            sortOrder: it.sortOrder || i,
          })),
        });
      await audit(tx, a, "template.saved", template.id, { name: input.name });
      return tx.inspectionTemplate.findUnique({
        where: { id: template.id },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      });
    });
  },
};
