import { Router } from "express";
import type { Request, RequestHandler } from "express";
import { z } from "zod";
import {
  authenticate,
  validate,
  uploadSingle,
} from "../../middlewares";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { inspectionsService as service } from "./inspections.service";
import { renderPodHtml } from "./pod.html";
import * as v from "./inspections.validators";

const ids = z.object({ id: z.string().uuid() });
const key = (r: Request) => r.get("Idempotency-Key") ?? "";
const out = (res: import("express").Response, result: unknown, status = 200) =>
  ApiResponse.success(res, result, undefined, status);

const anyPermission =
  (...permissions: string[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !permissions.some((p) => req.user!.permissions.includes(p)))
      return next(ApiError.forbidden());
    next();
  };

const read = anyPermission(
  "inspections:read",
  "inspections:manage",
  "inspections:confirm",
);

export const inspectionsRoutes = Router();
export const handoverRoutes = Router();
export const discrepanciesRoutes = Router();
for (const r of [inspectionsRoutes, handoverRoutes, discrepanciesRoutes])
  r.use(authenticate);

// ---------------------------------------------------------------------------
// Inspections
// ---------------------------------------------------------------------------
inspectionsRoutes.get(
  "/lookups",
  read,
  asyncHandler(async (req, res) => out(res, await service.lookups(req.user!))),
);
inspectionsRoutes.get(
  "/dashboard",
  read,
  asyncHandler(async (req, res) => out(res, await service.dashboard(req.user!))),
);
inspectionsRoutes.get(
  "/reports",
  read,
  asyncHandler(async (req, res) => out(res, await service.dashboard(req.user!))),
);

// Templates
inspectionsRoutes.get(
  "/templates",
  read,
  asyncHandler(async (req, res) => out(res, await service.templates(req.user!))),
);
inspectionsRoutes.post(
  "/templates",
  anyPermission("inspections:manage"),
  validate({ body: v.templateSchema }),
  asyncHandler(async (req, res) =>
    out(res, await service.saveTemplate(undefined, req.body, req.user!, key(req)), 201),
  ),
);
inspectionsRoutes.put(
  "/templates/:id",
  anyPermission("inspections:manage"),
  validate({ params: ids, body: v.templateSchema }),
  asyncHandler(async (req, res) =>
    out(res, await service.saveTemplate(req.params.id, req.body, req.user!, key(req))),
  ),
);

// Photo comparison baseline
inspectionsRoutes.get(
  "/comparison/:vehicleId",
  read,
  validate({
    params: z.object({ vehicleId: z.string().uuid() }),
    query: z.object({ dispatchId: z.string().uuid().optional() }),
  }),
  asyncHandler(async (req, res) =>
    out(
      res,
      await service.comparison(
        req.params.vehicleId,
        req.query.dispatchId as string | undefined,
        req.user!,
      ),
    ),
  ),
);

// Photo / evidence download (authorized, scope-checked)
inspectionsRoutes.get(
  "/photos/:id/download",
  read,
  validate({ params: ids }),
  asyncHandler(async (req, res) => {
    const { photo, buffer } = await service.downloadPhoto(req.params.id, req.user!);
    res.type(photo.contentType).attachment(photo.fileName).send(buffer);
  }),
);
inspectionsRoutes.get(
  "/evidence/:id/download",
  read,
  validate({ params: ids }),
  asyncHandler(async (req, res) => {
    const { evidence, buffer } = await service.downloadEvidence(
      req.params.id,
      req.user!,
    );
    res.type(evidence.contentType).attachment(evidence.fileName).send(buffer);
  }),
);

inspectionsRoutes.get(
  "/",
  read,
  validate({ query: v.querySchema }),
  asyncHandler(async (req, res) => {
    const r = await service.list(req.query as unknown as v.Query, req.user!);
    ApiResponse.success(res, r.data, "Inspections", 200, r.meta);
  }),
);
inspectionsRoutes.post(
  "/",
  read,
  validate({ body: v.createSchema }),
  asyncHandler(async (req, res) =>
    out(res, await service.create(req.body, req.user!, key(req)), 201),
  ),
);
inspectionsRoutes.get(
  "/:id",
  read,
  validate({ params: ids }),
  asyncHandler(async (req, res) => out(res, await service.get(req.params.id, req.user!))),
);
inspectionsRoutes.put(
  "/:id",
  read,
  validate({ params: ids, body: v.updateSchema }),
  asyncHandler(async (req, res) =>
    out(res, await service.update(req.params.id, req.body, req.user!, key(req))),
  ),
);
inspectionsRoutes.post(
  "/:id/submit",
  read,
  validate({ params: ids }),
  asyncHandler(async (req, res) =>
    out(res, await service.submit(req.params.id, req.user!, key(req))),
  ),
);
inspectionsRoutes.post(
  "/:id/review",
  anyPermission("inspections:review"),
  validate({ params: ids, body: v.reviewSchema }),
  asyncHandler(async (req, res) =>
    out(res, await service.review(req.params.id, req.body, req.user!, key(req))),
  ),
);
inspectionsRoutes.post(
  "/:id/complete",
  anyPermission("inspections:manage"),
  validate({ params: ids }),
  asyncHandler(async (req, res) =>
    out(res, await service.complete(req.params.id, req.user!, key(req))),
  ),
);
inspectionsRoutes.post(
  "/:id/amend",
  anyPermission("inspections:manage"),
  validate({ params: ids }),
  asyncHandler(async (req, res) =>
    out(res, await service.amend(req.params.id, req.user!, key(req)), 201),
  ),
);
inspectionsRoutes.post(
  "/:id/photos",
  read,
  validate({ params: ids }),
  uploadSingle("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest("File required");
    const meta = v.photoMetaSchema.parse(req.body);
    out(
      res,
      await service.uploadPhoto(req.params.id, req.file, meta, req.user!, key(req)),
      201,
    );
  }),
);
inspectionsRoutes.post(
  "/:id/photos/reuse",
  read,
  validate({ params: ids, body: v.reusePhotoSchema }),
  asyncHandler(async (req, res) =>
    out(res, await service.reusePhoto(req.params.id, req.body, req.user!, key(req)), 201),
  ),
);
inspectionsRoutes.post(
  "/:id/evidence",
  read,
  validate({ params: ids }),
  uploadSingle("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest("File required");
    const meta = v.evidenceMetaSchema.parse(req.body);
    out(
      res,
      await service.uploadEvidence(req.params.id, req.file, meta, req.user!, key(req)),
      201,
    );
  }),
);

// ---------------------------------------------------------------------------
// Discrepancies  (/api/v1/discrepancies)
// ---------------------------------------------------------------------------
discrepanciesRoutes.get(
  "/",
  read,
  validate({ query: v.querySchema }),
  asyncHandler(async (req, res) => {
    const r = await service.listDiscrepancies(
      req.query as unknown as v.Query,
      req.user!,
    );
    ApiResponse.success(res, r.data, "Discrepancies", 200, r.meta);
  }),
);
discrepanciesRoutes.post(
  "/",
  anyPermission("inspections:confirm", "inspections:manage"),
  validate({ body: v.discrepancySchema }),
  asyncHandler(async (req, res) =>
    out(res, await service.createDiscrepancy(req.body, req.user!, key(req)), 201),
  ),
);
discrepanciesRoutes.get(
  "/:id",
  read,
  validate({ params: ids }),
  asyncHandler(async (req, res) =>
    out(res, await service.getDiscrepancy(req.params.id, req.user!)),
  ),
);
discrepanciesRoutes.post(
  "/:id/transition",
  anyPermission("inspections:confirm", "inspections:manage", "inspections:review"),
  validate({ params: ids, body: v.discrepancyTransitionSchema }),
  asyncHandler(async (req, res) =>
    out(
      res,
      await service.transitionDiscrepancy(req.params.id, req.body, req.user!, key(req)),
    ),
  ),
);
discrepanciesRoutes.post(
  "/:id/comments",
  anyPermission("inspections:confirm", "inspections:manage", "inspections:review"),
  validate({ params: ids, body: v.commentSchema }),
  asyncHandler(async (req, res) =>
    out(res, await service.commentDiscrepancy(req.params.id, req.body.body, req.user!), 201),
  ),
);
discrepanciesRoutes.post(
  "/:id/evidence",
  anyPermission("inspections:confirm", "inspections:manage", "inspections:review"),
  validate({ params: ids }),
  uploadSingle("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest("File required");
    const meta = v.evidenceMetaSchema.parse(req.body);
    out(
      res,
      await service.uploadDiscrepancyEvidence(
        req.params.id,
        req.file,
        meta,
        req.user!,
        key(req),
      ),
      201,
    );
  }),
);

// ---------------------------------------------------------------------------
// Digital handover + POD  (/api/v1/handover)
// ---------------------------------------------------------------------------
handoverRoutes.get(
  "/",
  read,
  validate({ query: v.querySchema }),
  asyncHandler(async (req, res) => {
    const r = await service.listHandovers(req.query as unknown as v.Query, req.user!);
    ApiResponse.success(res, r.data, "Handovers", 200, r.meta);
  }),
);
handoverRoutes.post(
  "/",
  anyPermission("inspections:confirm", "inspections:manage"),
  validate({ body: v.handoverSchema }),
  asyncHandler(async (req, res) =>
    out(res, await service.createHandover(req.body, req.user!, key(req)), 201),
  ),
);
// POD collection routes must precede "/:id".
handoverRoutes.get(
  "/pod",
  read,
  validate({ query: v.querySchema }),
  asyncHandler(async (req, res) => {
    const r = await service.listPods(req.query as unknown as v.Query, req.user!);
    ApiResponse.success(res, r.data, "Proofs of delivery", 200, r.meta);
  }),
);
handoverRoutes.post(
  "/pod",
  anyPermission("inspections:manage"),
  validate({ body: v.podSchema }),
  asyncHandler(async (req, res) =>
    out(res, await service.generatePod(req.body, req.user!, key(req)), 201),
  ),
);
handoverRoutes.get(
  "/pod/:id",
  read,
  validate({ params: ids }),
  asyncHandler(async (req, res) => out(res, await service.getPod(req.params.id, req.user!))),
);
handoverRoutes.get(
  "/pod/:id/document",
  read,
  validate({ params: ids }),
  asyncHandler(async (req, res) => {
    const pod = await service.getPod(req.params.id, req.user!);
    res.type("text/html").send(renderPodHtml(pod));
  }),
);
handoverRoutes.get(
  "/:id",
  read,
  validate({ params: ids }),
  asyncHandler(async (req, res) =>
    out(res, await service.getHandover(req.params.id, req.user!)),
  ),
);
handoverRoutes.post(
  "/:id/acknowledge",
  anyPermission("inspections:confirm", "inspections:manage"),
  validate({ params: ids, body: v.acknowledgeSchema }),
  asyncHandler(async (req, res) =>
    out(res, await service.acknowledgeHandover(req.params.id, req.body, req.user!, key(req)), 201),
  ),
);
handoverRoutes.post(
  "/:id/confirm",
  anyPermission("inspections:confirm", "inspections:manage"),
  validate({ params: ids }),
  asyncHandler(async (req, res) =>
    out(res, await service.confirmHandover(req.params.id, req.user!, key(req))),
  ),
);
