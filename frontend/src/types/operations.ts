export interface Ref {
  id: string;
  name: string;
  type?: string;
  status?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  makeId?: string;
  organizationId?: string;
  fullName?: string;
}
export interface OpsLookups {
  depots: Ref[];
  organizations: Ref[];
  drivers: Driver[];
  types: Ref[];
  makes: Ref[];
  models: Ref[];
  users: Ref[];
}
export interface Driver {
  id: string;
  name: string;
  phone: string;
  licenseNumber: string;
  licenseExpiry: string;
  transporterId: string;
  userId: string | null;
  status: "ACTIVE" | "INACTIVE";
}
export interface RequestTicket {
  id: string;
  ticketNumber: string;
  type: string;
  subject: string;
  requestingOrgId: string;
  sourceDepotId: string | null;
  destinationDepotId: string | null;
  requestedTypeId: string | null;
  vehicleId: string | null;
  requestedQuantity: number | null;
  requested: number;
  allocated: number;
  pending: number;
}
export interface AllocationItem {
  id: string;
  vehicleId: string;
  cancelledAt: string | null;
  inventoryAllocationId: string;
}
export interface OpsVehicle {
  id: string;
  vehicleCode: string;
  registrationNumber: string;
  vin: string | null;
  make?: Ref | null;
  model?: Ref | null;
  type?: Ref | null;
  status: string;
}
export interface AvailableVehicle {
  eligible:boolean;
  vehicleId: string;
  currentDepotId: string;
  currentCustodianId: string;
  vehicle: OpsVehicle;
}
export interface Allocation {
  id: string;
  reference: string;
  ticketId: string;
  ticket: RequestTicket;
  state: string;
  sourceDepotId: string;
  destinationDepotId: string;
  receivingOrgId: string;
  transporterId: string;
  plannedDispatchAt: string;
  expectedDeliveryAt: string;
  allocatedById: string;
  createdAt: string;
  cancelReason: string | null;
  items: AllocationItem[];
  vehicles: OpsVehicle[];
  dispatches: Dispatch[];
}
export interface DispatchVehicle {
  id: string;
  vehicleId: string;
  allocationItemId: string;
  identityVerified: boolean;
  registrationVerified: boolean;
  odometer: number | null;
  fuelLevel: number | null;
  accessories: string | null;
  keysHandedOver: boolean;
  documentsHandedOver: boolean;
  remarks: string | null;
}
export interface DispatchFile {
  id: string;
  vehicleId: string | null;
  exceptionId: string | null;
  category: string;
  remarks: string | null;
  fileName: string;
  contentType: string;
  uploadedById: string;
  createdAt: string;
}
export interface Dispatch {
  id: string;
  reference: string;
  allocationId: string;
  allocation: Allocation;
  driverId: string;
  driver: Driver;
  transporterId: string;
  sourceDepotId: string;
  destinationDepotId: string;
  destinationAddress: string;
  plannedDispatchAt: string;
  expectedDeliveryAt: string;
  state: string;
  confirmedAt: string | null;
  instructions: string | null;
  transportVehicle: string | null;
  vehicles: DispatchVehicle[];
  vehicleDetails: OpsVehicle[];
  evidence: DispatchFile[];
  trip: Trip;
  assignments: {
    id: string;
    driverId: string;
    transporterId: string;
    reason: string;
    createdAt: string;
  }[];
}
export interface Trip {
  id: string;
  reference: string;
  dispatchId: string;
  dispatch: Dispatch;
  status: string;
  actualStartAt: string | null;
  actualArrivalAt: string | null;
  delayMinutes: number;
  remarks: string | null;
  trackingReady?: boolean;
  events: TripEvent[];
  exceptions: OpsException[];
}
export interface TripEvent {
  id: string;
  type: string;
  description: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorId: string;
  occurredAt: string;
}
export interface OpsException {
  id: string;
  tripId: string;
  trip?: Trip;
  type: string;
  description: string;
  severity: string;
  status: string;
  resolutionNotes: string | null;
  reportedById: string;
  createdAt: string;
}
export interface OpsDashboard {
  totalAllocations: number;
  pendingAllocations: number;
  ready: number;
  dispatchedToday: number;
  inTransit: number;
  delayed: number;
  delivered: number;
  failed: number;
  byStatus: { label: string; count: number }[];
  byDepot: { label: string; count: number }[];
  byTransporter: { label: string; count: number }[];
  deliveryTiming: { label: string; count: number }[];
}
