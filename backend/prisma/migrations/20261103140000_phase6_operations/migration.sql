-- CreateEnum
CREATE TYPE "AllocationState" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DispatchState" AS ENUM ('PLANNED', 'READY', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TripState" AS ENUM ('PLANNED', 'READY_FOR_DISPATCH', 'DISPATCHED', 'IN_TRANSIT', 'DELAYED', 'DELIVERY_ATTEMPTED', 'DELIVERED', 'FAILED_DELIVERY', 'CANCELLED');

-- CreateTable
CREATE TABLE "vehicle_allocations" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "sourceDepotId" TEXT NOT NULL,
    "destinationDepotId" TEXT NOT NULL,
    "receivingOrgId" TEXT NOT NULL,
    "transporterId" TEXT NOT NULL,
    "plannedDispatchAt" TIMESTAMP(3) NOT NULL,
    "expectedDeliveryAt" TIMESTAMP(3) NOT NULL,
    "state" "AllocationState" NOT NULL DEFAULT 'CONFIRMED',
    "allocatedById" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_allocation_items" (
    "id" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "inventoryAllocationId" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_allocation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "licenseExpiry" TIMESTAMP(3) NOT NULL,
    "transporterId" TEXT NOT NULL,
    "userId" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatches" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "transporterId" TEXT NOT NULL,
    "sourceDepotId" TEXT NOT NULL,
    "destinationDepotId" TEXT NOT NULL,
    "destinationAddress" TEXT NOT NULL,
    "plannedDispatchAt" TIMESTAMP(3) NOT NULL,
    "expectedDeliveryAt" TIMESTAMP(3) NOT NULL,
    "transportVehicle" TEXT,
    "instructions" TEXT,
    "state" "DispatchState" NOT NULL DEFAULT 'PLANNED',
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_vehicles" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "allocationItemId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "identityVerified" BOOLEAN NOT NULL DEFAULT false,
    "registrationVerified" BOOLEAN NOT NULL DEFAULT false,
    "odometer" INTEGER,
    "fuelLevel" INTEGER,
    "accessories" TEXT,
    "keysHandedOver" BOOLEAN NOT NULL DEFAULT false,
    "documentsHandedOver" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "checkedById" TEXT,
    "checkedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "dispatch_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "status" "TripState" NOT NULL DEFAULT 'PLANNED',
    "actualStartAt" TIMESTAMP(3),
    "actualArrivalAt" TIMESTAMP(3),
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_events" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" "TripState",
    "toStatus" "TripState",
    "description" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_evidence" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "exceptionId" TEXT,
    "category" TEXT NOT NULL,
    "remarks" TEXT,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatch_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_assignments" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "transporterId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_exceptions" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reportedById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "resolutionNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operational_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_allocations_reference_key" ON "vehicle_allocations"("reference");

-- CreateIndex
CREATE INDEX "vehicle_allocations_ticketId_state_idx" ON "vehicle_allocations"("ticketId", "state");

-- CreateIndex
CREATE INDEX "vehicle_allocations_sourceDepotId_idx" ON "vehicle_allocations"("sourceDepotId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_allocation_items_inventoryAllocationId_key" ON "vehicle_allocation_items"("inventoryAllocationId");

-- CreateIndex
CREATE INDEX "vehicle_allocation_items_vehicleId_idx" ON "vehicle_allocation_items"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_allocation_items_allocationId_vehicleId_key" ON "vehicle_allocation_items"("allocationId", "vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_licenseNumber_key" ON "drivers"("licenseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_userId_key" ON "drivers"("userId");

-- CreateIndex
CREATE INDEX "drivers_transporterId_idx" ON "drivers"("transporterId");

-- CreateIndex
CREATE UNIQUE INDEX "dispatches_reference_key" ON "dispatches"("reference");

-- CreateIndex
CREATE INDEX "dispatches_allocationId_idx" ON "dispatches"("allocationId");

-- CreateIndex
CREATE INDEX "dispatches_sourceDepotId_state_idx" ON "dispatches"("sourceDepotId", "state");

-- CreateIndex
CREATE INDEX "dispatch_vehicles_allocationItemId_idx" ON "dispatch_vehicles"("allocationItemId");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_vehicles_dispatchId_vehicleId_key" ON "dispatch_vehicles"("dispatchId", "vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "trips_reference_key" ON "trips"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "trips_dispatchId_key" ON "trips"("dispatchId");

-- CreateIndex
CREATE INDEX "trips_status_idx" ON "trips"("status");

-- CreateIndex
CREATE INDEX "trip_events_tripId_occurredAt_idx" ON "trip_events"("tripId", "occurredAt");

-- CreateIndex
CREATE INDEX "dispatch_evidence_dispatchId_vehicleId_idx" ON "dispatch_evidence"("dispatchId", "vehicleId");

-- CreateIndex
CREATE INDEX "transport_assignments_dispatchId_idx" ON "transport_assignments"("dispatchId");

-- CreateIndex
CREATE INDEX "operational_exceptions_tripId_status_idx" ON "operational_exceptions"("tripId", "status");

-- AddForeignKey
ALTER TABLE "vehicle_allocations" ADD CONSTRAINT "vehicle_allocations_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_allocation_items" ADD CONSTRAINT "vehicle_allocation_items_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "vehicle_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "vehicle_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_vehicles" ADD CONSTRAINT "dispatch_vehicles_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "dispatches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_vehicles" ADD CONSTRAINT "dispatch_vehicles_allocationItemId_fkey" FOREIGN KEY ("allocationItemId") REFERENCES "vehicle_allocation_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "dispatches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_evidence" ADD CONSTRAINT "dispatch_evidence_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "dispatches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "dispatches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_exceptions" ADD CONSTRAINT "operational_exceptions_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicle_allocations" ADD CONSTRAINT "vehicle_allocations_sourceDepotId_fk" FOREIGN KEY ("sourceDepotId") REFERENCES "depots"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_allocations" ADD CONSTRAINT "vehicle_allocations_destinationDepotId_fk" FOREIGN KEY ("destinationDepotId") REFERENCES "depots"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_allocations" ADD CONSTRAINT "vehicle_allocations_receivingOrgId_fk" FOREIGN KEY ("receivingOrgId") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_allocations" ADD CONSTRAINT "vehicle_allocations_transporterId_fk" FOREIGN KEY ("transporterId") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_allocations" ADD CONSTRAINT "vehicle_allocations_allocatedById_fk" FOREIGN KEY ("allocatedById") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_allocation_items" ADD CONSTRAINT "vehicle_allocation_items_vehicleId_fk" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_allocation_items" ADD CONSTRAINT "vehicle_allocation_items_inventoryAllocationId_fk" FOREIGN KEY ("inventoryAllocationId") REFERENCES "inventory_allocations"("id") ON DELETE RESTRICT;
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_transporterId_fk" FOREIGN KEY ("transporterId") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_userId_fk" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_transporterId_fk" FOREIGN KEY ("transporterId") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_sourceDepotId_fk" FOREIGN KEY ("sourceDepotId") REFERENCES "depots"("id") ON DELETE RESTRICT;
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_destinationDepotId_fk" FOREIGN KEY ("destinationDepotId") REFERENCES "depots"("id") ON DELETE RESTRICT;
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_createdById_fk" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_confirmedById_fk" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "dispatch_vehicles" ADD CONSTRAINT "dispatch_vehicles_vehicleId_fk" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT;
ALTER TABLE "dispatch_vehicles" ADD CONSTRAINT "dispatch_vehicles_checkedById_fk" FOREIGN KEY ("checkedById") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_actorId_fk" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "dispatch_evidence" ADD CONSTRAINT "dispatch_evidence_vehicleId_fk" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT;
ALTER TABLE "dispatch_evidence" ADD CONSTRAINT "dispatch_evidence_exceptionId_fk" FOREIGN KEY ("exceptionId") REFERENCES "operational_exceptions"("id") ON DELETE RESTRICT;
ALTER TABLE "dispatch_evidence" ADD CONSTRAINT "dispatch_evidence_uploadedById_fk" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_driverId_fk" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT;
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_transporterId_fk" FOREIGN KEY ("transporterId") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_assignedById_fk" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "operational_exceptions" ADD CONSTRAINT "operational_exceptions_reportedById_fk" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "operational_exceptions" ADD CONSTRAINT "operational_exceptions_resolvedById_fk" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE RESTRICT;
CREATE UNIQUE INDEX dispatch_item_one_active ON dispatch_vehicles ("allocationItemId") WHERE "releasedAt" IS NULL;
CREATE UNIQUE INDEX ticket_step_one_order ON ticket_approvals ("ticketId", "order");
ALTER TABLE vehicle_allocations ADD CONSTRAINT allocation_dates CHECK ("expectedDeliveryAt" > "plannedDispatchAt");
ALTER TABLE dispatches ADD CONSTRAINT dispatch_dates CHECK ("expectedDeliveryAt" > "plannedDispatchAt");
ALTER TABLE dispatch_vehicles ADD CONSTRAINT dispatch_odometer CHECK (odometer IS NULL OR odometer >= 0);
ALTER TABLE dispatch_vehicles ADD CONSTRAINT dispatch_fuel CHECK ("fuelLevel" IS NULL OR "fuelLevel" BETWEEN 0 AND 100);
ALTER TABLE trips ADD CONSTRAINT trip_delay CHECK ("delayMinutes" >= 0);
CREATE TRIGGER trip_event_immutable BEFORE UPDATE OR DELETE ON trip_events FOR EACH ROW EXECUTE FUNCTION fleetgo_immutable_ledger();
CREATE TRIGGER transport_assignment_immutable BEFORE UPDATE OR DELETE ON transport_assignments FOR EACH ROW EXECUTE FUNCTION fleetgo_immutable_ledger();
