/**
 * Twilio-Compatible Error Codes for ChatUncle
 *
 * Error code ranges:
 * - 30001-30099: Delivery errors
 * - 30100-30199: Rate limit errors
 * - 30200-30299: Blocked/banned errors
 * - 30300-30399: Unreachable errors
 * - 30400-30499: Content policy errors
 * - 30500-30599: Authentication errors
 * - 30600-30699: Validation errors
 * - 30900-30999: System errors
 */

export type ErrorCategory =
  | 'delivery'
  | 'rate_limit'
  | 'blocked'
  | 'unreachable'
  | 'content_policy'
  | 'auth'
  | 'validation'
  | 'system';

export interface ErrorCodeDefinition {
  code: number;
  category: ErrorCategory;
  name: string;
  description: string;
  retryable: boolean;
}

/**
 * Standardized error codes registry
 */
export const ERROR_CODES = {
  // ============================================
  // 30001-30099: Delivery Errors
  // ============================================
  DELIVERY_UNKNOWN: {
    code: 30001,
    category: 'delivery' as const,
    name: 'DELIVERY_UNKNOWN',
    description: 'Unknown delivery error',
    retryable: true,
  },
  DELIVERY_TIMEOUT: {
    code: 30002,
    category: 'delivery' as const,
    name: 'DELIVERY_TIMEOUT',
    description: 'Message delivery timed out',
    retryable: true,
  },
  DELIVERY_FAILED: {
    code: 30003,
    category: 'delivery' as const,
    name: 'DELIVERY_FAILED',
    description: 'Message delivery failed',
    retryable: true,
  },
  MESSAGE_EXPIRED: {
    code: 30004,
    category: 'delivery' as const,
    name: 'MESSAGE_EXPIRED',
    description: 'Message validity period expired',
    retryable: false,
  },
  QUEUE_OVERFLOW: {
    code: 30005,
    category: 'delivery' as const,
    name: 'QUEUE_OVERFLOW',
    description: 'Message queue is full',
    retryable: true,
  },
  DUPLICATE_MESSAGE: {
    code: 30006,
    category: 'delivery' as const,
    name: 'DUPLICATE_MESSAGE',
    description: 'Duplicate message detected',
    retryable: false,
  },
  CHANNEL_UNAVAILABLE: {
    code: 30007,
    category: 'delivery' as const,
    name: 'CHANNEL_UNAVAILABLE',
    description: 'Channel is temporarily unavailable',
    retryable: true,
  },

  // ============================================
  // 30100-30199: Rate Limit Errors
  // ============================================
  RATE_LIMIT_EXCEEDED: {
    code: 30100,
    category: 'rate_limit' as const,
    name: 'RATE_LIMIT_EXCEEDED',
    description: 'Rate limit exceeded',
    retryable: true,
  },
  DAILY_LIMIT_EXCEEDED: {
    code: 30101,
    category: 'rate_limit' as const,
    name: 'DAILY_LIMIT_EXCEEDED',
    description: 'Daily message limit exceeded',
    retryable: false,
  },
  SAME_CONTACT_LIMIT: {
    code: 30102,
    category: 'rate_limit' as const,
    name: 'SAME_CONTACT_LIMIT',
    description: 'Rate limit for same contact exceeded',
    retryable: true,
  },
  API_RATE_LIMIT: {
    code: 30103,
    category: 'rate_limit' as const,
    name: 'API_RATE_LIMIT',
    description: 'API rate limit exceeded',
    retryable: true,
  },
  GLOBAL_RATE_LIMIT: {
    code: 30104,
    category: 'rate_limit' as const,
    name: 'GLOBAL_RATE_LIMIT',
    description: 'Global rate limit exceeded',
    retryable: true,
  },

  // ============================================
  // 30200-30299: Blocked/Banned Errors
  // ============================================
  NUMBER_BLOCKED: {
    code: 30200,
    category: 'blocked' as const,
    name: 'NUMBER_BLOCKED',
    description: 'Recipient has blocked sender',
    retryable: false,
  },
  ACCOUNT_BANNED: {
    code: 30201,
    category: 'blocked' as const,
    name: 'ACCOUNT_BANNED',
    description: 'Sender account is banned',
    retryable: false,
  },
  SPAM_DETECTED: {
    code: 30202,
    category: 'blocked' as const,
    name: 'SPAM_DETECTED',
    description: 'Message flagged as spam',
    retryable: false,
  },
  CARRIER_FILTERED: {
    code: 30203,
    category: 'blocked' as const,
    name: 'CARRIER_FILTERED',
    description: 'Message filtered by carrier',
    retryable: false,
  },
  OPT_OUT: {
    code: 30204,
    category: 'blocked' as const,
    name: 'OPT_OUT',
    description: 'Recipient has opted out',
    retryable: false,
  },

  // ============================================
  // 30300-30399: Unreachable Errors
  // ============================================
  INVALID_RECIPIENT: {
    code: 30300,
    category: 'unreachable' as const,
    name: 'INVALID_RECIPIENT',
    description: 'Invalid recipient identifier',
    retryable: false,
  },
  RECIPIENT_NOT_FOUND: {
    code: 30301,
    category: 'unreachable' as const,
    name: 'RECIPIENT_NOT_FOUND',
    description: 'Recipient not found on platform',
    retryable: false,
  },
  RECIPIENT_UNREGISTERED: {
    code: 30302,
    category: 'unreachable' as const,
    name: 'RECIPIENT_UNREGISTERED',
    description: 'Recipient not registered on channel',
    retryable: false,
  },
  RECIPIENT_OFFLINE: {
    code: 30303,
    category: 'unreachable' as const,
    name: 'RECIPIENT_OFFLINE',
    description: 'Recipient device is offline',
    retryable: true,
  },
  INVALID_PHONE_NUMBER: {
    code: 30304,
    category: 'unreachable' as const,
    name: 'INVALID_PHONE_NUMBER',
    description: 'Phone number format is invalid',
    retryable: false,
  },

  // ============================================
  // 30400-30499: Content Policy Errors
  // ============================================
  CONTENT_TOO_LONG: {
    code: 30400,
    category: 'content_policy' as const,
    name: 'CONTENT_TOO_LONG',
    description: 'Message content exceeds maximum length',
    retryable: false,
  },
  INVALID_MEDIA_TYPE: {
    code: 30401,
    category: 'content_policy' as const,
    name: 'INVALID_MEDIA_TYPE',
    description: 'Media type not supported',
    retryable: false,
  },
  MEDIA_TOO_LARGE: {
    code: 30402,
    category: 'content_policy' as const,
    name: 'MEDIA_TOO_LARGE',
    description: 'Media file exceeds size limit',
    retryable: false,
  },
  PROHIBITED_CONTENT: {
    code: 30403,
    category: 'content_policy' as const,
    name: 'PROHIBITED_CONTENT',
    description: 'Content violates policy',
    retryable: false,
  },
  TEMPLATE_REQUIRED: {
    code: 30404,
    category: 'content_policy' as const,
    name: 'TEMPLATE_REQUIRED',
    description: 'Template message required for this recipient',
    retryable: false,
  },
  TEMPLATE_NOT_APPROVED: {
    code: 30405,
    category: 'content_policy' as const,
    name: 'TEMPLATE_NOT_APPROVED',
    description: 'Template not approved for use',
    retryable: false,
  },
  INVALID_TEMPLATE: {
    code: 30406,
    category: 'content_policy' as const,
    name: 'INVALID_TEMPLATE',
    description: 'Invalid template parameters',
    retryable: false,
  },

  // ============================================
  // 30500-30599: Authentication Errors
  // ============================================
  ACCOUNT_DISCONNECTED: {
    code: 30500,
    category: 'auth' as const,
    name: 'ACCOUNT_DISCONNECTED',
    description: 'Channel account is disconnected',
    retryable: true,
  },
  AUTH_EXPIRED: {
    code: 30501,
    category: 'auth' as const,
    name: 'AUTH_EXPIRED',
    description: 'Authentication has expired',
    retryable: true,
  },
  SESSION_INVALID: {
    code: 30502,
    category: 'auth' as const,
    name: 'SESSION_INVALID',
    description: 'Session is invalid or logged out',
    retryable: true,
  },
  TOKEN_REFRESH_FAILED: {
    code: 30503,
    category: 'auth' as const,
    name: 'TOKEN_REFRESH_FAILED',
    description: 'Failed to refresh authentication token',
    retryable: true,
  },
  ACCOUNT_SUSPENDED: {
    code: 30504,
    category: 'auth' as const,
    name: 'ACCOUNT_SUSPENDED',
    description: 'Account has been suspended',
    retryable: false,
  },

  // ============================================
  // 30600-30699: Validation Errors
  // ============================================
  INVALID_CONTENT_TYPE: {
    code: 30600,
    category: 'validation' as const,
    name: 'INVALID_CONTENT_TYPE',
    description: 'Invalid content type specified',
    retryable: false,
  },
  MISSING_CONTENT: {
    code: 30601,
    category: 'validation' as const,
    name: 'MISSING_CONTENT',
    description: 'Message content is required',
    retryable: false,
  },
  INVALID_SCHEDULE_TIME: {
    code: 30602,
    category: 'validation' as const,
    name: 'INVALID_SCHEDULE_TIME',
    description: 'Scheduled time is invalid or in the past',
    retryable: false,
  },
  INVALID_VALIDITY_PERIOD: {
    code: 30603,
    category: 'validation' as const,
    name: 'INVALID_VALIDITY_PERIOD',
    description: 'Validity period is out of range',
    retryable: false,
  },
  MISSING_REQUIRED_FIELD: {
    code: 30604,
    category: 'validation' as const,
    name: 'MISSING_REQUIRED_FIELD',
    description: 'Required field is missing',
    retryable: false,
  },
  INVALID_IDEMPOTENCY_KEY: {
    code: 30605,
    category: 'validation' as const,
    name: 'INVALID_IDEMPOTENCY_KEY',
    description: 'Idempotency key is invalid',
    retryable: false,
  },

  // ============================================
  // 30900-30999: System Errors
  // ============================================
  INTERNAL_ERROR: {
    code: 30900,
    category: 'system' as const,
    name: 'INTERNAL_ERROR',
    description: 'Internal system error',
    retryable: true,
  },
  SERVICE_UNAVAILABLE: {
    code: 30901,
    category: 'system' as const,
    name: 'SERVICE_UNAVAILABLE',
    description: 'Service temporarily unavailable',
    retryable: true,
  },
  DATABASE_ERROR: {
    code: 30902,
    category: 'system' as const,
    name: 'DATABASE_ERROR',
    description: 'Database operation failed',
    retryable: true,
  },
  QUEUE_ERROR: {
    code: 30903,
    category: 'system' as const,
    name: 'QUEUE_ERROR',
    description: 'Message queue error',
    retryable: true,
  },
  EXTERNAL_SERVICE_ERROR: {
    code: 30904,
    category: 'system' as const,
    name: 'EXTERNAL_SERVICE_ERROR',
    description: 'External service error',
    retryable: true,
  },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/**
 * Get error definition by error code number
 */
export function getErrorByCode(code: number): ErrorCodeDefinition | undefined {
  return Object.values(ERROR_CODES).find((e) => e.code === code);
}

/**
 * Get error definition by error name
 */
export function getErrorByName(name: ErrorCode): ErrorCodeDefinition {
  return ERROR_CODES[name];
}

/**
 * Get documentation URL for error code
 */
export function getErrorDocUrl(code: number | ErrorCode): string {
  const codeNum = typeof code === 'number' ? code : ERROR_CODES[code].code;
  return `https://docs.chatuncle.com/errors/${codeNum}`;
}

/**
 * Map channel-specific errors to standardized error codes
 */
export function mapChannelErrorToCode(
  channelType: string,
  error: string | Error
): ErrorCodeDefinition {
  const errorStr = typeof error === 'string' ? error : error.message;
  const errorLower = errorStr.toLowerCase();

  // WhatsApp-specific error mappings
  if (channelType === 'whatsapp') {
    if (errorLower.includes('not on whatsapp') || errorLower.includes('not registered')) {
      return ERROR_CODES.RECIPIENT_UNREGISTERED;
    }
    if (errorLower.includes('logged out') || errorLower.includes('require restart')) {
      return ERROR_CODES.SESSION_INVALID;
    }
  }

  // Telegram-specific error mappings
  if (channelType === 'telegram') {
    if (errorLower.includes('bot was blocked')) {
      return ERROR_CODES.NUMBER_BLOCKED;
    }
    if (errorLower.includes('chat not found')) {
      return ERROR_CODES.RECIPIENT_NOT_FOUND;
    }
    if (errorLower.includes('too many requests') || errorLower.includes('429')) {
      return ERROR_CODES.RATE_LIMIT_EXCEEDED;
    }
  }

  // Generic error mappings
  if (errorLower.includes('blocked') || errorLower.includes('banned')) {
    return ERROR_CODES.NUMBER_BLOCKED;
  }
  if (errorLower.includes('rate') || errorLower.includes('too many') || errorLower.includes('429')) {
    return ERROR_CODES.RATE_LIMIT_EXCEEDED;
  }
  if (errorLower.includes('not found') || errorLower.includes('invalid')) {
    return ERROR_CODES.INVALID_RECIPIENT;
  }
  if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
    return ERROR_CODES.DELIVERY_TIMEOUT;
  }
  if (errorLower.includes('disconnect') || errorLower.includes('session')) {
    return ERROR_CODES.ACCOUNT_DISCONNECTED;
  }
  if (errorLower.includes('spam') || errorLower.includes('filter')) {
    return ERROR_CODES.SPAM_DETECTED;
  }
  if (errorLower.includes('too long') || errorLower.includes('too large')) {
    return ERROR_CODES.CONTENT_TOO_LONG;
  }
  if (errorLower.includes('media') || errorLower.includes('file type')) {
    return ERROR_CODES.INVALID_MEDIA_TYPE;
  }

  // Default to unknown delivery error
  return ERROR_CODES.DELIVERY_UNKNOWN;
}

/**
 * Check if an error code is retryable
 */
export function isRetryableError(code: number | ErrorCode): boolean {
  if (typeof code === 'number') {
    const error = getErrorByCode(code);
    return error?.retryable ?? false;
  }
  return ERROR_CODES[code].retryable;
}

/**
 * API error response format
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
 * Create API error response
 */
export function createApiErrorResponse(
  errorCode: ErrorCode,
  requestId: string,
  details?: ApiErrorResponse['details']
): ApiErrorResponse {
  const error = ERROR_CODES[errorCode];
  return {
    status: getHttpStatusForError(error.category),
    code: error.name,
    message: error.description,
    moreInfo: getErrorDocUrl(error.code),
    requestId,
    details,
  };
}

/**
 * Get HTTP status code for error category
 */
function getHttpStatusForError(category: ErrorCategory): number {
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
