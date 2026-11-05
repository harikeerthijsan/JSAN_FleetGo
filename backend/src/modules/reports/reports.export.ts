import ExcelJS from "exceljs";
import type { ReportResult } from "./reports.service";

/**
 * Report serializers. Exports contain only the already-scoped rows the caller
 * is authorized to see — the export path reuses the same dataset query as the
 * on-screen report, so exported totals always match the screen.
 */

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function toCsv(result: ReportResult): string {
  const headers = result.columns.map((c) => c.header);
  const escape = (s: string) =>
    /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const lines = [headers.map(escape).join(",")];
  for (const row of result.rows)
    lines.push(result.columns.map((c) => escape(cell(row[c.key]))).join(","));
  return lines.join("\r\n");
}

export async function toXlsx(result: ReportResult): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "FleetGo";
  book.created = new Date();
  const sheet = book.addWorksheet((result.title || "Report").slice(0, 31));
  sheet.columns = result.columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: Math.max(12, Math.min(40, c.header.length + 6)),
  }));
  sheet.getRow(1).font = { bold: true };
  for (const row of result.rows) {
    const flat: Record<string, unknown> = {};
    for (const c of result.columns) flat[c.key] = cell(row[c.key]);
    sheet.addRow(flat);
  }
  return (await book.xlsx.writeBuffer()) as unknown as Buffer;
}

function esc(value: unknown): string {
  return cell(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Self-contained, print-ready HTML (browser "Save as PDF"). */
export function toHtml(result: ReportResult, context: { generatedBy: string; filters?: unknown }): string {
  const headerRow = result.columns.map((c) => `<th>${esc(c.header)}</th>`).join("");
  const bodyRows = result.rows
    .map(
      (row) =>
        `<tr>${result.columns.map((c) => `<td>${esc(row[c.key])}</td>`).join("")}</tr>`,
    )
    .join("");
  const summary = result.summary
    ? `<h3>Summary</h3><table class="kv">${Object.entries(result.summary)
        .map(
          ([k, v]) =>
            `<tr><th>${esc(k)}</th><td>${esc(
              typeof v === "object" ? JSON.stringify(v) : v,
            )}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<title>${esc(result.title)}</title>
<style>
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 28px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h3 { font-size: 14px; margin: 20px 0 6px; }
  .meta { color: #555; font-size: 12px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 8px 0; }
  th, td { border: 1px solid #ddd; padding: 5px 7px; text-align: left; }
  thead th { background: #f4f7f5; }
  table.kv th { width: 30%; background: #fafafa; }
  .note { font-size: 11px; color: #555; margin-top: 16px; font-style: italic; }
  @media print { body { padding: 0; } button { display: none; } }
</style></head><body>
<button onclick="window.print()" style="float:right;padding:8px 16px;">Print / Save as PDF</button>
<h1>FleetGo — ${esc(result.title)}</h1>
<p class="meta">Generated ${esc(new Date().toLocaleString())} by ${esc(context.generatedBy)} · ${esc(result.total)} record(s)${
    context.filters && Object.keys(context.filters as object).length
      ? " · filters: " + esc(JSON.stringify(context.filters))
      : ""
  }</p>
${summary}
<h3>Records</h3>
<table><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows || `<tr><td colspan="${result.columns.length}">No records.</td></tr>`}</tbody></table>
${result.note ? `<p class="note">${esc(result.note)}</p>` : ""}
<p class="note">This report is drawn directly from FleetGo operational records within your authorized scope. Image/GPS-derived figures are omitted where supporting data is unavailable.</p>
</body></html>`;
}
