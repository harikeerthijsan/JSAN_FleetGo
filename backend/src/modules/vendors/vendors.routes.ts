import { Router } from "express";
import type { RequestHandler } from "express";
import { z } from "zod";
import { authenticate, authorize, validate, uploadSingle } from "../../middlewares";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { vendorsService as service } from "./vendors.service";
import * as v from "./vendors.validators";

const idParam = z.object({ id: z.string().uuid() });
const contactParam = z.object({ id: z.string().uuid(), contactId: z.string().uuid() });
const locationParam = z.object({ id: z.string().uuid(), locationId: z.string().uuid() });
const userParam = z.object({ id: z.string().uuid(), userId: z.string().uuid() });
const docParam = z.object({ id: z.string().uuid(), docId: z.string().uuid() });

const out = (res: import("express").Response, data: unknown, status = 200) =>
  ApiResponse.success(res, data, undefined, status);

// vendors:read OR vendors:manage may read; writes require vendors:manage.
const read: RequestHandler = (req, _res, next) => {
  if (!req.user || !["vendors:read", "vendors:manage"].some((p) => req.user!.permissions.includes(p)))
    return next(ApiError.forbidden());
  next();
};
const manage = authorize("vendors:manage");

const router = Router();
router.use(authenticate);

router.get("/lookups", read, asyncHandler(async (req, res) => out(res, await service.lookups(req.user!))));

router.get(
  "/",
  read,
  validate({ query: v.listQuerySchema }),
  asyncHandler(async (req, res) => {
    const r = await service.list(req.query as unknown as v.ListQuery, req.user!);
    ApiResponse.success(res, r.data, "Vendors", 200, r.meta);
  }),
);
router.post(
  "/",
  manage,
  validate({ body: v.registerSchema }),
  asyncHandler(async (req, res) => out(res, await service.register(req.body, req.user!), 201)),
);
router.get("/:id", read, validate({ params: idParam }), asyncHandler(async (req, res) => out(res, await service.getById(req.params.id, req.user!))));
router.put(
  "/:id",
  manage,
  validate({ params: idParam, body: v.updateSchema }),
  asyncHandler(async (req, res) => out(res, await service.update(req.params.id, req.body, req.user!))),
);
router.post(
  "/:id/status",
  manage,
  validate({ params: idParam, body: v.statusSchema }),
  asyncHandler(async (req, res) => out(res, await service.setStatus(req.params.id, req.body.status, req.user!))),
);

// Assigned users
router.get("/:id/users", read, validate({ params: idParam }), asyncHandler(async (req, res) => out(res, await service.listUsers(req.params.id, req.user!))));
router.post(
  "/:id/users",
  manage,
  validate({ params: idParam, body: v.assignUserSchema }),
  asyncHandler(async (req, res) => out(res, await service.assignUser(req.params.id, req.body.userId, req.user!), 201)),
);
router.delete(
  "/:id/users/:userId",
  manage,
  validate({ params: userParam }),
  asyncHandler(async (req, res) => out(res, await service.unassignUser(req.params.id, req.params.userId, req.user!))),
);

// Contacts
router.post(
  "/:id/contacts",
  manage,
  validate({ params: idParam, body: v.contactSchema }),
  asyncHandler(async (req, res) => out(res, await service.addContact(req.params.id, req.body, req.user!), 201)),
);
router.put(
  "/:id/contacts/:contactId",
  manage,
  validate({ params: contactParam, body: v.contactSchema }),
  asyncHandler(async (req, res) => out(res, await service.updateContact(req.params.id, req.params.contactId, req.body, req.user!))),
);
router.delete(
  "/:id/contacts/:contactId",
  manage,
  validate({ params: contactParam }),
  asyncHandler(async (req, res) => out(res, await service.deleteContact(req.params.id, req.params.contactId, req.user!))),
);

// Locations
router.post(
  "/:id/locations",
  manage,
  validate({ params: idParam, body: v.locationSchema }),
  asyncHandler(async (req, res) => out(res, await service.addLocation(req.params.id, req.body, req.user!), 201)),
);
router.put(
  "/:id/locations/:locationId",
  manage,
  validate({ params: locationParam, body: v.locationSchema }),
  asyncHandler(async (req, res) => out(res, await service.updateLocation(req.params.id, req.params.locationId, req.body, req.user!))),
);
router.delete(
  "/:id/locations/:locationId",
  manage,
  validate({ params: locationParam }),
  asyncHandler(async (req, res) => out(res, await service.deleteLocation(req.params.id, req.params.locationId, req.user!))),
);

// Documents — agreements, consent forms, supporting files
router.get(
  "/:id/documents",
  read,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => out(res, await service.listDocuments(req.params.id, req.user!))),
);
router.post(
  "/:id/documents",
  manage,
  validate({ params: idParam }),
  uploadSingle("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest("A file is required");
    const category = v.DOCUMENT_CATEGORIES.includes(req.body.category) ? req.body.category : "OTHER";
    const title = typeof req.body.title === "string" ? req.body.title : undefined;
    out(res, await service.addDocument(req.params.id, req.file, { category, title }, req.user!), 201);
  }),
);
router.get(
  "/:id/documents/:docId/download",
  read,
  validate({ params: docParam }),
  asyncHandler(async (req, res) => {
    const { doc, buffer } = await service.downloadDocument(req.params.id, req.params.docId, req.user!);
    res.type(doc.contentType).attachment(doc.fileName).send(buffer);
  }),
);
router.delete(
  "/:id/documents/:docId",
  manage,
  validate({ params: docParam }),
  asyncHandler(async (req, res) => out(res, await service.deleteDocument(req.params.id, req.params.docId, req.user!))),
);

// Vendor-wise inventory
router.get(
  "/:id/vehicles",
  read,
  validate({ params: idParam, query: v.listQuerySchema }),
  asyncHandler(async (req, res) => {
    const r = await service.vehicles(req.params.id, req.query as unknown as v.ListQuery, req.user!);
    ApiResponse.success(res, r.data, "Vendor vehicles", 200, r.meta);
  }),
);
router.get(
  "/:id/disks",
  read,
  validate({ params: idParam, query: v.listQuerySchema }),
  asyncHandler(async (req, res) => {
    const r = await service.disks(req.params.id, req.query as unknown as v.ListQuery, req.user!);
    ApiResponse.success(res, r.data, "Vendor disks", 200, r.meta);
  }),
);

export const vendorsRoutes = router;
