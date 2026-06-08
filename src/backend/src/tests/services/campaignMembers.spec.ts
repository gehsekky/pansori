// Campaign membership rules against an in-memory fake of the users /
// campaigns / campaign_members tables. Verifies the discriminated results
// the routes map to statuses: add-by-email lookup, upsert re-roling, the
// last-owner guard on every demotion/removal path, and the admin 'owner'
// fallback in the campaign listing.

import {
  type CampaignVisibility,
  addMemberByEmail,
  createCampaign,
  listCampaignsForUser,
  listMembers,
  listVisibleCampaignIds,
  removeMember,
  setCampaignVisibility,
  setMemberRole,
} from '../../services/campaignMembers.js';
import { describe, expect, it, vi } from 'vitest';
import type { AppUser } from '../../auth/passport.js';
import type { CampaignRole } from '../../auth/middleware.js';
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
  campaigns?: { id: string; name: string; visibility?: CampaignVisibility }[];
  members?: Omit<FakeMember, 'added_at'>[];
}) {
  const users = opts.users ?? [];
  const campaigns = (opts.campaigns ?? []).map((c) => ({
    ...c,
    visibility: c.visibility ?? ('global' as CampaignVisibility),
  }));
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
      if (sql.includes('JOIN users u') && sql.includes('ORDER BY CASE m.role')) {
        const rows = members.filter((m) => m.campaign_id === params[0]).map(joined);
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('INSERT INTO campaigns')) {
        const [id, name] = params as [string, string];
        if (campaigns.some((c) => c.id === id)) return { rows: [], rowCount: 0 }; // ON CONFLICT DO NOTHING
        campaigns.push({ id, name, visibility: 'private' });
        return { rows: [], rowCount: 1 };
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
      if (sql.includes('AS my_role')) {
        // listCampaignsForUser: global OR member OR admin ($2).
        const [userId, isAdmin] = params as [string, boolean];
        const rows = campaigns
          .map((c) => {
            const m = members.find((m) => m.campaign_id === c.id && m.user_id === userId);
            return { id: c.id, name: c.name, visibility: c.visibility, my_role: m?.role ?? null };
          })
          .filter((r) => r.visibility === 'global' || r.my_role !== null || isAdmin);
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('SELECT id FROM campaigns')) {
        // listVisibleCampaignIds, admin path: everything.
        const rows = campaigns.map((c) => ({ id: c.id }));
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('SELECT c.id')) {
        // listVisibleCampaignIds, non-admin path: global OR member.
        const rows = campaigns
          .filter(
            (c) =>
              c.visibility === 'global' ||
              members.some((m) => m.campaign_id === c.id && m.user_id === params[0])
          )
          .map((c) => ({ id: c.id }));
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('UPDATE campaigns SET visibility')) {
        const c = campaigns.find((c) => c.id === params[0]);
        if (c) c.visibility = params[1] as CampaignVisibility;
        return { rows: [], rowCount: c ? 1 : 0 };
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
        { id: 'secret', name: 'Secret Realm', visibility: 'private' },
      ],
      members: [{ campaign_id: 'malgovia', user_id: 'a', role: 'editor' }],
    });

  it('returns membership roles, null where none — private non-member campaigns hidden', async () => {
    const db = setup();
    const list = await listCampaignsForUser(db.pool, appUser('a'));
    expect(list).toEqual([
      { id: 'malgovia', name: 'Malgovia', visibility: 'global', my_role: 'editor' },
      { id: 'sandbox', name: 'sandbox', visibility: 'global', my_role: null },
    ]);
  });

  it('shows a private campaign to its members', async () => {
    const db = setup();
    db.members.push({ campaign_id: 'secret', user_id: 'a', role: 'player', added_at: new Date(0) });
    const list = await listCampaignsForUser(db.pool, appUser('a'));
    expect(list.find((c) => c.id === 'secret')?.my_role).toBe('player');
  });

  it('resolves admins to owner on campaigns they have no row for (private included)', async () => {
    const db = setup();
    const list = await listCampaignsForUser(db.pool, appUser('z', true));
    expect(list).toHaveLength(3);
    expect(list.every((c) => c.my_role === 'owner')).toBe(true);
  });
});

describe('listVisibleCampaignIds', () => {
  const setup = () =>
    makeDb({
      users: [ALICE],
      campaigns: [
        { id: 'malgovia', name: 'Malgovia' },
        { id: 'secret', name: 'Secret Realm', visibility: 'private' },
      ],
      members: [{ campaign_id: 'secret', user_id: 'a', role: 'player' }],
    });

  it('non-members see only global campaigns', async () => {
    const db = setup();
    expect(await listVisibleCampaignIds(db.pool, appUser('z'))).toEqual(new Set(['malgovia']));
  });

  it('members (any role, incl. player) see their private campaigns', async () => {
    const db = setup();
    expect(await listVisibleCampaignIds(db.pool, appUser('a'))).toEqual(
      new Set(['malgovia', 'secret'])
    );
  });

  it('admins see everything', async () => {
    const db = setup();
    expect(await listVisibleCampaignIds(db.pool, appUser('z', true))).toEqual(
      new Set(['malgovia', 'secret'])
    );
  });
});

describe('setCampaignVisibility', () => {
  it('updates visibility and reports a missing campaign', async () => {
    const db = makeDb({ campaigns: [{ id: 'malgovia', name: 'Malgovia' }] });
    expect(await setCampaignVisibility(db.pool, 'malgovia', 'private')).toBe(true);
    const ids = await listVisibleCampaignIds(db.pool, appUser('z'));
    expect(ids.has('malgovia')).toBe(false);
    expect(await setCampaignVisibility(db.pool, 'nope', 'global')).toBe(false);
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

  it('refuses to demote the sole owner (to editor or player)', async () => {
    const db = makeDb({
      users: [ALICE],
      members: [{ campaign_id: 'malgovia', user_id: 'a', role: 'owner' }],
    });
    expect(await setMemberRole(db.pool, 'malgovia', 'a', 'editor')).toEqual({
      ok: false,
      reason: 'last_owner',
    });
    expect(await setMemberRole(db.pool, 'malgovia', 'a', 'player')).toEqual({
      ok: false,
      reason: 'last_owner',
    });
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

describe('createCampaign', () => {
  it('creates a private campaign with the creator as owner', async () => {
    const db = makeDb({ users: [ALICE], campaigns: [{ id: 'malgovia', name: 'Malgovia' }] });
    const result = await createCampaign(db.pool, appUser('a'), 'mistwood', 'The Mistwood');
    expect(result).toEqual({
      id: 'mistwood',
      name: 'The Mistwood',
      visibility: 'private',
      my_role: 'owner',
    });
    expect(db.members.find((m) => m.campaign_id === 'mistwood')).toMatchObject({
      user_id: 'a',
      role: 'owner',
    });
    // It lists for the creator, invisible to strangers.
    expect((await listCampaignsForUser(db.pool, appUser('a'))).map((c) => c.id)).toContain(
      'mistwood'
    );
    expect((await listCampaignsForUser(db.pool, appUser('z'))).map((c) => c.id)).not.toContain(
      'mistwood'
    );
  });

  it('rejects a taken id (including the code built-ins)', async () => {
    const db = makeDb({ users: [ALICE], campaigns: [{ id: 'malgovia', name: 'Malgovia' }] });
    expect(await createCampaign(db.pool, appUser('a'), 'malgovia', 'Imposter')).toBe('exists');
    expect(db.members).toHaveLength(0);
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
