import type { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError';
import { ApiResponse } from '../../utils/ApiResponse';
import { requestContext, writeAudit } from '../../utils/audit';
import { asyncHandler } from '../../utils/asyncHandler';
import { fleetService } from './fleet.service';
import { STATUS_TRANSITIONS } from './fleet.status';
import { uploadDocumentSchema } from './fleet.validators';

export const fleetController = {
  stats: asyncHandler(async (req: Request, res: Response) => {
    const stats = await fleetService.stats(req.user!);
    ApiResponse.success(res, stats, 'Fleet statistics');
  }),

  statusTransitions: asyncHandler(async (_req: Request, res: Response) => {
    ApiResponse.success(res, STATUS_TRANSITIONS, 'Status transition map');
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const { data, meta } = await fleetService.list(
      req.query as never,
      req.user!,
    );
    ApiResponse.success(res, data, 'Vehicles', 200, meta);
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const vehicle = await fleetService.getById(req.params.id, req.user!);
    ApiResponse.success(res, vehicle, 'Vehicle');
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const vehicle = await fleetService.create(req.body, req.user!);
    await writeAudit({
      actorId: req.user!.id,
      action: 'VEHICLE_CREATED',
      entityType: 'Vehicle',
      entityId: vehicle.id,
      metadata: { vehicleCode: vehicle.vehicleCode, registrationNumber: vehicle.registrationNumber },
      ...requestContext(req),
    });
    ApiResponse.success(res, vehicle, 'Vehicle registered', 201);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const vehicle = await fleetService.update(req.params.id, req.body, req.user!);
    await writeAudit({
      actorId: req.user!.id,
      action: 'VEHICLE_UPDATED',
      entityType: 'Vehicle',
      entityId: req.params.id,
      ...requestContext(req),
    });
    ApiResponse.success(res, vehicle, 'Vehicle updated');
  }),

  changeStatus: asyncHandler(async (req: Request, res: Response) => {
    const { status, reason } = req.body;
    const vehicle = await fleetService.changeStatus(
      req.params.id,
      status,
      reason,
      req.user!,
    );
    await writeAudit({
      actorId: req.user!.id,
      action: 'VEHICLE_STATUS_CHANGED',
      entityType: 'Vehicle',
      entityId: req.params.id,
      metadata: { status, reason },
      ...requestContext(req),
    });
    ApiResponse.success(res, vehicle, 'Vehicle status updated');
  }),

  deactivate: asyncHandler(async (req: Request, res: Response) => {
    const vehicle = await fleetService.deactivate(req.params.id, req.user!);
    await writeAudit({
      actorId: req.user!.id,
      action: 'VEHICLE_DEACTIVATED',
      entityType: 'Vehicle',
      entityId: req.params.id,
      ...requestContext(req),
    });
    ApiResponse.success(res, vehicle, 'Vehicle deactivated');
  }),

  history: asyncHandler(async (req: Request, res: Response) => {
    const history = await fleetService.history(req.params.id, req.user!);
    ApiResponse.success(res, history, 'Vehicle history');
  }),

  // --- Documents ------------------------------------------------------------
  listDocuments: asyncHandler(async (req: Request, res: Response) => {
    const docs = await fleetService.listDocuments(req.params.id, req.user!);
    ApiResponse.success(res, docs, 'Vehicle documents');
  }),

  uploadDocument: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw ApiError.badRequest('A file is required');
    const meta = uploadDocumentSchema.parse(req.body);
    const doc = await fleetService.addDocument(
      req.params.id,
      {
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        contentType: req.file.mimetype,
        size: req.file.size,
      },
      meta,
      req.user!,
    );
    await writeAudit({
      actorId: req.user!.id,
      action: 'VEHICLE_DOCUMENT_UPLOADED',
      entityType: 'Vehicle',
      entityId: req.params.id,
      metadata: { documentId: doc.id, kind: doc.kind },
      ...requestContext(req),
    });
    ApiResponse.success(res, doc, 'Document uploaded', 201);
  }),

  downloadDocument: asyncHandler(async (req: Request, res: Response) => {
    const { buffer, contentType, fileName } =
      await fleetService.getDocumentForDownload(
        req.params.id,
        req.params.documentId,
        req.user!,
      );
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(fileName)}"`,
    );
    res.send(buffer);
  }),

  removeDocument: asyncHandler(async (req: Request, res: Response) => {
    const result = await fleetService.removeDocument(
      req.params.id,
      req.params.documentId,
      req.user!,
    );
    await writeAudit({
      actorId: req.user!.id,
      action: 'VEHICLE_DOCUMENT_DELETED',
      entityType: 'Vehicle',
      entityId: req.params.id,
      metadata: { documentId: req.params.documentId },
      ...requestContext(req),
    });
    ApiResponse.success(res, result, 'Document deleted');
  }),
};
