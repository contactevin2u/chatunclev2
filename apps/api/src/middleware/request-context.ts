import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Extended Express Request with request context
 */
export interface RequestWithContext extends Request {
  requestId: string;
  requestTimestamp: Date;
  debugMode: boolean;
  accountId?: string;
  userId?: string;
}

/**
 * Request context middleware - adds tracking info to every request
 *
 * Headers read:
 * - X-Request-Id: Client-provided request ID (falls back to generated UUID)
 * - X-Debug-Mode: Enable debug mode for verbose responses
 *
 * Headers set:
 * - X-Request-Id: Echo back the request ID
 * - X-Response-Time: Time taken to process request
 */
export function requestContext() {
  return (req: Request, res: Response, next: NextFunction) => {
    const contextReq = req as RequestWithContext;

    // Generate or use provided request ID
    contextReq.requestId =
      (req.headers['x-request-id'] as string) ||
      `req_${randomUUID().replace(/-/g, '')}`;

    // Record start time
    contextReq.requestTimestamp = new Date();

    // Check debug mode
    contextReq.debugMode = req.headers['x-debug-mode'] === 'true';

    // Set response headers
    res.setHeader('X-Request-Id', contextReq.requestId);

    // Calculate response time on finish
    const startTime = process.hrtime.bigint();

    res.on('finish', () => {
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1_000_000;

      // Note: Headers already sent, but we log the duration
      // For actual header, we'd need to use on('header') event
      if (contextReq.debugMode) {
        console.log(`[${contextReq.requestId}] ${req.method} ${req.path} - ${res.statusCode} (${durationMs.toFixed(2)}ms)`);
      }
    });

    // Intercept header send to add response time
    const originalWriteHead = res.writeHead.bind(res);
    let headersWritten = false;

    (res as any).writeHead = function(
      statusCode: number,
      statusMessage?: string | Record<string, unknown>,
      headers?: Record<string, unknown>
    ) {
      if (!headersWritten) {
        const endTime = process.hrtime.bigint();
        const durationMs = Number(endTime - startTime) / 1_000_000;
        res.setHeader('X-Response-Time', `${durationMs.toFixed(2)}ms`);
        headersWritten = true;
      }

      if (typeof statusMessage === 'object') {
        return originalWriteHead(statusCode, statusMessage as any);
      }
      return originalWriteHead(statusCode, statusMessage, headers as any);
    };

    next();
  };
}

/**
 * Get request context from request object
 */
export function getRequestContext(req: Request): RequestWithContext {
  return req as RequestWithContext;
}

/**
 * Generate a new request ID
 */
export function generateRequestId(): string {
  return `req_${randomUUID().replace(/-/g, '')}`;
}
