import { Prisma } from "@prisma/client";
import { ApiError } from "../../utils/ApiError";
import type { AuthenticatedUser } from "../../types/auth";
import {
  lockVehicle,
  scopedInventory,
  expireLocked,
  setStatus,
  movement,
  available,
} from "./inventory.service";
type Tx = Prisma.TransactionClient;
/** Transaction-aware inventory primitives used only by authorized Phase 6 orchestration. */
export async function allocateInventoryTx(
  tx: Tx,
  vehicleId: string,
  orgId: string,
  sourceDepotId: string,
  reference: string,
  actor: AuthenticatedUser,
) {
  await lockVehicle(tx, vehicleId);
  await scopedInventory(tx, vehicleId, actor);
  await expireLocked(tx, vehicleId, actor);
  const check = await available(
    tx,
    vehicleId,
    actor,
    undefined,
    undefined,
    sourceDepotId,
  );
  if (!check.available) throw ApiError.conflict(check.reasons.join("; "));
  const inv = await tx.vehicleInventory.findUniqueOrThrow({
    where: { vehicleId },
  });
  const ledger = await tx.inventoryAllocation.create({
    data: {
      vehicleId,
      organizationId: orgId,
      reference,
      allocatedById: actor.id,
    },
  });
  await movement(tx, vehicleId, actor, {
    type: "CUSTODY_CHANGE",
    toDepotId: sourceDepotId,
    custodianType: inv.currentCustodianType!,
    custodianId: inv.currentCustodianId!,
    occurredAt: new Date(),
    reason: "Allocation confirmed; custody retained at source",
    reference,
  });
  await setStatus(tx, vehicleId, "ALLOCATED", actor, reference);
  return ledger;
}
export async function releaseInventoryTx(
  tx: Tx,
  vehicleId: string,
  ledgerId: string,
  reason: string,
  actor: AuthenticatedUser,
) {
  await lockVehicle(tx, vehicleId);
  const inv = await tx.vehicleInventory.findUniqueOrThrow({
    where: { vehicleId },
    include: { vehicle: true },
  });
  const ledger = await tx.inventoryAllocation.findFirst({
    where: { id: ledgerId, vehicleId, releasedAt: null },
  });
  if (!ledger || inv.vehicle.status !== "ALLOCATED")
    throw ApiError.conflict(
      "Only an undispatched active allocation may be released",
    );
  await tx.inventoryAllocation.update({
    where: { id: ledgerId },
    data: { releasedAt: new Date() },
  });
  await movement(tx, vehicleId, actor, {
    type: "CUSTODY_CHANGE",
    toDepotId: inv.currentDepotId!,
    custodianType: inv.currentCustodianType!,
    custodianId: inv.currentCustodianId!,
    occurredAt: new Date(),
    reason,
    reference: ledger.reference,
  });
  await setStatus(
    tx,
    vehicleId,
    inv.currentCustodianType === "VENDOR" ? "AT_VENDOR" : "AVAILABLE",
    actor,
    reason,
  );
}
export async function dispatchInventoryTx(
  tx: Tx,
  vehicleId: string,
  ledgerId: string,
  sourceDepotId: string,
  transporterId: string,
  reference: string,
  actor: AuthenticatedUser,
) {
  await lockVehicle(tx, vehicleId);
  const inv = await tx.vehicleInventory.findUniqueOrThrow({
    where: { vehicleId },
    include: { vehicle: true },
  });
  if (
    inv.vehicle.status !== "ALLOCATED" ||
    inv.currentDepotId !== sourceDepotId ||
    !(await tx.inventoryAllocation.findFirst({
      where: { id: ledgerId, vehicleId, releasedAt: null },
    }))
  )
    throw ApiError.conflict(
      "Allocation, source location or vehicle status changed",
    );
  await movement(tx, vehicleId, actor, {
    type: "DISPATCH",
    toDepotId: sourceDepotId,
    custodianType: "VENDOR",
    custodianId: transporterId,
    occurredAt: new Date(),
    reason:
      "Dispatched into transport custody; depot is last known departure location",
    reference,
  });
  await setStatus(tx, vehicleId, "DISPATCHED", actor, reference);
}
export async function transitInventoryTx(
  tx: Tx,
  vehicleId: string,
  actor: AuthenticatedUser,
  reference: string,
) {
  await lockVehicle(tx, vehicleId);
  const v = await tx.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
  if (!["DISPATCHED", "IN_TRANSIT"].includes(v.status))
    throw ApiError.conflict("Vehicle is not dispatched");
  await setStatus(tx, vehicleId, "IN_TRANSIT", actor, reference);
}
export async function deliveryInventoryTx(
  tx: Tx,
  vehicleId: string,
  ledgerId: string,
  depotId: string,
  receivingOrgId: string,
  reference: string,
  actor: AuthenticatedUser,
) {
  await lockVehicle(tx, vehicleId);
  const v = await tx.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
  if (
    !["DISPATCHED", "IN_TRANSIT"].includes(v.status) ||
    !(await tx.inventoryAllocation.findFirst({
      where: { id: ledgerId, vehicleId, releasedAt: null },
    }))
  )
    throw ApiError.conflict("Vehicle has no active dispatched allocation");
  const org = await tx.organization.findFirst({
    where: { id: receivingOrgId, status: "ACTIVE" },
  });
  if (
    !org ||
    !(await tx.depot.findFirst({ where: { id: depotId, status: "ACTIVE" } }))
  )
    throw ApiError.badRequest(
      "Destination or receiving organization is inactive",
    );
  await movement(tx, vehicleId, actor, {
    type: "DELIVERY",
    toDepotId: depotId,
    custodianType: ["VEHICLE_VENDOR", "TRANSPORT_PARTNER"].includes(org.type)
      ? "VENDOR"
      : "ORGANIZATION",
    custodianId: receivingOrgId,
    occurredAt: new Date(),
    reason:
      "Delivery recorded; receiving inspection/availability verification pending",
    reference,
  });
  await tx.inventoryAllocation.update({
    where: { id: ledgerId },
    data: { releasedAt: new Date() },
  });
  await setStatus(tx, vehicleId, "DELIVERED", actor, reference);
}
