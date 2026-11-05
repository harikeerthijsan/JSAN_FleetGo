import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../database/prisma';
import type { AuthenticatedUser } from '../types/auth';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { accessToken } from '../utils/jwt';

/**
 * Loads the full authenticated principal (role, permissions, organization,
 * depots) for a user id. Returns null if the user does not exist or is not
 * active. Exported so other flows (e.g. /auth/me) can reuse the exact shape.
 */
export async function loadAuthenticatedUser(
  userId: string,
): Promise<AuthenticatedUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      organization: true,
      depots: true,
    },
  });

  if (!user || user.status !== 'ACTIVE') return null;

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: {
      id: user.role.id,
      name: user.role.name,
      displayName: user.role.displayName,
    },
    permissions: user.role.permissions.map((rp) => rp.permission.key),
    organizationId: user.organizationId,
    organizationType: user.organization?.type ?? null,
    depotIds: user.depots.map((d) => d.depotId),
  };
}

/**
 * Verifies the Bearer access token and attaches `req.user`. Rejects with 401
 * when the token is missing/invalid/expired or the account is inactive.
 * Authorization data is re-read from the database on every request, so
 * deactivations and permission changes apply immediately.
 */
export const authenticate = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Authentication required');
    }

    const token = header.slice('Bearer '.length).trim();
    let userId: string;
    try {
      userId = accessToken.verify(token).sub;
    } catch {
      throw ApiError.unauthorized('Invalid or expired access token');
    }

    const user = await loadAuthenticatedUser(userId);
    if (!user) {
      throw ApiError.unauthorized('Account is inactive or no longer exists');
    }

    req.user = user;
    next();
  },
);

/** True if the user holds every one of the given permission keys. */
export function hasPermissions(
  user: AuthenticatedUser,
  required: string[],
): boolean {
  return required.every((key) => user.permissions.includes(key));
}

/**
 * Authorization guard. Requires an authenticated user holding ALL of the
 * listed permissions. Must be placed after `authenticate`.
 */
export const authorize =
  (...required: string[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized('Authentication required'));
      return;
    }
    if (!hasPermissions(req.user, required)) {
      next(
        ApiError.forbidden(
          'You do not have permission to perform this action',
        ),
      );
      return;
    }
    next();
  };

/** Guard requiring the user to hold one of the given role names. */
export const requireRole =
  (...roleNames: string[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized('Authentication required'));
      return;
    }
    if (!roleNames.includes(req.user.role.name)) {
      next(ApiError.forbidden('Your role cannot perform this action'));
      return;
    }
    next();
  };
