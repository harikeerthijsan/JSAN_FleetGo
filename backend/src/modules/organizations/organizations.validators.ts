import { EntityStatus, OrganizationType } from '@prisma/client';
import { z } from 'zod';

export const listOrganizationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  type: z.nativeEnum(OrganizationType).optional(),
  status: z.nativeEnum(EntityStatus).optional(),
});
export type ListOrganizationsQuery = z.infer<
  typeof listOrganizationsQuerySchema
>;

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  type: z.nativeEnum(OrganizationType),
  contactName: z.string().trim().optional(),
  contactEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email('A valid contact email is required')
    .optional(),
  contactPhone: z.string().trim().optional(),
  status: z.nativeEnum(EntityStatus).default(EntityStatus.ACTIVE),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = createOrganizationSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
