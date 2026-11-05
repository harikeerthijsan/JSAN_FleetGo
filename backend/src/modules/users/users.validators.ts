import { UserStatus } from '@prisma/client';
import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from '../../utils/password';

const strongPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  roleId: z.string().optional(),
  organizationId: z.string().optional(),
  status: z.nativeEnum(UserStatus).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

// Role-specific profile details (all optional). Blank strings are normalized to
// undefined so empty inputs don't overwrite stored values with "".
const blankToUndef = z.string().trim().max(200).optional().or(z.literal('').transform(() => undefined));
const optionalDate = z.coerce.date().optional().or(z.literal('').transform(() => undefined));

export const userProfileSchema = z.object({
  licenseNumber: blankToUndef,
  licenseExpiry: optionalDate,
  licenseClass: blankToUndef,
  addressLine: z.string().trim().max(300).optional().or(z.literal('').transform(() => undefined)),
  city: blankToUndef,
  state: blankToUndef,
  postalCode: blankToUndef,
  emergencyContactName: blankToUndef,
  emergencyContactPhone: blankToUndef,
  dateOfBirth: optionalDate,
  notes: z.string().trim().max(2000).optional().or(z.literal('').transform(() => undefined)),
});
export type UserProfileInput = z.infer<typeof userProfileSchema>;

export const createUserSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required'),
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  phone: z.string().trim().optional(),
  // Optional: if omitted, a temporary password is generated and returned (dev).
  password: strongPasswordSchema.optional(),
  roleId: z.string().min(1, 'A role is required'),
  organizationId: z.string().optional(),
  depotIds: z.array(z.string()).optional(),
  status: z.nativeEnum(UserStatus).default(UserStatus.ACTIVE),
  profile: userProfileSchema.optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    fullName: z.string().trim().min(2).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    phone: z.string().trim().nullable().optional(),
    roleId: z.string().min(1).optional(),
    organizationId: z.string().nullable().optional(),
    depotIds: z.array(z.string()).optional(),
    profile: userProfileSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const updateUserStatusSchema = z.object({
  status: z.nativeEnum(UserStatus),
});
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
