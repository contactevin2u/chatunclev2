import type { Request, Response, NextFunction } from 'express';
import type { RequestWithContext } from './request-context.js';
import {
  ERROR_CODES,
  type ErrorCode,
  type ErrorCodeDefinition,
  getErrorDocUrl,
} from '@chatuncle/shared';

/**
 * Twilio-compatible API error response format
 */
export interface ApiErrorResponse {
  status: number;
  code: string;
  message: string;
  moreInfo: string;
  requestId: string;
  details?: Array<{
    field: string;
    message: string;
    code: string;
  }>;
}

/**
 * Application error with standardized error code
 */
export class AppError extends Error {
  public readonly errorCode: ErrorCodeDefinition;
  public readonly httpStatus: number;
  public readonly details?: ApiErrorResponse['details'];

  constructor(
    errorCode: ErrorCode | ErrorCodeDefinition,
    customMessage?: string,
    details?: ApiErrorResponse['details']
  ) {
    const errorDef = typeof errorCode === 'string' ? ERROR_CODES[errorCode] : errorCode;
    super(customMessage || errorDef.description);

    this.errorCode = errorDef;
    this.httpStatus = getHttpStatusForCategory(errorDef.category);
    this.details = details;

    // Maintains proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error helper
 */
export class ValidationError extends AppError {
  constructor(
    field: string,
    message: string,
    errorCode: ErrorCode = 'MISSING_REQUIRED_FIELD'
  ) {
    super(errorCode, message, [{ field, message, code: errorCode }]);
  }
}

/**
 * Not found error helper
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} '${id}' not found` : `${resource} not found`;
    super('INVALID_RECIPIENT', message);
  }
}

/**
 * Rate limit error helper
 */
export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(retryAfterSeconds: number) {
    super('RATE_LIMIT_EXCEEDED', `Rate limit exceeded. Retry after ${retryAfterSeconds} seconds.`);
    this.retryAfter = retryAfterSeconds;
  }
}

/**
 * Get HTTP status code for error category
 */
function getHttpStatusForCategory(category: string): number {
  switch (category) {
    case 'validation':
      return 400;
    case 'auth':
      return 401;
    case 'blocked':
    case 'content_policy':
      return 403;
    case 'unreachable':
      return 404;
    case 'rate_limit':
      return 429;
    case 'delivery':
    case 'system':
    default:
      return 500;
  }
}

/**
 * Format error response in Twilio-compatible format
 */
function formatErrorResponse(
  error: AppError | Error,
  requestId: string
): ApiErrorResponse {
  if (error instanceof AppError) {
    return {
      status: error.httpStatus,
      code: error.errorCode.name,
      message: error.message,
      moreInfo: getErrorDocUrl(error.errorCode.code),
      requestId,
      details: error.details,
    };
  }

  // Unknown error - treat as internal server error
  const internalError = ERROR_CODES.INTERNAL_ERROR;
  return {
    status: 500,
    code: internalError.name,
    message: process.env.NODE_ENV === 'production'
      ? internalError.description
      : error.message || internalError.description,
    moreInfo: getErrorDocUrl(internalError.code),
    requestId,
  };
}

/**
 * Global error handler middleware
 *
 * Must be registered last in the middleware chain.
 * Catches all errors and formats them in Twilio-compatible format.
 */
export function globalErrorHandler() {
  return (err: Error, req: Request, res: Response, _next: NextFunction) => {
    const contextReq = req as RequestWithContext;
    const requestId = contextReq.requestId || 'unknown';

    // Log the error
    console.error(`[${requestId}] Error:`, err);

    // Format response
    const response = formatErrorResponse(err, requestId);

    // Set rate limit headers if applicable
    if (err instanceof RateLimitError) {
      res.setHeader('Retry-After', err.retryAfter);
    }

    // Send response
    res.status(response.status).json(response);
  };
}

/**
 * Not found handler - for routes that don't exist
 */
export function notFoundHandler() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const error = new AppError(
      'INVALID_RECIPIENT',
      `Route ${req.method} ${req.path} not found`
    );
    next(error);
  };
}

/**
 * Async handler wrapper - catches async errors and passes to error handler
 */
export function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as T, res, next)).catch(next);
  };
}

/**
 * Success response helper
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  status: number = 200
): void {
  res.status(status).json(data);
}

/**
 * Created response helper
 */
export function sendCreated<T>(res: Response, data: T): void {
  sendSuccess(res, data, 201);
}

/**
 * No content response helper
 */
export function sendNoContent(res: Response): void {
  res.status(204).end();
}
