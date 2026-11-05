export type InspectionType =
  | "INITIAL_RECEIPT"
  | "PRE_DISPATCH"
  | "RECEIVING"
  | "RETURN";
export type InspectionStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "COMPLETED";
export type ReceivingOutcome =
  | "FULL"
  | "WITH_DISCREPANCIES"
  | "DAMAGED"
  | "PARTIAL"
  | "REJECTED";
export type DiscrepancyStatus =
  | "REPORTED"
  | "UNDER_REVIEW"
  | "CONFIRMED"
  | "DISPUTED"
  | "RESOLVED"
  | "CLOSED";

export interface NamedRef {
  id: string;
  name?: string;
  code?: string;
  vehicleCode?: string;
  registrationNumber?: string;
  vin?: string | null;
  status?: string;
  type?: string;
  fullName?: string;
}

export interface InspectionPhoto {
  id: string;
  inspectionId: string;
  category: string;
  label: string | null;
  fileName: string;
  contentType: string;
  reused: boolean;
  sourceEvidenceId: string | null;
  uploadedById: string | null;
  takenAt: string;
  createdAt: string;
}

export interface InspectionResponse {
  id: string;
  checklistItemId: string | null;
  label: string;
  category: string | null;
  value: string | null;
  numericValue: number | null;
  remarks: string | null;
}

export interface ChecklistItem {
  id: string;
  label: string;
  category: string;
  inputType: string;
  required: boolean;
  photoRequired: boolean;
  requiredPhotoCategory: string | null;
  sortOrder: number;
}

export interface InspectionTemplate {
  id: string;
  type: InspectionType;
  name: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  version: number;
  items: ChecklistItem[];
}

export interface Inspection {
  id: string;
  reference: string;
  type: InspectionType;
  status: InspectionStatus;
  vehicleId: string;
  registrationNumber: string | null;
  vin: string | null;
  dispatchId: string | null;
  tripId: string | null;
  ticketId: string | null;
  organizationId: string | null;
  depotId: string | null;
  receivedFromOrgId: string | null;
  templateId: string | null;
  odometer: number | null;
  fuelLevel: number | null;
  exteriorCondition: string | null;
  interiorCondition: string | null;
  tyresCondition: string | null;
  glassCondition: string | null;
  lightsCondition: string | null;
  accessories: string | null;
  keysDocuments: string | null;
  existingDamage: string | null;
  missingItems: string | null;
  newDamage: string | null;
  generalRemarks: string | null;
  identityVerified: boolean;
  registrationVerified: boolean;
  receivingOutcome: ReceivingOutcome | null;
  rejectionReason: string | null;
  performedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewRemarks: string | null;
  version: number;
  supersedesId: string | null;
  createdAt: string;
  vehicle?: NamedRef | null;
  depot?: NamedRef | null;
  organization?: NamedRef | null;
  template?: InspectionTemplate | null;
  responses?: InspectionResponse[];
  photos?: InspectionPhoto[];
  evidence?: { id: string; kind: string; label: string | null; fileName: string }[];
  discrepancies?: Discrepancy[];
  people?: Record<string, NamedRef>;
}

export interface Discrepancy {
  id: string;
  reference: string;
  vehicleId: string;
  dispatchId: string | null;
  inspectionId: string | null;
  category: string;
  description: string;
  severity: string;
  status: DiscrepancyStatus;
  aiSuggested: boolean;
  aiConfirmed: boolean;
  reportedById: string | null;
  assignedReviewerId: string | null;
  resolvedById: string | null;
  resolutionRemarks: string | null;
  resolvedAt: string | null;
  createdAt: string;
  vehicle?: NamedRef | null;
  comments?: {
    id: string;
    authorId: string | null;
    body: string;
    fromStatus: string | null;
    toStatus: string | null;
    createdAt: string;
  }[];
  evidence?: { id: string; kind: string; label: string | null; fileName: string }[];
  people?: Record<string, NamedRef>;
}

export interface Acknowledgement {
  id: string;
  party: string;
  role: string | null;
  name: string;
  acknowledged: boolean;
  signatureKey: string | null;
  remarks: string | null;
  acknowledgedAt: string;
}

export interface Handover {
  id: string;
  reference: string;
  type: "DISPATCH" | "RECEIVING";
  status: "PENDING" | "CONFIRMED";
  vehicleId: string;
  dispatchId: string | null;
  inspectionId: string | null;
  handoverByName: string | null;
  handoverParty: string | null;
  receivedByName: string | null;
  receivedParty: string | null;
  checklist: Record<string, unknown> | null;
  remarks: string | null;
  confirmedAt: string | null;
  createdAt: string;
  vehicle?: NamedRef | null;
  acknowledgements?: Acknowledgement[];
  people?: Record<string, NamedRef>;
}

export interface ProofOfDelivery {
  id: string;
  reference: string;
  dispatchId: string;
  vehicleId: string;
  tripId: string | null;
  organizationId: string | null;
  dispatchedAt: string | null;
  receivedAt: string | null;
  summary: Record<string, unknown>;
  generatedAt: string;
}

export interface ComparisonPhoto {
  id: string;
  inspectionReference: string;
  inspectionType: InspectionType;
  category: string;
  label: string | null;
  takenAt: string;
  uploadedAt: string;
  reused: boolean;
  uploadedBy: string | null;
  downloadPath: string;
}

export interface Comparison {
  vehicle: NamedRef | null;
  inspections: { id: string; reference: string; type: InspectionType; status: string }[];
  stages: Record<InspectionType, ComparisonPhoto[]>;
  note: string;
}

export interface InspectionLookups {
  depots: NamedRef[];
  organizations: NamedRef[];
  templates: { id: string; name: string; type: InspectionType; isDefault: boolean }[];
  photoCategories: string[];
  canManage: boolean;
  canReview: boolean;
  canConfirm: boolean;
}

export interface InspectionDashboard {
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  openDiscrepancies: number;
  pendingHandovers: number;
  proofsOfDelivery: number;
}
