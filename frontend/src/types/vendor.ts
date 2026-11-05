/**
 * Phase 11 — Vendor Management client types. A vendor is an Organization of type
 * VEHICLE_VENDOR or TRANSPORT_PARTNER; these shape the vendor workspace. The
 * backend remains the source of truth and re-validates/re-scopes every request.
 */

export const VENDOR_TYPES = ["VEHICLE_VENDOR", "TRANSPORT_PARTNER"] as const;
export type VendorType = (typeof VENDOR_TYPES)[number];
export type VendorStatus = "ACTIVE" | "INACTIVE";

export interface VendorProfile {
  id: string;
  code: string;
  registrationNumber: string | null;
  category: string | null;
  addressLine: string | null;
  city: string | null;
  region: string | null;
  website: string | null;
  onboardedAt: string | null;
  notes: string | null;
}

export interface VendorContact {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}

export interface VendorLocation {
  id: string;
  label: string;
  addressLine: string | null;
  city: string | null;
  region: string | null;
  contactName: string | null;
  contactPhone: string | null;
  isPrimary: boolean;
}

export interface VendorUser {
  id: string;
  fullName: string;
  email: string;
  status: string;
  role: { name: string; displayName: string } | null;
}

export interface VendorSummary {
  assignedVehicles: number;
  custodyVehicles: number;
  disksInCustody: number;
  allocations: number;
  dispatches: number;
  inspections: number;
  openTickets: number;
  users: number;
}

export interface VendorListItem {
  id: string;
  name: string;
  type: VendorType;
  status: VendorStatus;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  vendorProfile: { code: string; category: string | null } | null;
  _count?: { users: number; vendorVehicles: number; vendorLocations: number };
}

export type VendorDocumentCategory = "CONSENT" | "AGREEMENT" | "OTHER";

export interface VendorDocument {
  id: string;
  category: VendorDocumentCategory;
  title: string;
  fileName: string;
  contentType: string;
  size: number;
  createdAt: string;
}

export interface VendorDetail extends VendorListItem {
  vendorProfile: (VendorProfile & { code: string; category: string | null }) | null;
  vendorContacts: VendorContact[];
  vendorLocations: VendorLocation[];
  vendorDocuments: VendorDocument[];
  users: VendorUser[];
  summary: VendorSummary;
}

export interface VendorLookups {
  types: readonly VendorType[];
  statuses: readonly VendorStatus[];
  canManage: boolean;
}

export interface VendorVehicle {
  id: string;
  vehicleCode: string;
  registrationNumber: string | null;
  status: string;
  organizationId: string | null;
  vendorId: string | null;
}

export interface VendorDisk {
  id: string;
  diskCode: string;
  serialNumber: string;
  status: string;
  mediaType: string;
}

export interface VendorListFilters {
  type?: string;
  status?: string;
  search?: string;
}
