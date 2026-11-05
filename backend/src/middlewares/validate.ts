import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { ApiError } from '../utils/ApiError';

/**
 * Request-validation foundation.
 *
 * Produces an Express middleware that validates and (where applicable) coerces
 * the request `body`, `query` and `params` against the provided Zod schemas.
 * Validated values are written back onto the request so downstream handlers
 * receive clean, typed input. Validation failures become a 422 ApiError with a
 * structured list of field issues.
 *
 * Business modules will supply their own schemas in their `*.validators.ts`
 * files; this middleware is the shared entry point.
 */
export interface RequestSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export const validate =
  (schemas: RequestSchemas) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) {
        // req.query has a read-only getter on some Express versions; assign via
        // defineProperty-safe reassignment of individual keys.
        Object.assign(req.query, schemas.query.parse(req.query));
      }
      if (schemas.params) {
        Object.assign(req.params, schemas.params.parse(req.params));
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));
        next(ApiError.unprocessable('Validation failed', details));
        return;
      }
      next(error);
    }
  };
