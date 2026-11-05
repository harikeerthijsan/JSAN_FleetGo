import { z } from 'zod';

/**
 * Shared, reusable Zod schemas used across modules. Module-specific schemas
 * live in each module's `*.validators.ts`; these are the common building
 * blocks (pagination, id params) that most list/detail endpoints need.
 */

/** `?page=1&pageSize=20` with sane defaults and bounds. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** `/:id` route param as a non-empty string (UUID/CUID-friendly). */
export const idParamSchema = z.object({
  id: z.string().min(1, 'id is required'),
});
export type IdParam = z.infer<typeof idParamSchema>;
