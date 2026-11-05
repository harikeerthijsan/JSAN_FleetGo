import {
  Prisma,
  type ReconciliationScope,
  type ReconciliationItemResult,
} from "@prisma/client";
import { prisma } from "../../database/prisma";
import { ApiError } from "../../utils/ApiError";
import type { AuthenticatedUser } from "../../types/auth";
import {
  inventoryScope,
  operation,
  scopedInventory,
  lockVehicle,
  destination,
  movement,
  setStatus,
  audit,
} from "./inventory.service";

type Tx = Prisma.TransactionClient;
const broad = (a: AuthenticatedUser) =>
  ["SUPER_ADMIN", "JSAN_ADMIN"].includes(a.role.name);
async function session(
  tx: Tx,
  id: string,
  actor: AuthenticatedUser,
  lock = false,
) {
  if (lock)
    await tx.$queryRaw`SELECT id FROM inventory_reconciliations WHERE id=${id} FOR UPDATE`;
  const r = await tx.inventoryReconciliation.findUnique({
    where: { id },
    include: { items: true, photos: true },
  });
  if (!r) throw ApiError.notFound("Reconciliation not found");
  if (!broad(actor)) {
    const allowed =
      actor.role.name === "OPERATIONS_MANAGER"
        ? r.scope === "DEPOT" && actor.depotIds.includes(r.scopeId)
        : r.scope !== "DEPOT" && r.scopeId === actor.organizationId;
    if (!allowed)
      throw ApiError.forbidden("Reconciliation is outside your scope");
  }
  return r;
}
function scopeFilter(
  scope: ReconciliationScope,
  scopeId: string,
): Prisma.VehicleInventoryWhereInput {
  return scope === "DEPOT"
    ? { currentDepotId: scopeId }
    : scope === "VENDOR"
      ? { currentCustodianType: "VENDOR", currentCustodianId: scopeId }
      : { vehicle: { organizationId: scopeId } };
}
function report(items: { result: string; expectedStatus: unknown }[]) {
  const count = (result: string) =>
    items.filter((i) => i.result === result).length;
  return {
    systemQuantity: items.filter((i) => i.expectedStatus !== null).length,
    physicallyVerifiedQuantity: items.filter((i) =>
      ["VERIFIED", "MISPLACED", "DAMAGED", "UNEXPECTED"].includes(i.result),
    ).length,
    verified: count("VERIFIED"),
    missing: count("MISSING"),
    unexpected: count("UNEXPECTED"),
    damaged: count("DAMAGED"),
    locationMismatches: count("MISPLACED"),
    pending: count("PENDING"),
  };
}
export const reconciliationService = {
  async create(
    input: { scope: ReconciliationScope; scopeId: string; notes?: string },
    actor: AuthenticatedUser,
    key: string,
  ) {
    return operation(actor, key, "reconciliation.create", input, async (tx) => {
      if (input.scope === "DEPOT") {
        if (!(await tx.depot.findUnique({ where: { id: input.scopeId } })))
          throw ApiError.badRequest("Depot not found");
      } else if (
        !(await tx.organization.findFirst({
          where: {
            id: input.scopeId,
            ...(input.scope === "VENDOR"
              ? { type: { in: ["VEHICLE_VENDOR", "TRANSPORT_PARTNER"] } }
              : {}),
          },
        }))
      )
        throw ApiError.badRequest("Organization not found");
      if (
        !broad(actor) &&
        !(
          actor.role.name === "OPERATIONS_MANAGER" &&
          input.scope === "DEPOT" &&
          actor.depotIds.includes(input.scopeId)
        )
      )
        throw ApiError.forbidden("You cannot reconcile this scope");
      const records = await tx.vehicleInventory.findMany({
        where: {
          AND: [scopeFilter(input.scope, input.scopeId), inventoryScope(actor)],
        },
        include: { vehicle: true },
      });
      const row = await tx.inventoryReconciliation.create({
        data: {
          ...input,
          startedById: actor.id,
          items: {
            create: records.map((i) => ({
              vehicleId: i.vehicleId,
              vehicleRef: i.vehicle.vehicleCode,
              expectedStatus: i.vehicle.status,
              expectedDepotId: i.currentDepotId,
              expectedUpdatedAt: i.updatedAt,
              expectedCustodianType: i.currentCustodianType,
              expectedCustodianId: i.currentCustodianId,
            })),
          },
        },
        include: { items: true },
      });
      await audit(tx, actor, "inventory.reconciliation.created", row.id, {
        scope: input.scope,
        scopeId: input.scopeId,
        quantity: records.length,
      });
      return row;
    });
  },
  async list(actor: AuthenticatedUser) {
    const where: Prisma.InventoryReconciliationWhereInput = broad(actor)
      ? {}
      : actor.role.name === "OPERATIONS_MANAGER"
        ? { scope: "DEPOT", scopeId: { in: actor.depotIds } }
        : {
            scope: { in: ["VENDOR", "ORGANIZATION"] },
            scopeId: actor.organizationId ?? "__none__",
          };
    return prisma.inventoryReconciliation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { items: true } } },
    });
  },
  async get(id: string, actor: AuthenticatedUser) {
    const row = await session(prisma, id, actor);
    return { ...row, report: report(row.items) };
  },
  async item(
    id: string,
    itemId: string | undefined,
    input: {
      vehicleId?: string;
      vehicleRef?: string;
      observedDepotId?: string;
      result: ReconciliationItemResult;
      discrepancy?: string;
      remarks?: string;
    },
    actor: AuthenticatedUser,
    key: string,
  ) {
    return operation(
      actor,
      key,
      "reconciliation.item",
      { id, itemId, input },
      async (tx) => {
        const r = await session(tx, id, actor, true);
        if (r.status !== "DRAFT")
          throw ApiError.conflict("Only draft reconciliations can be edited");
        if (
          input.observedDepotId &&
          !(await tx.depot.findUnique({ where: { id: input.observedDepotId } }))
        )
          throw ApiError.badRequest("Observed depot not found");
        if (itemId) {
          const old = r.items.find((i) => i.id === itemId);
          if (!old) throw ApiError.notFound("Item not found");
          if (input.vehicleId && input.vehicleId !== old.vehicleId)
            throw ApiError.badRequest("Cannot replace a snapshot vehicle");
          if (input.result === "UNEXPECTED" && old.expectedStatus)
            throw ApiError.badRequest(
              "Expected vehicle cannot be marked unexpected",
            );
          if (
            input.result === "MISPLACED" &&
            (!input.observedDepotId ||
              input.observedDepotId === old.expectedDepotId)
          )
            throw ApiError.badRequest(
              "Choose a different observed depot for a misplaced vehicle",
            );
          return tx.reconciliationItem.update({
            where: { id: itemId },
            data: {
              result: input.result,
              observedDepotId: input.observedDepotId,
              discrepancy: input.discrepancy,
              remarks: input.remarks,
            },
          });
        }
        if (input.result !== "UNEXPECTED")
          throw ApiError.badRequest(
            "Only unexpected vehicles may be added to the snapshot",
          );
        if (input.vehicleId) {
          await scopedInventory(tx, input.vehicleId, actor);
          if (r.items.some((i) => i.vehicleId === input.vehicleId))
            throw ApiError.conflict("Vehicle already in snapshot");
        }
        return tx.reconciliationItem.create({
          data: { ...input, reconciliationId: id },
        });
      },
    );
  },
  async submit(id: string, actor: AuthenticatedUser, key: string) {
    return operation(
      actor,
      key,
      "reconciliation.submit",
      { id },
      async (tx) => {
        const r = await session(tx, id, actor, true);
        if (r.status !== "DRAFT")
          throw ApiError.conflict("Only drafts may be submitted");
        if (r.items.some((i) => i.result === "PENDING"))
          throw ApiError.badRequest(
            "Verify every expected vehicle before submitting",
          );
        const row = await tx.inventoryReconciliation.update({
          where: { id },
          data: { status: "SUBMITTED", submittedAt: new Date() },
        });
        await audit(
          tx,
          actor,
          "inventory.reconciliation.submitted",
          id,
          report(r.items),
        );
        return row;
      },
    );
  },
  async review(
    id: string,
    decision: "APPROVED" | "REJECTED",
    comment: string,
    actor: AuthenticatedUser,
    key: string,
  ) {
    return operation(
      actor,
      key,
      "reconciliation.review",
      { id, decision, comment },
      async (tx) => {
        const r = await session(tx, id, actor, true);
        if (r.status !== "SUBMITTED")
          throw ApiError.conflict("Only submitted sessions may be reviewed");
        if (r.startedById === actor.id)
          throw ApiError.forbidden(
            "A different authorized reviewer must review this session",
          );
        if (decision === "APPROVED") {
          for (const item of [...r.items].sort((a, b) =>
            (a.vehicleId ?? "").localeCompare(b.vehicleId ?? ""),
          )) {
            if (
              !item.vehicleId ||
              !["MISPLACED", "DAMAGED"].includes(item.result)
            )
              continue;
            await lockVehicle(tx, item.vehicleId);
            const inv = await scopedInventory(tx, item.vehicleId, actor);
            if (
              !item.expectedUpdatedAt ||
              inv.updatedAt.getTime() !== item.expectedUpdatedAt.getTime() ||
              inv.vehicle.status !== item.expectedStatus
            )
              throw ApiError.conflict(
                `Vehicle ${item.vehicleRef} changed after the snapshot. Reject and start a new reconciliation.`,
              );
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
                "This operational status cannot be corrected by reconciliation",
              );
            if (
              inv.activeReservationId ||
              (await tx.inventoryAllocation.count({
                where: { vehicleId: item.vehicleId, releasedAt: null },
              }))
            )
              throw ApiError.conflict(
                "Reserved or allocated vehicle cannot be corrected",
              );
            if (item.result === "MISPLACED") {
              if (!item.observedDepotId)
                throw ApiError.badRequest("Correction needs an observed depot");
              await destination(
                tx,
                item.observedDepotId,
                "DEPOT",
                item.observedDepotId,
                actor,
              );
              await movement(tx, item.vehicleId, actor, {
                type: "ADJUSTMENT",
                toDepotId: item.observedDepotId,
                custodianType: "DEPOT",
                custodianId: item.observedDepotId,
                occurredAt: new Date(),
                reason: comment,
                reference: id,
              });
              if (inv.vehicle.status === "AT_VENDOR")
                await setStatus(
                  tx,
                  item.vehicleId,
                  "AVAILABLE",
                  actor,
                  comment,
                );
            } else {
              await setStatus(tx, item.vehicleId, "DAMAGED", actor, comment);
              await tx.vehicleInventory.update({
                where: { vehicleId: item.vehicleId },
                data: { updatedAt: new Date() },
              });
            }
            await tx.inventoryAdjustment.create({
              data: {
                vehicleId: item.vehicleId,
                reconciliationId: id,
                type: item.result,
                fromValue:
                  item.result === "MISPLACED"
                    ? inv.currentDepotId
                    : inv.vehicle.status,
                toValue:
                  item.result === "MISPLACED"
                    ? item.observedDepotId
                    : "DAMAGED",
                reason: comment,
                approvedById: actor.id,
              },
            });
          }
        }
        const row = await tx.inventoryReconciliation.update({
          where: { id },
          data: {
            status: decision,
            reviewedById: actor.id,
            reviewedAt: new Date(),
            reviewComment: comment,
          },
        });
        await audit(
          tx,
          actor,
          `inventory.reconciliation.${decision.toLowerCase()}`,
          id,
          { comment, report: report(r.items) },
        );
        return row;
      },
    );
  },
};
