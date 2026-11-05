import { Router } from "express";
import { z } from "zod";
import { createHash } from "crypto";
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
import { operation } from "../inventory/inventory.service";
import {
  operationsService as service,
  getDispatch,
  lockDispatch,
  audit,
  event,
} from "./operations.service";
import * as v from "./operations.validators";
const ids = z.object({ id: z.string().uuid() });
const key = (r: import("express").Request) => r.get("Idempotency-Key") ?? "";
export const allocationRoutes = Router(),
  dispatchRoutes = Router(),
  tripRoutes = Router();
for (const r of [allocationRoutes, dispatchRoutes, tripRoutes])
  r.use(authenticate);
const anyPermission =
  (...permissions: string[]): import("express").RequestHandler =>
  (req, _res, next) => {
    if (
      !req.user ||
      !permissions.some((p) => req.user!.permissions.includes(p))
    )
      return next(ApiError.forbidden());
    next();
  };
const read = anyPermission("dispatch:read", "allocation:manage");
const manage = authorize("dispatch:manage");
function output(res: import("express").Response, result: unknown) {
  return ApiResponse.success(res, result);
}
allocationRoutes.get(
  "/lookups",
  read,
  asyncHandler(async (req, res) => {
    output(res, await service.lookups(req.user!));
  }),
);
allocationRoutes.get(
  "/dashboard",
  read,
  asyncHandler(async (req, res) => {
    output(res, await service.dashboard(req.user!));
  }),
);
allocationRoutes.get('/reports',read,asyncHandler(async(req,res)=>{output(res,await service.dashboard(req.user!));}));
allocationRoutes.get(
  "/queue",
  authorize("allocation:manage"),
  asyncHandler(async (req, res) => {
    output(res, await service.queue(req.user!));
  }),
);
allocationRoutes.get(
  "/available",
  authorize("allocation:manage"),
  validate({ query: v.querySchema }),
  asyncHandler(async (req, res) => {
    const r = await service.available(
      req.query as unknown as v.Query,
      req.user!,
    );
    ApiResponse.success(res, r.data, "Available vehicles", 200, r.meta);
  }),
);
allocationRoutes.get(
  "/",
  read,
  validate({ query: v.querySchema }),
  asyncHandler(async (req, res) => {
    const r = await service.listAllocations(
      req.query as unknown as v.Query,
      req.user!,
    );
    ApiResponse.success(res, r.data, "Allocations", 200, r.meta);
  }),
);
allocationRoutes.post(
  "/",
  authorize("allocation:manage"),
  validate({ body: v.allocationSchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await service.allocate(req.body, req.user!, key(req)),
      "Allocation confirmed",
      201,
    );
  }),
);
allocationRoutes.get(
  "/:id",
  read,
  validate({ params: ids }),
  asyncHandler(async (req, res) => {
    output(res, await service.allocation(req.params.id, req.user!));
  }),
);
allocationRoutes.post(
  "/:id/cancel",
  authorize("allocation:manage"),
  validate({ params: ids, body: v.reasonSchema }),
  asyncHandler(async (req, res) => {
    output(
      res,
      await service.cancelAllocation(
        req.params.id,
        req.body.reason,
        req.user!,
        key(req),
      ),
    );
  }),
);
dispatchRoutes.get(
  "/lookups",
  read,
  asyncHandler(async (req, res) => {
    output(res, await service.lookups(req.user!));
  }),
);
dispatchRoutes.get(
  "/dashboard",
  read,
  asyncHandler(async (req, res) => {
    output(res, await service.dashboard(req.user!));
  }),
);
dispatchRoutes.get(
  "/reports",
  read,
  asyncHandler(async (req, res) => {
    output(res, await service.dashboard(req.user!));
  }),
);
dispatchRoutes.get(
  "/drivers",
  manage,
  asyncHandler(async (req, res) => {
    output(res, await service.drivers(req.user!));
  }),
);
dispatchRoutes.post(
  "/drivers",
  manage,
  validate({ body: v.driverSchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await service.saveDriver(undefined, req.body, req.user!, key(req)),
      "Driver created",
      201,
    );
  }),
);
dispatchRoutes.put(
  "/drivers/:id",
  manage,
  validate({ params: ids, body: v.driverSchema }),
  asyncHandler(async (req, res) => {
    output(
      res,
      await service.saveDriver(req.params.id, req.body, req.user!, key(req)),
    );
  }),
);
dispatchRoutes.get(
  "/transporters",
  read,
  asyncHandler(async (req, res) => {
    const a = req.user!;
    output(
      res,
      await prisma.organization.findMany({
        where: {
          type: "TRANSPORT_PARTNER",
          ...(!a.permissions.includes("dispatch:manage")
            ? { id: a.organizationId ?? "__none__" }
            : {}),
        },
        select: {
          id: true,
          name: true,
          contactName: true,
          contactPhone: true,
          contactEmail: true,
          status: true,
        },
      }),
    );
  }),
);
dispatchRoutes.put(
  "/transporters/:id",
  manage,
  validate({
    params: ids,
    body: z.object({
      contactName: z.string().trim().max(150),
      contactPhone: z.string().trim().max(30),
      contactEmail: z.string().email(),
      status: z.enum(["ACTIVE", "INACTIVE"]),
    }),
  }),
  asyncHandler(async (req, res) => {
    output(
      res,
      await operation(
        req.user!,
        key(req),
        "transporter.update",
        { id: req.params.id, ...req.body },
        async (tx) => {
          const o = await tx.organization.findFirst({
            where: { id: req.params.id, type: "TRANSPORT_PARTNER" },
          });
          if (!o) throw ApiError.notFound();
          const r = await tx.organization.update({
            where: { id: o.id },
            data: req.body,
          });
          await audit(tx, req.user!, "transporter.updated", o.id, req.body);
          return r;
        },
      ),
    );
  }),
);
dispatchRoutes.get(
  "/exceptions",
  read,
  asyncHandler(async (req, res) => {
    output(res, await service.exceptions(req.user!));
  }),
);
dispatchRoutes.post(
  "/exceptions",
  anyPermission("dispatch:manage", "trips:update"),
  validate({ body: v.exceptionSchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await service.exception(req.body, req.user!, key(req)),
      "Exception recorded without changing trip status",
      201,
    );
  }),
);
dispatchRoutes.post(
  "/exceptions/:id/resolve",
  manage,
  validate({ params: ids, body: v.resolutionSchema }),
  asyncHandler(async (req, res) => {
    output(
      res,
      await service.resolveException(
        req.params.id,
        req.body.resolutionNotes,
        req.user!,
        key(req),
      ),
    );
  }),
);
dispatchRoutes.get(
  "/",
  read,
  validate({ query: v.querySchema }),
  asyncHandler(async (req, res) => {
    const r = await service.listDispatches(
      req.query as unknown as v.Query,
      req.user!,
    );
    ApiResponse.success(res, r.data, "Dispatches", 200, r.meta);
  }),
);
dispatchRoutes.post(
  "/",
  manage,
  validate({ body: v.dispatchSchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await service.createDispatch(req.body, req.user!, key(req)),
      "Dispatch planned",
      201,
    );
  }),
);
dispatchRoutes.get(
  "/:id",
  read,
  validate({ params: ids }),
  asyncHandler(async (req, res) => {
    output(res, await service.dispatch(req.params.id, req.user!));
  }),
);
dispatchRoutes.put(
  "/:id/checklist/:vehicleId",
  manage,
  validate({
    params: ids.extend({ vehicleId: z.string().uuid() }),
    body: v.checklistSchema,
  }),
  asyncHandler(async (req, res) => {
    output(
      res,
      await service.checklist(
        req.params.id,
        req.params.vehicleId,
        req.body,
        req.user!,
        key(req),
      ),
    );
  }),
);
dispatchRoutes.post(
  "/:id/assignment",
  manage,
  validate({ params: ids, body: v.assignmentSchema }),
  asyncHandler(async (req, res) => {
    output(
      res,
      await service.assignDriver(req.params.id, req.body, req.user!, key(req)),
    );
  }),
);
dispatchRoutes.post(
  "/:id/ready",
  manage,
  validate({ params: ids }),
  asyncHandler(async (req, res) => {
    output(res, await service.ready(req.params.id, req.user!, key(req)));
  }),
);
dispatchRoutes.post(
  "/:id/confirm",
  manage,
  validate({ params: ids }),
  asyncHandler(async (req, res) => {
    output(res, await service.confirm(req.params.id, req.user!, key(req)));
  }),
);
dispatchRoutes.post(
  "/:id/evidence",
  anyPermission("dispatch:manage", "trips:update"),
  validate({ params: ids }),
  uploadSingle("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest("File required");
    const file = req.file;
    const parsed = z
      .object({
        vehicleId: z.string().uuid().optional(),
        exceptionId: z.string().uuid().optional(),
        category: z.enum([
          "FRONT",
          "REAR",
          "SIDE",
          "INTERIOR",
          "DOCUMENT",
          "EXCEPTION",
        ]),
        remarks: z.string().trim().max(2000).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success)
      throw ApiError.unprocessable(
        "Invalid dispatch evidence metadata",
        parsed.error.issues,
      );
    const meta = parsed.data;
    const b = file.buffer;
    const image =
      file.mimetype === "image/png"
        ? b
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : file.mimetype === "image/jpeg"
          ? b[0] === 255 && b[1] === 216
          : file.mimetype === "image/webp"
            ? b.toString("ascii", 0, 4) === "RIFF" &&
              b.toString("ascii", 8, 12) === "WEBP"
            : file.mimetype === "image/gif"
              ? b.toString("ascii", 0, 3) === "GIF"
              : false;
    if (file.mimetype.startsWith("image/") && !image)
      throw ApiError.badRequest(
        "Image content does not match its declared type",
      );
    if (
      ["FRONT", "REAR", "SIDE", "INTERIOR"].includes(meta.category) &&
      (!image || !meta.vehicleId)
    )
      throw ApiError.badRequest(
        "Vehicle photographs require an image and vehicle reference",
      );
    output(
      res,
      await operation(
        req.user!,
        key(req),
        "dispatch.evidence",
        {
          id: req.params.id,
          meta,
          hash: createHash("sha256").update(b).digest("hex"),
        },
        async (tx) => {
          const d = await lockDispatch(tx, req.params.id, req.user!);
          const isManager = req.user!.permissions.includes("dispatch:manage");
          if (!isManager && d.driver.userId !== req.user!.id)
            throw ApiError.forbidden();
          if (
            !isManager &&
            (!meta.exceptionId || meta.category !== "EXCEPTION")
          )
            throw ApiError.forbidden(
              "Drivers may only add assigned-trip exception evidence",
            );
          if (
            meta.vehicleId &&
            !d.vehicles.some((x) => x.vehicleId === meta.vehicleId)
          )
            throw ApiError.badRequest("Vehicle is not in this dispatch");
          if (
            meta.exceptionId &&
            !(await tx.operationalException.findFirst({
              where: { id: meta.exceptionId, tripId: d.trip!.id },
            }))
          )
            throw ApiError.badRequest(
              "Exception is not associated with this trip",
            );
          if (meta.category === "EXCEPTION" && !meta.exceptionId)
            throw ApiError.badRequest("Exception reference is required");
          if (!meta.exceptionId && !["PLANNED", "READY"].includes(d.state))
            throw ApiError.conflict(
              "Dispatch evidence is locked after confirmation/cancellation",
            );
          const stored = await storage.save({
            buffer: b,
            originalName: file.originalname,
            contentType: file.mimetype,
            folder: `dispatch/${d.id}`,
          });
          try {
            const row = await tx.dispatchEvidence.create({
              data: {
                dispatchId: d.id,
                ...meta,
                fileName: file.originalname,
                storageKey: stored.key,
                contentType: file.mimetype,
                size: file.size,
                uploadedById: req.user!.id,
              },
            });
            await event(
              tx,
              d.trip!.id,
              req.user!,
              "EVIDENCE",
              `${meta.category} evidence added`,
            );
            await audit(tx, req.user!, "dispatch.evidence", d.id, {
              evidenceId: row.id,
            });
            return row;
          } catch (e) {
            await storage.remove(stored.key);
            throw e;
          }
        },
      ),
    );
  }),
);
dispatchRoutes.get(
  "/evidence/:id/download",
  read,
  validate({ params: ids }),
  asyncHandler(async (req, res) => {
    const e = await prisma.dispatchEvidence.findUnique({
      where: { id: req.params.id },
    });
    if (!e) throw ApiError.notFound();
    await getDispatch(prisma, e.dispatchId, req.user!);
    res
      .type(e.contentType)
      .attachment(e.fileName)
      .send(await storage.read(e.storageKey));
  }),
);
tripRoutes.get(
  "/tracking-ready",
  read,
  validate({ query: v.querySchema }),
  asyncHandler(async (req, res) => {
    const r = await service.tripList(
      req.query as unknown as v.Query,
      req.user!,
      true,
    );
    ApiResponse.success(
      res,
      r.data.map((t) => ({
        tripId: t.id,
        reference: t.reference,
        dispatchId: t.dispatchId,
        status: t.status,
        driverId: t.dispatch.driverId,
        vehicleIds: t.dispatch.vehicles.map((v) => v.vehicleId),
        sourceDepotId: t.dispatch.sourceDepotId,
        destinationDepotId: t.dispatch.destinationDepotId,
      })),
      "Tracking integration candidates",
      200,
      r.meta,
    );
  }),
);
tripRoutes.get(
  "/",
  read,
  validate({ query: v.querySchema }),
  asyncHandler(async (req, res) => {
    const r = await service.tripList(
      req.query as unknown as v.Query,
      req.user!,
    );
    ApiResponse.success(res, r.data, "Trips", 200, r.meta);
  }),
);
// Dispatch creation normally creates the trip. This idempotent entry point resolves/repairs a planned trip without duplication.
tripRoutes.post('/',manage,validate({body:z.object({dispatchId:z.string().uuid()})}),asyncHandler(async(req,res)=>{
 output(res,await operation(req.user!,key(req),'trip.ensure',req.body,async tx=>{
   const d=await lockDispatch(tx,req.body.dispatchId,req.user!);
   if(d.trip)return d.trip;
   if(d.state!=='PLANNED')throw ApiError.conflict('Only a planned dispatch can create a missing trip');
   const c=await tx.counter.upsert({where:{name:'trip'},create:{name:'trip',value:1},update:{value:{increment:1}}});
   const trip=await tx.trip.create({data:{dispatchId:d.id,reference:`FG-TRP-${String(c.value).padStart(6,'0')}`}});
   await event(tx,trip.id,req.user!,'CREATED','Planned trip created for dispatch');await audit(tx,req.user!,'trip.created',trip.id,{dispatchId:d.id});return trip;
 }));
}));
tripRoutes.get(
  "/:id",
  read,
  validate({ params: ids }),
  asyncHandler(async (req, res) => {
    output(res, await service.trip(req.params.id, req.user!));
  }),
);
tripRoutes.get(
  "/:id/events",
  read,
  validate({ params: ids }),
  asyncHandler(async (req, res) => {
    const r = await service.trip(req.params.id, req.user!);
    output(res, r.events);
  }),
);
tripRoutes.post(
  "/:id/status",
  anyPermission("dispatch:manage", "trips:update"),
  validate({ params: ids, body: v.tripStatusSchema }),
  asyncHandler(async (req, res) => {
    output(
      res,
      await service.tripStatus(req.params.id, req.body, req.user!, key(req)),
    );
  }),
);
