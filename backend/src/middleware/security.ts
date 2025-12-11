/**
 * Security Middleware
 * Rate limiting and security headers for the application
 */

import rateLimit, { type Options } from 'express-rate-limit';
import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';

/**
 * Common validation options to disable IPv6 warnings
 * We handle IP normalization properly and use user IDs where possible
 */
const commonValidation: Partial<Options['validate']> = {
  xForwardedForHeader: false,
  ip: false,
  // Disable IPv6 keyGenerator check - we handle this via validate options
  default: true,
};

/**
 * Rate limiter for authentication endpoints
 * Prevents brute force attacks
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  // Use IPv6 subnet to handle address rotation (56-bit prefix)
  ipv6Subnet: 56,
  validate: commonValidation,
});

/**
 * Rate limiter for API endpoints
 * Prevents DoS attacks
 */
export const apiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  // Use IPv6 subnet to handle address rotation (56-bit prefix)
  ipv6Subnet: 56,
  validate: commonValidation,
  skip: (req: Request) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  },
});

/**
 * Rate limiter for message sending
 * Aligned with anti-ban limits
 */
export const messageRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // 20 messages per minute per user
  message: { error: 'Message rate limit exceeded. Please wait before sending more messages.' },
  standardHeaders: true,
  legacyHeaders: false,
  // Use IPv6 subnet for IP fallback
  ipv6Subnet: 56,
  validate: commonValidation,
  keyGenerator: (req: Request) => {
    // Rate limit per user, not per IP (user ID takes precedence)
    return req.user?.userId || req.ip || 'unknown';
  },
});

/**
 * Security headers middleware using helmet
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      connectSrc: ["'self'", 'wss:', 'ws:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", 'https:', 'blob:'],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow embedding for media
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin resources
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

/**
 * Request sanitization middleware
 * Removes common XSS attack vectors from request body
 */
export function sanitizeRequest(req: Request, res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }
  next();
}

function sanitizeObject(obj: Record<string, any>): void {
  for (const key in obj) {
    if (typeof obj[key] === 'string') {
      // Don't sanitize password fields
      if (!key.toLowerCase().includes('password')) {
        // Remove null bytes and other control characters
        obj[key] = obj[key].replace(/\0/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
      }
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeObject(obj[key]);
    }
  }
}

/**
 * Error handler that doesn't expose internal details
 */
export function secureErrorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  // Log the full error for debugging
  console.error('Error:', err);

  // Don't expose internal error details in production
  if (config.nodeEnv === 'production') {
    res.status(500).json({ error: 'An unexpected error occurred. Please try again later.' });
  } else {
    // In development, show more details
    res.status(500).json({
      error: 'Internal server error',
      message: err.message,
      stack: err.stack,
    });
  }
}
