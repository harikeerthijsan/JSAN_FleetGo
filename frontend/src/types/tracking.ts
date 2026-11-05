export type GPSMode = "REAL" | "SIMULATED";
export interface GPSPoint {
  id: string;
  sessionId: string;
  vehicleId: string;
  tripId: string;
  mode: GPSMode;
  latitude: number | null;
  longitude: number | null;
  speedKph: number | null;
  heading: number | null;
  address: string | null;
  eta: string | null;
  gpsAt: string;
  receivedAt: string;
  quality: "VALID" | "LOW" | "NO_FIX";
  isLate: boolean;
  providerId: string;
  deviceId: string;
}
export interface TrackingTrip {
  id: string;
  reference: string;
  status: string;
  actualStartAt: string | null;
  actualArrivalAt: string | null;
  dispatch: {
    id: string;
    reference: string;
    sourceDepotId: string;
    destinationDepotId: string;
    plannedDispatchAt: string;
    expectedDeliveryAt: string;
    driver: { name: string; phone?: string };
    ticketNumber?: string;
    allocation?: { receivingOrgId: string; ticketId: string };
    vehicles?: { vehicleId: string }[];
  };
}
export interface Session {
  id: string;
  vehicleId: string;
  tripId: string;
  mode: GPSMode;
  state: string;
  latestLocation: GPSPoint | null;
  lastObservedAt: string | null;
  lastGPSAt: string | null;
  createdAt: string;
  closedAt: string | null;
  trip: TrackingTrip;
  vehicle: { id: string; vehicleCode: string; registrationNumber: string };
  signal?: string;
  signalLost?: boolean;
  motion?: string;
  markerStyle?: string;
  simulated?: boolean;
  plannedRoute?: [number, number][] | null;
  routeApprovedById?: string | null;
}
export interface TrackingSnapshot {
  mode: string;
  items: Session[];
  untracked: {
    tripId: string;
    tripReference: string;
    vehicle: { id: string; vehicleCode: string; registrationNumber: string };
  }[];
  summary: {
    activeTrips: number;
    inTransit: number;
    moving: number;
    stationary: number;
    delayedTrips: number;
    gpsOffline: number;
    completedTrips: number;
  };
  policy: { staleSeconds: number; offlineSeconds: number };
}
export interface Provider {
  id: string;
  slug: string;
  name: string;
  mode: GPSMode;
  adapter: string;
  isActive: boolean;
  credentialsConfigured: boolean;
  webhookSecretEnv?: string | null;
  apiUrlEnv?: string | null;
  apiTokenEnv?: string | null;
  lastErrorCode: string | null;
  lastErrorAt: string | null;
}
export interface Policy {
  staleSeconds: number;
  offlineSeconds: number;
  stationarySeconds: number;
  movingSpeedKph: number;
  routeDeviationMeters: number;
  approachMeters: number;
  retentionDays: number;
  alertsEnabled: boolean;
}
export interface TrackingSettings {
  policy: Policy;
  providers: Provider[];
  simulationEnabled: boolean;
  websocketPath: string;
}
export interface GPSDevice {
  id: string;
  providerId: string;
  externalId: string;
  name: string;
  status: string;
  provider: Provider;
  mappings: {
    id: string;
    vehicleId: string;
    mode: GPSMode;
    startedAt: string;
    endedAt: string | null;
  }[];
}
export interface TrackingAlert {
  id: string;
  sessionId: string;
  type: string;
  severity: string;
  description: string;
  status: string;
  createdAt: string;
  recoveredAt: string | null;
  resolutionRemarks: string | null;
  session?: { vehicleId: string; tripId: string; mode: GPSMode };
}
export interface Fence {
  id: string;
  name: string;
  kind: string;
  shape: "CIRCLE" | "POLYGON";
  centerLat: number | null;
  centerLon: number | null;
  radiusMeters: number | null;
  polygon: [number, number][] | null;
  depotId: string | null;
  organizationId: string | null;
  tripId: string | null;
  alertOnEntry: boolean;
  alertOnExit: boolean;
  isActive: boolean;
}
export interface TrackingDetails extends Session {
  fences: Fence[];
  alerts: TrackingAlert[];
  depots: { id: string; name: string }[];
  geofenceEvents: {
    id: string;
    type: string;
    gpsAt: string;
    geofence: { name: string; kind: string };
  }[];
}
