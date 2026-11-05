import { EntityStatus } from '@prisma/client';
import { z } from 'zod';

/** Shared list query for every master-data resource. */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().trim().optional(),
  // 'true' | 'false' — filter by active state (optional).
  active: z.enum(['true', 'false']).optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const statusSchema = z.object({ active: z.boolean() });

// --- Per-resource create/update payloads ------------------------------------
const nameOnly = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  isActive: z.boolean().optional(),
});

export const makeSchema = nameOnly;
export const categorySchema = nameOnly;
export const fuelTypeSchema = nameOnly;
export const ownershipTypeSchema = nameOnly;

export const documentTypeSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  category: z
    .enum(['registration', 'insurance', 'photo', 'other'])
    .default('other'),
  isActive: z.boolean().optional(),
});

export const modelSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  variant: z.string().trim().optional(),
  makeId: z.string().min(1, 'A make is required'),
  isActive: z.boolean().optional(),
});

export const typeSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  categoryId: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const depotSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  code: z.string().trim().min(1, 'Code is required'),
  region: z.string().trim().optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  country: z.string().trim().optional(),
  status: z.nativeEnum(EntityStatus).optional(),
});
