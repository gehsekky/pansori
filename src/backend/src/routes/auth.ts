import { Request, Response, Router } from 'express';
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

// E2E test bypass — POST { email } creates/finds the user and logs them in
// without going through Google OAuth. Gated to non-production environments
// AND requires E2E_TEST_LOGIN_ENABLED=true so it can never accidentally
// expose itself in deployed environments. The Playwright suite hits this
// before driving the UI.
if (process.env.NODE_ENV !== 'production' && process.env.E2E_TEST_LOGIN_ENABLED === 'true') {
  authRouter.post('/test-login', async (req: Request, res: Response) => {
    const email = (req.body?.email ?? 'e2e-test@pansori.local') as string;
    const displayName = (req.body?.displayName ?? 'E2E Test User') as string;
    const googleId = `e2e:${email}`;
    try {
      const { pool } = await import('../db/pool.js');
      const { rows } = await pool.query(
        `INSERT INTO users (google_id, email, display_name, avatar_url)
         VALUES ($1, $2, $3, NULL)
         ON CONFLICT (google_id) DO UPDATE SET email = EXCLUDED.email
         RETURNING id, google_id, email, display_name, avatar_url`,
        [googleId, email, displayName]
      );
      req.login(rows[0], (err) => {
        if (err) {
          res.status(500).json({ error: 'login failed', detail: String(err) });
          return;
        }
        res.json(rows[0]);
      });
    } catch (err) {
      res.status(500).json({ error: 'test-login failed', detail: String(err) });
    }
  });
}

// Sign out
authRouter.post('/logout', (req: Request, res: Response) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });
});
