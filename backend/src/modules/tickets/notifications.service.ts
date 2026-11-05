import type { NotificationType, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../database/prisma';
import type { AuthenticatedUser } from '../../types/auth';
import { logger } from '../../utils/logger';

type Tx = Prisma.TransactionClient | PrismaClient;

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  ticketId?: string;
}

/**
 * In-app notification service. Notifications are persisted rows surfaced via
 * the bell menu and the Approval Inbox. A future email/SMS channel can wrap
 * `notify()` (the single integration point) without changing callers — no
 * external credentials are invented here.
 */
export const notificationsService = {
  /** Create one notification. Safe inside or outside a transaction. */
  async notify(input: NotifyInput, tx: Tx = prisma): Promise<void> {
    try {
      await tx.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          ticketId: input.ticketId,
        },
      });
    } catch (err) {
      // Notifications must never break the primary operation.
      logger.error('Failed to create notification', {
        type: input.type,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  },

  /** Fan-out to many recipients (deduplicated, skipping empty ids). */
  async notifyMany(
    userIds: Array<string | null | undefined>,
    base: Omit<NotifyInput, 'userId'>,
    tx: Tx = prisma,
  ): Promise<void> {
    const unique = [...new Set(userIds.filter((id): id is string => !!id))];
    for (const userId of unique) {
      await this.notify({ ...base, userId }, tx);
    }
  },

  async list(actor: AuthenticatedUser, unreadOnly = false) {
    return prisma.notification.findMany({
      where: { userId: actor.id, ...(unreadOnly ? { isRead: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  },

  async unreadCount(actor: AuthenticatedUser): Promise<number> {
    return prisma.notification.count({
      where: { userId: actor.id, isRead: false },
    });
  },

  async markRead(id: string, actor: AuthenticatedUser): Promise<void> {
    await prisma.notification.updateMany({
      where: { id, userId: actor.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  },

  async markAllRead(actor: AuthenticatedUser): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId: actor.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  },
};
