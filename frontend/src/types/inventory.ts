import type { Vehicle, VehicleStatus } from "./vehicle";
export interface Lookup {
  id: string;
  name: string;
  type?: string;
  makeId?: string;
}
export interface InventoryLookups {
  depots: Lookup[];
  organizations: Lookup[];
  makes: Lookup[];
  models: Lookup[];
  types: Lookup[];
  users: Lookup[];
}
export interface InventoryRecord {
  id: string;
  vehicleId: string;
  vehicle: Vehicle;
  receivedAt: string;
  receivedFromOrgId: string;
  receivingDepotId: string;
  initialCondition: string;
  currentDepotId: string;
  currentCustodianType: string;
  currentCustodianId: string;
  currentDepotName?: string;
  currentCustodianName?: string;
  odometer: number | null;
  accessories: string | null;
  remarks: string | null;
  lastMovementAt: string | null;
  updatedAt: string;
}
export interface Movement {
  id: string;
  type: string;
  fromDepotId: string | null;
  toDepotId: string;
  fromCustodianType: string | null;
  fromCustodianId: string | null;
  toCustodianType: string;
  toCustodianId: string;
  occurredAt: string;
  initiatedById: string;
  reason: string;
  reference: string | null;
  remarks: string | null;
}
export interface Reservation {
  id: string;
  vehicleId: string;
  requestingOrgId: string;
  depotId: string;
  startDate: string;
  endDate: string;
  purpose: string;
  reference: string | null;
  status: string;
  cancelReason: string | null;
}
export interface Evidence {
  movementId?: string | null;
  context?: string;
  id: string;
  fileName: string;
  contentType: string;
  createdAt: string;
}
export interface ReconciliationItem {
  id: string;
  vehicleId: string | null;
  vehicleRef: string | null;
  expectedStatus: VehicleStatus | null;
  expectedDepotId: string | null;
  observedDepotId: string | null;
  result: string;
  discrepancy: string | null;
  remarks: string | null;
}
export interface Reconciliation {
  id: string;
  scope: string;
  scopeId: string;
  status: string;
  notes: string | null;
  startedById: string;
  reviewComment: string | null;
  createdAt: string;
  updatedAt: string;
  items: ReconciliationItem[];
  photos: Evidence[];
  report: Record<string, number>;
}
export interface InventoryDetails extends InventoryRecord {
  receipt: { id: string; receivedAt: string; receivedById: string };
  reservations: Reservation[];
  movements: Movement[];
  custody: {
    id: string;
    custodianType: string;
    custodianId: string;
    fromDate: string;
    toDate: string | null;
  }[];
  adjustments: {
    id: string;
    type: string;
    fromValue: string;
    toValue: string;
    reason: string;
    createdAt: string;
  }[];
  reconciliationItems: (ReconciliationItem & {
    reconciliation: Reconciliation;
  })[];
  photos: Evidence[];
  documents: { id: string; fileName: string; kind: string }[];
  allocations: {
    id: string;
    organizationId: string;
    reference: string;
    releasedAt: string | null;
  }[];
  labels: InventoryLookups;
}
export interface InventoryDashboard {
  total: number;
  atVendors: number;
  byStatus: { label: string; count: number }[];
  byDepot: { label: string; count: number }[];
  byVendor: { label: string; count: number }[];
  byType: { label: string; count: number }[];
  movements: { label: string; count: number }[];
}
export interface ImportRow {
  row: number;
  status: string;
  errors: string[];
  input?: Record<string, unknown>;
  vehicleId?: string;
}
