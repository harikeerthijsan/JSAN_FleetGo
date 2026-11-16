import { z } from 'zod';

/** PATCH fields omitted by the caller must not run create-time defaults/transforms. */
export function partialSchema<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const shape = {} as {
    [K in keyof T]: z.ZodOptional<z.ZodUnion<readonly [z.ZodUndefined, T[K]]>>;
  };
  for (const key of Object.keys(schema.shape) as (keyof T)[])
    shape[key] = z.union([z.undefined(), schema.shape[key]]).optional();
  return z.object(shape);
}
