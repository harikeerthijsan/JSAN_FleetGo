import { apiClient } from "./apiClient";
import { downloadBlob } from "./inventoryService";
import type { ApiSuccess, PaginatedMeta } from "@/types/api";
import type {
  VendorContact,
  VendorDetail,
  VendorDisk,
  VendorDocument,
  VendorDocumentCategory,
  VendorListFilters,
  VendorListItem,
  VendorLocation,
  VendorLookups,
  VendorUser,
  VendorVehicle,
} from "@/types/vendor";

/**
 * Phase 11 — Vendor Management client. Every call is scoped and re-validated
 * server-side; vendor users are limited to their own organization and cannot
 * perform any write.
 */
function clean(filters?: VendorListFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (!filters) return out;
  for (const [k, v] of Object.entries(filters)) if (v) out[k] = String(v);
  return out;
}

async function get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const r = await apiClient.get<ApiSuccess<T>>(path, { params });
  return r.data.data;
}
async function listReq<T>(path: string, params?: Record<string, unknown>) {
  const r = await apiClient.get<ApiSuccess<T[]>>(path, { params });
  return { data: r.data.data, meta: r.data.meta as unknown as PaginatedMeta };
}
async function mutate<T>(path: string, data: unknown = {}, method: "post" | "put" | "delete" = "post"): Promise<T> {
  const r = await apiClient.request<ApiSuccess<T>>({ url: path, method, data });
  return r.data.data;
}

export const vendorApi = {
  lookups: () => get<VendorLookups>("/vendors/lookups"),
  list: (filters: VendorListFilters, page = 1, pageSize = 25) =>
    listReq<VendorListItem>("/vendors", { page, pageSize, ...clean(filters) }),
  getById: (id: string) => get<VendorDetail>(`/vendors/${id}`),
  register: (body: unknown) => mutate<VendorDetail>("/vendors", body),
  update: (id: string, body: unknown) => mutate<VendorDetail>(`/vendors/${id}`, body, "put"),
  setStatus: (id: string, status: "ACTIVE" | "INACTIVE", reason: string) =>
    mutate<VendorListItem>(`/vendors/${id}/status`, { status, reason }),

  // contacts
  addContact: (id: string, body: unknown) => mutate<VendorContact>(`/vendors/${id}/contacts`, body),
  updateContact: (id: string, contactId: string, body: unknown) => mutate<VendorContact>(`/vendors/${id}/contacts/${contactId}`, body, "put"),
  deleteContact: (id: string, contactId: string) => mutate<{ deleted: boolean }>(`/vendors/${id}/contacts/${contactId}`, {}, "delete"),

  // locations
  addLocation: (id: string, body: unknown) => mutate<VendorLocation>(`/vendors/${id}/locations`, body),
  updateLocation: (id: string, locationId: string, body: unknown) => mutate<VendorLocation>(`/vendors/${id}/locations/${locationId}`, body, "put"),
  deleteLocation: (id: string, locationId: string) => mutate<{ deleted: boolean }>(`/vendors/${id}/locations/${locationId}`, {}, "delete"),

  // users
  users: (id: string) => get<VendorUser[]>(`/vendors/${id}/users`),
  assignUser: (id: string, userId: string) => mutate<VendorUser>(`/vendors/${id}/users`, { userId }),
  unassignUser: (id: string, userId: string) => mutate<{ unassigned: boolean }>(`/vendors/${id}/users/${userId}`, {}, "delete"),

  // vendor-wise inventory
  vehicles: (id: string, page = 1, pageSize = 25) => listReq<VendorVehicle>(`/vendors/${id}/vehicles`, { page, pageSize }),
  disks: (id: string, page = 1, pageSize = 25) => listReq<VendorDisk>(`/vendors/${id}/disks`, { page, pageSize }),

  // documents (agreements, consent forms, supporting files)
  documents: (id: string) => get<VendorDocument[]>(`/vendors/${id}/documents`),
  uploadDocument: async (id: string, file: File, category: VendorDocumentCategory, title?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", category);
    if (title) fd.append("title", title);
    const r = await apiClient.post<ApiSuccess<VendorDocument>>(`/vendors/${id}/documents`, fd);
    return r.data.data;
  },
  downloadDocument: async (id: string, docId: string, fileName: string) => {
    const r = await apiClient.get(`/vendors/${id}/documents/${docId}/download`, { responseType: "blob" });
    downloadBlob(r.data as Blob, fileName);
  },
  deleteDocument: (id: string, docId: string) => mutate<{ deleted: boolean }>(`/vendors/${id}/documents/${docId}`, {}, "delete"),
};
