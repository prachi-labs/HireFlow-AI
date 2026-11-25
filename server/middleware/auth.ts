import type { Request, Response, NextFunction } from 'express';
import { getUserById, SessionUser, verifySessionToken } from '../services/authService.ts';

export interface AuthenticatedRequest extends Request {
  user?: SessionUser;
}

export function extractSessionUser(req: Request): SessionUser | null {
  const token =
    (req.cookies?.hf_session as string | undefined) ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7).trim()
      : undefined);

  const verified = verifySessionToken(token);
  if (!verified) return null;
  return getUserById(verified.uid);
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = extractSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  req.user = user;
  next();
}

export function requireRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions for this action.' });
      return;
    }
    next();
  };
}
