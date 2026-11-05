/** Fleet & master-data types mirroring the backend contracts. */
import type { OrganizationType } from './auth';

export type VehicleStatus =
  | 'REGISTERED'
  | 'RECEIVED'
  | 'AVAILABLE'
  | 'RESERVED'
  | 'ALLOCATED'
  | 'DISPATCHED'
  | 'AT_VENDOR'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'UNDER_MAINTENANCE'
  | 'DAMAGED'
  | 'RETURNED'
  | 'INACTIVE';

export const VEHICLE_STATUSES: VehicleStatus[] = [
  'REGISTERED', 'RECEIVED', 'AVAILABLE', 'RESERVED', 'ALLOCATED', 'DISPATCHED',
  'AT_VENDOR', 'IN_TRANSIT', 'DELIVERED', 'UNDER_MAINTENANCE', 'DAMAGED', 'RETURNED', 'INACTIVE',
];

interface Ref {
  id: string;
  name: string;
}

export interface Vehicle {
  id: string;
  vehicleCode: string;
  registrationNumber: string;
  vin: string | null;
  engineNumber: string | null;
  make: Ref | null;
  model: (Ref & { variant: string | null }) | null;
  type: Ref | null;
  category: Ref | null;
  fuelType: Ref | null;
  ownershipType: Ref | null;
  organization: { id: string; name: string; type: OrganizationType } | null;
  vendor: { id: string; name: string; type: OrganizationType } | null;
  depot: { id: string; name: string; code: string } | null;
  manufacturingYear: number | null;
  color: string | null;
  insuranceProvider: string | null;
  insurancePolicyNumber: string | null;
  insuranceExpiry: string | null;
  registrationCertNumber: string | null;
  registrationExpiry: string | null;
  status: VehicleStatus;
  remarks: string | null;
  metadata: Record<string, unknown> | null;
  isActive: boolean;
  createdBy: { id: string; fullName: string; email: string } | null;
  createdAt: string;
  updatedAt: string;
  _count?: { documents: number };
}

export interface FleetStats {
  total: number;
  active: number;
  byStatus: { status: VehicleStatus; count: number }[];
  byType: { label: string; count: number }[];
  byLocation: { label: string; count: number }[];
}

export interface VehicleDocument {
  id: string;
  kind: 'DOCUMENT' | 'PHOTO';
  documentType: Ref | null;
  label: string | null;
  fileName: string;
  contentType: string;
  size: number;
  isSensitive: boolean;
  uploadedBy: { id: string; fullName: string } | null;
  createdAt: string;
}

export interface VehicleHistory {
  statusHistory: {
    id: string;
    fromStatus: VehicleStatus | null;
    toStatus: VehicleStatus;
    reason: string | null;
    changedBy: { id: string; fullName: string } | null;
    createdAt: string;
  }[];
  auditLogs: {
    id: string;
    action: string;
    metadata: Record<string, unknown> | null;
    actor: { id: string; fullName: string } | null;
    createdAt: string;
  }[];
}

/** Generic master-data record (lookups). */
export interface MasterRecord {
  id: string;
  name: string;
  isActive?: boolean;
  status?: 'ACTIVE' | 'INACTIVE';
  // model-specific
  variant?: string | null;
  makeId?: string;
  make?: Ref | null;
  // type-specific
  categoryId?: string | null;
  category?: Ref | null;
  // document-type
  category_?: string;
  // depot-specific
  code?: string;
  region?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  createdAt?: string;
}
