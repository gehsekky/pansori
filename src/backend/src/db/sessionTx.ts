// Per-session write serialization.
//
// Every route that rewrites `game_sessions.state` used to read the row,
// work on it, then `UPDATE ... WHERE id = $1`. Two overlapping requests
// (a second tab, two party members acting at once) both read
// the same row and the later write silently erased the earlier one. The
// action route's `turn_seq` check didn't help: it compared against the row
// it had read, not the row it was about to overwrite.
//
// `withSessionTx` runs a handler inside a transaction. Handlers read the
// session with `SELECT ... FOR UPDATE` (see `lockSessionForParticipant` in
// routes/game.ts), which makes overlapping writers for the same session
// wait for the holder's COMMIT and then read the committed row. Different
// sessions never block each other.
//
// Responses and Socket.IO broadcasts that announce the new state go through
// `afterCommit`, so nobody is told about a state that might still roll
// back. Error responses for rejected requests (4xx before any write) can be
// sent directly; nothing was written, so there is nothing to commit.

import type { PoolClient } from 'pg';
import type { Response } from 'express';
import { pool } from './pool.js';

// How long a request waits for another request's lock on the same session
// before giving up with 409. An action normally holds it for milliseconds;
// the long tail is the optional LLM narration call.
export const SESSION_LOCK_TIMEOUT = '15s';

// Postgres SQLSTATE for lock_timeout expiry.
const LOCK_NOT_AVAILABLE = '55P03';

export interface SessionTx {
  client: PoolClient;
  // Queue work (a response, a broadcast) to run only once the transaction
  // has committed. Callbacks run in registration order.
  afterCommit: (fn: () => void) => void;
}

export interface SessionTxDeps {
  connect: () => Promise<PoolClient>;
}

const defaultDeps: SessionTxDeps = { connect: () => pool.connect() };

export async function withSessionTx(
  res: Response,
  handler: (tx: SessionTx) => Promise<void>,
  deps: SessionTxDeps = defaultDeps
): Promise<void> {
  const client = await deps.connect();
  const deferred: Array<() => void> = [];
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL lock_timeout = '${SESSION_LOCK_TIMEOUT}'`);
    await handler({ client, afterCommit: (fn) => deferred.push(fn) });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (!res.headersSent) {
      if ((err as { code?: string }).code === LOCK_NOT_AVAILABLE) {
        res.status(409).json({
          error: 'The session is busy with another request — try again.',
        });
      } else {
        res.status(500).json({ error: (err as Error).message });
      }
    }
    return;
  } finally {
    client.release();
  }
  for (const fn of deferred) {
    try {
      fn();
    } catch (err) {
      // The state is already committed; a failing broadcast or response must
      // not become an unhandled rejection in the Express handler.
      console.error('[sessionTx] afterCommit callback failed:', err);
    }
  }
}
