import { Router } from "express";
import type { RequestHandler } from "express";
import { z } from "zod";
import { authenticate, authorize, validate, uploadMediaSingle, uploadClaimMedia } from "../../middlewares";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { claimsService as service } from "./claims.service";
import * as v from "./claims.validators";

const idParam = z.object({ id: z.string().uuid() });
const attParam = z.object({ id: z.string().uuid(), attachmentId: z.string().uuid() });
const out = (res: import("express").Response, data: unknown, status = 200) => ApiResponse.success(res, data, undefined, status);

// claims:read OR report OR manage may read; report/manage gate writes.
const read: RequestHandler = (req, _res, next) => {
  if (!req.user || !["claims:read", "claims:report", "claims:manage"].some((p) => req.user!.permissions.includes(p)))
    return next(ApiError.forbidden());
  next();
};
const report = authorize("claims:report");
const manage = authorize("claims:manage");

const router = Router();
router.use(authenticate);

router.get("/lookups", read, asyncHandler(async (req, res) => out(res, await service.lookups(req.user!))));
router.get("/dashboard", read, asyncHandler(async (req, res) => out(res, await service.dashboard(req.user!))));

router.get(
  "/",
  read,
  validate({ query: v.listQuerySchema }),
  asyncHandler(async (req, res) => {
    const r = await service.list(req.query as unknown as v.ListQuery, req.user!);
    ApiResponse.success(res, r.data, "Claims", 200, r.meta);
  }),
);
router.post(
  "/",
  report,
  uploadClaimMedia(),
  validate({ body: v.createSchema }),
  asyncHandler(async (req, res) => out(res, await service.create(req.body, req.user!, Array.isArray(req.files) ? req.files : []), 201)),
);
router.get("/:id", read, validate({ params: idParam }), asyncHandler(async (req, res) => out(res, await service.getById(req.params.id, req.user!))));
router.put(
  "/:id",
  report,
  validate({ params: idParam, body: v.updateSchema }),
  asyncHandler(async (req, res) => out(res, await service.update(req.params.id, req.body, req.user!))),
);

// Receiver processing
router.post(
  "/:id/process",
  manage,
  validate({ params: idParam, body: v.processSchema }),
  asyncHandler(async (req, res) => out(res, await service.process(req.params.id, req.body, req.user!))),
);
router.post(
  "/:id/acknowledge",
  manage,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => out(res, await service.acknowledge(req.params.id, req.user!))),
);

// Evidence (photos / videos / documents)
router.post(
  "/:id/attachments",
  report,
  validate({ params: idParam }),
  uploadMediaSingle("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest("A file is required");
    const caption = typeof req.body.caption === "string" ? req.body.caption : undefined;
    out(res, await service.addAttachment(req.params.id, req.file, caption, req.user!), 201);
  }),
);
router.get(
  "/:id/attachments/:attachmentId/download",
  read,
  validate({ params: attParam }),
  asyncHandler(async (req, res) => {
    const { att, buffer } = await service.downloadAttachment(req.params.id, req.params.attachmentId, req.user!);
    res.type(att.contentType).attachment(att.fileName).send(buffer);
  }),
);
router.delete(
  "/:id/attachments/:attachmentId",
  report,
  validate({ params: attParam }),
  asyncHandler(async (req, res) => out(res, await service.deleteAttachment(req.params.id, req.params.attachmentId, req.user!))),
);

export const claimsRoutes = router;
