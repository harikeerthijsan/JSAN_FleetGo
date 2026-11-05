import { apiClient } from "./apiClient";
import type { ApiSuccess, PaginatedMeta } from "@/types/api";
import type {
  Disk,
  DiskCustody,
  DiskDashboard,
  DiskDiscrepancy,
  DiskListFilters,
  DiskLookups,
  DiskMovement,
  DiskReconciliation,
  DiskShipment,
} from "@/types/disk";

/**
 * Phase 10 — Disk / Media Logistics client. Every call is scoped and
 * re-validated server-side; this layer only shapes requests/responses. Mutating
 * calls send an Idempotency-Key so retries never double-apply.
 */

function clean(filters?: DiskListFilters | Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!filters) return out;
  for (const [k, v] of Object.entries(filters)) if (v !== undefined && v !== null && v !== "") out[k] = String(v);
  return out;
}

const idemHeaders = () => ({ "Idempotency-Key": crypto.randomUUID() });

async function get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const r = await apiClient.get<ApiSuccess<T>>(path, { params });
  return r.data.data;
}
async function list<T>(path: string, params?: Record<string, unknown>) {
  const r = await apiClient.get<ApiSuccess<T[]>>(path, { params });
  return { data: r.data.data, meta: r.data.meta as unknown as PaginatedMeta };
}
async function mutate<T>(path: string, data: unknown = {}, method: "post" | "put" = "post"): Promise<T> {
  const r = await apiClient.request<ApiSuccess<T>>({ url: path, method, data, headers: idemHeaders() });
  return r.data.data;
}

export const diskApi = {
  // --- reference / dashboard -----------------------------------------------
  lookups: () => get<DiskLookups>("/disks/lookups"),
  dashboard: () => get<DiskDashboard>("/disks/dashboard"),

  // --- disks ---------------------------------------------------------------
  listDisks: (filters: DiskListFilters, page = 1, pageSize = 50) =>
    list<Disk>("/disks", { page, pageSize, ...clean(filters) }),
  getDisk: (id: string) => get<Disk & { custody?: DiskCustody[]; movements?: DiskMovement[] }>(`/disks/${id}`),
  register: (body: unknown) => mutate<Disk>("/disks", body),
  bulkRegister: (body: unknown) => mutate<{ created: number; diskIds: string[] }>("/disks/bulk", body),
  updateStatus: (id: string, body: unknown) => mutate<Disk>(`/disks/${id}/status`, body),
  custody: (id: string) => get<DiskCustody[]>(`/disks/${id}/custody`),
  transferCustody: (id: string, body: unknown) => mutate<DiskCustody>(`/disks/${id}/custody`, body),

  // --- shipments -----------------------------------------------------------
  listShipments: (filters: DiskListFilters, page = 1, pageSize = 50) =>
    list<DiskShipment>("/disk-shipments", { page, pageSize, ...clean(filters) }),
  getShipment: (id: string) => get<DiskShipment>(`/disk-shipments/${id}`),
  createShipment: (body: unknown) => mutate<DiskShipment>("/disk-shipments", body),
  dispatchShipment: (id: string, body: unknown) => mutate<DiskShipment>(`/disk-shipments/${id}/dispatch`, body),
  recordTracking: (id: string, body: unknown) => mutate<DiskShipment>(`/disk-shipments/${id}/tracking`, body),
  receiveShipment: (id: string, body: unknown) => mutate<DiskShipment>(`/disk-shipments/${id}/receive`, body),
  cancelShipment: (id: string, reason: string) => mutate<DiskShipment>(`/disk-shipments/${id}/cancel`, { reason }),

  // --- reconciliation ------------------------------------------------------
  listReconciliations: (filters: DiskListFilters, page = 1, pageSize = 50) =>
    list<DiskReconciliation>("/disk-reconciliation", { page, pageSize, ...clean(filters) }),
  getReconciliation: (id: string) => get<DiskReconciliation>(`/disk-reconciliation/${id}`),
  createReconciliation: (body: unknown) => mutate<DiskReconciliation>("/disk-reconciliation", body),
  setReconciliationItems: (id: string, body: unknown) => mutate<DiskReconciliation>(`/disk-reconciliation/${id}/items`, body),
  submitReconciliation: (id: string) => mutate<DiskReconciliation>(`/disk-reconciliation/${id}/submit`),
  reviewReconciliation: (id: string, body: unknown) => mutate<DiskReconciliation>(`/disk-reconciliation/${id}/review`, body),

  // --- discrepancies -------------------------------------------------------
  listDiscrepancies: (filters: DiskListFilters, page = 1, pageSize = 50) =>
    list<DiskDiscrepancy>("/disks/discrepancies", { page, pageSize, ...clean(filters) }),
  createDiscrepancy: (body: unknown) => mutate<DiskDiscrepancy>("/disks/discrepancies", body),
  transitionDiscrepancy: (id: string, body: unknown) => mutate<DiskDiscrepancy>(`/disks/discrepancies/${id}/transition`, body),
};
