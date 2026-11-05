-- Phase 9 — Dashboard & Reporting (ADDITIVE ONLY).
-- Generated via prisma migrate diff, hand-filtered to drop spurious
-- DropForeignKey/DropIndex lines emitted for pre-existing tables whose
-- named constraints are intentionally not modelled as relations.

-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('CSV', 'XLSX', 'PDF', 'JSON');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ScheduleFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "saved_reports" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "filters" JSONB,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "organizationId" TEXT,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_exports" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "format" "ReportFormat" NOT NULL,
    "filters" JSONB,
    "rowCount" INTEGER,
    "status" "ExportStatus" NOT NULL DEFAULT 'COMPLETED',
    "error" TEXT,
    "savedReportId" TEXT,
    "scheduledId" TEXT,
    "requestedById" TEXT NOT NULL,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_reports" (
    "id" TEXT NOT NULL,
    "savedReportId" TEXT NOT NULL,
    "frequency" "ScheduleFrequency" NOT NULL,
    "format" "ReportFormat" NOT NULL DEFAULT 'XLSX',
    "recipientIds" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" "ExportStatus",
    "lastError" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_reports_ownerId_idx" ON "saved_reports"("ownerId");

-- CreateIndex
CREATE INDEX "saved_reports_organizationId_idx" ON "saved_reports"("organizationId");

-- CreateIndex
CREATE INDEX "report_exports_requestedById_idx" ON "report_exports"("requestedById");

-- CreateIndex
CREATE INDEX "report_exports_organizationId_idx" ON "report_exports"("organizationId");

-- CreateIndex
CREATE INDEX "report_exports_createdAt_idx" ON "report_exports"("createdAt");

-- CreateIndex
CREATE INDEX "scheduled_reports_savedReportId_idx" ON "scheduled_reports"("savedReportId");

-- CreateIndex
CREATE INDEX "scheduled_reports_isActive_idx" ON "scheduled_reports"("isActive");

-- AddForeignKey
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_savedReportId_fkey" FOREIGN KEY ("savedReportId") REFERENCES "saved_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

