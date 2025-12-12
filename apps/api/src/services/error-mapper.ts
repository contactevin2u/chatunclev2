import {
  ERROR_CODES,
  type ErrorCodeDefinition,
  type ChannelType,
  mapChannelErrorToCode,
} from '@chatuncle/shared';

/**
 * Extended error mapping for specific channel error patterns
 *
 * Augments the shared mapChannelErrorToCode function with
 * additional patterns discovered in production.
 */
const EXTENDED_ERROR_PATTERNS: Record<string, Array<{
  patterns: string[];
  errorCode: ErrorCodeDefinition;
}>> = {
  whatsapp: [
    {
      patterns: ['not on whatsapp', 'not registered', 'number not exists'],
      errorCode: ERROR_CODES.RECIPIENT_UNREGISTERED,
    },
    {
      patterns: ['logged out', 'require restart', 'connection closed', 'stream:error'],
      errorCode: ERROR_CODES.SESSION_INVALID,
    },
    {
      patterns: ['blocked', 'privacy settings'],
      errorCode: ERROR_CODES.NUMBER_BLOCKED,
    },
    {
      patterns: ['rate-limit', 'too many', 'please wait'],
      errorCode: ERROR_CODES.RATE_LIMIT_EXCEEDED,
    },
    {
      patterns: ['media too large', 'file size', 'exceeds maximum'],
      errorCode: ERROR_CODES.MEDIA_TOO_LARGE,
    },
    {
      patterns: ['unsupported media', 'invalid media', 'media type'],
      errorCode: ERROR_CODES.INVALID_MEDIA_TYPE,
    },
    {
      patterns: ['message too long', 'character limit'],
      errorCode: ERROR_CODES.CONTENT_TOO_LONG,
    },
    {
      patterns: ['timeout', 'timed out', 'took too long'],
      errorCode: ERROR_CODES.DELIVERY_TIMEOUT,
    },
    {
      patterns: ['server unavailable', '503', '500 internal'],
      errorCode: ERROR_CODES.SERVICE_UNAVAILABLE,
    },
    {
      patterns: ['banned', 'suspended', 'account disabled'],
      errorCode: ERROR_CODES.ACCOUNT_BANNED,
    },
    {
      patterns: ['spam', 'bulk messaging', 'marked as spam'],
      errorCode: ERROR_CODES.SPAM_DETECTED,
    },
  ],
  telegram: [
    {
      patterns: ['bot was blocked', 'user blocked'],
      errorCode: ERROR_CODES.NUMBER_BLOCKED,
    },
    {
      patterns: ['chat not found', 'peer_id_invalid'],
      errorCode: ERROR_CODES.RECIPIENT_NOT_FOUND,
    },
    {
      patterns: ['too many requests', '429', 'flood'],
      errorCode: ERROR_CODES.RATE_LIMIT_EXCEEDED,
    },
    {
      patterns: ['user deactivated', 'user is deactivated'],
      errorCode: ERROR_CODES.RECIPIENT_UNREGISTERED,
    },
    {
      patterns: ['unauthorized', '401', 'token invalid'],
      errorCode: ERROR_CODES.AUTH_EXPIRED,
    },
    {
      patterns: ['message too long'],
      errorCode: ERROR_CODES.CONTENT_TOO_LONG,
    },
    {
      patterns: ['file too big', 'file_too_big'],
      errorCode: ERROR_CODES.MEDIA_TOO_LARGE,
    },
  ],
  tiktok: [
    {
      patterns: ['unauthorized', 'token expired', 'invalid token'],
      errorCode: ERROR_CODES.AUTH_EXPIRED,
    },
    {
      patterns: ['rate limit', 'too many requests'],
      errorCode: ERROR_CODES.RATE_LIMIT_EXCEEDED,
    },
    {
      patterns: ['user not found', 'invalid user'],
      errorCode: ERROR_CODES.RECIPIENT_NOT_FOUND,
    },
    {
      patterns: ['service unavailable', 'server error'],
      errorCode: ERROR_CODES.SERVICE_UNAVAILABLE,
    },
  ],
  instagram: [
    {
      patterns: ['user blocked', 'cannot message'],
      errorCode: ERROR_CODES.NUMBER_BLOCKED,
    },
    {
      patterns: ['24 hour window', 'messaging window'],
      errorCode: ERROR_CODES.TEMPLATE_REQUIRED,
    },
    {
      patterns: ['rate limit', 'throttled'],
      errorCode: ERROR_CODES.RATE_LIMIT_EXCEEDED,
    },
    {
      patterns: ['invalid user', 'user not found'],
      errorCode: ERROR_CODES.RECIPIENT_NOT_FOUND,
    },
    {
      patterns: ['token expired', 'token invalid'],
      errorCode: ERROR_CODES.AUTH_EXPIRED,
    },
  ],
  messenger: [
    {
      patterns: ['user blocked', 'cannot message'],
      errorCode: ERROR_CODES.NUMBER_BLOCKED,
    },
    {
      patterns: ['24 hour window', 'messaging window'],
      errorCode: ERROR_CODES.TEMPLATE_REQUIRED,
    },
    {
      patterns: ['rate limit', 'throttled'],
      errorCode: ERROR_CODES.RATE_LIMIT_EXCEEDED,
    },
    {
      patterns: ['invalid user', 'user not found', 'psid invalid'],
      errorCode: ERROR_CODES.RECIPIENT_NOT_FOUND,
    },
    {
      patterns: ['token expired', 'token invalid'],
      errorCode: ERROR_CODES.AUTH_EXPIRED,
    },
  ],
};

/**
 * Error mapper service for translating channel errors to standardized codes
 */
export class ErrorMapperService {
  /**
   * Map a channel error to a standardized error code
   *
   * Uses extended patterns first, then falls back to shared mapper
   */
  mapError(
    channelType: ChannelType,
    error: string | Error
  ): ErrorCodeDefinition {
    const errorStr = typeof error === 'string' ? error : error.message;
    const errorLower = errorStr.toLowerCase();

    // Check extended patterns first
    const channelPatterns = EXTENDED_ERROR_PATTERNS[channelType];
    if (channelPatterns) {
      for (const { patterns, errorCode } of channelPatterns) {
        if (patterns.some(p => errorLower.includes(p))) {
          return errorCode;
        }
      }
    }

    // Fall back to shared mapper
    return mapChannelErrorToCode(channelType, error);
  }

  /**
   * Extract additional context from error message
   */
  extractErrorContext(error: string | Error): Record<string, unknown> {
    const errorStr = typeof error === 'string' ? error : error.message;
    const context: Record<string, unknown> = {};

    // Extract rate limit retry-after
    const retryMatch = errorStr.match(/retry (?:after|in) (\d+)/i);
    if (retryMatch) {
      context.retryAfterSeconds = parseInt(retryMatch[1], 10);
    }

    // Extract error codes from message
    const codeMatch = errorStr.match(/error[:\s]*(\d+)/i);
    if (codeMatch) {
      context.channelErrorCode = codeMatch[1];
    }

    // Extract HTTP status
    const httpMatch = errorStr.match(/(?:status|http)[:\s]*(\d{3})/i);
    if (httpMatch) {
      context.httpStatus = parseInt(httpMatch[1], 10);
    }

    return context;
  }

  /**
   * Create a full error result with code and context
   */
  createErrorResult(
    channelType: ChannelType,
    error: string | Error
  ): {
    errorCode: ErrorCodeDefinition;
    errorMessage: string;
    context: Record<string, unknown>;
    retryable: boolean;
  } {
    const errorCode = this.mapError(channelType, error);
    const errorStr = typeof error === 'string' ? error : error.message;
    const context = this.extractErrorContext(error);

    return {
      errorCode,
      errorMessage: errorStr,
      context,
      retryable: errorCode.retryable,
    };
  }

  /**
   * Check if an error should trigger account disconnection
   */
  shouldDisconnect(errorCode: ErrorCodeDefinition): boolean {
    return ([
      ERROR_CODES.SESSION_INVALID.code,
      ERROR_CODES.AUTH_EXPIRED.code,
      ERROR_CODES.ACCOUNT_BANNED.code,
      ERROR_CODES.ACCOUNT_DISCONNECTED.code,
      ERROR_CODES.ACCOUNT_SUSPENDED.code,
    ] as number[]).includes(errorCode.code);
  }

  /**
   * Check if an error should disable the conversation
   */
  shouldDisableConversation(errorCode: ErrorCodeDefinition): boolean {
    return ([
      ERROR_CODES.NUMBER_BLOCKED.code,
      ERROR_CODES.RECIPIENT_UNREGISTERED.code,
      ERROR_CODES.OPT_OUT.code,
    ] as number[]).includes(errorCode.code);
  }

  /**
   * Get suggested action for an error
   */
  getSuggestedAction(errorCode: ErrorCodeDefinition): string {
    switch (errorCode.category) {
      case 'auth':
        return 'Reconnect the account';
      case 'blocked':
        return 'Contact cannot receive messages from this account';
      case 'rate_limit':
        return 'Wait before retrying';
      case 'unreachable':
        return 'Verify the recipient identifier';
      case 'content_policy':
        return 'Modify message content to comply with policies';
      case 'validation':
        return 'Fix the request parameters';
      case 'system':
        return 'Retry later';
      case 'delivery':
      default:
        return errorCode.retryable ? 'Retry the message' : 'Contact support';
    }
  }
}

// Singleton instance
export const errorMapper = new ErrorMapperService();
