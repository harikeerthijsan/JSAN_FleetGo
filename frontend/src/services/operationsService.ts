import { apiClient } from "./apiClient";
import type { ApiSuccess, PaginatedMeta } from "@/types/api";
import { downloadBlob } from "./inventoryService";
export const opsApi = {
  async get<T>(path: string, params?: Record<string, unknown>) {
    const r = await apiClient.get<ApiSuccess<T>>(path, { params });
    return r.data.data;
  },
  async list<T>(path: string, params?: Record<string, unknown>) {
    const r = await apiClient.get<ApiSuccess<T[]>>(path, { params });
    return { data: r.data.data, meta: r.data.meta as unknown as PaginatedMeta };
  },
  async mutate<T>(
    path: string,
    data: unknown = {},
    method: "post" | "put" = "post",
    key = crypto.randomUUID(),
  ) {
    const r = await apiClient.request<ApiSuccess<T>>({
      url: path,
      method,
      data,
      headers: { "Idempotency-Key": key },
    });
    return r.data.data;
  },
  async upload(path: string, file: File, meta: Record<string, string>) {
    const data = new FormData();
    data.append("file", file);
    Object.entries(meta).forEach(([k, v]) => {
      if (v) data.append(k, v);
    });
    const r = await apiClient.post<ApiSuccess<unknown>>(path, data, {
      headers: {
        "Content-Type": "multipart/form-data",
        "Idempotency-Key": crypto.randomUUID(),
      },
    });
    return r.data.data;
  },
  async download(path: string, name: string) {
    const r = await apiClient.get(path, { responseType: "blob" });
    downloadBlob(r.data, name);
  },
};
