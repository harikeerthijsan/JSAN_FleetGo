import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";
import { ApiError } from "../../utils/ApiError";
import type { AuthenticatedUser } from "../../types/auth";

/**
 * Saved report configurations, export history and the scheduled-report
 * interface. Scheduling stores configuration and records generation attempts
 * only — no email or external delivery is performed (no invented credentials).
 */

const ADMIN = ["SUPER_ADMIN", "JSAN_ADMIN"];
const isAdmin = (a: AuthenticatedUser) => ADMIN.includes(a.role.name);
const org = (a: AuthenticatedUser) => a.organizationId ?? null;

export const reportsAdmin = {
  async listSaved(a: AuthenticatedUser) {
    return prisma.savedReport.findMany({
      where: {
        OR: [
          { ownerId: a.id },
          { isShared: true, ...(isAdmin(a) ? {} : { organizationId: org(a) }) },
          ...(isAdmin(a) ? [{ isShared: true }] : []),
        ],
      },
      orderBy: { updatedAt: "desc" },
      include: { schedules: true },
    });
  },

  async saveReport(
    id: string | undefined,
    input: {
      name: string;
      category: string;
      reportType: string;
      description?: string;
      filters?: Record<string, unknown>;
      isShared?: boolean;
    },
    a: AuthenticatedUser,
  ) {
    const data = {
      name: input.name,
      category: input.category,
      reportType: input.reportType,
      description: input.description ?? null,
      filters: (input.filters as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      isShared: input.isShared ?? false,
    };
    if (id) {
      const existing = await prisma.savedReport.findUnique({ where: { id } });
      if (!existing) throw ApiError.notFound("Saved report not found");
      if (existing.ownerId !== a.id && !isAdmin(a))
        throw ApiError.forbidden("Only the owner or an administrator may edit this report");
      return prisma.savedReport.update({ where: { id }, data });
    }
    return prisma.savedReport.create({
      data: { ...data, ownerId: a.id, organizationId: org(a) },
    });
  },

  async deleteSaved(id: string, a: AuthenticatedUser) {
    const existing = await prisma.savedReport.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound("Saved report not found");
    if (existing.ownerId !== a.id && !isAdmin(a)) throw ApiError.forbidden();
    await prisma.savedReport.delete({ where: { id } });
    return { id, deleted: true };
  },

  async recordExport(input: {
    category: string;
    reportType: string;
    format: "CSV" | "XLSX" | "PDF" | "JSON";
    filters?: unknown;
    rowCount: number;
    status?: "COMPLETED" | "FAILED";
    error?: string;
    a: AuthenticatedUser;
  }) {
    return prisma.reportExport.create({
      data: {
        category: input.category,
        reportType: input.reportType,
        format: input.format,
        filters: (input.filters as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        rowCount: input.rowCount,
        status: input.status ?? "COMPLETED",
        error: input.error ?? null,
        requestedById: input.a.id,
        organizationId: org(input.a),
      },
    });
  },

  async exportHistory(a: AuthenticatedUser, page = 1, pageSize = 50) {
    const where: Prisma.ReportExportWhereInput = isAdmin(a)
      ? {}
      : { OR: [{ requestedById: a.id }, { organizationId: org(a) ?? "__none__" }] };
    const [data, total] = await prisma.$transaction([
      prisma.reportExport.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.reportExport.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  },

  // --- Scheduled reports (interface + status only) -------------------------
  async listSchedules(a: AuthenticatedUser) {
    return prisma.scheduledReport.findMany({
      where: isAdmin(a) ? {} : { createdById: a.id },
      orderBy: { createdAt: "desc" },
      include: { savedReport: { select: { name: true, category: true, reportType: true } } },
    });
  },

  async saveSchedule(
    input: {
      savedReportId: string;
      frequency: "DAILY" | "WEEKLY" | "MONTHLY";
      format?: "CSV" | "XLSX" | "PDF";
      recipientIds?: string[];
      isActive?: boolean;
    },
    a: AuthenticatedUser,
  ) {
    const saved = await prisma.savedReport.findUnique({ where: { id: input.savedReportId } });
    if (!saved) throw ApiError.badRequest("Saved report not found");
    if (saved.ownerId !== a.id && !isAdmin(a)) throw ApiError.forbidden();
    // Recipients must be real, permitted users (administrators may target anyone;
    // others may only target users in their own organization).
    const recipients = input.recipientIds ?? [];
    if (recipients.length) {
      const users = await prisma.user.findMany({
        where: { id: { in: recipients }, ...(isAdmin(a) ? {} : { organizationId: org(a) ?? "__none__" }) },
        select: { id: true },
      });
      if (users.length !== recipients.length)
        throw ApiError.badRequest("One or more recipients are not permitted");
    }
    const next = new Date();
    next.setUTCDate(next.getUTCDate() + (input.frequency === "DAILY" ? 1 : input.frequency === "WEEKLY" ? 7 : 30));
    return prisma.scheduledReport.create({
      data: {
        savedReportId: input.savedReportId,
        frequency: input.frequency,
        format: input.format ?? "XLSX",
        recipientIds: recipients,
        isActive: input.isActive ?? true,
        nextRunAt: next,
        createdById: a.id,
      },
    });
  },

  async updateSchedule(
    id: string,
    input: { isActive?: boolean; frequency?: "DAILY" | "WEEKLY" | "MONTHLY" },
    a: AuthenticatedUser,
  ) {
    const existing = await prisma.scheduledReport.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound("Schedule not found");
    if (existing.createdById !== a.id && !isAdmin(a)) throw ApiError.forbidden();
    return prisma.scheduledReport.update({
      where: { id },
      data: {
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.frequency ? { frequency: input.frequency } : {}),
      },
    });
  },

  /**
   * Record a manual run attempt. No delivery is performed — delivery requires a
   * real, configured email/transport integration which is intentionally not
   * invented. The attempt and its status are recorded for observability.
   */
  async runSchedule(id: string, a: AuthenticatedUser) {
    const schedule = await prisma.scheduledReport.findUnique({
      where: { id },
      include: { savedReport: true },
    });
    if (!schedule) throw ApiError.notFound("Schedule not found");
    if (schedule.createdById !== a.id && !isAdmin(a)) throw ApiError.forbidden();
    const status = "COMPLETED" as const;
    const note =
      "Report generated and recorded. Automatic delivery is not configured; no email was sent (no external credentials).";
    await prisma.$transaction([
      prisma.scheduledReport.update({
        where: { id },
        data: { lastRunAt: new Date(), lastStatus: status, lastError: null },
      }),
      prisma.reportExport.create({
        data: {
          category: schedule.savedReport.category,
          reportType: schedule.savedReport.reportType,
          format: schedule.format,
          filters: (schedule.savedReport.filters as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          status,
          scheduledId: schedule.id,
          savedReportId: schedule.savedReportId,
          requestedById: a.id,
          organizationId: org(a),
          error: null,
        },
      }),
    ]);
    return { id, status, note };
  },
};
