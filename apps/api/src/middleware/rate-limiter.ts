import type { Request, Response, NextFunction } from 'express';
import type { RequestWithContext } from './request-context.js';
import { RateLimitError } from './error-handler.js';

/**
 * Rate limit tiers
 */
export type RateLimitTier = 'free' | 'starter' | 'business' | 'enterprise';

/**
 * Rate limit configuration per tier
 */
export const RATE_LIMIT_TIERS: Record<RateLimitTier, {
  windowMs: number;
  maxRequests: number;
}> = {
  free: { windowMs: 60000, maxRequests: 100 },        // 100 req/min
  starter: { windowMs: 60000, maxRequests: 500 },    // 500 req/min
  business: { windowMs: 60000, maxRequests: 2000 },  // 2000 req/min
  enterprise: { windowMs: 60000, maxRequests: 10000 }, // 10000 req/min
};

/**
 * Per-endpoint rate limits (overrides tier limits)
 */
export const ENDPOINT_LIMITS: Record<string, { windowMs: number; maxRequests: number }> = {
  'POST:/v1/Messages': { windowMs: 60000, maxRequests: 50 },        // 50 messages/min
  'POST:/v1/Accounts/:id/connect': { windowMs: 300000, maxRequests: 5 }, // 5 connects/5min
  'POST:/api/auth/login': { windowMs: 300000, maxRequests: 10 },    // 10 login attempts/5min
  'POST:/api/auth/register': { windowMs: 3600000, maxRequests: 3 }, // 3 registrations/hour
};

/**
 * In-memory rate limit store
 * For production, use Redis with sliding window
 */
class RateLimitStore {
  private store = new Map<string, { count: number; resetAt: number }>();

  /**
   * Check and increment rate limit counter
   */
  check(key: string, windowMs: number, maxRequests: number): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    retryAfter?: number;
  } {
    const now = Date.now();
    const existing = this.store.get(key);

    // If no entry or window expired, create new
    if (!existing || now >= existing.resetAt) {
      this.store.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });

      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetAt: now + windowMs,
      };
    }

    // Increment counter
    existing.count++;

    if (existing.count > maxRequests) {
      const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetAt: existing.resetAt,
        retryAfter,
      };
    }

    return {
      allowed: true,
      remaining: maxRequests - existing.count,
      resetAt: existing.resetAt,
    };
  }

  /**
   * Clean up expired entries (call periodically)
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.store.entries()) {
      if (now >= value.resetAt) {
        this.store.delete(key);
      }
    }
  }
}

const rateLimitStore = new RateLimitStore();

// Cleanup expired entries every minute
setInterval(() => rateLimitStore.cleanup(), 60000);

/**
 * Get rate limit key for a request
 */
function getRateLimitKey(req: Request, type: 'ip' | 'account' | 'endpoint'): string {
  const contextReq = req as RequestWithContext;

  switch (type) {
    case 'ip':
      return `ip:${getClientIp(req)}`;
    case 'account':
      return `account:${contextReq.accountId || 'anonymous'}`;
    case 'endpoint':
      const path = req.route?.path || req.path;
      return `endpoint:${req.method}:${path}:${contextReq.accountId || getClientIp(req)}`;
  }
}

/**
 * Get client IP address
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Get endpoint-specific rate limit
 */
function getEndpointLimit(req: Request): { windowMs: number; maxRequests: number } | null {
  const path = req.route?.path || req.path;
  const key = `${req.method}:${path}`;

  // Try exact match first
  if (ENDPOINT_LIMITS[key]) {
    return ENDPOINT_LIMITS[key];
  }

  // Try pattern match
  for (const [pattern, limit] of Object.entries(ENDPOINT_LIMITS)) {
    const patternPath = pattern.split(':').slice(1).join(':');
    const reqPath = `${req.method}:${req.path}`;
    if (matchPattern(pattern, reqPath)) {
      return limit;
    }
  }

  return null;
}

/**
 * Simple pattern matching for routes
 */
function matchPattern(pattern: string, path: string): boolean {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');

  if (patternParts.length !== pathParts.length) {
    return false;
  }

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      continue; // Parameter matches anything
    }
    if (patternParts[i] !== pathParts[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Rate limiting middleware
 *
 * Implements Twilio-like rate limiting with:
 * - Tier-based limits
 * - Per-endpoint limits
 * - Standard rate limit headers
 */
export function rateLimiter(defaultTier: RateLimitTier = 'free') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const contextReq = req as RequestWithContext;

    // Get tier from account or use default
    // In a full implementation, we'd look up the account tier from the database
    const tier = defaultTier;
    const tierConfig = RATE_LIMIT_TIERS[tier];

    // Check for endpoint-specific limit
    const endpointLimit = getEndpointLimit(req);

    // Use the more restrictive limit
    const config = endpointLimit && endpointLimit.maxRequests < tierConfig.maxRequests
      ? endpointLimit
      : tierConfig;

    // Check rate limit
    const key = getRateLimitKey(req, 'account');
    const result = rateLimitStore.check(key, config.windowMs, config.maxRequests);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', config.maxRequests);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfter!);
      return next(new RateLimitError(result.retryAfter!));
    }

    next();
  };
}

/**
 * Create rate limiter for specific endpoint
 */
export function endpointRateLimiter(windowMs: number, maxRequests: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = getRateLimitKey(req, 'endpoint');
    const result = rateLimitStore.check(key, windowMs, maxRequests);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfter!);
      return next(new RateLimitError(result.retryAfter!));
    }

    next();
  };
}

/**
 * IP-based rate limiter for unauthenticated endpoints
 */
export function ipRateLimiter(windowMs: number, maxRequests: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = getRateLimitKey(req, 'ip');
    const result = rateLimitStore.check(key, windowMs, maxRequests);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfter!);
      return next(new RateLimitError(result.retryAfter!));
    }

    next();
  };
}
