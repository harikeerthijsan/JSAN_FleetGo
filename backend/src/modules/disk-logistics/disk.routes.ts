import { Router } from "express";
import type { Request, RequestHandler } from "express";
import { z } from "zod";
import { authenticate, authorize, validate, uploadSingle } from "../../middlewares";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { diskService as service } from "./disk.service";
import * as v from "./disk.validators";

const ids = z.object({ id: z.string().uuid() });
const diskParam = z.object({ diskId: z.string().uuid() });
const key = (r: Request) => r.get("Idempotency-Key") ?? "";
const out = (res: import("express").Response, data: unknown, status = 200) =>
  ApiResponse.success(res, data, undefined, status);

const anyPermission =
  (...permissions: string[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !permissions.some((p) => req.user!.permissions.includes(p))) return next(ApiError.forbidden());
    next();
  };
const read = anyPermission("disk:read", "disk:manage");
const manage = authorize("disk:manage");

export const disksRoutes = Router();
export const diskInventoryRoutes = Router();
export const diskShipmentsRoutes = Router();
export const diskCustodyRoutes = Router();
export const diskInspectionsRoutes = Router();
export const diskReconciliationRoutes = Router();
for (const r of [disksRoutes, diskInventoryRoutes, diskShipmentsRoutes, diskCustodyRoutes, diskInspectionsRoutes, diskReconciliationRoutes])
  r.use(authenticate);

// ---------------------------------------------------------------------------
// /api/v1/disks
// ---------------------------------------------------------------------------
disksRoutes.get("/lookups", read, asyncHandler(async (req, res) => out(res, await service.lookups(req.user!))));
disksRoutes.get("/dashboard", read, asyncHandler(async (req, res) => out(res, await service.dashboard(req.user!))));

disksRoutes.get(
  "/",
  read,
  validate({ query: v.querySchema }),
  asyncHandler(async (req, res) => {
    const r = await service.listDisks(req.query as unknown as v.Query, req.user!);
    ApiResponse.success(res, r.data, "Disks", 200, r.meta);
  }),
);
disksRoutes.post(
  "/",
  manage,
  validate({ body: v.registerSchema }),
  asyncHandler(async (req, res) => out(res, await service.register(req.body, req.user!, key(req)), 201)),
);
disksRoutes.post(
  "/bulk",
  manage,
  validate({ body: v.bulkSchema }),
  asyncHandler(async (req, res) => out(res, await service.bulkRegister(req.body, req.user!, key(req)), 201)),
);
disksRoutes.get(
  "/photos/:id/download",
  read,
  validate({ params: ids }),
  asyncHandler(async (req, res) => {
    const { photo, buffer } = await service.downloadPhoto(req.params.id, req.user!);
    res.type(photo.contentType).attachment(photo.fileName).send(buffer);
  }),
);
// Discrepancies (collection before :id).
disksRoutes.get(
  "/discrepancies",
  read,
  validate({ query: v.querySchema }),
  asyncHandler(async (req, res) => {
    const r = await service.listDiscrepancies(req.query as unknown as v.Query, req.user!);
    ApiResponse.success(res, r.data, "Disk discrepancies", 200, r.meta);
  }),
);
disksRoutes.post(
  "/discrepancies",
  read,
  validate({ body: v.discrepancySchema }),
  asyncHandler(async (req, res) => out(res, await service.createDiscrepancy(req.body, req.user!, key(req)), 201)),
);
disksRoutes.post(
  "/discrepancies/:id/transition",
  read,
  validate({ params: ids, body: v.discrepancyTransitionSchema }),
  asyncHandler(async (req, res) => out(res, await service.transitionDiscrepancy(req.params.id, req.body, req.user!, key(req)))),
);
disksRoutes.get("/:id", read, validate({ params: ids }), asyncHandler(async (req, res) => out(res, await service.getDisk(req.params.id, req.user!))));
disksRoutes.post(
  "/:id/status",
  manage,
  validate({ params: ids, body: v.statusSchema }),
  asyncHandler(async (req, res) => out(res, await service.updateStatus(req.params.id, req.body, req.user!, key(req)))),
);
disksRoutes.post(
  "/:id/photos",
  manage,
  validate({ params: ids }),
  uploadSingle("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest("File required");
    out(res, await service.uploadPhoto(req.params.id, req.file, { context: String(req.body.context ?? "DISK") }, req.user!, key(req)), 201);
  }),
);
disksRoutes.get("/:id/custody", read, validate({ params: ids }), asyncHandler(async (req, res) => out(res, await service.custodyHistory(req.params.id, req.user!))));
disksRoutes.post(
  "/:id/custody",
  manage,
  validate({ params: ids, body: v.custodySchema }),
  asyncHandler(async (req, res) => out(res, await service.transferCustody(req.params.id, req.body, req.user!, key(req)))),
);

// ---------------------------------------------------------------------------
// /api/v1/disk-inventory  (list + dashboard aliases over the same service)
// ---------------------------------------------------------------------------
diskInventoryRoutes.get("/dashboard", read, asyncHandler(async (req, res) => out(res, await service.dashboard(req.user!))));
diskInventoryRoutes.get(
  "/",
  read,
  validate({ query: v.querySchema }),
  asyncHandler(async (req, res) => {
    const r = await service.listDisks(req.query as unknown as v.Query, req.user!);
    ApiResponse.success(res, r.data, "Disk inventory", 200, r.meta);
  }),
);

// ---------------------------------------------------------------------------
// /api/v1/disk-shipments
// ---------------------------------------------------------------------------
diskShipmentsRoutes.get(
  "/",
  read,
  validate({ query: v.querySchema }),
  asyncHandler(async (req, res) => {
    const r = await service.listShipments(req.query as unknown as v.Query, req.user!);
    ApiResponse.success(res, r.data, "Disk shipments", 200, r.meta);
  }),
);
diskShipmentsRoutes.post(
  "/",
  manage,
  validate({ body: v.shipmentSchema }),
  asyncHandler(async (req, res) => out(res, await service.createShipment(req.body, req.user!, key(req)), 201)),
);
diskShipmentsRoutes.get("/:id", read, validate({ params: ids }), asyncHandler(async (req, res) => out(res, await service.getShipment(req.params.id, req.user!))));
diskShipmentsRoutes.post(
  "/:id/dispatch",
  manage,
  validate({ params: ids, body: v.dispatchSchema }),
  asyncHandler(async (req, res) => out(res, await service.dispatchShipment(req.params.id, req.body, req.user!, key(req)))),
);
diskShipmentsRoutes.post(
  "/:id/tracking",
  manage,
  validate({ params: ids, body: v.trackingSchema }),
  asyncHandler(async (req, res) => out(res, await service.recordTracking(req.params.id, req.body, req.user!, key(req)))),
);
diskShipmentsRoutes.post(
  "/:id/receive",
  read,
  validate({ params: ids, body: v.receiveSchema }),
  asyncHandler(async (req, res) => out(res, await service.receiveShipment(req.params.id, req.body, req.user!, key(req)))),
);
diskShipmentsRoutes.post(
  "/:id/cancel",
  manage,
  validate({ params: ids, body: z.object({ reason: z.string().trim().min(1).max(500) }) }),
  asyncHandler(async (req, res) => out(res, await service.cancelShipment(req.params.id, req.body.reason, req.user!, key(req)))),
);
diskShipmentsRoutes.post(
  "/:id/photos",
  manage,
  validate({ params: ids }),
  uploadSingle("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest("File required");
    out(res, await service.uploadShipmentPhoto(req.params.id, req.file, { context: String(req.body.context ?? "SHIPMENT") }, req.user!, key(req)), 201);
  }),
);

// ---------------------------------------------------------------------------
// /api/v1/disk-custody
// ---------------------------------------------------------------------------
diskCustodyRoutes.get("/:diskId", read, validate({ params: diskParam }), asyncHandler(async (req, res) => out(res, await service.custodyHistory(req.params.diskId, req.user!))));
diskCustodyRoutes.post(
  "/:diskId/transfer",
  manage,
  validate({ params: diskParam, body: v.custodySchema }),
  asyncHandler(async (req, res) => out(res, await service.transferCustody(req.params.diskId, req.body, req.user!, key(req)))),
);

// ---------------------------------------------------------------------------
// /api/v1/disk-inspections
// ---------------------------------------------------------------------------
diskInspectionsRoutes.post(
  "/",
  read,
  validate({ body: v.inspectionSchema }),
  asyncHandler(async (req, res) => out(res, await service.createInspection(req.body, req.user!, key(req)), 201)),
);

// ---------------------------------------------------------------------------
// /api/v1/disk-reconciliation
// ---------------------------------------------------------------------------
diskReconciliationRoutes.get(
  "/",
  read,
  validate({ query: v.querySchema }),
  asyncHandler(async (req, res) => {
    const r = await service.listReconciliations(req.query as unknown as v.Query, req.user!);
    ApiResponse.success(res, r.data, "Disk reconciliations", 200, r.meta);
  }),
);
diskReconciliationRoutes.post(
  "/",
  manage,
  validate({ body: v.reconciliationSchema }),
  asyncHandler(async (req, res) => out(res, await service.createReconciliation(req.body, req.user!, key(req)), 201)),
);
diskReconciliationRoutes.get("/:id", read, validate({ params: ids }), asyncHandler(async (req, res) => out(res, await service.getReconciliation(req.params.id, req.user!))));
diskReconciliationRoutes.post(
  "/:id/items",
  manage,
  validate({ params: ids, body: v.reconciliationItemsSchema }),
  asyncHandler(async (req, res) => out(res, await service.setReconciliationItems(req.params.id, req.body, req.user!, key(req)))),
);
diskReconciliationRoutes.post(
  "/:id/submit",
  manage,
  validate({ params: ids }),
  asyncHandler(async (req, res) => out(res, await service.submitReconciliation(req.params.id, req.user!, key(req)))),
);
diskReconciliationRoutes.post(
  "/:id/review",
  manage,
  validate({ params: ids, body: v.reviewSchema }),
  asyncHandler(async (req, res) => out(res, await service.reviewReconciliation(req.params.id, req.body, req.user!, key(req)))),
);
