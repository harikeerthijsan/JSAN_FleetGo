/**
 * Insurance Claims client types. The backend re-validates and re-scopes every
 * request; these only shape the UI.
 */

export const INCIDENT_TYPES = ["ACCIDENT", "THEFT", "FIRE", "VANDALISM", "NATURAL_DISASTER", "THIRD_PARTY", "OTHER"] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const DAMAGE_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type DamageLevel = (typeof DAMAGE_LEVELS)[number];

export const CLAIM_STATUSES = ["OPEN", "WIP", "CLOSED"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const INSURANCE_STATUSES = ["NOT_SUBMITTED", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "PARTIALLY_APPROVED", "REJECTED", "SETTLED"] as const;
export type InsuranceStatus = (typeof INSURANCE_STATUSES)[number];

export interface ClaimVehicleRef {
  id: string;
  vehicleCode: string;
  registrationNumber: string | null;
  status?: string;
}

export interface ClaimAttachment {
  id: string;
  kind: "PHOTO" | "VIDEO" | "DOCUMENT";
  fileName: string;
  contentType: string;
  size: number;
  caption: string | null;
  createdAt: string;
}

export interface ClaimEvent {
  id: string;
  type: string;
  note: string | null;
  createdAt: string;
}

export interface ClaimThirdParty {
  type: 'TWO_WHEELER' | 'CAR' | 'COMMERCIAL_VEHICLE' | 'OTHER_VEHICLE' | 'PEDESTRIAN' | 'PROPERTY' | 'OTHER';
  name: string;
  phone: string;
  address?: string;
  registrationNumber?: string;
  damageDescription: string;
  insurerName?: string;
  policyNumber?: string;
}

export interface InsuranceClaim {
  thirdParties?: ClaimThirdParty[];
  id: string;
  reference: string;
  vehicleId: string;
  organizationId: string | null;
  incidentType: IncidentType;
  category: string | null;
  incidentDate: string | null;
  city: string | null;
  location: string | null;
  damageLevel: DamageLevel;
  description: string;
  policeComplaint: boolean;
  policeComplaintNumber: string | null;
  policeStation: string | null;
  status: ClaimStatus;
  insuranceStatus: InsuranceStatus;
  insurerName: string | null;
  policyNumber: string | null;
  insurerClaimRef: string | null;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  currency: string;
  estimatedAmount: number | null;
  approvedPercentage: number | null;
  payableAmount: number | null;
  createdAt: string;
  updatedAt: string;
  vehicle?: ClaimVehicleRef;
  attachments?: ClaimAttachment[];
  events?: ClaimEvent[];
  _count?: { attachments: number };
}

export interface ClaimLookups {
  incidentTypes: readonly IncidentType[];
  damageLevels: readonly DamageLevel[];
  statuses: readonly ClaimStatus[];
  insuranceStatuses: readonly InsuranceStatus[];
  canReport: boolean;
  canManage: boolean;
}

export interface ClaimDashboard {
  totalsByCurrency?: { currency: string; estimatedAmount: number; payableAmount: number }[];
  total: number;
  open: number;
  wip: number;
  closed: number;
  totalEstimated: number;
  totalPayable: number;
  byDamageLevel: Record<string, number>;
  byIncidentType: Record<string, number>;
}

export interface ClaimListFilters {
  status?: string;
  incidentType?: string;
  damageLevel?: string;
  vehicleId?: string;
  search?: string;
}
