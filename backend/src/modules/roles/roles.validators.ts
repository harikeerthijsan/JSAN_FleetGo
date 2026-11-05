import { z } from 'zod';

export const createRoleSchema = z.object({
  // Machine key: UPPER_SNAKE_CASE, stable identifier used in code/checks.
  name: z
    .string()
    .trim()
    .regex(
      /^[A-Z][A-Z0-9_]{2,}$/,
      'Role key must be UPPER_SNAKE_CASE (e.g. REGIONAL_MANAGER)',
    ),
  displayName: z.string().trim().min(2, 'Display name is required'),
  description: z.string().trim().optional(),
  permissionKeys: z.array(z.string()).default([]),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z
  .object({
    displayName: z.string().trim().min(2).optional(),
    description: z.string().trim().nullable().optional(),
    permissionKeys: z.array(z.string()).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
