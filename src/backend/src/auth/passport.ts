import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import passport from 'passport';
import { pool } from '../db/pool.js';

export interface AppUser {
  id: string;
  google_id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
}

declare global {
   
  namespace Express {
    interface User extends AppUser {}
  }
}

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL!,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value ?? '';
        const displayName = profile.displayName ?? '';
        const avatarUrl = profile.photos?.[0]?.value ?? null;

        const { rows } = await pool.query<AppUser>(
          `INSERT INTO users (google_id, email, display_name, avatar_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (google_id) DO UPDATE
           SET email        = EXCLUDED.email,
               display_name = EXCLUDED.display_name,
               avatar_url   = EXCLUDED.avatar_url
         RETURNING id, google_id, email, display_name, avatar_url`,
          [profile.id, email, displayName, avatarUrl]
        );
        done(null, rows[0]);
      } catch (err) {
        done(err as Error);
      }
    }
  )
);

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id: string, done) => {
  try {
    const { rows } = await pool.query<AppUser>(
      'SELECT id, google_id, email, display_name, avatar_url FROM users WHERE id = $1',
      [id]
    );
    done(null, rows[0] ?? null);
  } catch (err) {
    done(err as Error);
  }
});
