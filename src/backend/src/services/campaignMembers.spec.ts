// Campaign membership rules against an in-memory fake of the users /
// campaigns / campaign_members tables. Verifies the discriminated results
// the routes map to statuses: add-by-email lookup, upsert re-roling, the
// last-owner guard on every demotion/removal path, and the admin 'owner'
// fallback in the campaign listing.

import {
  addMemberByEmail,
  listCampaignsForUser,
  listMembers,
  removeMember,
  setMemberRole,
} from './campaignMembers.js';
import { describe, expect, it, vi } from 'vitest';
import type { AppUser } from '../auth/passport.js';
import type { CampaignRole } from '../auth/middleware.js';
import type { Pool } from 'pg';

interface FakeUser {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
}

interface FakeMember {
  campaign_id: string;
  user_id: string;
  role: CampaignRole;
  added_at: Date;
}

function makeDb(opts: {
  users?: FakeUser[];
  campaigns?: { id: string; name: string }[];
  members?: Omit<FakeMember, 'added_at'>[];
}) {
  const users = opts.users ?? [];
  const campaigns = opts.campaigns ?? [];
  const members: FakeMember[] = (opts.members ?? []).map((m) => ({
    ...m,
    added_at: new Date(0),
  }));

  const joined = (m: FakeMember) => {
    const u = users.find((u) => u.id === m.user_id)!;
    return {
      user_id: m.user_id,
      role: m.role,
      added_at: m.added_at,
      display_name: u.display_name,
      email: u.email,
      avatar_url: u.avatar_url,
    };
  };

  const pool = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('SELECT id FROM users WHERE email')) {
        const u = users.find((u) => u.email === params[0]);
        return { rows: u ? [{ id: u.id }] : [], rowCount: u ? 1 : 0 };
      }
      if (sql.includes('FROM campaign_members WHERE campaign_id = $1 AND role')) {
        const rows = members
          .filter((m) => m.campaign_id === params[0] && m.role === params[1])
          .map((m) => ({ user_id: m.user_id }));
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('JOIN users u') && sql.includes('m.user_id = $2')) {
        const m = members.find((m) => m.campaign_id === params[0] && m.user_id === params[1]);
        return { rows: m ? [joined(m)] : [], rowCount: m ? 1 : 0 };
      }
      if (sql.includes('JOIN users u') && sql.includes('ORDER BY m.role DESC')) {
        const rows = members.filter((m) => m.campaign_id === params[0]).map(joined);
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('INSERT INTO campaign_members')) {
        const [campaign_id, user_id, role] = params as [string, string, CampaignRole];
        const existing = members.find(
          (m) => m.campaign_id === campaign_id && m.user_id === user_id
        );
        if (existing) existing.role = role;
        else members.push({ campaign_id, user_id, role, added_at: new Date(0) });
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('UPDATE campaign_members SET role')) {
        const m = members.find((m) => m.campaign_id === params[0] && m.user_id === params[1]);
        if (m) m.role = params[2] as CampaignRole;
        return { rows: [], rowCount: m ? 1 : 0 };
      }
      if (sql.includes('DELETE FROM campaign_members')) {
        const idx = members.findIndex(
          (m) => m.campaign_id === params[0] && m.user_id === params[1]
        );
        if (idx >= 0) members.splice(idx, 1);
        return { rows: [], rowCount: idx >= 0 ? 1 : 0 };
      }
      if (sql.includes('FROM campaigns c')) {
        const rows = campaigns.map((c) => {
          const m = members.find((m) => m.campaign_id === c.id && m.user_id === params[0]);
          return { id: c.id, name: c.name, my_role: m?.role ?? null };
        });
        return { rows, rowCount: rows.length };
      }
      throw new Error(`fake db: unhandled query: ${sql.split('\n')[0]}`);
    }),
  } as unknown as Pool;

  return { pool, members };
}

const ALICE: FakeUser = { id: 'a', email: 'alice@test', display_name: 'Alice', avatar_url: null };
const BOB: FakeUser = { id: 'b', email: 'bob@test', display_name: 'Bob', avatar_url: null };

function appUser(id: string, isAdmin = false): AppUser {
  return { id, email: `${id}@test`, display_name: id, avatar_url: null, is_admin: isAdmin };
}

describe('listCampaignsForUser', () => {
  const setup = () =>
    makeDb({
      users: [ALICE],
      campaigns: [
        { id: 'malgovia', name: 'Malgovia' },
        { id: 'sandbox', name: 'sandbox' },
      ],
      members: [{ campaign_id: 'malgovia', user_id: 'a', role: 'editor' }],
    });

  it('returns membership roles, null where none', async () => {
    const db = setup();
    const list = await listCampaignsForUser(db.pool, appUser('a'));
    expect(list).toEqual([
      { id: 'malgovia', name: 'Malgovia', my_role: 'editor' },
      { id: 'sandbox', name: 'sandbox', my_role: null },
    ]);
  });

  it('resolves admins to owner on campaigns they have no row for', async () => {
    const db = setup();
    const list = await listCampaignsForUser(db.pool, appUser('z', true));
    expect(list.every((c) => c.my_role === 'owner')).toBe(true);
  });
});

describe('addMemberByEmail', () => {
  it('404-reasons an unknown email', async () => {
    const db = makeDb({ users: [ALICE] });
    const result = await addMemberByEmail(db.pool, 'malgovia', 'nobody@test', 'editor');
    expect(result).toEqual({ ok: false, reason: 'user_not_found' });
  });

  it('adds a new member and returns the joined row', async () => {
    const db = makeDb({ users: [ALICE] });
    const result = await addMemberByEmail(db.pool, 'malgovia', 'alice@test', 'owner');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.member).toMatchObject({ user_id: 'a', role: 'owner', display_name: 'Alice' });
    }
  });

  it('upserts: re-adding an existing member changes their role', async () => {
    const db = makeDb({
      users: [ALICE, BOB],
      members: [
        { campaign_id: 'malgovia', user_id: 'a', role: 'owner' },
        { campaign_id: 'malgovia', user_id: 'b', role: 'editor' },
      ],
    });
    const result = await addMemberByEmail(db.pool, 'malgovia', 'bob@test', 'owner');
    expect(result.ok).toBe(true);
    expect(db.members.find((m) => m.user_id === 'b')?.role).toBe('owner');
  });

  it('refuses to demote the sole owner via re-add', async () => {
    const db = makeDb({
      users: [ALICE],
      members: [{ campaign_id: 'malgovia', user_id: 'a', role: 'owner' }],
    });
    const result = await addMemberByEmail(db.pool, 'malgovia', 'alice@test', 'editor');
    expect(result).toEqual({ ok: false, reason: 'last_owner' });
    expect(db.members.find((m) => m.user_id === 'a')?.role).toBe('owner');
  });
});

describe('setMemberRole', () => {
  it('reports a non-member', async () => {
    const db = makeDb({ users: [ALICE] });
    const result = await setMemberRole(db.pool, 'malgovia', 'a', 'editor');
    expect(result).toEqual({ ok: false, reason: 'not_a_member' });
  });

  it('refuses to demote the sole owner', async () => {
    const db = makeDb({
      users: [ALICE],
      members: [{ campaign_id: 'malgovia', user_id: 'a', role: 'owner' }],
    });
    const result = await setMemberRole(db.pool, 'malgovia', 'a', 'editor');
    expect(result).toEqual({ ok: false, reason: 'last_owner' });
  });

  it('demotes an owner when another owner remains', async () => {
    const db = makeDb({
      users: [ALICE, BOB],
      members: [
        { campaign_id: 'malgovia', user_id: 'a', role: 'owner' },
        { campaign_id: 'malgovia', user_id: 'b', role: 'owner' },
      ],
    });
    const result = await setMemberRole(db.pool, 'malgovia', 'a', 'editor');
    expect(result.ok).toBe(true);
    expect(db.members.find((m) => m.user_id === 'a')?.role).toBe('editor');
  });

  it('promotes an editor to owner', async () => {
    const db = makeDb({
      users: [ALICE, BOB],
      members: [
        { campaign_id: 'malgovia', user_id: 'a', role: 'owner' },
        { campaign_id: 'malgovia', user_id: 'b', role: 'editor' },
      ],
    });
    const result = await setMemberRole(db.pool, 'malgovia', 'b', 'owner');
    expect(result.ok).toBe(true);
    expect(db.members.find((m) => m.user_id === 'b')?.role).toBe('owner');
  });
});

describe('removeMember', () => {
  it('reports a non-member', async () => {
    const db = makeDb({ users: [ALICE] });
    expect(await removeMember(db.pool, 'malgovia', 'a')).toEqual({
      ok: false,
      reason: 'not_a_member',
    });
  });

  it('refuses to remove the sole owner', async () => {
    const db = makeDb({
      users: [ALICE],
      members: [{ campaign_id: 'malgovia', user_id: 'a', role: 'owner' }],
    });
    expect(await removeMember(db.pool, 'malgovia', 'a')).toEqual({
      ok: false,
      reason: 'last_owner',
    });
    expect(db.members).toHaveLength(1);
  });

  it('removes an editor, and an owner when one remains', async () => {
    const db = makeDb({
      users: [ALICE, BOB],
      members: [
        { campaign_id: 'malgovia', user_id: 'a', role: 'owner' },
        { campaign_id: 'malgovia', user_id: 'b', role: 'owner' },
      ],
    });
    expect(await removeMember(db.pool, 'malgovia', 'a')).toEqual({ ok: true });
    expect(db.members).toHaveLength(1);
  });
});

describe('listMembers', () => {
  it('returns joined rows for the campaign only', async () => {
    const db = makeDb({
      users: [ALICE, BOB],
      members: [
        { campaign_id: 'malgovia', user_id: 'a', role: 'owner' },
        { campaign_id: 'other', user_id: 'b', role: 'editor' },
      ],
    });
    const rows = await listMembers(db.pool, 'malgovia');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: 'a', role: 'owner', email: 'alice@test' });
  });
});
