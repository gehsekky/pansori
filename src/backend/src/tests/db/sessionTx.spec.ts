// withSessionTx — the per-session write serialization wrapper. These tests
// pin the transaction protocol (BEGIN → lock_timeout → handler → COMMIT,
// ROLLBACK on error, client always released), that responses/broadcasts
// queued with afterCommit run only after COMMIT, and the error mapping
// (lock timeout → 409, anything else → 500, never a double response).
// lockSessionForParticipant is checked to take the row lock.

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/pool.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import type { PoolClient } from 'pg';
import type { Response } from 'express';
import { lockSessionForParticipant } from '../../routes/game.js';
import { withSessionTx } from '../../db/sessionTx.js';

function fakeClient(failOn?: { sql: RegExp; err: unknown }) {
  const log: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      log.push(sql);
      if (failOn && failOn.sql.test(sql)) throw failOn.err;
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(() => log.push('RELEASE')),
  };
  return { client: client as unknown as PoolClient & typeof client, log };
}

function fakeRes() {
  const res = {
    headersSent: false,
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      res.headersSent = true;
      return res;
    },
  };
  return res;
}

describe('withSessionTx', () => {
  it('wraps the handler in BEGIN / lock_timeout / COMMIT and releases the client', async () => {
    const { client, log } = fakeClient();
    const res = fakeRes();
    await withSessionTx(
      res as unknown as Response,
      async ({ client: c }) => {
        await c.query('UPDATE game_sessions SET state = $1 WHERE id = $2');
      },
      { connect: async () => client }
    );
    expect(log).toEqual([
      'BEGIN',
      "SET LOCAL lock_timeout = '15s'",
      'UPDATE game_sessions SET state = $1 WHERE id = $2',
      'COMMIT',
      'RELEASE',
    ]);
  });

  it('runs afterCommit callbacks only after COMMIT, in order', async () => {
    const { client, log } = fakeClient();
    const res = fakeRes();
    await withSessionTx(
      res as unknown as Response,
      async ({ afterCommit }) => {
        afterCommit(() => log.push('broadcast'));
        afterCommit(() => res.json({ ok: true }));
        log.push('handler-done');
      },
      { connect: async () => client }
    );
    expect(log.indexOf('COMMIT')).toBeLessThan(log.indexOf('broadcast'));
    expect(log.slice(-2)).toEqual(['RELEASE', 'broadcast']);
    expect(res.body).toEqual({ ok: true });
  });

  it('rolls back, skips afterCommit and answers 500 when the handler throws', async () => {
    const { client, log } = fakeClient();
    const res = fakeRes();
    const broadcast = vi.fn();
    await withSessionTx(
      res as unknown as Response,
      async ({ afterCommit }) => {
        afterCommit(broadcast);
        throw new Error('boom');
      },
      { connect: async () => client }
    );
    expect(log).toContain('ROLLBACK');
    expect(log).not.toContain('COMMIT');
    expect(log.at(-1)).toBe('RELEASE');
    expect(broadcast).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'boom' });
  });

  it('maps a lock timeout (SQLSTATE 55P03) to 409', async () => {
    const lockErr = Object.assign(new Error('canceling statement due to lock timeout'), {
      code: '55P03',
    });
    const { client } = fakeClient({ sql: /FOR UPDATE/, err: lockErr });
    const res = fakeRes();
    await withSessionTx(
      res as unknown as Response,
      async ({ client: c }) => {
        await c.query('SELECT * FROM game_sessions WHERE id = $1 FOR UPDATE');
      },
      { connect: async () => client }
    );
    expect(res.statusCode).toBe(409);
  });

  it('does not send a second response when the handler already answered', async () => {
    const { client } = fakeClient();
    const res = fakeRes();
    const json = vi.spyOn(res, 'json');
    await withSessionTx(
      res as unknown as Response,
      async () => {
        res.status(404).json({ error: 'Session not found' });
        throw new Error('late failure');
      },
      { connect: async () => client }
    );
    expect(json).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(404);
  });

  it('commits a 4xx early return (nothing written, nothing to undo)', async () => {
    const { client, log } = fakeClient();
    const res = fakeRes();
    await withSessionTx(
      res as unknown as Response,
      async () => {
        res.status(403).json({ error: 'Not your turn' });
      },
      { connect: async () => client }
    );
    expect(log).toContain('COMMIT');
    expect(res.statusCode).toBe(403);
  });

  it('keeps going when an afterCommit callback throws', async () => {
    const { client } = fakeClient();
    const res = fakeRes();
    const second = vi.fn();
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await withSessionTx(
      res as unknown as Response,
      async ({ afterCommit }) => {
        afterCommit(() => {
          throw new Error('socket down');
        });
        afterCommit(second);
      },
      { connect: async () => client }
    );
    expect(second).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('lockSessionForParticipant', () => {
  it('takes the session row lock and scopes it to participants', async () => {
    const { client, log } = fakeClient();
    await lockSessionForParticipant(client, 'sess-1', 'user-1');
    const sql = log[0];
    expect(sql).toMatch(/FOR UPDATE OF gs/);
    expect(sql).toMatch(/session_participants/);
    expect(client.query).toHaveBeenCalledWith(expect.any(String), ['sess-1', 'user-1']);
  });

  it('returns null without querying for a non-string id', async () => {
    const { client } = fakeClient();
    expect(await lockSessionForParticipant(client, undefined, 'user-1')).toBeNull();
    expect(client.query).not.toHaveBeenCalled();
  });
});
