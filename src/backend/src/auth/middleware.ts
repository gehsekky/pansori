import { NextFunction, Request, Response } from 'express';
import type { AppUser } from './passport.js';

// After requireAuth, downstream handlers can use AuthedRequest to access
// req.user as non-undefined without a `!` assertion.
export type AuthedRequest = Request & { user: AppUser };

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Not authenticated' });
}
