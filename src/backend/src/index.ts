import 'dotenv/config';
import './auth/passport.js';
import { Server } from 'socket.io';
import { authRouter } from './routes/auth.js';
import connectPgSimple from 'connect-pg-simple';
import cors from 'cors';
import { createServer } from 'http';
import express from 'express';
import { gameRouter } from './routes/game.js';
import helmet from 'helmet';
import passport from 'passport';
import { pool } from './db/pool.js';
import { rateLimit } from 'express-rate-limit';
import { requireAuth } from './auth/middleware.js';
import { runMigrations } from './services/migrationRunner.js';
import session from 'express-session';

const app = express();
const httpServer = createServer(app);

// Behind nginx in prod: trust X-Forwarded-Proto so cookie.secure works and
// req.secure / req.ip reflect the original TLS-terminated connection.
app.set('trust proxy', 1);

const io = new Server(httpServer, {
  cors: { origin: process.env.FRONTEND_URL, credentials: true },
});

// Security headers (helmet) — applied before any route handler so every
// response carries reasonable defaults: X-Content-Type-Options, X-Frame-
// Options DENY, Strict-Transport-Security in prod, etc. The default CSP is
// disabled because the frontend is served from a different origin and the
// API never returns HTML — clients are SPA or fetch JSON only.
app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());

// ─── Session store ────────────────────────────────────────────────────────────
// Fail-fast if SESSION_SECRET is missing — a fallback string is a known
// secret in prod, which means forgeable session cookies and full auth
// bypass. Better to refuse to boot than to silently accept a known key.
if (!process.env.SESSION_SECRET) {
  throw new Error(
    'SESSION_SECRET is required. Generate a 64-char random value and set it in /opt/pansori/.env (or your local .env).'
  );
}
const PgSession = connectPgSimple(session);
// Built once so the same middleware can be reused by socket.io's
// engine.use() — that's how socket connections get the session cookie
// parsed and the user id available off socket.request.session.
const sessionMiddleware = session({
  store: new PgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: false,
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  },
});
app.use(sessionMiddleware);

// ─── Passport ─────────────────────────────────────────────────────────────────
app.use(passport.initialize());
app.use(passport.session());

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Defense in depth on /api/auth/*: the OAuth callback paths can't be brute-
// forced (Google/Discord control the token) but /api/auth/test-login is a
// password-equivalent endpoint in non-prod environments. Cap at 30 req/min
// per IP across the whole namespace — comfortably above any legitimate login
// flow but tight enough to throttle credential-stuffing.
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many auth requests, slow down.' },
});

// Game-route rate limit — protects against a misbehaving (or malicious)
// client spamming takeAction, which would drain LLM budget, balloon
// run_log, and pin the server CPU. 120 req/min is well above any legit
// playthrough cadence (the slowest action is one round = several seconds
// of player thought) but tight enough to throttle abuse.
const gameLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many game requests, slow down.' },
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/game', requireAuth, gameLimiter, gameRouter);

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(500).json({ status: 'error', db: 'disconnected' });
  }
});

// Socket.io — multiplayer-ready: each session gets its own room. Run the
// express-session middleware on each connection's upgrade request so the
// socket has access to req.session and we can authorize joins.
io.engine.use(sessionMiddleware);

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  socket.on('join-session', async (sessionId: string) => {
    // Ownership check: only the session's owner may subscribe to its room.
    // Without this any connected socket could `join-session(<any id>)`
    // and receive future state broadcasts. Single-tenant today;
    // session_participants will broaden this when multiplayer lands.
    const req = socket.request as unknown as {
      session?: { passport?: { user?: string } };
    };
    const userId = req.session?.passport?.user;
    if (!userId) {
      console.log(`Socket ${socket.id} rejected join (no session)`);
      return;
    }
    try {
      const { rowCount } = await pool.query(
        'SELECT 1 FROM game_sessions WHERE id = $1 AND user_id = $2',
        [sessionId, userId]
      );
      if (!rowCount) {
        console.log(`Socket ${socket.id} rejected join (not session owner)`);
        return;
      }
    } catch (err) {
      console.error('[socket] join-session ownership check failed:', err);
      return;
    }
    socket.join(`session:${sessionId}`);
    console.log(`Socket ${socket.id} joined session:${sessionId}`);
  });
  socket.on('disconnect', () => console.log('Socket disconnected:', socket.id));
});

const PORT = process.env.PORT || 3001;

// Run pending DB migrations before serving traffic. A failure here aborts
// startup so we don't accept requests against a half-migrated schema.
runMigrations(pool)
  .then(() => {
    httpServer.listen(PORT, () => console.log(`Backend running on :${PORT}`));
  })
  .catch((err) => {
    console.error('[startup] Migration runner failed — aborting:', err);
    process.exit(1);
  });
