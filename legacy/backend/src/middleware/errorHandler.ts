/**
 * Standardized Error Handling Middleware
 *
 * Provides consistent error responses across all API endpoints.
 * Includes error classification, logging, and client-friendly messages.
 */

import { Request, Response, NextFunction } from 'express';

// Error codes for client-side handling
export enum ErrorCode {
  // Auth errors (1xxx)
  UNAUTHORIZED = 1001,
  FORBIDDEN = 1002,
  TOKEN_EXPIRED = 1003,
  INVALID_CREDENTIALS = 1004,

  // Validation errors (2xxx)
  VALIDATION_ERROR = 2001,
  MISSING_REQUIRED_FIELD = 2002,
  INVALID_FORMAT = 2003,
  INVALID_CHANNEL_TYPE = 2004,

  // Resource errors (3xxx)
  NOT_FOUND = 3001,
  ACCOUNT_NOT_FOUND = 3002,
  CONTACT_NOT_FOUND = 3003,
  CONVERSATION_NOT_FOUND = 3004,
  MESSAGE_NOT_FOUND = 3005,
  USER_NOT_FOUND = 3006,

  // Permission errors (4xxx)
  INSUFFICIENT_PERMISSION = 4001,
  OWNER_ONLY = 4002,
  SEND_PERMISSION_REQUIRED = 4003,

  // Channel errors (5xxx)
  CHANNEL_NOT_CONNECTED = 5001,
  CHANNEL_CONNECTION_FAILED = 5002,
  CHANNEL_SEND_FAILED = 5003,
  CHANNEL_ALREADY_EXISTS = 5004,

  // Rate limiting (6xxx)
  RATE_LIMITED = 6001,
  ANTI_BAN_COOLDOWN = 6002,

  // Server errors (9xxx)
  INTERNAL_ERROR = 9001,
  DATABASE_ERROR = 9002,
  EXTERNAL_SERVICE_ERROR = 9003,
}

// HTTP status code mapping
const errorCodeToStatus: Record<ErrorCode, number> = {
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.TOKEN_EXPIRED]: 401,
  [ErrorCode.INVALID_CREDENTIALS]: 401,
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.MISSING_REQUIRED_FIELD]: 400,
  [ErrorCode.INVALID_FORMAT]: 400,
  [ErrorCode.INVALID_CHANNEL_TYPE]: 400,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.ACCOUNT_NOT_FOUND]: 404,
  [ErrorCode.CONTACT_NOT_FOUND]: 404,
  [ErrorCode.CONVERSATION_NOT_FOUND]: 404,
  [ErrorCode.MESSAGE_NOT_FOUND]: 404,
  [ErrorCode.USER_NOT_FOUND]: 404,
  [ErrorCode.INSUFFICIENT_PERMISSION]: 403,
  [ErrorCode.OWNER_ONLY]: 403,
  [ErrorCode.SEND_PERMISSION_REQUIRED]: 403,
  [ErrorCode.CHANNEL_NOT_CONNECTED]: 400,
  [ErrorCode.CHANNEL_CONNECTION_FAILED]: 500,
  [ErrorCode.CHANNEL_SEND_FAILED]: 500,
  [ErrorCode.CHANNEL_ALREADY_EXISTS]: 409,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.ANTI_BAN_COOLDOWN]: 429,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.DATABASE_ERROR]: 500,
  [ErrorCode.EXTERNAL_SERVICE_ERROR]: 502,
};

// Standardized error response format
export interface ErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, any>;
  };
  requestId?: string;
}

// Custom API Error class
export class ApiError extends Error {
  public code: ErrorCode;
  public details?: Record<string, any>;

  constructor(code: ErrorCode, message: string, details?: Record<string, any>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }

  static unauthorized(message = 'Authentication required'): ApiError {
    return new ApiError(ErrorCode.UNAUTHORIZED, message);
  }

  static forbidden(message = 'Access denied'): ApiError {
    return new ApiError(ErrorCode.FORBIDDEN, message);
  }

  static notFound(resource: string): ApiError {
    return new ApiError(ErrorCode.NOT_FOUND, `${resource} not found`);
  }

  static accountNotFound(): ApiError {
    return new ApiError(ErrorCode.ACCOUNT_NOT_FOUND, 'Account not found');
  }

  static contactNotFound(): ApiError {
    return new ApiError(ErrorCode.CONTACT_NOT_FOUND, 'Contact not found');
  }

  static conversationNotFound(): ApiError {
    return new ApiError(ErrorCode.CONVERSATION_NOT_FOUND, 'Conversation not found');
  }

  static validation(message: string, details?: Record<string, any>): ApiError {
    return new ApiError(ErrorCode.VALIDATION_ERROR, message, details);
  }

  static missingField(field: string): ApiError {
    return new ApiError(ErrorCode.MISSING_REQUIRED_FIELD, `${field} is required`, { field });
  }

  static insufficientPermission(message = 'Insufficient permission'): ApiError {
    return new ApiError(ErrorCode.INSUFFICIENT_PERMISSION, message);
  }

  static ownerOnly(): ApiError {
    return new ApiError(ErrorCode.OWNER_ONLY, 'Only account owner can perform this action');
  }

  static sendPermissionRequired(): ApiError {
    return new ApiError(ErrorCode.SEND_PERMISSION_REQUIRED, 'Send permission required');
  }

  static channelNotConnected(channelType: string): ApiError {
    return new ApiError(ErrorCode.CHANNEL_NOT_CONNECTED, `${channelType} not connected`);
  }

  static channelAlreadyExists(channelType: string): ApiError {
    return new ApiError(ErrorCode.CHANNEL_ALREADY_EXISTS, `${channelType} account already connected`);
  }

  static rateLimited(message = 'Rate limit exceeded'): ApiError {
    return new ApiError(ErrorCode.RATE_LIMITED, message);
  }

  static internal(message = 'Internal server error'): ApiError {
    return new ApiError(ErrorCode.INTERNAL_ERROR, message);
  }
}

/**
 * Express error handling middleware
 * Place this LAST in the middleware chain
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Generate request ID for tracking
  const requestId = req.headers['x-request-id'] as string || `req_${Date.now()}`;

  // Determine error details
  let code: ErrorCode;
  let message: string;
  let details: Record<string, any> | undefined;
  let status: number;

  if (err instanceof ApiError) {
    // Known API error
    code = err.code;
    message = err.message;
    details = err.details;
    status = errorCodeToStatus[code] || 500;
  } else {
    // Unknown error - log full details but return generic message
    code = ErrorCode.INTERNAL_ERROR;
    message = process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred';
    status = 500;

    // Log full error in development
    console.error(`[Error] ${requestId}:`, {
      name: err.name,
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });
  }

  // Send standardized response
  const response: ErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
    requestId,
  };

  res.status(status).json(response);
}

/**
 * Async route handler wrapper
 * Catches async errors and passes them to error middleware
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Success response helper
 * Provides consistent success response format
 */
export function successResponse<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({
    success: true,
    data,
  });
}

/**
 * Created response helper (201)
 */
export function createdResponse<T>(res: Response, data: T): Response {
  return successResponse(res, data, 201);
}

/**
 * No content response (204)
 */
export function noContentResponse(res: Response): Response {
  return res.status(204).send();
}

export default {
  errorHandler,
  asyncHandler,
  successResponse,
  createdResponse,
  noContentResponse,
  ApiError,
  ErrorCode,
};
