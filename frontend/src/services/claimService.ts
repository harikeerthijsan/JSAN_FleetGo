import { apiClient } from "./apiClient";
import { downloadBlob } from "./inventoryService";
import type { ApiSuccess, PaginatedMeta } from "@/types/api";
import type {
  ClaimDashboard,
  ClaimListFilters,
  ClaimLookups,
  InsuranceClaim,
} from "@/types/claim";

/**
 * Insurance Claims client. Every call is scoped and re-validated server-side;
 * vendors are limited to their own organization's claims.
 */
function clean(filters?: ClaimListFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (!filters) return out;
  for (const [k, v] of Object.entries(filters)) if (v) out[k] = String(v);
  return out;
}

async function get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const r = await apiClient.get<ApiSuccess<T>>(path, { params });
  return r.data.data;
}

export const claimApi = {
  lookups: () => get<ClaimLookups>("/claims/lookups"),
  dashboard: () => get<ClaimDashboard>("/claims/dashboard"),
  list: async (filters: ClaimListFilters, page = 1, pageSize = 25) => {
    const r = await apiClient.get<ApiSuccess<InsuranceClaim[]>>("/claims", { params: { page, pageSize, ...clean(filters) } });
    return { data: r.data.data, meta: r.data.meta as unknown as PaginatedMeta };
  },
  getById: (id: string) => get<InsuranceClaim>(`/claims/${id}`),
  create: async (body: Record<string, unknown>, photos: File[], videos: File[], thirdPartyFiles: File[] = []) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(body)) if (value !== undefined && value !== null) data.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    for (const file of [...photos, ...videos, ...thirdPartyFiles]) data.append("files", file);
    return (await apiClient.post<ApiSuccess<InsuranceClaim>>("/claims", data)).data.data;
  },
  update: async (id: string, body: unknown) => (await apiClient.put<ApiSuccess<InsuranceClaim>>(`/claims/${id}`, body)).data.data,
  process: async (id: string, body: unknown) => (await apiClient.post<ApiSuccess<InsuranceClaim>>(`/claims/${id}/process`, body)).data.data,
  acknowledge: async (id: string) => (await apiClient.post<ApiSuccess<InsuranceClaim>>(`/claims/${id}/acknowledge`, {})).data.data,

  // evidence
  uploadEvidence: async (id: string, file: File, caption?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    if (caption) fd.append("caption", caption);
    const r = await apiClient.post<ApiSuccess<unknown>>(`/claims/${id}/attachments`, fd);
    return r.data.data;
  },
  downloadEvidence: async (id: string, attachmentId: string, fileName: string) => {
    const r = await apiClient.get(`/claims/${id}/attachments/${attachmentId}/download`, { responseType: "blob" });
    downloadBlob(r.data as Blob, fileName);
  },
  deleteEvidence: async (id: string, attachmentId: string) =>
    (await apiClient.delete<ApiSuccess<{ deleted: boolean }>>(`/claims/${id}/attachments/${attachmentId}`)).data.data,
};
