import { EntityStatus } from '@prisma/client';
import { ZodError, type ZodSchema } from 'zod';
import { prisma } from '../../database/prisma';
import { ApiError } from '../../utils/ApiError';
import type { PaginationMeta } from '../../utils/ApiResponse';
import {
  categorySchema,
  depotSchema,
  documentTypeSchema,
  fuelTypeSchema,
  makeSchema,
  modelSchema,
  ownershipTypeSchema,
  typeSchema,
  type ListQuery,
} from './masterdata.validators';

/**
 * Master-data administration for all vehicle lookups. A single resource
 * registry drives generic list/create/update/status/delete handlers so every
 * lookup behaves consistently: search, active filter, duplicate validation,
 * deactivate vs. delete, and reference protection.
 */

// Loose delegate type — every Prisma model delegate shares these methods.
interface Delegate {
  findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
  count: (args?: unknown) => Promise<number>;
  findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
  findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
  create: (args: unknown) => Promise<Record<string, unknown>>;
  update: (args: unknown) => Promise<Record<string, unknown>>;
  delete: (args: unknown) => Promise<Record<string, unknown>>;
}

interface ResourceDescriptor {
  label: string;
  delegate: Delegate;
  statusField: 'isActive' | 'status';
  searchFields: string[];
  schema: ZodSchema;
  toData: (parsed: Record<string, unknown>) => Record<string, unknown>;
  dupWhere: (parsed: Record<string, unknown>) => Record<string, unknown>;
  include?: Record<string, unknown>;
  orderBy?: Record<string, unknown> | Record<string, unknown>[];
  countRefs: (id: string) => Promise<number>;
}

const p = prisma as unknown as Record<string, Delegate>;

const RESOURCES: Record<string, ResourceDescriptor> = {
  makes: {
    label: 'Make',
    delegate: p.vehicleMake,
    statusField: 'isActive',
    searchFields: ['name'],
    schema: makeSchema,
    toData: (d) => ({ name: d.name, isActive: d.isActive }),
    dupWhere: (d) => ({ name: { equals: d.name, mode: 'insensitive' } }),
    orderBy: { name: 'asc' },
    countRefs: async (id) =>
      (await prisma.vehicle.count({ where: { makeId: id } })) +
      (await prisma.vehicleModel.count({ where: { makeId: id } })),
  },
  models: {
    label: 'Model',
    delegate: p.vehicleModel,
    statusField: 'isActive',
    searchFields: ['name', 'variant'],
    schema: modelSchema,
    toData: (d) => ({
      name: d.name,
      variant: d.variant ?? null,
      makeId: d.makeId,
      isActive: d.isActive,
    }),
    dupWhere: (d) => ({
      makeId: d.makeId,
      name: { equals: d.name, mode: 'insensitive' },
      variant: (d.variant as string | undefined) ?? null,
    }),
    include: { make: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
    countRefs: (id) => prisma.vehicle.count({ where: { modelId: id } }),
  },
  categories: {
    label: 'Category',
    delegate: p.vehicleCategory,
    statusField: 'isActive',
    searchFields: ['name'],
    schema: categorySchema,
    toData: (d) => ({ name: d.name, isActive: d.isActive }),
    dupWhere: (d) => ({ name: { equals: d.name, mode: 'insensitive' } }),
    orderBy: { name: 'asc' },
    countRefs: async (id) =>
      (await prisma.vehicle.count({ where: { categoryId: id } })) +
      (await prisma.vehicleType.count({ where: { categoryId: id } })),
  },
  types: {
    label: 'Type',
    delegate: p.vehicleType,
    statusField: 'isActive',
    searchFields: ['name'],
    schema: typeSchema,
    toData: (d) => ({
      name: d.name,
      categoryId: (d.categoryId as string | undefined) || null,
      isActive: d.isActive,
    }),
    dupWhere: (d) => ({ name: { equals: d.name, mode: 'insensitive' } }),
    include: { category: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
    countRefs: (id) => prisma.vehicle.count({ where: { typeId: id } }),
  },
  'fuel-types': {
    label: 'Fuel type',
    delegate: p.fuelType,
    statusField: 'isActive',
    searchFields: ['name'],
    schema: fuelTypeSchema,
    toData: (d) => ({ name: d.name, isActive: d.isActive }),
    dupWhere: (d) => ({ name: { equals: d.name, mode: 'insensitive' } }),
    orderBy: { name: 'asc' },
    countRefs: (id) => prisma.vehicle.count({ where: { fuelTypeId: id } }),
  },
  'ownership-types': {
    label: 'Ownership type',
    delegate: p.ownershipType,
    statusField: 'isActive',
    searchFields: ['name'],
    schema: ownershipTypeSchema,
    toData: (d) => ({ name: d.name, isActive: d.isActive }),
    dupWhere: (d) => ({ name: { equals: d.name, mode: 'insensitive' } }),
    orderBy: { name: 'asc' },
    countRefs: (id) => prisma.vehicle.count({ where: { ownershipTypeId: id } }),
  },
  'document-types': {
    label: 'Document type',
    delegate: p.documentType,
    statusField: 'isActive',
    searchFields: ['name'],
    schema: documentTypeSchema,
    toData: (d) => ({
      name: d.name,
      category: d.category ?? 'other',
      isActive: d.isActive,
    }),
    dupWhere: (d) => ({ name: { equals: d.name, mode: 'insensitive' } }),
    orderBy: { name: 'asc' },
    countRefs: (id) =>
      prisma.vehicleDocument.count({ where: { documentTypeId: id } }),
  },
  depots: {
    label: 'Depot',
    delegate: p.depot,
    statusField: 'status',
    searchFields: ['name', 'code', 'city', 'region'],
    schema: depotSchema,
    toData: (d) => ({
      name: d.name,
      code: d.code,
      region: d.region ?? null,
      address: d.address ?? null,
      city: d.city ?? null,
      state: d.state ?? null,
      country: d.country ?? null,
      status: d.status ?? EntityStatus.ACTIVE,
    }),
    dupWhere: (d) => ({ code: { equals: d.code, mode: 'insensitive' } }),
    orderBy: { name: 'asc' },
    countRefs: async (id) =>
      (await prisma.vehicle.count({ where: { depotId: id } })) +
      (await prisma.userDepot.count({ where: { depotId: id } })),
  },
};

export function getResource(resource: string): ResourceDescriptor {
  const descriptor = RESOURCES[resource];
  if (!descriptor) throw ApiError.notFound(`Unknown master-data resource: ${resource}`);
  return descriptor;
}

export const RESOURCE_KEYS = Object.keys(RESOURCES);

function parse(schema: ZodSchema, body: unknown, partial = false) {
  try {
    const s = partial && 'partial' in schema ? (schema as never as { partial: () => ZodSchema }).partial() : schema;
    return s.parse(body) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof ZodError) {
      throw ApiError.unprocessable(
        'Validation failed',
        err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    throw err;
  }
}

export const masterDataService = {
  async list(resource: string, query: ListQuery) {
    const d = getResource(resource);
    const where: Record<string, unknown> = {};
    if (query.search) {
      where.OR = d.searchFields.map((f) => ({
        [f]: { contains: query.search, mode: 'insensitive' },
      }));
    }
    if (query.active !== undefined) {
      if (d.statusField === 'isActive') where.isActive = query.active === 'true';
      else where.status = query.active === 'true' ? 'ACTIVE' : 'INACTIVE';
    }

    const [total, data] = await Promise.all([
      d.delegate.count({ where }),
      d.delegate.findMany({
        where,
        include: d.include,
        orderBy: d.orderBy,
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

  async create(resource: string, body: unknown) {
    const d = getResource(resource);
    const parsed = parse(d.schema, body);
    const dupe = await d.delegate.findFirst({ where: d.dupWhere(parsed) });
    if (dupe) throw ApiError.conflict(`${d.label} already exists`);
    return d.delegate.create({ data: d.toData(parsed), include: d.include });
  },

  async update(resource: string, id: string, body: unknown) {
    const d = getResource(resource);
    const existing = await d.delegate.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound(`${d.label} not found`);
    const parsed = parse(d.schema, body, true);
    // Duplicate check only when a field affecting uniqueness changed.
    const dupWhere = d.dupWhere({ ...existing, ...parsed });
    const dupe = await d.delegate.findFirst({
      where: { AND: [dupWhere, { NOT: { id } }] },
    });
    if (dupe) throw ApiError.conflict(`${d.label} already exists`);
    const data = d.toData({ ...existing, ...parsed });
    return d.delegate.update({ where: { id }, data, include: d.include });
  },

  async setStatus(resource: string, id: string, active: boolean) {
    const d = getResource(resource);
    const existing = await d.delegate.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound(`${d.label} not found`);
    const data =
      d.statusField === 'isActive'
        ? { isActive: active }
        : { status: active ? EntityStatus.ACTIVE : EntityStatus.INACTIVE };
    return d.delegate.update({ where: { id }, data, include: d.include });
  },

  async remove(resource: string, id: string) {
    const d = getResource(resource);
    const existing = await d.delegate.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound(`${d.label} not found`);
    const refs = await d.countRefs(id);
    if (refs > 0) {
      throw ApiError.conflict(
        `${d.label} is referenced by ${refs} record(s) and cannot be deleted. Deactivate it instead.`,
      );
    }
    await d.delegate.delete({ where: { id } });
    return { id };
  },
};
