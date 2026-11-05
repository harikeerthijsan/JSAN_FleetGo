import type { OrganizationType } from '@prisma/client';

/**
 * The authenticated principal attached to `req.user` by the `authenticate`
 * middleware. Loaded fresh from the database on every request so role,
 * permission and status changes take effect immediately.
 */
export interface AuthenticatedUser {
  id: string;
  fullName: string;
  email: string;
  role: {
    id: string;
    name: string;
    displayName: string;
  };
  permissions: string[];
  organizationId: string | null;
  organizationType: OrganizationType | null;
  depotIds: string[];
}
