import { Request, Response, Router } from 'express';
import { configuredProviders, findOrCreateUser } from '../auth/passport.js';
import passport from 'passport';

export const authRouter = Router();

// Register OAuth start + callback routes for each configured provider.
// Pattern is identical across providers — passport.authenticate handles the
// strategy lookup by name. New providers only need an entry in passport.ts
// (strategy registration) and configuredProviders() (UI registry).
//
// Google uses 'profile' + 'email' scopes; Discord uses its own scopes set on
// the strategy itself. We pass an empty scope here because the strategies
// declare their own defaults.
const PROVIDER_SCOPES: Record<string, string[]> = {
  google: ['profile', 'email'],
  discord: ['identify', 'email'],
};

for (const provider of configuredProviders()) {
  const scope = PROVIDER_SCOPES[provider.id] ?? [];
  authRouter.get(`/${provider.id}`, passport.authenticate(provider.id, { scope }));
  authRouter.get(
    `/${provider.id}/callback`,
    passport.authenticate(provider.id, {
      failureRedirect: `${process.env.FRONTEND_URL}/?auth=failed`,
    }),
    (_req: Request, res: Response) => {
      res.redirect(process.env.FRONTEND_URL ?? '/');
    }
  );
}

// What the frontend asks for to render the login screen. Returns only
// providers the server is configured for (env vars present).
authRouter.get('/providers', (_req: Request, res: Response) => {
  res.json(configuredProviders());
});

// Current user info — frontend polls this to decide whether to show login screen
authRouter.get('/me', (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  res.json(req.user);
});

// E2E test bypass — POST { email } creates/finds the user and logs them in
// without going through an OAuth provider. Gated to non-production environments
// AND requires E2E_TEST_LOGIN_ENABLED=true so it can never accidentally
// expose itself in deployed environments. The Playwright suite hits this
// before driving the UI.
//
// Uses the same findOrCreateUser path as the real providers, with
// provider: 'e2e'. This keeps the bypass on the multi-provider rails
// instead of carving out a special-case write path.
if (process.env.NODE_ENV !== 'production' && process.env.E2E_TEST_LOGIN_ENABLED === 'true') {
  authRouter.post('/test-login', async (req: Request, res: Response) => {
    const email = (req.body?.email ?? 'e2e-test@pansori.local') as string;
    const displayName = (req.body?.displayName ?? 'E2E Test User') as string;
    try {
      const user = await findOrCreateUser({
        provider: 'e2e',
        providerId: email,
        email,
        displayName,
        avatarUrl: null,
      });
      req.login(user, (err) => {
        if (err) {
          res.status(500).json({ error: 'login failed', detail: String(err) });
          return;
        }
        res.json(user);
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
