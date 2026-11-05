/**
 * Application-level operational error. Any error thrown through the request
 * pipeline that is an instance of `ApiError` is considered "expected" and is
 * serialized into the standard error response by the error-handling
 * middleware. Unexpected errors are treated as HTTP 500.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    message: string,
    details?: unknown,
    isOperational = true,
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace?.(this, this.constructor);
  }

  static badRequest(message = 'Bad Request', details?: unknown) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Unauthorized', details?: unknown) {
    return new ApiError(401, message, details);
  }

  static forbidden(message = 'Forbidden', details?: unknown) {
    return new ApiError(403, message, details);
  }

  static notFound(message = 'Not Found', details?: unknown) {
    return new ApiError(404, message, details);
  }

  static conflict(message = 'Conflict', details?: unknown) {
    return new ApiError(409, message, details);
  }

  static unprocessable(message = 'Unprocessable Entity', details?: unknown) {
    return new ApiError(422, message, details);
  }

  static internal(message = 'Internal Server Error', details?: unknown) {
    return new ApiError(500, message, details, false);
  }
}
