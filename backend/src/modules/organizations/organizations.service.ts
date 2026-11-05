import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import type { AuthenticatedUser } from '../../types/auth';
import { ApiError } from '../../utils/ApiError';
import type { PaginationMeta } from '../../utils/ApiResponse';
import type {
  CreateOrganizationInput,
  ListOrganizationsQuery,
  UpdateOrganizationInput,
} from './organizations.validators';

/**
 * Organization data-access + business rules.
 *
 * Data isolation: a user whose organization is a VENDOR or TRANSPORT partner
 * is restricted to their own organization record. Administrative roles
 * (holding `organizations:read`) see all organizations.
 */
function isScopedActor(actor: AuthenticatedUser): boolean {
  return (
    actor.organizationType === 'VEHICLE_VENDOR' ||
    actor.organizationType === 'TRANSPORT_PARTNER'
  );
}

export const organizationsService = {
  async list(query: ListOrganizationsQuery, actor: AuthenticatedUser) {
    const where: Prisma.OrganizationWhereInput = {};

    if (isScopedActor(actor)) {
      where.id = actor.organizationId ?? '__none__';
    }
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const [total, data] = await Promise.all([
      prisma.organization.count({ where }),
      prisma.organization.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: { users: true } } },
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

  async getById(id: string, actor: AuthenticatedUser) {
    if (isScopedActor(actor) && actor.organizationId !== id) {
      throw ApiError.forbidden('You cannot access this organization');
    }
    const org = await prisma.organization.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            fullName: true,
            email: true,
            status: true,
            role: { select: { name: true, displayName: true } },
          },
        },
      },
    });
    if (!org) throw ApiError.notFound('Organization not found');
    return org;
  },

  async create(input: CreateOrganizationInput) {
    const existing = await prisma.organization.findFirst({
      where: { name: input.name, type: input.type },
    });
    if (existing) {
      throw ApiError.conflict(
        'An organization with this name and type already exists',
      );
    }
    return prisma.organization.create({ data: input });
  },

  async update(id: string, input: UpdateOrganizationInput) {
    const org = await prisma.organization.findUnique({ where: { id } });
    if (!org) throw ApiError.notFound('Organization not found');

    if (input.name || input.type) {
      const dupe = await prisma.organization.findFirst({
        where: {
          name: input.name ?? org.name,
          type: input.type ?? org.type,
          NOT: { id },
        },
      });
      if (dupe) {
        throw ApiError.conflict(
          'An organization with this name and type already exists',
        );
      }
    }

    return prisma.organization.update({ where: { id }, data: input });
  },
};
