export interface ChartPoint {
  label: string;
  count: number;
  color?: string;
}

export interface DashboardSummary {
  totalFleet: number;
  available: number;
  reserved: number;
  allocated: number;
  inTransit: number;
  atVendor: number;
  underMaintenance: number;
  damaged: number;
  activeTickets: number;
  pendingApprovals: number;
  delayedTrips: number;
  completedDeliveries: number;
  byStatus: Record<string, number>;
}

export interface DashboardCharts {
  fleetByStatus: ChartPoint[];
  vehiclesByType: ChartPoint[];
  vehiclesByMake: ChartPoint[];
  inventoryByDepot: ChartPoint[];
  inventoryByVendor: ChartPoint[];
  ticketsByStatus: ChartPoint[];
  ticketsByPriority: ChartPoint[];
  dispatchesByState: ChartPoint[];
  deliveryPerformance: ChartPoint[];
  inspectionsByType: ChartPoint[];
  discrepanciesByStatus: ChartPoint[];
}

export interface MonitoringItem {
  id: string;
  reference?: string;
  ticketNumber?: string;
  subject?: string;
  status?: string;
  type?: string;
  category?: string;
  severity?: string;
  priority?: string;
  vehicleId?: string;
  dispatch?: { id: string; reference: string };
}

export interface Monitoring {
  activeTrips: MonitoringItem[];
  delayedDeliveries: MonitoringItem[];
  pendingInspections: MonitoringItem[];
  unresolvedDamage: MonitoringItem[];
  pendingApprovals: MonitoringItem[];
  overdueTickets: MonitoringItem[];
  counts: Record<string, number>;
}

export interface ReportColumn {
  key: string;
  header: string;
}

export interface ReportResult {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  summary?: Record<string, unknown>;
  note?: string;
}

export interface ReportLookups {
  depots: { id: string; name: string; code: string }[];
  organizations: { id: string; name: string; type: string }[];
  vendors: { id: string; name: string; type: string }[];
  vehicleTypes: { id: string; name: string }[];
  role: string;
  isAdmin: boolean;
}

export interface SavedReport {
  id: string;
  name: string;
  category: string;
  reportType: string;
  description: string | null;
  filters: Record<string, unknown> | null;
  isShared: boolean;
  ownerId: string;
  createdAt: string;
  schedules?: ScheduledReport[];
}

export interface ScheduledReport {
  id: string;
  savedReportId: string;
  frequency: string;
  format: string;
  recipientIds: string[];
  isActive: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  nextRunAt: string | null;
  savedReport?: { name: string; category: string; reportType: string };
}

export interface ReportExportRow {
  id: string;
  category: string;
  reportType: string;
  format: string;
  rowCount: number | null;
  status: string;
  error: string | null;
  createdAt: string;
}

export interface ReportFilterValues {
  from?: string;
  to?: string;
  organizationId?: string;
  depotId?: string;
  vendorId?: string;
  transporterId?: string;
  vehicleTypeId?: string;
  status?: string;
  mode?: string;
}

/** Registry of report categories/types shown in the UI (mirrors backend DATASETS). */
export const REPORT_TYPES: {
  category: string;
  type: string;
  label: string;
  moduleLink?: (id: string) => string;
}[] = [
  { category: "fleet", type: "vehicles", label: "Fleet vehicles", moduleLink: (id) => `/fleet/vehicles/${id}` },
  { category: "inventory", type: "current", label: "Current inventory", moduleLink: (id) => `/inventory/vehicles/${id}` },
  { category: "inventory", type: "receipts", label: "CTS receipts" },
  { category: "tickets", type: "all", label: "Tickets & approvals", moduleLink: (id) => `/tickets/${id}` },
  { category: "dispatch", type: "deliveries", label: "Dispatch & delivery", moduleLink: (id) => `/dispatch/trips/${id}` },
  { category: "gps", type: "sessions", label: "GPS tracking sessions" },
  { category: "inspections", type: "all", label: "Inspections", moduleLink: (id) => `/inspections/${id}` },
  { category: "inspections", type: "discrepancies", label: "Damage & discrepancies", moduleLink: (id) => `/inspections/discrepancies/${id}` },
  { category: "vendors", type: "performance", label: "Vendor & transporter performance" },
];
