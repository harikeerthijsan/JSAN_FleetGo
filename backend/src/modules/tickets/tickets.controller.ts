import type { Request, Response } from 'express';
import { prisma } from '../../database/prisma';
import { ApiError } from '../../utils/ApiError';
import { ApiResponse } from '../../utils/ApiResponse';
import { requestContext, writeAudit } from '../../utils/audit';
import { asyncHandler } from '../../utils/asyncHandler';
import { storage } from '../../utils/storage';
import { notificationsService } from './notifications.service';
import { ticketsService } from './tickets.service';
import { isInternalTicketActor, ticketScope } from './tickets.workflow';

export const ticketsController = {
  dashboard: asyncHandler(async (req: Request, res: Response) => {
    ApiResponse.success(res, await ticketsService.dashboard(req.user!), 'Ticket dashboard');
  }),

  slaReport: asyncHandler(async (req: Request, res: Response) => {
    ApiResponse.success(res, await ticketsService.slaReport(req.user!), 'SLA report');
  }),

  availability: asyncHandler(async (req: Request, res: Response) => {
    const { typeId, depotId } = req.query as { typeId?: string; depotId?: string };
    ApiResponse.success(res, await ticketsService.availability({ typeId, depotId }, req.user!), 'Inventory availability');
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const { data, meta } = await ticketsService.list(req.query as never, req.user!);
    ApiResponse.success(res, data, 'Tickets', 200, meta);
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    ApiResponse.success(res, await ticketsService.details(req.params.id, req.user!), 'Ticket');
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const ticket = await ticketsService.create(req.body, req.user!);
    ApiResponse.success(res, ticket, 'Ticket created', 201);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    ApiResponse.success(res, await ticketsService.update(req.params.id, req.body, req.user!), 'Ticket updated');
  }),

  submit: asyncHandler(async (req: Request, res: Response) => {
    ApiResponse.success(res, await ticketsService.submit(req.params.id, req.user!), 'Ticket submitted');
  }),

  decide: asyncHandler(async (req: Request, res: Response) => {
    const ticket = await ticketsService.decide(
      req.params.id,
      req.body.decision,
      req.body.comment,
      req.user!,
    );
    ApiResponse.success(res, ticket, 'Decision recorded');
  }),

  reassignApprover: asyncHandler(async (req: Request, res: Response) => {
    ApiResponse.success(
      res,
      await ticketsService.reassignApprover(req.params.id, req.body.approverId, req.body.note, req.user!),
      'Approver reassigned',
    );
  }),

  escalate: asyncHandler(async (req: Request, res: Response) => {
    ApiResponse.success(res, await ticketsService.escalate(req.params.id, req.user!), 'Ticket escalated');
  }),

  assign: asyncHandler(async (req: Request, res: Response) => {
    ApiResponse.success(res, await ticketsService.assign(req.params.id, req.body, req.user!), 'Ticket assigned');
  }),

  comment: asyncHandler(async (req: Request, res: Response) => {
    ApiResponse.success(
      res,
      await ticketsService.comment(req.params.id, req.body.body, req.body.isInternal ?? false, req.user!),
      'Comment added',
      201,
    );
  }),

  changeStatus: asyncHandler(async (req: Request, res: Response) => {
    ApiResponse.success(
      res,
      await ticketsService.changeStatus(req.params.id, req.body.status, req.body.reason, req.user!),
      'Ticket status updated',
    );
  }),

  // --- Attachments ----------------------------------------------------------
  listAttachments: asyncHandler(async (req: Request, res: Response) => {
    // Scope check via details (throws if unauthorized).
    await ticketsService.details(req.params.id, req.user!);
    const internal = isInternalTicketActor(req.user!);
    const files = await prisma.ticketAttachment.findMany({
      where: { ticketId: req.params.id, ...(internal ? {} : { isInternal: false }) },
      orderBy: { createdAt: 'desc' },
    });
    ApiResponse.success(res, files, 'Attachments');
  }),

  uploadAttachment: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw ApiError.badRequest('A file is required');
    const ticket = await prisma.ticket.findFirst({
      where: { id: req.params.id, ...ticketScope(req.user!) },
    });
    if (!ticket) throw ApiError.notFound('Ticket not found');
    const isInternal =
      String(req.body?.isInternal) === 'true' && isInternalTicketActor(req.user!);
    const stored = await storage.save({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      contentType: req.file.mimetype,
      folder: `tickets/${req.params.id}`,
    });
    const row = await prisma.ticketAttachment.create({
      data: {
        ticketId: req.params.id,
        fileName: req.file.originalname,
        storageKey: stored.key,
        contentType: req.file.mimetype,
        size: req.file.size,
        isInternal,
        uploadedById: req.user!.id,
      },
    });
    await writeAudit({
      actorId: req.user!.id,
      action: 'TICKET_ATTACHMENT_UPLOADED',
      entityType: 'Ticket',
      entityId: req.params.id,
      metadata: { attachmentId: row.id },
      ...requestContext(req),
    });
    ApiResponse.success(res, row, 'Attachment uploaded', 201);
  }),

  downloadAttachment: asyncHandler(async (req: Request, res: Response) => {
    const ticket = await prisma.ticket.findFirst({
      where: { id: req.params.id, ...ticketScope(req.user!) },
    });
    if (!ticket) throw ApiError.notFound('Ticket not found');
    const file = await prisma.ticketAttachment.findFirst({
      where: { id: req.params.attachmentId, ticketId: req.params.id },
    });
    if (!file) throw ApiError.notFound('Attachment not found');
    if (file.isInternal && !isInternalTicketActor(req.user!)) {
      throw ApiError.forbidden('You cannot access this attachment');
    }
    res
      .type(file.contentType)
      .attachment(file.fileName)
      .send(await storage.read(file.storageKey));
  }),

  // --- Notifications --------------------------------------------------------
  notifications: asyncHandler(async (req: Request, res: Response) => {
    const unreadOnly = req.query.unread === 'true';
    const [items, unread] = await Promise.all([
      notificationsService.list(req.user!, unreadOnly),
      notificationsService.unreadCount(req.user!),
    ]);
    ApiResponse.success(res, items, 'Notifications', 200, { unread });
  }),

  markNotificationRead: asyncHandler(async (req: Request, res: Response) => {
    await notificationsService.markRead(req.params.id, req.user!);
    ApiResponse.success(res, null, 'Marked read');
  }),

  markAllNotificationsRead: asyncHandler(async (req: Request, res: Response) => {
    await notificationsService.markAllRead(req.user!);
    ApiResponse.success(res, null, 'All marked read');
  }),
};
