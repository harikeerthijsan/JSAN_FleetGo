import { z } from "zod";

/** Phase 11 — Vendor Management request validation. A vendor is an Organization
 * of type VEHICLE_VENDOR or TRANSPORT_PARTNER; these schemas cover the vendor
 * workspace (profile, contacts, locations, assigned users, status). */

export const VENDOR_TYPES = ["VEHICLE_VENDOR", "TRANSPORT_PARTNER"] as const;
export const ENTITY_STATUSES = ["ACTIVE", "INACTIVE"] as const;

const opt = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal("").transform(() => undefined));
const email = () =>
  z.string().trim().toLowerCase().email("A valid email is required").optional().or(z.literal("").transform(() => undefined));

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  type: z.enum(VENDOR_TYPES).optional(),
  status: z.enum(ENTITY_STATUSES).optional(),
  search: z.string().trim().max(120).optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(160),
  type: z.enum(VENDOR_TYPES),
  contactName: opt(150),
  contactEmail: email(),
  contactPhone: opt(40),
  registrationNumber: opt(80),
  category: opt(80),
  addressLine: opt(200),
  city: opt(80),
  region: opt(80),
  website: opt(200),
  notes: opt(2000),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const updateSchema = registerSchema
  .partial()
  .omit({ type: true })
  .refine((d) => Object.keys(d).length > 0, { message: "At least one field must be provided" });
export type UpdateInput = z.infer<typeof updateSchema>;

export const statusSchema = z.object({
  status: z.enum(ENTITY_STATUSES),
  reason: z.string().trim().min(1).max(500),
});

export const contactSchema = z.object({
  name: z.string().trim().min(1).max(150),
  title: opt(120),
  email: email(),
  phone: opt(40),
  isPrimary: z.boolean().default(false),
});

export const locationSchema = z.object({
  label: z.string().trim().min(1).max(120),
  addressLine: opt(200),
  city: opt(80),
  region: opt(80),
  contactName: opt(150),
  contactPhone: opt(40),
  isPrimary: z.boolean().default(false),
});

export const assignUserSchema = z.object({
  userId: z.string().uuid(),
});

export const DOCUMENT_CATEGORIES = ["CONSENT", "AGREEMENT", "OTHER"] as const;
