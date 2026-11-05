import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { logger } from '../utils/logger';

/**
 * Centralized error-handling middleware. Must be registered LAST (after all
 * routes and the notFound handler). Converts any thrown value into the
 * standard error response envelope.
 */
export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  // `next` is required so Express recognizes this as an error handler.
  _next: NextFunction,
): void => {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let details: unknown;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.too.large') {
    statusCode = 413; message = 'Request exceeds the maximum supported size';
  } else if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.parse.failed') {
    statusCode = 400; message = 'Malformed JSON request';
  } else if (err instanceof Error) {
    message = err.message;
  }

  // Server-side errors are logged with stack; client errors (4xx) are noise at
  // warn level only.
  if (statusCode >= 500) {
    logger.error(`Unhandled error: ${message}`, {
      stack: err instanceof Error ? err.stack : undefined,
    });
  } else {
    logger.warn(`Request error (${statusCode}): ${message}`);
  }

  // Never leak internal error details/stack traces in production.
  const safeDetails = config.app.isProduction && statusCode >= 500 ? undefined : details;

  ApiResponse.error(res, statusCode, message, safeDetails);
};
