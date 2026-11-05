-- CreateEnum
CREATE TYPE "TrackingMode" AS ENUM ('REAL', 'SIMULATED');

-- CreateTable
CREATE TABLE "gps_providers" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "TrackingMode" NOT NULL,
    "adapter" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "webhookSecretEnv" TEXT,
    "apiUrlEnv" TEXT,
    "apiTokenEnv" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gps_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gps_devices" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gps_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_gps_mappings" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "mode" "TrackingMode" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,

    CONSTRAINT "vehicle_gps_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_sessions" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "mode" "TrackingMode" NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "latestLocationId" TEXT,
    "lastObservedAt" TIMESTAMP(3),
    "lastGPSAt" TIMESTAMP(3),
    "signalLost" BOOLEAN NOT NULL DEFAULT false,
    "stationarySince" TIMESTAMP(3),
    "plannedRoute" JSONB,
    "routeApprovedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "tracking_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gps_locations" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "mode" "TrackingMode" NOT NULL,
    "eventId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "speedKph" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "address" TEXT,
    "eta" TIMESTAMP(3),
    "gpsAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quality" TEXT NOT NULL,
    "isLate" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "gps_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_alerts" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "conditionKey" TEXT NOT NULL DEFAULT 'default',
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionRemarks" TEXT,
    "recoveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geofences" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "shape" TEXT NOT NULL,
    "centerLat" DOUBLE PRECISION,
    "centerLon" DOUBLE PRECISION,
    "radiusMeters" DOUBLE PRECISION,
    "polygon" JSONB,
    "depotId" TEXT,
    "organizationId" TEXT,
    "tripId" TEXT,
    "alertOnEntry" BOOLEAN NOT NULL DEFAULT true,
    "alertOnExit" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geofences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geofence_events" (
    "id" TEXT NOT NULL,
    "geofenceId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "gpsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geofence_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geofence_states" (
    "id" TEXT NOT NULL,
    "geofenceId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "inside" BOOLEAN NOT NULL,
    "revision" INTEGER NOT NULL,
    "gpsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geofence_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_policy" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "staleSeconds" INTEGER NOT NULL DEFAULT 120,
    "offlineSeconds" INTEGER NOT NULL DEFAULT 300,
    "stationarySeconds" INTEGER NOT NULL DEFAULT 600,
    "movingSpeedKph" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "routeDeviationMeters" INTEGER NOT NULL DEFAULT 300,
    "approachMeters" INTEGER NOT NULL DEFAULT 500,
    "retentionDays" INTEGER NOT NULL DEFAULT 90,
    "alertsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracking_policy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gps_providers_slug_key" ON "gps_providers"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "gps_devices_providerId_externalId_key" ON "gps_devices"("providerId", "externalId");

-- CreateIndex
CREATE INDEX "vehicle_gps_mappings_vehicleId_startedAt_idx" ON "vehicle_gps_mappings"("vehicleId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_sessions_latestLocationId_key" ON "tracking_sessions"("latestLocationId");

-- CreateIndex
CREATE INDEX "tracking_sessions_state_mode_idx" ON "tracking_sessions"("state", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_sessions_tripId_vehicleId_mode_key" ON "tracking_sessions"("tripId", "vehicleId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "gps_locations_fingerprint_key" ON "gps_locations"("fingerprint");

-- CreateIndex
CREATE INDEX "gps_locations_sessionId_gpsAt_id_idx" ON "gps_locations"("sessionId", "gpsAt", "id");

-- CreateIndex
CREATE INDEX "gps_locations_vehicleId_gpsAt_idx" ON "gps_locations"("vehicleId", "gpsAt");

-- CreateIndex
CREATE INDEX "gps_locations_receivedAt_idx" ON "gps_locations"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "gps_locations_providerId_eventId_key" ON "gps_locations"("providerId", "eventId");

-- CreateIndex
CREATE INDEX "tracking_alerts_sessionId_status_idx" ON "tracking_alerts"("sessionId", "status");

-- CreateIndex
CREATE INDEX "tracking_alerts_status_createdAt_idx" ON "tracking_alerts"("status", "createdAt");

-- CreateIndex
CREATE INDEX "geofences_tripId_isActive_idx" ON "geofences"("tripId", "isActive");

-- CreateIndex
CREATE INDEX "geofences_depotId_idx" ON "geofences"("depotId");

-- CreateIndex
CREATE INDEX "geofence_events_sessionId_gpsAt_idx" ON "geofence_events"("sessionId", "gpsAt");

-- CreateIndex
CREATE UNIQUE INDEX "geofence_states_sessionId_geofenceId_key" ON "geofence_states"("sessionId", "geofenceId");

-- AddForeignKey
ALTER TABLE "gps_devices" ADD CONSTRAINT "gps_devices_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "gps_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_gps_mappings" ADD CONSTRAINT "vehicle_gps_mappings_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "gps_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_sessions" ADD CONSTRAINT "tracking_sessions_latestLocationId_fkey" FOREIGN KEY ("latestLocationId") REFERENCES "gps_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_locations" ADD CONSTRAINT "gps_locations_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "tracking_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_locations" ADD CONSTRAINT "gps_locations_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "gps_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_locations" ADD CONSTRAINT "gps_locations_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "gps_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_alerts" ADD CONSTRAINT "tracking_alerts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "tracking_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_geofenceId_fkey" FOREIGN KEY ("geofenceId") REFERENCES "geofences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "tracking_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofence_states" ADD CONSTRAINT "geofence_states_geofenceId_fkey" FOREIGN KEY ("geofenceId") REFERENCES "geofences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofence_states" ADD CONSTRAINT "geofence_states_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "tracking_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicle_gps_mappings" ADD CONSTRAINT "vehicle_gps_mappings_vehicleId_fk" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_gps_mappings" ADD CONSTRAINT "vehicle_gps_mappings_createdById_fk" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "tracking_sessions" ADD CONSTRAINT "tracking_sessions_vehicleId_fk" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT;
ALTER TABLE "tracking_sessions" ADD CONSTRAINT "tracking_sessions_tripId_fk" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE RESTRICT;
ALTER TABLE "tracking_sessions" ADD CONSTRAINT "tracking_sessions_routeApprovedById_fk" FOREIGN KEY ("routeApprovedById") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "gps_locations" ADD CONSTRAINT "gps_locations_vehicleId_fk" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT;
ALTER TABLE "gps_locations" ADD CONSTRAINT "gps_locations_tripId_fk" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE RESTRICT;
ALTER TABLE "tracking_alerts" ADD CONSTRAINT "tracking_alerts_acknowledgedById_fk" FOREIGN KEY ("acknowledgedById") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "tracking_alerts" ADD CONSTRAINT "tracking_alerts_resolvedById_fk" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "geofences" ADD CONSTRAINT "geofences_depotId_fk" FOREIGN KEY ("depotId") REFERENCES "depots"("id") ON DELETE RESTRICT;
ALTER TABLE "geofences" ADD CONSTRAINT "geofences_organizationId_fk" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "geofences" ADD CONSTRAINT "geofences_tripId_fk" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE RESTRICT;
ALTER TABLE "geofences" ADD CONSTRAINT "geofences_createdById_fk" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT;
CREATE UNIQUE INDEX gps_one_active_device_mapping ON vehicle_gps_mappings ("deviceId") WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX gps_one_active_vehicle_mode ON vehicle_gps_mappings ("vehicleId",mode) WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX tracking_alert_one_unresolved ON tracking_alerts ("sessionId",type,"conditionKey") WHERE status IN ('OPEN','ACKNOWLEDGED');
ALTER TABLE gps_locations ADD CONSTRAINT gps_coordinates CHECK ((latitude IS NULL)=(longitude IS NULL) AND (latitude IS NULL OR latitude BETWEEN -90 AND 90) AND (longitude IS NULL OR longitude BETWEEN -180 AND 180));
ALTER TABLE gps_locations ADD CONSTRAINT gps_motion CHECK (("speedKph" IS NULL OR "speedKph" BETWEEN 0 AND 500) AND (heading IS NULL OR (heading>=0 AND heading<360)));
ALTER TABLE gps_locations ADD CONSTRAINT gps_quality CHECK (quality IN ('VALID','LOW','NO_FIX'));
ALTER TABLE tracking_policy ADD CONSTRAINT tracking_thresholds CHECK ("offlineSeconds">"staleSeconds" AND "staleSeconds">=5 AND "stationarySeconds">=5 AND "retentionDays">=1);
CREATE TRIGGER gps_location_immutable BEFORE UPDATE ON gps_locations FOR EACH ROW EXECUTE FUNCTION fleetgo_immutable_ledger();
CREATE TRIGGER geofence_event_immutable BEFORE UPDATE OR DELETE ON geofence_events FOR EACH ROW EXECUTE FUNCTION fleetgo_immutable_ledger();
