-- Phase 8 — Inspection & Digital Handover (ADDITIVE ONLY).
-- Generated via prisma migrate diff, hand-filtered to drop spurious
-- DropForeignKey/DropIndex lines the diff emits for pre-existing tables
-- whose named constraints are intentionally not modelled as relations.

-- CreateEnum
CREATE TYPE "InspectionType" AS ENUM ('INITIAL_RECEIPT', 'PRE_DISPATCH', 'RECEIVING', 'RETURN');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ReceivingOutcome" AS ENUM ('FULL', 'WITH_DISCREPANCIES', 'DAMAGED', 'PARTIAL', 'REJECTED');

-- CreateEnum
CREATE TYPE "ChecklistInputType" AS ENUM ('BOOLEAN', 'TEXT', 'NUMBER', 'CONDITION');

-- CreateEnum
CREATE TYPE "InspectionPhotoCategory" AS ENUM ('FRONT', 'REAR', 'LEFT', 'RIGHT', 'INTERIOR', 'DASHBOARD', 'ODOMETER', 'TYRES', 'GLASS', 'LIGHTS', 'ACCESSORIES', 'KEYS_DOCUMENTS', 'EXISTING_DAMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "InspectionEvidenceKind" AS ENUM ('PHOTO', 'VIDEO', 'DOCUMENT', 'SIGNATURE');

-- CreateEnum
CREATE TYPE "DiscrepancyCategory" AS ENUM ('NEW_SCRATCH', 'DENT', 'BROKEN_GLASS', 'TYRE_DAMAGE', 'MISSING_ACCESSORY', 'MISSING_DOCUMENT', 'INTERIOR_DAMAGE', 'MECHANICAL_ISSUE', 'ODOMETER_DISCREPANCY', 'OTHER');

-- CreateEnum
CREATE TYPE "DiscrepancySeverity" AS ENUM ('MINOR', 'MODERATE', 'MAJOR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DiscrepancyStatus" AS ENUM ('REPORTED', 'UNDER_REVIEW', 'CONFIRMED', 'DISPUTED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "HandoverType" AS ENUM ('DISPATCH', 'RECEIVING');

-- CreateEnum
CREATE TYPE "HandoverStatus" AS ENUM ('PENDING', 'CONFIRMED');

-- CreateTable
CREATE TABLE "inspection_templates" (
    "id" TEXT NOT NULL,
    "type" "InspectionType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspection_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_checklist_items" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "inputType" "ChecklistInputType" NOT NULL DEFAULT 'CONDITION',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "photoRequired" BOOLEAN NOT NULL DEFAULT false,
    "requiredPhotoCategory" "InspectionPhotoCategory",
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inspection_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_inspections" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "type" "InspectionType" NOT NULL,
    "status" "InspectionStatus" NOT NULL DEFAULT 'PENDING',
    "vehicleId" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "vin" TEXT,
    "dispatchId" TEXT,
    "dispatchVehicleId" TEXT,
    "tripId" TEXT,
    "ticketId" TEXT,
    "organizationId" TEXT,
    "depotId" TEXT,
    "receivedFromOrgId" TEXT,
    "templateId" TEXT,
    "odometer" INTEGER,
    "fuelLevel" INTEGER,
    "exteriorCondition" TEXT,
    "interiorCondition" TEXT,
    "tyresCondition" TEXT,
    "glassCondition" TEXT,
    "lightsCondition" TEXT,
    "accessories" TEXT,
    "keysDocuments" TEXT,
    "existingDamage" TEXT,
    "missingItems" TEXT,
    "newDamage" TEXT,
    "generalRemarks" TEXT,
    "identityVerified" BOOLEAN NOT NULL DEFAULT false,
    "registrationVerified" BOOLEAN NOT NULL DEFAULT false,
    "receivingOutcome" "ReceivingOutcome",
    "rejectionReason" TEXT,
    "performedAt" TIMESTAMP(3),
    "performedById" TEXT,
    "receivedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewRemarks" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "idempotencyKey" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_responses" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "checklistItemId" TEXT,
    "label" TEXT NOT NULL,
    "category" TEXT,
    "value" TEXT,
    "numericValue" DOUBLE PRECISION,
    "remarks" TEXT,

    CONSTRAINT "inspection_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_photos" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "category" "InspectionPhotoCategory" NOT NULL,
    "label" TEXT,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sourceEvidenceId" TEXT,
    "reused" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_evidence" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT,
    "discrepancyId" TEXT,
    "kind" "InspectionEvidenceKind" NOT NULL DEFAULT 'DOCUMENT',
    "label" TEXT,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_discrepancies" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "dispatchId" TEXT,
    "tripId" TEXT,
    "ticketId" TEXT,
    "inspectionId" TEXT,
    "organizationId" TEXT,
    "category" "DiscrepancyCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "DiscrepancySeverity" NOT NULL DEFAULT 'MINOR',
    "status" "DiscrepancyStatus" NOT NULL DEFAULT 'REPORTED',
    "dispatchEvidenceId" TEXT,
    "dispatchPhotoId" TEXT,
    "receivingPhotoId" TEXT,
    "aiSuggested" BOOLEAN NOT NULL DEFAULT false,
    "aiConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "reportedById" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedReviewerId" TEXT,
    "resolvedById" TEXT,
    "resolutionRemarks" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_discrepancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discrepancy_comments" (
    "id" TEXT NOT NULL,
    "discrepancyId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "fromStatus" "DiscrepancyStatus",
    "toStatus" "DiscrepancyStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discrepancy_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digital_handovers" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "type" "HandoverType" NOT NULL,
    "status" "HandoverStatus" NOT NULL DEFAULT 'PENDING',
    "vehicleId" TEXT NOT NULL,
    "dispatchId" TEXT,
    "tripId" TEXT,
    "ticketId" TEXT,
    "organizationId" TEXT,
    "inspectionId" TEXT,
    "handoverByUserId" TEXT,
    "handoverByName" TEXT,
    "handoverParty" TEXT,
    "receivedByUserId" TEXT,
    "receivedByName" TEXT,
    "receivedParty" TEXT,
    "checklist" JSONB,
    "remarks" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "digital_handovers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handover_acknowledgements" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "role" TEXT,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT true,
    "signatureKey" TEXT,
    "remarks" TEXT,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handover_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proofs_of_delivery" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "tripId" TEXT,
    "ticketId" TEXT,
    "organizationId" TEXT,
    "sourceDepotId" TEXT,
    "destinationDepotId" TEXT,
    "dispatchHandoverId" TEXT,
    "receivingHandoverId" TEXT,
    "receivingInspectionId" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "summary" JSONB NOT NULL,
    "storageKey" TEXT,
    "generatedById" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proofs_of_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inspection_templates_type_isActive_idx" ON "inspection_templates"("type", "isActive");

-- CreateIndex
CREATE INDEX "inspection_checklist_items_templateId_idx" ON "inspection_checklist_items"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_inspections_reference_key" ON "vehicle_inspections"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_inspections_supersedesId_key" ON "vehicle_inspections"("supersedesId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_inspections_idempotencyKey_key" ON "vehicle_inspections"("idempotencyKey");

-- CreateIndex
CREATE INDEX "vehicle_inspections_vehicleId_type_idx" ON "vehicle_inspections"("vehicleId", "type");

-- CreateIndex
CREATE INDEX "vehicle_inspections_dispatchId_idx" ON "vehicle_inspections"("dispatchId");

-- CreateIndex
CREATE INDEX "vehicle_inspections_tripId_idx" ON "vehicle_inspections"("tripId");

-- CreateIndex
CREATE INDEX "vehicle_inspections_status_idx" ON "vehicle_inspections"("status");

-- CreateIndex
CREATE INDEX "vehicle_inspections_organizationId_idx" ON "vehicle_inspections"("organizationId");

-- CreateIndex
CREATE INDEX "inspection_responses_inspectionId_idx" ON "inspection_responses"("inspectionId");

-- CreateIndex
CREATE INDEX "inspection_photos_inspectionId_category_idx" ON "inspection_photos"("inspectionId", "category");

-- CreateIndex
CREATE INDEX "inspection_evidence_inspectionId_idx" ON "inspection_evidence"("inspectionId");

-- CreateIndex
CREATE INDEX "inspection_evidence_discrepancyId_idx" ON "inspection_evidence"("discrepancyId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_discrepancies_reference_key" ON "vehicle_discrepancies"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_discrepancies_idempotencyKey_key" ON "vehicle_discrepancies"("idempotencyKey");

-- CreateIndex
CREATE INDEX "vehicle_discrepancies_vehicleId_idx" ON "vehicle_discrepancies"("vehicleId");

-- CreateIndex
CREATE INDEX "vehicle_discrepancies_dispatchId_idx" ON "vehicle_discrepancies"("dispatchId");

-- CreateIndex
CREATE INDEX "vehicle_discrepancies_status_idx" ON "vehicle_discrepancies"("status");

-- CreateIndex
CREATE INDEX "vehicle_discrepancies_organizationId_idx" ON "vehicle_discrepancies"("organizationId");

-- CreateIndex
CREATE INDEX "discrepancy_comments_discrepancyId_createdAt_idx" ON "discrepancy_comments"("discrepancyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "digital_handovers_reference_key" ON "digital_handovers"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "digital_handovers_idempotencyKey_key" ON "digital_handovers"("idempotencyKey");

-- CreateIndex
CREATE INDEX "digital_handovers_vehicleId_idx" ON "digital_handovers"("vehicleId");

-- CreateIndex
CREATE INDEX "digital_handovers_dispatchId_idx" ON "digital_handovers"("dispatchId");

-- CreateIndex
CREATE INDEX "digital_handovers_type_status_idx" ON "digital_handovers"("type", "status");

-- CreateIndex
CREATE INDEX "handover_acknowledgements_handoverId_idx" ON "handover_acknowledgements"("handoverId");

-- CreateIndex
CREATE UNIQUE INDEX "proofs_of_delivery_reference_key" ON "proofs_of_delivery"("reference");

-- CreateIndex
CREATE INDEX "proofs_of_delivery_vehicleId_idx" ON "proofs_of_delivery"("vehicleId");

-- CreateIndex
CREATE INDEX "proofs_of_delivery_organizationId_idx" ON "proofs_of_delivery"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "proofs_of_delivery_dispatchId_vehicleId_key" ON "proofs_of_delivery"("dispatchId", "vehicleId");

-- AddForeignKey
ALTER TABLE "inspection_checklist_items" ADD CONSTRAINT "inspection_checklist_items_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "inspection_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_inspections" ADD CONSTRAINT "vehicle_inspections_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "inspection_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_inspections" ADD CONSTRAINT "vehicle_inspections_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "vehicle_inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_responses" ADD CONSTRAINT "inspection_responses_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "vehicle_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_responses" ADD CONSTRAINT "inspection_responses_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "inspection_checklist_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_photos" ADD CONSTRAINT "inspection_photos_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "vehicle_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_evidence" ADD CONSTRAINT "inspection_evidence_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "vehicle_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_evidence" ADD CONSTRAINT "inspection_evidence_discrepancyId_fkey" FOREIGN KEY ("discrepancyId") REFERENCES "vehicle_discrepancies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_discrepancies" ADD CONSTRAINT "vehicle_discrepancies_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "vehicle_inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discrepancy_comments" ADD CONSTRAINT "discrepancy_comments_discrepancyId_fkey" FOREIGN KEY ("discrepancyId") REFERENCES "vehicle_discrepancies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_handovers" ADD CONSTRAINT "digital_handovers_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "vehicle_inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_acknowledgements" ADD CONSTRAINT "handover_acknowledgements_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "digital_handovers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

