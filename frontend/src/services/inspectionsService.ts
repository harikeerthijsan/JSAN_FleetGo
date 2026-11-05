import { apiClient } from "./apiClient";
import type { ApiSuccess, PaginatedMeta } from "@/types/api";

/**
 * Phase 8 — Inspection & Digital Handover API client. Mirrors the operations
 * client (Bearer token, standard envelope, Idempotency-Key for mutations) and
 * adds an authenticated blob helper so inspection photographs — served only via
 * authorized download endpoints — can be rendered as object URLs.
 */
export const inspectionsApi = {
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
  async upload<T>(path: string, file: File, meta: Record<string, string>) {
    const data = new FormData();
    data.append("file", file);
    Object.entries(meta).forEach(([k, v]) => {
      if (v) data.append(k, v);
    });
    const r = await apiClient.post<ApiSuccess<T>>(path, data, {
      headers: {
        "Content-Type": "multipart/form-data",
        "Idempotency-Key": crypto.randomUUID(),
      },
    });
    return r.data.data;
  },
  /** Fetch an authorized binary (photo/evidence) as a blob object URL. */
  async blobUrl(path: string) {
    const r = await apiClient.get(path, { responseType: "blob" });
    return URL.createObjectURL(r.data as Blob);
  },
  /** Open the printable POD document in a new tab (authorized fetch). */
  async openDocument(path: string) {
    const r = await apiClient.get(path, { responseType: "blob" });
    const url = URL.createObjectURL(
      new Blob([r.data as Blob], { type: "text/html" }),
    );
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
};
