import { Router, type RequestHandler } from "express";
import multer from "multer";
import { z } from "zod";
import {
  authenticate,
  authorize,
  validate,
  uploadSingle,
} from "../../middlewares";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { prisma } from "../../database/prisma";
import { storage } from "../../utils/storage";
import {
  inventoryService as service,
  inventoryScope,
  operation,
  scopedInventory,
  audit,
} from "./inventory.service";
import { reconciliationService as reconciliation } from "./reconciliation.service";
import * as schemas from "./inventory.validators";
import {
  readWorkbook,
  template,
  validateRows,
  commitRows,
  IMPORT_COLUMNS,
} from "./import.service";
const router = Router();
router.use(authenticate);
const key = (req: import("express").Request) =>
  req.get("Idempotency-Key") ?? "";
const idParams = z.object({ id: z.string().uuid() });
const importBounds: RequestHandler = (req, _res, next) => {
  if (
    !Array.isArray(req.body?.rows) ||
    req.body.rows.length < 1 ||
    req.body.rows.length > 1000
  )
    return next(ApiError.badRequest("Import requires 1?1,000 rows"));
  if (
    req.body.rows.some(
      (row: unknown) =>
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        Object.keys(row).length > 80,
    )
  )
    return next(
      ApiError.badRequest("Invalid import row shape or more than 80 columns"),
    );
  next();
};
const read = authorize("inventory:read");
const manage = authorize("inventory:manage");
router.get(
  "/lookups",
  read,
  asyncHandler(async (req, res) => {
    ApiResponse.success(res, await service.lookups(req.user!));
  }),
);
router.get(
  "/dashboard",
  read,
  asyncHandler(async (req, res) => {
    ApiResponse.success(res, await service.dashboard(req.user!));
  }),
);
router.get(
  "/vehicles",
  read,
  validate({ query: schemas.listSchema }),
  asyncHandler(async (req, res) => {
    const out = await service.list(
      req.query as unknown as schemas.InventoryQuery,
      req.user!,
    );
    ApiResponse.success(res, out.data, "Inventory", 200, out.meta);
  }),
);
router.post(
  "/receipts",
  manage,
  validate({ body: schemas.receiptSchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await service.receive(req.body, req.user!, key(req)),
      "Vehicle received",
      201,
    );
  }),
);
router.get(
  "/reservations",
  read,
  asyncHandler(async (req, res) => {
    ApiResponse.success(res, await service.reservations(req.user!));
  }),
);
router.post(
  "/reservations",
  authorize("inventory:reserve"),
  validate({ body: schemas.reservationSchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await service.reserve(req.body, req.user!, key(req)),
      "Reservation created",
      201,
    );
  }),
);
router.post(
  "/reservations/:id/cancel",
  authorize("inventory:reserve"),
  validate({ params: idParams, body: schemas.reasonSchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await service.cancel(req.params.id, req.body.reason, req.user!, key(req)),
    );
  }),
);
router.post(
  "/transfers",
  manage,
  validate({ body: schemas.transferSchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await service.transfer(req.body, req.user!, key(req)),
      "Movement recorded",
    );
  }),
);
router.get(
  "/vehicles/:id",
  read,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(res, await service.details(req.params.id, req.user!));
  }),
);
router.get(
  "/vehicles/:id/availability",
  read,
  validate({ params: idParams, query: schemas.availabilitySchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await service.availability(req.params.id, req.query, req.user!),
    );
  }),
);
router.get(
  "/vehicles/:id/movements",
  read,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await scopedInventory(prisma, req.params.id, req.user!);
    ApiResponse.success(
      res,
      await prisma.vehicleMovement.findMany({
        where: { vehicleId: req.params.id },
        orderBy: { occurredAt: "desc" },
      }),
    );
  }),
);
router.get(
  "/vehicles/:id/custody",
  read,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const inv = await scopedInventory(prisma, req.params.id, req.user!);
    ApiResponse.success(res, {
      current: {
        type: inv.currentCustodianType,
        id: inv.currentCustodianId,
        depotId: inv.currentDepotId,
      },
      history: await prisma.vehicleCustody.findMany({
        where: { vehicleId: req.params.id },
        orderBy: { fromDate: "desc" },
      }),
    });
  }),
);
router.post(
  "/vehicles/:id/status",
  manage,
  validate({ params: idParams, body: schemas.statusSchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await service.changeStatus(
        req.params.id,
        req.body.status,
        req.body.reason,
        req.user!,
        key(req),
      ),
    );
  }),
);
router.get(
  "/reconciliations",
  read,
  asyncHandler(async (req, res) => {
    ApiResponse.success(res, await reconciliation.list(req.user!));
  }),
);
router.post(
  "/reconciliations",
  manage,
  validate({ body: schemas.reconciliationSchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await reconciliation.create(req.body, req.user!, key(req)),
      "Reconciliation started",
      201,
    );
  }),
);
router.get(
  "/reconciliations/:id",
  read,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await reconciliation.get(req.params.id, req.user!),
    );
  }),
);
router.post(
  "/reconciliations/:id/items",
  manage,
  validate({ params: idParams, body: schemas.itemSchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await reconciliation.item(
        req.params.id,
        undefined,
        req.body,
        req.user!,
        key(req),
      ),
    );
  }),
);
router.put(
  "/reconciliations/:id/items/:itemId",
  manage,
  validate({
    params: idParams.extend({ itemId: z.string().uuid() }),
    body: schemas.itemSchema,
  }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await reconciliation.item(
        req.params.id,
        req.params.itemId,
        req.body,
        req.user!,
        key(req),
      ),
    );
  }),
);
router.post(
  "/reconciliations/:id/submit",
  manage,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await reconciliation.submit(req.params.id, req.user!, key(req)),
    );
  }),
);
router.post(
  "/reconciliations/:id/review",
  authorize("inventory:review"),
  validate({ params: idParams, body: schemas.reviewSchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await reconciliation.review(
        req.params.id,
        req.body.decision,
        req.body.comment,
        req.user!,
        key(req),
      ),
    );
  }),
);
router.get(
  "/adjustments",
  read,
  asyncHandler(async (req, res) => {
    const ids = await prisma.vehicleInventory.findMany({
      where: inventoryScope(req.user!),
      select: { vehicleId: true },
    });
    ApiResponse.success(
      res,
      await prisma.inventoryAdjustment.findMany({
        where: { vehicleId: { in: ids.map((r) => r.vehicleId) } },
        orderBy: { createdAt: "desc" },
      }),
    );
  }),
);
router.get(
  "/reports",
  read,
  asyncHandler(async (req, res) => {
    ApiResponse.success(res, {
      inventory: await service.dashboard(req.user!),
      reconciliations: await reconciliation.list(req.user!),
    });
  }),
);
router.get(
  "/import/template",
  manage,
  asyncHandler(async (_req, res) => {
    res
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .attachment("fleetgo-inventory-template.xlsx")
      .send(Buffer.from(await template()));
  }),
);
router.get(
  "/import/columns",
  manage,
  asyncHandler(async (_req, res) => {
    ApiResponse.success(res, IMPORT_COLUMNS);
  }),
);
const fileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 5 * 1024 * 1024 },
}).single("file");
router.post(
  "/import/file",
  manage,
  (req, res, next) =>
    fileUpload(req, res, (error) =>
      next(error ? ApiError.badRequest(error.message) : undefined),
    ),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest("Choose an Excel or CSV file");
    ApiResponse.success(
      res,
      await readWorkbook(req.file.buffer, req.file.originalname),
    );
  }),
);
router.post(
  "/import/validate",
  manage,
  importBounds,
  validate({ body: schemas.importSchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(res, await validateRows(req.body.rows, req.user!));
  }),
);
router.post(
  "/import/commit",
  manage,
  importBounds,
  validate({ body: schemas.importSchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await commitRows(req.body.rows, req.user!, key(req)),
    );
  }),
);
// Evidence is append-only and scoped to its vehicle or reconciliation. Metadata lives in DB; bytes use existing storage.
for (const context of ["vehicles", "reconciliations"] as const) {
  router.post(
    `/${context}/:id/evidence`,
    manage,
    validate({
      params: idParams,
      query: z.object({ movementId: z.string().uuid().optional() }),
    }),
    uploadSingle("file"),
    asyncHandler(async (req, res) => {
      if (!req.file) throw ApiError.badRequest("Choose an image or PDF");
      const file = req.file;
      const movementId = req.query.movementId as string | undefined;
      if (context === "reconciliations" && movementId)
        throw ApiError.badRequest(
          "Movement evidence must be uploaded through its vehicle",
        );
      const out = await operation(
        req.user!,
        key(req),
        "evidence",
        {
          context,
          id: req.params.id,
          movementId,
          fileName: file.originalname,
          size: file.size,
          hash: require("crypto")
            .createHash("sha256")
            .update(file.buffer)
            .digest("hex"),
        },
        async (tx) => {
          if (context === "vehicles") {
            await scopedInventory(tx, req.params.id, req.user!);
            if (
              movementId &&
              !(await tx.vehicleMovement.findFirst({
                where: { id: movementId, vehicleId: req.params.id },
              }))
            )
              throw ApiError.badRequest(
                "Movement does not belong to this vehicle",
              );
          } else {
            await reconciliation.get(req.params.id, req.user!);
            await tx.$queryRaw`SELECT id FROM inventory_reconciliations WHERE id=${req.params.id} FOR UPDATE`;
            const r = await tx.inventoryReconciliation.findUniqueOrThrow({
              where: { id: req.params.id },
            });
            if (r.status !== "DRAFT")
              throw ApiError.conflict(
                "Evidence can only be added to draft reconciliations",
              );
          }
          const stored = await storage.save({
            buffer: file.buffer,
            originalName: file.originalname,
            contentType: file.mimetype,
            folder: `inventory/${req.params.id}`,
          });
          try {
            const row = await tx.inventoryPhoto.create({
              data: {
                vehicleId: context === "vehicles" ? req.params.id : undefined,
                reconciliationId:
                  context === "reconciliations" ? req.params.id : undefined,
                movementId,
                context: movementId
                  ? "MOVEMENT"
                  : context === "vehicles"
                    ? "RECEIPT"
                    : "RECONCILIATION",
                fileName: file.originalname,
                storageKey: stored.key,
                contentType: file.mimetype,
                size: file.size,
                uploadedById: req.user!.id,
              },
            });
            await audit(
              tx,
              req.user!,
              "inventory.evidence.added",
              req.params.id,
              { id: row.id, fileName: row.fileName },
            );
            return row;
          } catch (e) {
            await storage.remove(stored.key);
            throw e;
          }
        },
      );
      ApiResponse.success(res, out, "Evidence uploaded", 201);
    }),
  );
}
router.get(
  "/evidence/:id/download",
  read,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const file = await prisma.inventoryPhoto.findUnique({
      where: { id: req.params.id },
    });
    if (!file) throw ApiError.notFound();
    if (file.vehicleId)
      await scopedInventory(prisma, file.vehicleId, req.user!);
    else if (file.reconciliationId)
      await reconciliation.get(file.reconciliationId, req.user!);
    else throw ApiError.forbidden();
    res
      .type(file.contentType)
      .attachment(file.fileName)
      .send(await storage.read(file.storageKey));
  }),
);
export const inventoryRoutes = router;
