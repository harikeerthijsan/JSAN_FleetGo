import type { Prisma } from '@prisma/client';
import { config } from '../../config';
import { prisma } from '../../database/prisma';
import type { AuthenticatedUser } from '../../types/auth';
import { ApiError } from '../../utils/ApiError';
import type { PaginationMeta } from '../../utils/ApiResponse';
import { password } from '../../utils/password';
import {
  expiresInMs,
  generateOpaqueToken,
  hashToken,
} from '../../utils/tokens';
import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateUserInput,
} from './users.validators';

/** Public user shape — never includes the password hash. */
const userSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, name: true, displayName: true } },
  organization: { select: { id: true, name: true, type: true } },
  depots: { select: { depot: { select: { id: true, name: true, code: true } } } },
  profile: true,
} satisfies Prisma.UserSelect;

const SUPER_ADMIN = 'SUPER_ADMIN';

/** Generate a temporary password that satisfies the strength policy. */
function generateTempPassword(): string {
  // e.g. "Fg-3f9a2b7c" — has upper, lower and digits.
  return `Fg-${generateOpaqueToken(5)}`;
}

async function assertRoleAssignable(
  roleId: string,
  actor: AuthenticatedUser,
): Promise<void> {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw ApiError.badRequest('The selected role does not exist');
  // Only a Super Admin may create/assign the Super Admin role.
  if (role.name === SUPER_ADMIN && actor.role.name !== SUPER_ADMIN) {
    throw ApiError.forbidden('Only a Super Admin can assign the Super Admin role');
  }
}

/**
 * When assigning a vendor role, the user must belong to a vendor organization.
 * This keeps vendor data-isolation coherent (a vendor user is always scoped to
 * a VEHICLE_VENDOR organization).
 */
async function assertOrganizationConsistency(
  roleId: string,
  organizationId: string | null | undefined,
): Promise<void> {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) return;
  if (role.name === 'VENDOR_USER') {
    if (!organizationId) {
      throw ApiError.badRequest('Vendor users must be assigned a vendor organization');
    }
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org || org.type !== 'VEHICLE_VENDOR') {
      throw ApiError.badRequest(
        'Vendor users must be assigned to a vehicle-vendor organization',
      );
    }
  }
}

export const usersService = {
  async list(query: ListUsersQuery) {
    const where: Prisma.UserWhereInput = {};
    if (query.roleId) where.roleId = query.roleId;
    if (query.organizationId) where.organizationId = query.organizationId;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const meta: PaginationMeta = {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
    return { data, meta };
  },

  async getById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });
    if (!user) throw ApiError.notFound('User not found');
    return user;
  },

  async create(input: CreateUserInput, actor: AuthenticatedUser) {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existing) throw ApiError.conflict('A user with this email already exists');

    await assertRoleAssignable(input.roleId, actor);
    await assertOrganizationConsistency(input.roleId, input.organizationId);

    const tempPassword = input.password ? undefined : generateTempPassword();
    const passwordHash = await password.hash(input.password ?? tempPassword!);

    const user = await prisma.user.create({
      data: {
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        passwordHash,
        status: input.status,
        roleId: input.roleId,
        organizationId: input.organizationId ?? null,
        depots: input.depotIds?.length
          ? { create: input.depotIds.map((depotId) => ({ depotId })) }
          : undefined,
        profile: input.profile && Object.values(input.profile).some((v) => v !== undefined)
          ? { create: input.profile }
          : undefined,
      },
      select: userSelect,
    });

    // tempPassword is surfaced only in non-production for first-login handoff.
    return {
      user,
      tempPassword: !config.app.isProduction ? tempPassword : undefined,
    };
  },

  async update(id: string, input: UpdateUserInput, actor: AuthenticatedUser) {
    const target = await prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!target) throw ApiError.notFound('User not found');

    // Guard changes affecting Super Admin accounts.
    if (target.role.name === SUPER_ADMIN && actor.role.name !== SUPER_ADMIN) {
      throw ApiError.forbidden('Only a Super Admin can modify a Super Admin');
    }

    if (input.email && input.email !== target.email) {
      const dupe = await prisma.user.findUnique({
        where: { email: input.email },
      });
      if (dupe) throw ApiError.conflict('A user with this email already exists');
    }

    if (input.roleId) await assertRoleAssignable(input.roleId, actor);

    const effectiveRoleId = input.roleId ?? target.roleId;
    const effectiveOrgId =
      input.organizationId !== undefined
        ? input.organizationId
        : target.organizationId;
    await assertOrganizationConsistency(effectiveRoleId, effectiveOrgId);

    const data: Prisma.UserUpdateInput = {
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
    };
    if (input.roleId) data.role = { connect: { id: input.roleId } };
    if (input.organizationId !== undefined) {
      data.organization = input.organizationId
        ? { connect: { id: input.organizationId } }
        : { disconnect: true };
    }

    // Replace depot assignments when provided.
    if (input.depotIds) {
      await prisma.userDepot.deleteMany({ where: { userId: id } });
      if (input.depotIds.length) {
        data.depots = {
          create: input.depotIds.map((depotId) => ({ depotId })),
        };
      }
    }

    // Upsert the role-specific profile when provided.
    if (input.profile) {
      data.profile = {
        upsert: { create: input.profile, update: input.profile },
      };
    }

    return prisma.user.update({ where: { id }, data, select: userSelect });
  },

  async updateStatus(
    id: string,
    status: 'ACTIVE' | 'INACTIVE' | 'PENDING',
    actor: AuthenticatedUser,
  ) {
    if (id === actor.id && status !== 'ACTIVE') {
      throw ApiError.badRequest('You cannot deactivate your own account');
    }

    const target = await prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!target) throw ApiError.notFound('User not found');

    if (target.role.name === SUPER_ADMIN && actor.role.name !== SUPER_ADMIN) {
      throw ApiError.forbidden('Only a Super Admin can modify a Super Admin');
    }

    // Never allow deactivating the last active Super Admin.
    if (target.role.name === SUPER_ADMIN && status !== 'ACTIVE') {
      const activeSuperAdmins = await prisma.user.count({
        where: { role: { name: SUPER_ADMIN }, status: 'ACTIVE' },
      });
      if (activeSuperAdmins <= 1) {
        throw ApiError.badRequest('Cannot deactivate the last active Super Admin');
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { status },
      select: userSelect,
    });

    // Deactivation immediately kills all sessions.
    if (status !== 'ACTIVE') {
      await prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return updated;
  },

  /**
   * Admin-initiated password reset: issues a single-use reset token (the same
   * secure mechanism as the self-service forgot-password flow) rather than
   * setting a known password. The raw token is returned in non-production.
   */
  async adminResetPassword(id: string) {
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw ApiError.notFound('User not found');

    const raw = generateOpaqueToken(32);
    await prisma.passwordResetToken.create({
      data: {
        userId: id,
        tokenHash: hashToken(raw),
        expiresAt: expiresInMs(config.auth.passwordResetTtlMin * 60_000),
      },
    });
    return { devToken: !config.app.isProduction ? raw : undefined };
  },
};
