import { Request, Response, NextFunction } from 'express';
import { verifyToken, type TokenPayload } from '../modules/auth/service.js';
import { userHasAccountAccess, getUserAccountRole } from '../modules/accounts/access.js';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const payload = verifyToken(token);

    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    req.user = payload;
    next();
  } catch (error) {
    console.error('[Auth Middleware] Error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

/**
 * Account access middleware factory
 * Verifies user has access to the account specified in params
 */
export function accountAccessMiddleware(paramName: string = 'accountId') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const accountId = req.params[paramName];
      if (!accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const hasAccess = await userHasAccountAccess(req.user.userId, accountId);

      if (!hasAccess) {
        res.status(403).json({ error: 'Access denied to this account' });
        return;
      }

      next();
    } catch (error) {
      console.error('[Account Access Middleware] Error:', error);
      res.status(500).json({ error: 'Access check failed' });
    }
  };
}

/**
 * Role-based access middleware factory
 * Verifies user has specific role for the account
 */
export function roleMiddleware(requiredRoles: string[], paramName: string = 'accountId') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const accountId = req.params[paramName];
      if (!accountId) {
        res.status(400).json({ error: 'Account ID required' });
        return;
      }

      const role = await getUserAccountRole(req.user.userId, accountId);

      if (!role || !requiredRoles.includes(role)) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      next();
    } catch (error) {
      console.error('[Role Middleware] Error:', error);
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
}

/**
 * Admin-only middleware
 */
export function adminMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
