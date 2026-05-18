import { Router, Request, Response } from 'express';
import passport from 'passport';

export const authRouter = Router();

// Kick off Google OAuth flow
authRouter.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// Google redirects here after user grants permission
authRouter.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: `${process.env.FRONTEND_URL}/?auth=failed` }),
  (_req: Request, res: Response) => {
    res.redirect(process.env.FRONTEND_URL ?? '/');
  }
);

// Current user info — frontend polls this to decide whether to show login screen
authRouter.get('/me', (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  res.json(req.user);
});

// Sign out
authRouter.post('/logout', (req: Request, res: Response) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });
});
