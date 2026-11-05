import { prisma } from '../../database/prisma';
import { ApiError } from '../../utils/ApiError';
import type { CreateRoleInput, UpdateRoleInput } from './roles.validators';

/**
 * Role & permission administration. Roles are fully configurable: new roles can
 * be created and existing roles' permissions edited at runtime. Built-in
 * (system) roles are protected from renaming/deletion but their permission sets
 * can still be adjusted.
 */

function serializeRole(role: {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  permissions: { permission: { key: string } }[];
  _count?: { users: number };
}) {
  return {
    id: role.id,
    name: role.name,
    displayName: role.displayName,
    description: role.description,
    isSystem: role.isSystem,
    permissionKeys: role.permissions.map((p) => p.permission.key),
    userCount: role._count?.users,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

/** Resolve permission keys → ids, failing if any key is unknown. */
async function resolvePermissionIds(keys: string[]): Promise<string[]> {
  if (keys.length === 0) return [];
  const unique = [...new Set(keys)];
  const found = await prisma.permission.findMany({
    where: { key: { in: unique } },
    select: { id: true, key: true },
  });
  if (found.length !== unique.length) {
    const foundKeys = new Set(found.map((p) => p.key));
    const missing = unique.filter((k) => !foundKeys.has(k));
    throw ApiError.badRequest(`Unknown permission(s): ${missing.join(', ')}`);
  }
  return found.map((p) => p.id);
}

export const rolesService = {
  async list() {
    const roles = await prisma.role.findMany({
      orderBy: { displayName: 'asc' },
      include: {
        permissions: { include: { permission: { select: { key: true } } } },
        _count: { select: { users: true } },
      },
    });
    return roles.map(serializeRole);
  },

  async getById(id: string) {
    const role = await prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: { select: { key: true } } } },
        _count: { select: { users: true } },
      },
    });
    if (!role) throw ApiError.notFound('Role not found');
    return serializeRole(role);
  },

  async create(input: CreateRoleInput) {
    const existing = await prisma.role.findUnique({
      where: { name: input.name },
    });
    if (existing) throw ApiError.conflict('A role with this key already exists');

    const permissionIds = await resolvePermissionIds(input.permissionKeys);

    const role = await prisma.role.create({
      data: {
        name: input.name,
        displayName: input.displayName,
        description: input.description,
        isSystem: false,
        permissions: {
          create: permissionIds.map((permissionId) => ({ permissionId })),
        },
      },
      include: {
        permissions: { include: { permission: { select: { key: true } } } },
        _count: { select: { users: true } },
      },
    });
    return serializeRole(role);
  },

  async update(id: string, input: UpdateRoleInput) {
    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) throw ApiError.notFound('Role not found');

    // Replace permission set if provided.
    if (input.permissionKeys) {
      const permissionIds = await resolvePermissionIds(input.permissionKeys);
      await prisma.rolePermission.deleteMany({ where: { roleId: id } });
      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: id,
          permissionId,
        })),
      });
    }

    const updated = await prisma.role.update({
      where: { id },
      data: {
        displayName: input.displayName,
        description: input.description ?? undefined,
      },
      include: {
        permissions: { include: { permission: { select: { key: true } } } },
        _count: { select: { users: true } },
      },
    });
    return serializeRole(updated);
  },

  async listPermissions() {
    const permissions = await prisma.permission.findMany({
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
      select: { key: true, category: true, description: true },
    });
    // Group by category for the UI.
    const grouped: Record<string, typeof permissions> = {};
    for (const p of permissions) {
      (grouped[p.category] ??= []).push(p);
    }
    return { permissions, grouped };
  },
};
