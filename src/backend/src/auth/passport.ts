import { Strategy as DiscordStrategy } from 'passport-discord';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import passport from 'passport';
import { pool } from '../db/pool.js';

// AppUser is the shape stored in the session. It's deliberately
// provider-agnostic — the session only knows the user's identity at the
// Pansori-account level. Provider linkages live in the user_identities table
// and are queried on demand if the UI needs to show "linked accounts" etc.
export interface AppUser {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  // Site admin — gates the admin section and bypasses per-campaign role
  // checks (see auth/middleware.ts). Never set by any OAuth flow; flipped
  // manually in the DB (UPDATE users SET is_admin = TRUE WHERE email = …).
  is_admin: boolean;
}

declare global {
  namespace Express {
    interface User extends AppUser {}
  }
}

// findOrCreateUser is the single entry point that every provider's verify
// callback funnels through. It does two things atomically:
//   1. Look up an existing identity by (provider, provider_id). If found,
//      return the linked user (and refresh their profile fields).
//   2. Otherwise create a new user row + a new identity row.
//
// The function is also used by the E2E test-login bypass (which passes
// provider: 'e2e' and a synthetic provider_id) — see routes/auth.ts.
export async function findOrCreateUser(input: {
  provider: string;
  providerId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}): Promise<AppUser> {
  const { provider, providerId, email, displayName, avatarUrl } = input;

  // Try to resolve an existing identity → user.
  const existing = await pool.query<AppUser>(
    `SELECT u.id, u.email, u.display_name, u.avatar_url, u.is_admin
       FROM user_identities i
       JOIN users u ON u.id = i.user_id
      WHERE i.provider = $1 AND i.provider_id = $2`,
    [provider, providerId]
  );
  if (existing.rows[0]) {
    // Refresh the user's profile fields with the provider's latest values so
    // a name/avatar change at the provider propagates next sign-in.
    const refreshed = await pool.query<AppUser>(
      `UPDATE users
          SET email = $2, display_name = $3, avatar_url = $4
        WHERE id = $1
        RETURNING id, email, display_name, avatar_url, is_admin`,
      [existing.rows[0].id, email, displayName, avatarUrl]
    );
    return refreshed.rows[0];
  }

  // No identity yet. Create the user first, then the identity row.
  // The two writes are sequential rather than wrapped in a transaction —
  // if the identity insert races against itself (two concurrent OAuth
  // callbacks for the same new user), the primary key on
  // (provider, provider_id) makes the second one fail cleanly.
  const userRes = await pool.query<AppUser>(
    `INSERT INTO users (email, display_name, avatar_url)
     VALUES ($1, $2, $3)
     RETURNING id, email, display_name, avatar_url, is_admin`,
    [email, displayName, avatarUrl]
  );
  const user = userRes.rows[0];

  await pool.query(
    `INSERT INTO user_identities (user_id, provider, provider_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (provider, provider_id) DO NOTHING`,
    [user.id, provider, providerId]
  );

  return user;
}

// ─── Provider strategies ─────────────────────────────────────────────────────
//
// Each provider registration is gated on its own env vars. If a provider's
// client ID isn't configured, the strategy is skipped — the corresponding
// /api/auth/<provider> route in routes/auth.ts is also skipped, and
// /api/auth/providers omits it from the list. Result: the UI only offers
// providers the server is actually configured for.

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL ?? '/api/auth/google/callback',
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const user = await findOrCreateUser({
            provider: 'google',
            providerId: profile.id,
            email: profile.emails?.[0]?.value ?? '',
            displayName: profile.displayName ?? '',
            avatarUrl: profile.photos?.[0]?.value ?? null,
          });
          done(null, user);
        } catch (err) {
          done(err as Error);
        }
      }
    )
  );
}

if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
  passport.use(
    new DiscordStrategy(
      {
        clientID: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
        callbackURL: process.env.DISCORD_CALLBACK_URL ?? '/api/auth/discord/callback',
        scope: ['identify', 'email'],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          // Discord avatar URL has to be assembled from the avatar hash.
          // Format: https://cdn.discordapp.com/avatars/{user_id}/{hash}.png
          const avatarUrl = profile.avatar
            ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
            : null;
          const user = await findOrCreateUser({
            provider: 'discord',
            providerId: profile.id,
            email: profile.email ?? '',
            displayName: profile.username ?? profile.global_name ?? '',
            avatarUrl,
          });
          done(null, user);
        } catch (err) {
          done(err as Error);
        }
      }
    )
  );
}

// ─── Session serialization (provider-agnostic — keys by users.id) ────────────

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id: string, done) => {
  try {
    const { rows } = await pool.query<AppUser>(
      'SELECT id, email, display_name, avatar_url, is_admin FROM users WHERE id = $1',
      [id]
    );
    done(null, rows[0] ?? null);
  } catch (err) {
    done(err as Error);
  }
});

// ─── Provider registry — what's enabled, for the frontend to render buttons ──

export interface ConfiguredProvider {
  id: string;
  label: string;
}

export function configuredProviders(): ConfiguredProvider[] {
  const out: ConfiguredProvider[] = [];
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    out.push({ id: 'google', label: 'Sign in with Google' });
  }
  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
    out.push({ id: 'discord', label: 'Sign in with Discord' });
  }
  return out;
}
