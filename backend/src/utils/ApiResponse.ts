import type { Response } from 'express';

/**
 * Standard API response envelope used by every endpoint so that frontend
 * clients can rely on a single, predictable shape.
 *
 * Success: { success: true,  data, message, meta?, timestamp }
 * Failure: { success: false, error: { code, message, details? }, timestamp }
 */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SuccessBody<T> {
  success: true;
  message: string;
  data: T;
  meta?: PaginationMeta | Record<string, unknown>;
  timestamp: string;
}

export interface ErrorBody {
  success: false;
  error: {
    code: number;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

export const ApiResponse = {
  success<T>(
    res: Response,
    data: T,
    message = 'OK',
    statusCode = 200,
    meta?: PaginationMeta | Record<string, unknown>,
  ): Response {
    const body: SuccessBody<T> = {
      success: true,
      message,
      data,
      ...(meta ? { meta } : {}),
      timestamp: new Date().toISOString(),
    };
    return res.status(statusCode).json(body);
  },

  error(
    res: Response,
    statusCode: number,
    message: string,
    details?: unknown,
  ): Response {
    const body: ErrorBody = {
      success: false,
      error: {
        code: statusCode,
        message,
        ...(details !== undefined ? { details } : {}),
      },
      timestamp: new Date().toISOString(),
    };
    return res.status(statusCode).json(body);
  },
};
