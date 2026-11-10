-- Insurance Claims (ADDITIVE ONLY).
-- A vendor reports a vehicle incident with evidence; a receiver processes it
-- with the insurer and records the outcome. No existing table is modified.

-- CreateEnum
CREATE TYPE "ClaimIncidentType" AS ENUM ('ACCIDENT', 'THEFT', 'FIRE', 'VANDALISM', 'NATURAL_DISASTER', 'THIRD_PARTY', 'OTHER');
CREATE TYPE "ClaimDamageLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "ClaimStatus" AS ENUM ('OPEN', 'WIP', 'CLOSED');
CREATE TYPE "ClaimInsuranceStatus" AS ENUM ('NOT_SUBMITTED', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'SETTLED');
CREATE TYPE "ClaimAttachmentKind" AS ENUM ('PHOTO', 'VIDEO', 'DOCUMENT');

-- CreateTable
CREATE TABLE "insurance_claims" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "organizationId" TEXT,
    "incidentType" "ClaimIncidentType" NOT NULL DEFAULT 'ACCIDENT',
    "category" TEXT,
    "incidentDate" TIMESTAMP(3),
    "city" TEXT,
    "location" TEXT,
    "damageLevel" "ClaimDamageLevel" NOT NULL DEFAULT 'MEDIUM',
    "description" TEXT NOT NULL,
    "policeComplaint" BOOLEAN NOT NULL DEFAULT false,
    "policeComplaintNumber" TEXT,
    "policeStation" TEXT,
    "status" "ClaimStatus" NOT NULL DEFAULT 'OPEN',
    "insuranceStatus" "ClaimInsuranceStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "insurerName" TEXT,
    "policyNumber" TEXT,
    "insurerClaimRef" TEXT,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "estimatedAmount" DOUBLE PRECISION,
    "approvedPercentage" DOUBLE PRECISION,
    "payableAmount" DOUBLE PRECISION,
    "reportedById" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_attachments" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "kind" "ClaimAttachmentKind" NOT NULL DEFAULT 'PHOTO',
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "caption" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_events" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "insurance_claims_reference_key" ON "insurance_claims"("reference");
CREATE UNIQUE INDEX "insurance_claims_idempotencyKey_key" ON "insurance_claims"("idempotencyKey");
CREATE INDEX "insurance_claims_vehicleId_idx" ON "insurance_claims"("vehicleId");
CREATE INDEX "insurance_claims_organizationId_idx" ON "insurance_claims"("organizationId");
CREATE INDEX "insurance_claims_status_idx" ON "insurance_claims"("status");
CREATE INDEX "claim_attachments_claimId_idx" ON "claim_attachments"("claimId");
CREATE INDEX "claim_events_claimId_idx" ON "claim_events"("claimId");

-- AddForeignKey
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "claim_attachments" ADD CONSTRAINT "claim_attachments_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "insurance_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "claim_events" ADD CONSTRAINT "claim_events_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "insurance_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;
