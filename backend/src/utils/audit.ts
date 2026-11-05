import type { Request } from 'express';
import { prisma } from '../database/prisma';
import { logger } from './logger';

/**
 * Centralized audit-event writer. Records authentication and administrative
 * events to the `audit_logs` table. Never pass passwords, tokens or other
 * secrets in `metadata` — audit logs are intended to be safely retained.
 */
export interface AuditEntry {
  actorId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Extract client context (ip + user agent) from a request for audit records. */
export function requestContext(req: Request): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata as object | undefined,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  } catch (error) {
    // Auditing must never break the primary request flow.
    logger.error('Failed to write audit log', {
      action: entry.action,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
