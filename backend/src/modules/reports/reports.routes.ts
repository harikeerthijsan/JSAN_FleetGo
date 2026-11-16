import { Router } from "express";
import type { Request, Response, RequestHandler } from "express";
import { z } from "zod";
import { authenticate, validate } from "../../middlewares";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { reportsService, type ReportFilters } from "./reports.service";
import { reportsAdmin } from "./reports.admin";
import { toCsv, toXlsx, toHtml } from "./reports.export";

const out = (res: Response, data: unknown) => ApiResponse.success(res, data);

const requireReports: RequestHandler = (req, _res, next) => {
  if (!req.user?.permissions.includes("reports:read")) return next(ApiError.forbidden());
  next();
};

const filterSchema = z.object({
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
  organizationId: z.string().uuid().optional(),
  depotId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  transporterId: z.string().uuid().optional(),
  vehicleTypeId: z.string().uuid().optional(),
  status: z.string().trim().max(40).optional(),
  mode: z.string().trim().max(10).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(50),
});

function pickFilters(q: Record<string, unknown>): ReportFilters {
  const f: ReportFilters = {};
  for (const k of ["from", "to", "organizationId", "depotId", "vendorId", "transporterId", "vehicleTypeId", "status", "mode"] as const)
    if (q[k]) (f as Record<string, unknown>)[k] = q[k];
  return f;
}

export const dashboardRoutes = Router();
export const reportsRoutes = Router();
for (const r of [dashboardRoutes, reportsRoutes]) {
  r.use(authenticate);
  r.use(requireReports);
}

// --- Dashboard --------------------------------------------------------------
dashboardRoutes.get(
  "/summary",
  asyncHandler(async (req, res) => out(res, await reportsService.dashboardSummary(req.user!))),
);
dashboardRoutes.get(
  "/charts",
  asyncHandler(async (req, res) => out(res, await reportsService.dashboardCharts(req.user!))),
);
dashboardRoutes.get(
  "/monitoring",
  validate({ query: filterSchema }),
  asyncHandler(async (req, res) =>
    out(res, await reportsService.monitoring(req.user!, pickFilters(req.query as Record<string, unknown>))),
  ),
);

// --- Reports ----------------------------------------------------------------
reportsRoutes.get(
  "/lookups",
  asyncHandler(async (req, res) => out(res, await reportsService.lookups(req.user!))),
);

const categorySchema = z.object({
  category: z.string().trim().min(1).max(40),
  type: z.string().trim().min(1).max(40),
});

async function buildFromRequest(req: Request) {
  const q = req.query as Record<string, unknown>;
  const parsed = filterSchema.parse(q);
  const category = String(q.category ?? "");
  const type = String(q.type ?? "");
  if (!category || !type) throw ApiError.badRequest("category and type are required");
  return reportsService.dataset(category, type, pickFilters(q), req.user!, parsed.page, parsed.pageSize);
}

// Tabular report data (report screens + builder). category & type in query.
reportsRoutes.get(
  "/data",
  asyncHandler(async (req, res) => {
    const result = await buildFromRequest(req);
    ApiResponse.success(res, result, result.title, 200, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: Math.max(1, Math.ceil(result.total / result.pageSize)),
    } as never);
  }),
);

// Export — serializes the SAME scoped dataset (optionally all rows up to a cap).
reportsRoutes.get(
  "/export",
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, unknown>;
    const format = String(q.format ?? "csv").toLowerCase();
    const category = String(q.category ?? "");
    const type = String(q.type ?? "");
    if (!category || !type) throw ApiError.badRequest("category and type are required");
    const filters = pickFilters(q);
    // Export up to 5,000 rows; report screens remain paginated.
    const result = await reportsService.dataset(category, type, filters, req.user!, 1, 5000);
    const base = `fleetgo-${category}-${type}-${Date.now()}`;
    try {
      if (format === "xlsx") {
        const buffer = await toXlsx(result);
        res
          .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
          .attachment(`${base}.xlsx`)
          .send(buffer);
      } else if (format === "pdf") {
        res.type("text/html").send(toHtml(result, { generatedBy: req.user!.fullName, filters }));
      } else {
        res.type("text/csv").attachment(`${base}.csv`).send(toCsv(result));
      }
      await reportsAdmin.recordExport({
        category,
        reportType: type,
        format: format === "xlsx" ? "XLSX" : format === "pdf" ? "PDF" : "CSV",
        filters,
        rowCount: result.rows.length,
        a: req.user!,
      });
    } catch (e) {
      await reportsAdmin.recordExport({
        category,
        reportType: type,
        format: format === "xlsx" ? "XLSX" : format === "pdf" ? "PDF" : "CSV",
        filters,
        rowCount: 0,
        status: "FAILED",
        error: e instanceof Error ? e.message : String(e),
        a: req.user!,
      });
      throw e;
    }
  }),
);

// --- Saved reports ----------------------------------------------------------
const savedSchema = z.object({
  name: z.string().trim().min(1).max(150),
  category: z.string().trim().min(1).max(40),
  reportType: z.string().trim().min(1).max(40),
  description: z.string().trim().max(1000).optional(),
  filters: z.record(z.unknown()).optional(),
  isShared: z.boolean().optional(),
});
reportsRoutes.get(
  "/saved",
  asyncHandler(async (req, res) => out(res, await reportsAdmin.listSaved(req.user!))),
);
reportsRoutes.post(
  "/saved",
  validate({ body: savedSchema }),
  asyncHandler(async (req, res) =>
    ApiResponse.success(res, await reportsAdmin.saveReport(undefined, req.body, req.user!), "Saved", 201),
  ),
);
reportsRoutes.put(
  "/saved/:id",
  validate({ params: z.object({ id: z.string().uuid() }), body: savedSchema }),
  asyncHandler(async (req, res) =>
    out(res, await reportsAdmin.saveReport(req.params.id, req.body, req.user!)),
  ),
);
reportsRoutes.delete(
  "/saved/:id",
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => out(res, await reportsAdmin.deleteSaved(req.params.id, req.user!))),
);

// --- Export history ---------------------------------------------------------
reportsRoutes.get(
  "/exports",
  validate({ query: z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50) }) }),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    const r = await reportsAdmin.exportHistory(req.user!, page, pageSize);
    ApiResponse.success(res, r.data, "Export history", 200, r.meta as never);
  }),
);

// --- Scheduled reports (interface) -----------------------------------------
reportsRoutes.get(
  "/schedules",
  asyncHandler(async (req, res) => out(res, await reportsAdmin.listSchedules(req.user!))),
);
reportsRoutes.post(
  "/schedules",
  validate({
    body: z.object({
      savedReportId: z.string().uuid(),
      frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
      format: z.enum(["CSV", "XLSX", "PDF"]).optional(),
      recipientIds: z.array(z.string().uuid()).max(50).optional(),
      isActive: z.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) =>
    ApiResponse.success(res, await reportsAdmin.saveSchedule(req.body, req.user!), "Schedule created", 201),
  ),
);
reportsRoutes.put(
  "/schedules/:id",
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({ isActive: z.boolean().optional(), frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).optional() }),
  }),
  asyncHandler(async (req, res) => out(res, await reportsAdmin.updateSchedule(req.params.id, req.body, req.user!))),
);
reportsRoutes.post(
  "/schedules/:id/run",
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => out(res, await reportsAdmin.runSchedule(req.params.id, req.user!))),
);

void categorySchema;
