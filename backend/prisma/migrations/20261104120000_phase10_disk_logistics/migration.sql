-- Phase 10 — Disk / Media Logistics (ADDITIVE ONLY).
-- Generated via prisma migrate diff, hand-filtered to drop spurious
-- DropForeignKey/DropIndex lines emitted for pre-existing tables whose
-- named constraints are intentionally not modelled as relations.

-- CreateEnum
CREATE TYPE "DiskStatus" AS ENUM ('RECEIVED', 'AVAILABLE', 'RESERVED', 'PACKED', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'AT_VENDOR', 'RETURNED', 'DAMAGED', 'LOST', 'UNDER_INSPECTION', 'INACTIVE');

-- CreateEnum
CREATE TYPE "DiskMediaType" AS ENUM ('HDD', 'SSD', 'TAPE', 'OPTICAL', 'FLASH', 'OTHER');

-- CreateEnum
CREATE TYPE "DiskCustodianType" AS ENUM ('DEPOT', 'VENDOR', 'ORGANIZATION', 'TRANSPORTER', 'USER');

-- CreateEnum
CREATE TYPE "DiskMovementType" AS ENUM ('RECEIPT', 'SHIPMENT_OUT', 'SHIPMENT_IN', 'CUSTODY_CHANGE', 'RETURN', 'ADJUSTMENT', 'RECONCILIATION');

-- CreateEnum
CREATE TYPE "DiskShipmentType" AS ENUM ('CTS_TO_DEPOT', 'DEPOT_TO_VENDOR', 'VENDOR_TO_DEPOT', 'DEPOT_TO_CTS', 'VENDOR_TO_VENDOR', 'RETURN');

-- CreateEnum
CREATE TYPE "DiskShipmentStatus" AS ENUM ('PLANNED', 'READY', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "DiskShipmentItemStatus" AS ENUM ('PENDING', 'DISPATCHED', 'RECEIVED', 'MISSING', 'DAMAGED', 'EXTRA');

-- CreateEnum
CREATE TYPE "DiskInspectionType" AS ENUM ('RECEIPT', 'PRE_DISPATCH', 'RECEIVING', 'RECONCILIATION');

-- CreateEnum
CREATE TYPE "DiskHandoverType" AS ENUM ('DISPATCH', 'RECEIVING');

-- CreateEnum
CREATE TYPE "DiskDiscrepancyCategory" AS ENUM ('MISSING', 'DAMAGED', 'UNACCOUNTED', 'WRONG_LOCATION', 'WRONG_CUSTODIAN', 'SERIAL_MISMATCH', 'OTHER');

-- CreateEnum
CREATE TYPE "DiskDiscrepancySeverity" AS ENUM ('MINOR', 'MODERATE', 'MAJOR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DiskDiscrepancyStatus" AS ENUM ('REPORTED', 'UNDER_REVIEW', 'CONFIRMED', 'DISPUTED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DiskReconciliationScope" AS ENUM ('DEPOT', 'VENDOR', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "DiskReconciliationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DiskReconciliationResult" AS ENUM ('PENDING', 'VERIFIED', 'MISSING', 'MISPLACED', 'DAMAGED', 'UNACCOUNTED');

-- CreateTable
CREATE TABLE "disks" (
    "id" TEXT NOT NULL,
    "diskCode" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "mediaType" "DiskMediaType" NOT NULL DEFAULT 'HDD',
    "capacity" TEXT,
    "make" TEXT,
    "model" TEXT,
    "condition" TEXT,
    "sourceOrgId" TEXT,
    "status" "DiskStatus" NOT NULL DEFAULT 'RECEIVED',
    "remarks" TEXT,
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disk_inventory" (
    "id" TEXT NOT NULL,
    "diskId" TEXT NOT NULL,
    "inInventory" BOOLEAN NOT NULL DEFAULT true,
    "receivedAt" TIMESTAMP(3),
    "receivedFromOrgId" TEXT,
    "receivingDepotId" TEXT,
    "currentDepotId" TEXT,
    "currentLocation" TEXT,
    "currentCustodianType" "DiskCustodianType",
    "currentCustodianId" TEXT,
    "activeShipmentId" TEXT,
    "lastMovementId" TEXT,
    "lastMovementAt" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disk_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disk_movements" (
    "id" TEXT NOT NULL,
    "diskId" TEXT NOT NULL,
    "type" "DiskMovementType" NOT NULL,
    "shipmentId" TEXT,
    "fromDepotId" TEXT,
    "toDepotId" TEXT,
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "fromCustodianType" "DiskCustodianType",
    "fromCustodianId" TEXT,
    "toCustodianType" "DiskCustodianType",
    "toCustodianId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "initiatedById" TEXT,
    "reference" TEXT,
    "reason" TEXT,
    "remarks" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disk_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disk_custody" (
    "id" TEXT NOT NULL,
    "diskId" TEXT NOT NULL,
    "custodianType" "DiskCustodianType" NOT NULL,
    "custodianId" TEXT NOT NULL,
    "location" TEXT,
    "depotId" TEXT,
    "fromDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "toDate" TIMESTAMP(3),
    "movementId" TEXT,
    "shipmentId" TEXT,
    "handedOverById" TEXT,
    "receivedById" TEXT,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "signatureKey" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disk_custody_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disk_shipments" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "type" "DiskShipmentType" NOT NULL,
    "status" "DiskShipmentStatus" NOT NULL DEFAULT 'PLANNED',
    "ticketId" TEXT,
    "sourceOrgId" TEXT,
    "sourceDepotId" TEXT,
    "destinationOrgId" TEXT,
    "destinationDepotId" TEXT,
    "transporterId" TEXT,
    "driverId" TEXT,
    "plannedDispatchAt" TIMESTAMP(3),
    "expectedDeliveryAt" TIMESTAMP(3),
    "trackingReference" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "dispatchedById" TEXT,
    "confirmedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "remarks" TEXT,
    "exception" TEXT,
    "idempotencyKey" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disk_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disk_shipment_items" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "diskId" TEXT NOT NULL,
    "status" "DiskShipmentItemStatus" NOT NULL DEFAULT 'PENDING',
    "dispatchVerified" BOOLEAN NOT NULL DEFAULT false,
    "dispatchCondition" TEXT,
    "receivedVerified" BOOLEAN NOT NULL DEFAULT false,
    "receivedCondition" TEXT,
    "remarks" TEXT,

    CONSTRAINT "disk_shipment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disk_inspections" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "type" "DiskInspectionType" NOT NULL,
    "shipmentId" TEXT,
    "diskId" TEXT,
    "condition" TEXT,
    "sealNumber" TEXT,
    "packaging" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "performedById" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disk_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disk_photos" (
    "id" TEXT NOT NULL,
    "diskId" TEXT,
    "shipmentId" TEXT,
    "inspectionId" TEXT,
    "reconciliationId" TEXT,
    "context" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disk_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disk_handovers" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "type" "DiskHandoverType" NOT NULL,
    "handoverByUserId" TEXT,
    "handoverByName" TEXT,
    "receivedByUserId" TEXT,
    "receivedByName" TEXT,
    "sealNumber" TEXT,
    "packaging" TEXT,
    "checklist" JSONB,
    "handoverAck" BOOLEAN NOT NULL DEFAULT false,
    "handoverSignatureKey" TEXT,
    "receiverAck" BOOLEAN NOT NULL DEFAULT false,
    "receiverSignatureKey" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "remarks" TEXT,
    "idempotencyKey" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disk_handovers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disk_reconciliations" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "scope" "DiskReconciliationScope" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "status" "DiskReconciliationStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "startedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disk_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disk_reconciliation_items" (
    "id" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "diskId" TEXT,
    "diskRef" TEXT,
    "expectedStatus" "DiskStatus",
    "expectedDepotId" TEXT,
    "expectedCustodianType" "DiskCustodianType",
    "expectedCustodianId" TEXT,
    "observedDepotId" TEXT,
    "observedCustodianId" TEXT,
    "result" "DiskReconciliationResult" NOT NULL DEFAULT 'PENDING',
    "discrepancy" TEXT,
    "remarks" TEXT,

    CONSTRAINT "disk_reconciliation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disk_discrepancies" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "diskId" TEXT,
    "shipmentId" TEXT,
    "reconciliationId" TEXT,
    "category" "DiskDiscrepancyCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "DiskDiscrepancySeverity" NOT NULL DEFAULT 'MINOR',
    "status" "DiskDiscrepancyStatus" NOT NULL DEFAULT 'REPORTED',
    "organizationId" TEXT,
    "reportedById" TEXT,
    "assignedReviewerId" TEXT,
    "resolvedById" TEXT,
    "resolutionRemarks" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disk_discrepancies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "disks_diskCode_key" ON "disks"("diskCode");

-- CreateIndex
CREATE UNIQUE INDEX "disks_serialNumber_key" ON "disks"("serialNumber");

-- CreateIndex
CREATE INDEX "disks_status_idx" ON "disks"("status");

-- CreateIndex
CREATE INDEX "disks_sourceOrgId_idx" ON "disks"("sourceOrgId");

-- CreateIndex
CREATE INDEX "disks_mediaType_idx" ON "disks"("mediaType");

-- CreateIndex
CREATE UNIQUE INDEX "disk_inventory_diskId_key" ON "disk_inventory"("diskId");

-- CreateIndex
CREATE INDEX "disk_inventory_currentDepotId_idx" ON "disk_inventory"("currentDepotId");

-- CreateIndex
CREATE INDEX "disk_inventory_currentCustodianType_currentCustodianId_idx" ON "disk_inventory"("currentCustodianType", "currentCustodianId");

-- CreateIndex
CREATE INDEX "disk_inventory_inInventory_idx" ON "disk_inventory"("inInventory");

-- CreateIndex
CREATE UNIQUE INDEX "disk_movements_idempotencyKey_key" ON "disk_movements"("idempotencyKey");

-- CreateIndex
CREATE INDEX "disk_movements_diskId_idx" ON "disk_movements"("diskId");

-- CreateIndex
CREATE INDEX "disk_movements_shipmentId_idx" ON "disk_movements"("shipmentId");

-- CreateIndex
CREATE INDEX "disk_movements_type_idx" ON "disk_movements"("type");

-- CreateIndex
CREATE INDEX "disk_custody_diskId_idx" ON "disk_custody"("diskId");

-- CreateIndex
CREATE INDEX "disk_custody_shipmentId_idx" ON "disk_custody"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "disk_shipments_reference_key" ON "disk_shipments"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "disk_shipments_idempotencyKey_key" ON "disk_shipments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "disk_shipments_status_idx" ON "disk_shipments"("status");

-- CreateIndex
CREATE INDEX "disk_shipments_type_idx" ON "disk_shipments"("type");

-- CreateIndex
CREATE INDEX "disk_shipments_transporterId_idx" ON "disk_shipments"("transporterId");

-- CreateIndex
CREATE INDEX "disk_shipment_items_diskId_idx" ON "disk_shipment_items"("diskId");

-- CreateIndex
CREATE UNIQUE INDEX "disk_shipment_items_shipmentId_diskId_key" ON "disk_shipment_items"("shipmentId", "diskId");

-- CreateIndex
CREATE UNIQUE INDEX "disk_inspections_reference_key" ON "disk_inspections"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "disk_inspections_idempotencyKey_key" ON "disk_inspections"("idempotencyKey");

-- CreateIndex
CREATE INDEX "disk_inspections_shipmentId_idx" ON "disk_inspections"("shipmentId");

-- CreateIndex
CREATE INDEX "disk_inspections_diskId_idx" ON "disk_inspections"("diskId");

-- CreateIndex
CREATE INDEX "disk_photos_diskId_idx" ON "disk_photos"("diskId");

-- CreateIndex
CREATE INDEX "disk_photos_shipmentId_idx" ON "disk_photos"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "disk_handovers_reference_key" ON "disk_handovers"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "disk_handovers_idempotencyKey_key" ON "disk_handovers"("idempotencyKey");

-- CreateIndex
CREATE INDEX "disk_handovers_shipmentId_idx" ON "disk_handovers"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "disk_reconciliations_reference_key" ON "disk_reconciliations"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "disk_reconciliations_idempotencyKey_key" ON "disk_reconciliations"("idempotencyKey");

-- CreateIndex
CREATE INDEX "disk_reconciliations_scope_scopeId_idx" ON "disk_reconciliations"("scope", "scopeId");

-- CreateIndex
CREATE INDEX "disk_reconciliations_status_idx" ON "disk_reconciliations"("status");

-- CreateIndex
CREATE INDEX "disk_reconciliation_items_reconciliationId_idx" ON "disk_reconciliation_items"("reconciliationId");

-- CreateIndex
CREATE UNIQUE INDEX "disk_discrepancies_reference_key" ON "disk_discrepancies"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "disk_discrepancies_idempotencyKey_key" ON "disk_discrepancies"("idempotencyKey");

-- CreateIndex
CREATE INDEX "disk_discrepancies_diskId_idx" ON "disk_discrepancies"("diskId");

-- CreateIndex
CREATE INDEX "disk_discrepancies_shipmentId_idx" ON "disk_discrepancies"("shipmentId");

-- CreateIndex
CREATE INDEX "disk_discrepancies_status_idx" ON "disk_discrepancies"("status");

-- AddForeignKey
ALTER TABLE "disk_inventory" ADD CONSTRAINT "disk_inventory_diskId_fkey" FOREIGN KEY ("diskId") REFERENCES "disks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disk_movements" ADD CONSTRAINT "disk_movements_diskId_fkey" FOREIGN KEY ("diskId") REFERENCES "disks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disk_custody" ADD CONSTRAINT "disk_custody_diskId_fkey" FOREIGN KEY ("diskId") REFERENCES "disks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disk_shipment_items" ADD CONSTRAINT "disk_shipment_items_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "disk_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disk_shipment_items" ADD CONSTRAINT "disk_shipment_items_diskId_fkey" FOREIGN KEY ("diskId") REFERENCES "disks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disk_inspections" ADD CONSTRAINT "disk_inspections_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "disk_shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disk_photos" ADD CONSTRAINT "disk_photos_diskId_fkey" FOREIGN KEY ("diskId") REFERENCES "disks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disk_photos" ADD CONSTRAINT "disk_photos_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "disk_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disk_photos" ADD CONSTRAINT "disk_photos_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "disk_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disk_photos" ADD CONSTRAINT "disk_photos_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "disk_reconciliations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disk_handovers" ADD CONSTRAINT "disk_handovers_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "disk_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disk_reconciliation_items" ADD CONSTRAINT "disk_reconciliation_items_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "disk_reconciliations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disk_discrepancies" ADD CONSTRAINT "disk_discrepancies_diskId_fkey" FOREIGN KEY ("diskId") REFERENCES "disks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disk_discrepancies" ADD CONSTRAINT "disk_discrepancies_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "disk_shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

