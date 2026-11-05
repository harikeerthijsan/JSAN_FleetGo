-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('NEW_VEHICLE', 'DELIVERY', 'PICKUP', 'TRANSFER', 'RETURN', 'MAINTENANCE', 'DAMAGE_INCIDENT', 'REPLACEMENT', 'GENERAL');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'INFO_REQUIRED', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'INFO_REQUESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED', 'INFO_REQUESTED');

-- CreateEnum
CREATE TYPE "ApprovalStepState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'INFO_REQUESTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TICKET_SUBMITTED', 'APPROVAL_REQUIRED', 'TICKET_APPROVED', 'TICKET_REJECTED', 'INFO_REQUESTED', 'TICKET_ASSIGNED', 'TICKET_REASSIGNED', 'TICKET_COMMENT', 'TICKET_OVERDUE', 'TICKET_STATUS_CHANGED', 'TICKET_COMPLETED');

-- DropForeignKey
ALTER TABLE "inventory_adjustments" DROP CONSTRAINT "inventory_adjustments_approvedById_fk";

-- DropForeignKey
ALTER TABLE "inventory_adjustments" DROP CONSTRAINT "inventory_adjustments_reconciliationId_fk";

-- DropForeignKey
ALTER TABLE "inventory_adjustments" DROP CONSTRAINT "inventory_adjustments_vehicleId_fk";

-- DropForeignKey
ALTER TABLE "inventory_allocations" DROP CONSTRAINT "inventory_allocations_allocatedById_fk";

-- DropForeignKey
ALTER TABLE "inventory_allocations" DROP CONSTRAINT "inventory_allocations_organizationId_fk";

-- DropForeignKey
ALTER TABLE "inventory_allocations" DROP CONSTRAINT "inventory_allocations_vehicleId_fk";

-- DropForeignKey
ALTER TABLE "inventory_operations" DROP CONSTRAINT "inventory_operations_actorId_fk";

-- DropForeignKey
ALTER TABLE "inventory_photos" DROP CONSTRAINT "inventory_photos_movementId_fk";

-- DropForeignKey
ALTER TABLE "inventory_photos" DROP CONSTRAINT "inventory_photos_reconciliationItemId_fk";

-- DropForeignKey
ALTER TABLE "inventory_photos" DROP CONSTRAINT "inventory_photos_uploadedById_fk";

-- DropForeignKey
ALTER TABLE "inventory_photos" DROP CONSTRAINT "inventory_photos_vehicleId_fk";

-- DropForeignKey
ALTER TABLE "inventory_reconciliations" DROP CONSTRAINT "inventory_reconciliations_reviewedById_fk";

-- DropForeignKey
ALTER TABLE "inventory_reconciliations" DROP CONSTRAINT "inventory_reconciliations_startedById_fk";

-- DropForeignKey
ALTER TABLE "reconciliation_items" DROP CONSTRAINT "reconciliation_items_expectedDepotId_fk";

-- DropForeignKey
ALTER TABLE "reconciliation_items" DROP CONSTRAINT "reconciliation_items_observedDepotId_fk";

-- DropForeignKey
ALTER TABLE "reconciliation_items" DROP CONSTRAINT "reconciliation_items_vehicleId_fk";

-- DropForeignKey
ALTER TABLE "vehicle_custody" DROP CONSTRAINT "vehicle_custody_createdById_fk";

-- DropForeignKey
ALTER TABLE "vehicle_custody" DROP CONSTRAINT "vehicle_custody_movementId_fk";

-- DropForeignKey
ALTER TABLE "vehicle_custody" DROP CONSTRAINT "vehicle_custody_vehicleId_fk";

-- DropForeignKey
ALTER TABLE "vehicle_inventory" DROP CONSTRAINT "vehicle_inventory_activeReservationId_fk";

-- DropForeignKey
ALTER TABLE "vehicle_inventory" DROP CONSTRAINT "vehicle_inventory_currentDepotId_fk";

-- DropForeignKey
ALTER TABLE "vehicle_inventory" DROP CONSTRAINT "vehicle_inventory_lastMovementId_fk";

-- DropForeignKey
ALTER TABLE "vehicle_inventory" DROP CONSTRAINT "vehicle_inventory_receiptId_fk";

-- DropForeignKey
ALTER TABLE "vehicle_inventory" DROP CONSTRAINT "vehicle_inventory_receivedFromOrgId_fk";

-- DropForeignKey
ALTER TABLE "vehicle_inventory" DROP CONSTRAINT "vehicle_inventory_receivingDepotId_fk";

-- DropForeignKey
ALTER TABLE "vehicle_movements" DROP CONSTRAINT "vehicle_movements_fromDepotId_fk";

-- DropForeignKey
ALTER TABLE "vehicle_movements" DROP CONSTRAINT "vehicle_movements_initiatedById_fk";

-- DropForeignKey
ALTER TABLE "vehicle_movements" DROP CONSTRAINT "vehicle_movements_toDepotId_fk";

-- DropForeignKey
ALTER TABLE "vehicle_movements" DROP CONSTRAINT "vehicle_movements_vehicleId_fk";

-- DropForeignKey
ALTER TABLE "vehicle_receipts" DROP CONSTRAINT "vehicle_receipts_receivedById_fk";

-- DropForeignKey
ALTER TABLE "vehicle_receipts" DROP CONSTRAINT "vehicle_receipts_receivedFromOrgId_fk";

-- DropForeignKey
ALTER TABLE "vehicle_receipts" DROP CONSTRAINT "vehicle_receipts_receivingDepotId_fk";

-- DropForeignKey
ALTER TABLE "vehicle_receipts" DROP CONSTRAINT "vehicle_receipts_vehicleId_fk";

-- DropForeignKey
ALTER TABLE "vehicle_reservations" DROP CONSTRAINT "vehicle_reservations_createdById_fk";

-- DropForeignKey
ALTER TABLE "vehicle_reservations" DROP CONSTRAINT "vehicle_reservations_depotId_fk";

-- DropForeignKey
ALTER TABLE "vehicle_reservations" DROP CONSTRAINT "vehicle_reservations_requestingOrgId_fk";

-- DropForeignKey
ALTER TABLE "vehicle_reservations" DROP CONSTRAINT "vehicle_reservations_vehicleId_fk";

-- CreateTable
CREATE TABLE "ticket_type_configs" (
    "id" TEXT NOT NULL,
    "type" "TicketType" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "defaultWorkflowId" TEXT,
    "requiresInventory" BOOLEAN NOT NULL DEFAULT false,
    "requiresVehicle" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_type_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_workflows" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ticketType" "TicketType",
    "organizationType" "OrganizationType",
    "allowSelfApproval" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_workflow_steps" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "approverRoleName" TEXT NOT NULL,
    "slaHours" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "type" "TicketType" NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "requesterId" TEXT NOT NULL,
    "requestingOrgId" TEXT,
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requiredDate" TIMESTAMP(3),
    "sourceDepotId" TEXT,
    "destinationDepotId" TEXT,
    "requestedTypeId" TEXT,
    "requestedQuantity" INTEGER,
    "vehicleId" TEXT,
    "details" JSONB,
    "status" "TicketStatus" NOT NULL DEFAULT 'DRAFT',
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "workflowId" TEXT,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "assignedToId" TEXT,
    "assignedTeam" TEXT,
    "approvalDueAt" TIMESTAMP(3),
    "resolutionDueAt" TIMESTAMP(3),
    "firstApprovalAt" TIMESTAMP(3),
    "finalApprovalAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_approvals" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "stepName" TEXT NOT NULL,
    "approverRoleName" TEXT NOT NULL,
    "assignedApproverId" TEXT,
    "state" "ApprovalStepState" NOT NULL DEFAULT 'PENDING',
    "decision" "ApprovalDecision",
    "decidedById" TEXT,
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "slaDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_comments" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_attachments" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_assignments" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "assignedToId" TEXT,
    "assignedTeam" TEXT,
    "assignedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_activities" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_slas" (
    "id" TEXT NOT NULL,
    "ticketType" "TicketType" NOT NULL,
    "priority" "TicketPriority" NOT NULL,
    "firstApprovalHours" INTEGER,
    "resolutionHours" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_slas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "ticketId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_type_configs_type_key" ON "ticket_type_configs"("type");

-- CreateIndex
CREATE INDEX "approval_workflows_ticketType_idx" ON "approval_workflows"("ticketType");

-- CreateIndex
CREATE INDEX "approval_workflow_steps_workflowId_idx" ON "approval_workflow_steps"("workflowId");

-- CreateIndex
CREATE UNIQUE INDEX "approval_workflow_steps_workflowId_order_key" ON "approval_workflow_steps"("workflowId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_ticketNumber_key" ON "tickets"("ticketNumber");

-- CreateIndex
CREATE INDEX "tickets_status_idx" ON "tickets"("status");

-- CreateIndex
CREATE INDEX "tickets_approvalStatus_idx" ON "tickets"("approvalStatus");

-- CreateIndex
CREATE INDEX "tickets_type_idx" ON "tickets"("type");

-- CreateIndex
CREATE INDEX "tickets_requesterId_idx" ON "tickets"("requesterId");

-- CreateIndex
CREATE INDEX "tickets_requestingOrgId_idx" ON "tickets"("requestingOrgId");

-- CreateIndex
CREATE INDEX "tickets_assignedToId_idx" ON "tickets"("assignedToId");

-- CreateIndex
CREATE INDEX "tickets_vehicleId_idx" ON "tickets"("vehicleId");

-- CreateIndex
CREATE INDEX "ticket_approvals_ticketId_order_idx" ON "ticket_approvals"("ticketId", "order");

-- CreateIndex
CREATE INDEX "ticket_comments_ticketId_idx" ON "ticket_comments"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_attachments_ticketId_idx" ON "ticket_attachments"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_assignments_ticketId_idx" ON "ticket_assignments"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_activities_ticketId_idx" ON "ticket_activities"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_slas_ticketType_priority_key" ON "ticket_slas"("ticketType", "priority");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_ticketId_idx" ON "notifications"("ticketId");

-- AddForeignKey
ALTER TABLE "approval_workflow_steps" ADD CONSTRAINT "approval_workflow_steps_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "approval_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_approvals" ADD CONSTRAINT "ticket_approvals_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_assignments" ADD CONSTRAINT "ticket_assignments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_activities" ADD CONSTRAINT "ticket_activities_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
