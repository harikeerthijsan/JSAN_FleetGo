/**
 * Phase 10 — Disk / Media Logistics client types. Mirror the backend Prisma
 * models (`Disk`, `DiskShipment`, `DiskReconciliation`, `DiskDiscrepancy`, …)
 * and the `disk.validators` enums. The backend remains the source of truth and
 * re-validates every request; these types only shape the UI.
 */

export const DISK_MEDIA_TYPES = ["HDD", "SSD", "TAPE", "OPTICAL", "FLASH", "OTHER"] as const;
export type DiskMediaType = (typeof DISK_MEDIA_TYPES)[number];

export const DISK_STATUSES = [
  "RECEIVED",
  "AVAILABLE",
  "RESERVED",
  "PACKED",
  "DISPATCHED",
  "IN_TRANSIT",
  "DELIVERED",
  "AT_VENDOR",
  "RETURNED",
  "DAMAGED",
  "LOST",
  "UNDER_INSPECTION",
  "INACTIVE",
] as const;
export type DiskStatus = (typeof DISK_STATUSES)[number];

export const DISK_CUSTODIAN_TYPES = ["DEPOT", "VENDOR", "ORGANIZATION", "TRANSPORTER", "USER"] as const;
export type DiskCustodianType = (typeof DISK_CUSTODIAN_TYPES)[number];

export const DISK_SHIPMENT_TYPES = [
  "CTS_TO_DEPOT",
  "DEPOT_TO_VENDOR",
  "VENDOR_TO_DEPOT",
  "DEPOT_TO_CTS",
  "VENDOR_TO_VENDOR",
  "RETURN",
] as const;
export type DiskShipmentType = (typeof DISK_SHIPMENT_TYPES)[number];

export const DISK_SHIPMENT_STATUSES = [
  "PLANNED",
  "READY",
  "DISPATCHED",
  "IN_TRANSIT",
  "DELIVERED",
  "CANCELLED",
  "EXCEPTION",
] as const;
export type DiskShipmentStatus = (typeof DISK_SHIPMENT_STATUSES)[number];

export const DISK_DISCREPANCY_CATEGORIES = [
  "MISSING",
  "DAMAGED",
  "UNACCOUNTED",
  "WRONG_LOCATION",
  "WRONG_CUSTODIAN",
  "SERIAL_MISMATCH",
  "OTHER",
] as const;
export type DiskDiscrepancyCategory = (typeof DISK_DISCREPANCY_CATEGORIES)[number];

export const DISK_DISCREPANCY_SEVERITIES = ["MINOR", "MODERATE", "MAJOR", "CRITICAL"] as const;
export type DiskDiscrepancySeverity = (typeof DISK_DISCREPANCY_SEVERITIES)[number];

export const DISK_DISCREPANCY_STATUSES = [
  "REPORTED",
  "UNDER_REVIEW",
  "CONFIRMED",
  "DISPUTED",
  "RESOLVED",
  "CLOSED",
] as const;
export type DiskDiscrepancyStatus = (typeof DISK_DISCREPANCY_STATUSES)[number];

export const DISK_RECONCILIATION_SCOPES = ["DEPOT", "VENDOR", "ORGANIZATION"] as const;
export type DiskReconciliationScope = (typeof DISK_RECONCILIATION_SCOPES)[number];

export const DISK_RECONCILIATION_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] as const;
export type DiskReconciliationStatus = (typeof DISK_RECONCILIATION_STATUSES)[number];

export const DISK_RECONCILIATION_RESULTS = [
  "PENDING",
  "VERIFIED",
  "MISSING",
  "MISPLACED",
  "DAMAGED",
  "UNACCOUNTED",
] as const;
export type DiskReconciliationResult = (typeof DISK_RECONCILIATION_RESULTS)[number];

export const DISK_INSPECTION_TYPES = ["RECEIPT", "PRE_DISPATCH", "RECEIVING", "RECONCILIATION"] as const;
export type DiskInspectionType = (typeof DISK_INSPECTION_TYPES)[number];

export interface DiskInventory {
  id: string;
  inInventory: boolean;
  receivedAt: string | null;
  receivingDepotId: string | null;
  currentDepotId: string | null;
  currentLocation: string | null;
  currentCustodianType: DiskCustodianType | null;
  currentCustodianId: string | null;
  activeShipmentId: string | null;
  lastMovementAt: string | null;
}

export interface Disk {
  id: string;
  diskCode: string;
  serialNumber: string;
  mediaType: DiskMediaType;
  capacity: string | null;
  make: string | null;
  model: string | null;
  condition: string | null;
  sourceOrgId: string | null;
  status: DiskStatus;
  remarks: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  inventory?: DiskInventory | null;
}

export interface DiskMovement {
  id: string;
  type: string;
  shipmentId: string | null;
  fromDepotId: string | null;
  toDepotId: string | null;
  fromCustodianType: DiskCustodianType | null;
  fromCustodianId: string | null;
  toCustodianType: DiskCustodianType | null;
  toCustodianId: string | null;
  occurredAt: string;
  reference: string | null;
  reason: string | null;
}

export interface DiskCustody {
  id: string;
  custodianType: DiskCustodianType;
  custodianId: string;
  location: string | null;
  depotId: string | null;
  fromDate: string;
  toDate: string | null;
  shipmentId: string | null;
  acknowledged: boolean;
}

export interface DiskShipmentItem {
  id: string;
  diskId: string;
  status: string;
  dispatchVerified: boolean;
  dispatchCondition: string | null;
  receivedVerified: boolean;
  receivedCondition: string | null;
  disk?: Pick<Disk, "id" | "diskCode" | "serialNumber" | "status" | "mediaType">;
}

export interface DiskShipment {
  id: string;
  reference: string;
  type: DiskShipmentType;
  status: DiskShipmentStatus;
  ticketId: string | null;
  sourceOrgId: string | null;
  sourceDepotId: string | null;
  destinationOrgId: string | null;
  destinationDepotId: string | null;
  transporterId: string | null;
  driverId: string | null;
  plannedDispatchAt: string | null;
  expectedDeliveryAt: string | null;
  trackingReference: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  remarks: string | null;
  exception: string | null;
  createdAt: string;
  items?: DiskShipmentItem[];
}

export interface DiskDiscrepancy {
  id: string;
  reference: string;
  diskId: string | null;
  shipmentId: string | null;
  reconciliationId: string | null;
  category: DiskDiscrepancyCategory;
  description: string;
  severity: DiskDiscrepancySeverity;
  status: DiskDiscrepancyStatus;
  resolutionRemarks: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface DiskReconciliationItem {
  id: string;
  diskId: string | null;
  diskRef: string | null;
  result: DiskReconciliationResult;
  observedDepotId: string | null;
  observedCustodianId: string | null;
  discrepancy: string | null;
  remarks: string | null;
}

export interface DiskReconciliation {
  id: string;
  reference: string;
  scope: DiskReconciliationScope;
  scopeId: string;
  status: DiskReconciliationStatus;
  notes: string | null;
  submittedAt: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  createdAt: string;
  items?: DiskReconciliationItem[];
}

export interface DiskDashboard {
  totalDisks: number;
  available: number;
  reserved: number;
  dispatched: number;
  inTransit: number;
  delivered: number;
  atVendor: number;
  returned: number;
  damaged: number;
  lost: number;
  openShipmentExceptions: number;
  byStatus: Record<string, number>;
}

export interface DiskNamedRef {
  id: string;
  name: string;
  code?: string;
  type?: string;
}

export interface DiskLookups {
  canManage: boolean;
  canReview: boolean;
  depots: DiskNamedRef[];
  organizations: DiskNamedRef[];
  vendors: DiskNamedRef[];
  transporters: DiskNamedRef[];
  mediaTypes: readonly string[];
  statuses: readonly string[];
  shipmentTypes: readonly string[];
}

export interface DiskListFilters {
  status?: string;
  mediaType?: string;
  depotId?: string;
  vendorId?: string;
  search?: string;
  sort?: string;
}
