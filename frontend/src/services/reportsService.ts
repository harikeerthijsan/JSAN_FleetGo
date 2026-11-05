import { apiClient } from "./apiClient";
import { downloadBlob } from "./inventoryService";
import type { ApiSuccess, PaginatedMeta } from "@/types/api";
import type { ReportFilterValues, ReportResult } from "@/types/reports";

/**
 * Phase 9 — dashboard & reporting client. All aggregation and export is scoped
 * server-side; exports reuse the same dataset query as the on-screen report so
 * totals always match.
 */
export const reportsApi = {
  async get<T>(path: string, params?: Record<string, unknown>) {
    const r = await apiClient.get<ApiSuccess<T>>(path, { params });
    return r.data.data;
  },
  async list<T>(path: string, params?: Record<string, unknown>) {
    const r = await apiClient.get<ApiSuccess<T[]>>(path, { params });
    return { data: r.data.data, meta: r.data.meta as unknown as PaginatedMeta };
  },
  async data(category: string, type: string, filters: ReportFilterValues, page = 1, pageSize = 50) {
    const r = await apiClient.get<ApiSuccess<ReportResult>>("/reports/data", {
      params: { category, type, page, pageSize, ...clean(filters) },
    });
    return r.data.data;
  },
  async mutate<T>(path: string, data: unknown = {}, method: "post" | "put" | "delete" = "post") {
    const r = await apiClient.request<ApiSuccess<T>>({ url: path, method, data });
    return r.data.data;
  },
  async export(
    category: string,
    type: string,
    format: "csv" | "xlsx" | "pdf",
    filters: ReportFilterValues,
  ) {
    const params = { category, type, format, ...clean(filters) };
    if (format === "pdf") {
      const r = await apiClient.get("/reports/export", { params, responseType: "blob" });
      const url = URL.createObjectURL(new Blob([r.data as Blob], { type: "text/html" }));
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
    const r = await apiClient.get("/reports/export", { params, responseType: "blob" });
    downloadBlob(r.data as Blob, `fleetgo-${category}-${type}.${format}`);
  },
};

function clean(filters: ReportFilterValues): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(filters)) if (v) out[k] = String(v);
  return out;
}
