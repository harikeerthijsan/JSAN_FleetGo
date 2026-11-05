import { z } from "zod";

/** Phase 12 — Settings request validation. */

export const keyParam = z.object({ key: z.string().trim().min(1).max(120) });

// A setting value arrives as a string, number or boolean; the service coerces it
// to its stored string form and validates it against the setting's valueType.
export const updateSettingSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export const preferencesSchema = z
  .object({
    theme: z.enum(["system", "light", "dark"]).optional(),
    density: z.enum(["comfortable", "compact"]).optional(),
    defaultLanding: z.string().trim().max(120).nullable().optional(),
    notifyEmail: z.boolean().optional(),
    notifyInApp: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "At least one preference must be provided" });
export type PreferencesInput = z.infer<typeof preferencesSchema>;
