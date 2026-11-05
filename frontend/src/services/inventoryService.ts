import { apiClient } from "./apiClient";
import type { ApiSuccess, PaginatedMeta } from "@/types/api";
export const inventoryApi = {
  async get<T>(path: string, params?: Record<string, unknown>) {
    const r = await apiClient.get<ApiSuccess<T>>(`/inventory${path}`, {
      params,
    });
    return r.data.data;
  },
  async list<T>(params: Record<string, unknown>) {
    const r = await apiClient.get<ApiSuccess<T[]>>("/inventory/vehicles", {
      params,
    });
    return { data: r.data.data, meta: r.data.meta as unknown as PaginatedMeta };
  },
  async mutate<T>(
    path: string,
    body: unknown = {},
    method: "post" | "put" = "post",
    key = crypto.randomUUID(),
  ) {
    const r = await apiClient.request<ApiSuccess<T>>({
      url: `/inventory${path}`,
      method,
      data: body,
      headers: { "Idempotency-Key": key },
    });
    return r.data.data;
  },
  async upload<T>(path: string, file: File, key = crypto.randomUUID()) {
    const form = new FormData();
    form.append("file", file);
    const r = await apiClient.post<ApiSuccess<T>>(`/inventory${path}`, form, {
      headers: {
        "Content-Type": "multipart/form-data",
        "Idempotency-Key": key,
      },
    });
    return r.data.data;
  },
  async download(path: string, name: string) {
    const r = await apiClient.get(`/inventory${path}`, {
      responseType: "blob",
    });
    downloadBlob(r.data, name);
  },
};
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadCsv(rows: Record<string, unknown>[], name: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+@\-\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  downloadBlob(
    new Blob(
      [
        "\uFEFF" +
          [
            headers.map(escape).join(","),
            ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
          ].join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    ),
    name,
  );
}
