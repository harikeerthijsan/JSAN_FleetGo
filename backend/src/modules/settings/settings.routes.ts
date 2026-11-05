import { Router } from "express";
import { authenticate, authorize, validate } from "../../middlewares";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { settingsService as service } from "./settings.service";
import * as v from "./settings.validators";

const out = (res: import("express").Response, data: unknown, status = 200) =>
  ApiResponse.success(res, data, undefined, status);

const manage = authorize("settings:manage");

const router = Router();
router.use(authenticate);

// --- Public, non-sensitive settings (any authenticated user) ---------------
// Declared before "/:key" so the literal path wins.
router.get("/public", asyncHandler(async (_req, res) => out(res, await service.getPublic())));

// --- Per-user preferences (any authenticated user) -------------------------
router.get("/preferences", asyncHandler(async (req, res) => out(res, await service.getPreferences(req.user!.id))));
router.put(
  "/preferences",
  validate({ body: v.preferencesSchema }),
  asyncHandler(async (req, res) => out(res, await service.updatePreferences(req.user!.id, req.body))),
);

// --- System settings (administrators) --------------------------------------
router.get("/", manage, asyncHandler(async (_req, res) => out(res, await service.listSystem())));
router.put(
  "/:key",
  manage,
  validate({ params: v.keyParam, body: v.updateSettingSchema }),
  asyncHandler(async (req, res) => out(res, await service.updateSystem(req.params.key, req.body.value, req.user!))),
);
router.post(
  "/:key/reset",
  manage,
  validate({ params: v.keyParam }),
  asyncHandler(async (req, res) => out(res, await service.resetSystem(req.params.key, req.user!))),
);

export const settingsRoutes = router;
