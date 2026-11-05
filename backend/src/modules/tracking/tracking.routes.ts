import { Router } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { authenticate, authorize, validate } from "../../middlewares";
import { ApiError } from "../../utils/ApiError";
import { ApiResponse } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { prisma } from "../../database/prisma";
import { logger } from "../../utils/logger";
import {
  trackingService as service,
  isTrackingAdmin,
  simulationEnabled,
} from "./tracking.service";
import { providerAdapter } from "./tracking.providers";
import { operationsService } from "../operations/operations.service";
import * as v from "./tracking.validators";
const router = Router(),
  ids = z.object({ id: z.string().uuid() });
const key = (r: import("express").Request) => r.get("Idempotency-Key") ?? "";
router.post(
  "/webhooks/:slug",
  rateLimit({
    windowMs: 60000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  asyncHandler(async (req, res) => {
    const p = await prisma.gPSProviderConfiguration.findUnique({
      where: { slug: req.params.slug },
    });
    if (!p || !p.isActive || p.adapter !== "GENERIC_WEBHOOK")
      throw ApiError.unauthorized("Unknown or inactive webhook provider");
    if (p.mode === "SIMULATED" && !simulationEnabled())
      throw ApiError.forbidden("Simulation is disabled");
    const secret = p.webhookSecretEnv
      ? process.env[p.webhookSecretEnv]
      : undefined;
    const timestamp = req.get("X-GPS-Timestamp") ?? "",
      signature = (req.get("X-GPS-Signature") ?? "").replace(/^sha256=/, "");
    if (
      !secret ||
      !/^\d{10}$/.test(timestamp) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
      !/^[a-f0-9]{64}$/i.test(signature) ||
      !Buffer.isBuffer(req.body)
    )
      throw ApiError.unauthorized("Webhook authentication failed");
    const expected = createHmac("sha256", secret)
      .update(timestamp + ".")
      .update(req.body)
      .digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
      throw ApiError.unauthorized("Webhook signature is invalid");
    try {
      let payload: unknown;
      try {
        payload = JSON.parse(req.body.toString("utf8"));
      } catch {
        throw ApiError.badRequest("Invalid webhook JSON");
      }
      const out = await service.ingest(
        p.id,
        providerAdapter(p.adapter).normalize(payload),
      );
      ApiResponse.success(
        res,
        out,
        "GPS batch processed; inspect per-event results",
      );
    } catch (e) {
      await prisma.gPSProviderConfiguration.update({
        where: { id: p.id },
        data: { lastErrorAt: new Date(), lastErrorCode: "INGEST_REJECTED" },
      });
      logger.warn("GPS provider ingestion rejected", {
        provider: p.slug,
        code: "INGEST_REJECTED",
      });
      throw e;
    }
  }),
);
router.use(authenticate, authorize("tracking:read"));
const manage = authorize("tracking:manage");
const readQuery = validate({ query: v.querySchema });
router.get(
  "/settings",
  asyncHandler(async (req, res) => {
    ApiResponse.success(res, await service.settings(req.user!));
  }),
);
router.put(
  "/settings",
  manage,
  validate({ body: v.policySchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await service.savePolicy(req.body, req.user!, key(req)),
    );
  }),
);
router.post(
  "/providers",
  manage,
  validate({ body: v.providerSchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await service.saveProvider(undefined, req.body, req.user!, key(req)),
      "Provider configured",
      201,
    );
  }),
);
router.put(
  "/providers/:id",
  manage,
  validate({ params: ids, body: v.providerSchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await service.saveProvider(req.params.id, req.body, req.user!, key(req)),
    );
  }),
);
router.post(
  "/providers/:id/pull",
  manage,
  validate({ params: ids }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(res, await service.pull(req.params.id, req.user!));
  }),
);
router.get(
  "/devices",
  manage,
  asyncHandler(async (req, res) => {
    ApiResponse.success(res, await service.devices(req.user!));
  }),
);
router.post(
  "/devices",
  manage,
  validate({ body: v.deviceSchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await service.saveDevice(undefined, req.body, req.user!, key(req)),
      "Device registered",
      201,
    );
  }),
);
router.put(
  "/devices/:id",
  manage,
  validate({ params: ids, body: v.deviceSchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await service.saveDevice(req.params.id, req.body, req.user!, key(req)),
    );
  }),
);
router.post(
  "/devices/:id/mapping",
  manage,
  validate({ params: ids, body: v.mappingSchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await service.mapDevice(
        req.params.id,
        req.body.vehicleId,
        req.user!,
        key(req),
      ),
    );
  }),
);
router.post(
  "/devices/:id/unmap",
  manage,
  validate({ params: ids }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await service.unmap(req.params.id, req.user!, key(req)),
    );
  }),
);
router.get(
  "/active",
  readQuery,
  asyncHandler(async (req, res) => {
    await service.maintain(req.user!);
    ApiResponse.success(
      res,
      await service.snapshot(req.query as unknown as v.Query, req.user!),
    );
  }),
);
router.get(
  "/sessions",
  readQuery,
  asyncHandler(async (req, res) => {
    const r = await service.sessions(
      req.query as unknown as v.Query,
      req.user!,
    );
    ApiResponse.success(res, r.data, "Tracking sessions", 200, r.meta);
  }),
);
router.post(
  "/sessions",
  manage,
  validate({ body: v.startSchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await service.start(req.body, req.user!, key(req)),
      "Tracking session started",
      201,
    );
  }),
);
router.get(
  "/sessions/:id",
  validate({ params: ids }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(res, await service.details(req.params.id, req.user!));
  }),
);
for (const suffix of ["history", "replay"])
  router.get(
    `/sessions/:id/${suffix}`,
    validate({ params: ids }),
    readQuery,
    asyncHandler(async (req, res) => {
      const r = await service.history(
        req.params.id,
        req.query as unknown as v.Query,
        req.user!,
      );
      ApiResponse.success(
        res,
        r.data,
        "Recorded GPS observations",
        200,
        r.meta,
      );
    }),
  );
router.put(
  "/sessions/:id/route",
  manage,
  validate({ params: ids, body: v.routeSchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await service.plannedRoute(
        req.params.id,
        req.body.points,
        req.body.reason,
        req.user!,
        key(req),
      ),
    );
  }),
);
router.get(
  "/vehicles/:id",
  validate({ params: ids }),
  readQuery,
  asyncHandler(async (req, res) => {
    const q = v.querySchema.parse(req.query);
    const all = await service.sessions(q, req.user!,req.params.id);
    ApiResponse.success(
      res,
      all.data,
      "Authorized vehicle tracking sessions",
      200,
      all.meta,
    );
  }),
);
router.get(
  "/trips/:id/history",
  validate({ params: ids }),
  readQuery,
  asyncHandler(async (req, res) => {
    const q = v.querySchema.parse({ ...req.query, tripId: req.params.id });
    const r = await service.sessions(q, req.user!);
    ApiResponse.success(res, r.data, "Trip tracking sessions", 200, r.meta);
  }),
);
router.post(
  "/manual",
  manage,
  rateLimit({
    windowMs: 60000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user!.id,
  }),
  validate({ body: v.manualSchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await service.manual(req.body, req.user!),
      "SIMULATED updates only; no real GPS location is asserted",
    );
  }),
);
router.get(
  "/alerts",
  readQuery,
  asyncHandler(async (req, res) => {
    const r = await service.alerts(req.query as unknown as v.Query, req.user!);
    ApiResponse.success(res, r.data, "Tracking alerts", 200, r.meta);
  }),
);
for (const action of ["acknowledge", "resolve"] as const)
  router.post(
    `/alerts/:id/${action}`,
    manage,
    validate({
      params: ids,
      body: z.object({ remarks: z.string().trim().min(1).max(2000) }),
    }),
    asyncHandler(async (req, res) => {
      ApiResponse.success(
        res,
        await service.alertAction(
          req.params.id,
          action,
          req.body.remarks,
          req.user!,
          key(req),
        ),
      );
    }),
  );
router.get(
  "/geofences",
  manage,
  asyncHandler(async (req, res) => {
    ApiResponse.success(res, await service.geofences(req.user!));
  }),
);
router.post(
  "/geofences",
  manage,
  validate({ body: v.geofenceSchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await service.saveGeofence(undefined, req.body, req.user!, key(req)),
      "Geofence created",
      201,
    );
  }),
);
router.put(
  "/geofences/:id",
  manage,
  validate({ params: ids, body: v.geofenceSchema }),
  asyncHandler(async (req, res) => {
    ApiResponse.success(
      res,
      await service.saveGeofence(req.params.id, req.body, req.user!, key(req)),
    );
  }),
);
router.get(
  "/reports",
  readQuery,
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as v.Query;
    const snapshot = await service.snapshot(q, req.user!);
    const alerts = await service.alerts({ ...q, pageSize: 1000 }, req.user!);
    ApiResponse.success(res, {
      summary: snapshot.summary,
      mode: q.mode,
      alerts: alerts.data,
      alertTotal: alerts.meta.total,
    });
  }),
);
router.get(
  "/lookups",
  asyncHandler(async (req, res) => {
    const r = await operationsService.lookups(req.user!);
    ApiResponse.success(res, {
      depots: r.depots,
      organizations: r.organizations.map((o) => ({
        id: o.id,
        name: o.name,
        type: o.type,
      })),
      canConfigure: isTrackingAdmin(req.user!),
    });
  }),
);
router.post(
  "/maintenance",
  manage,
  asyncHandler(async (req, res) => {
    ApiResponse.success(res, await service.maintain(req.user!));
  }),
);
export const trackingRoutes = router;
