// Campaign membership operations — the logic behind routes/campaigns.ts.
// Kept route-free (pool injected, plain results) so the rules — owner ⊃
// editor, the last-owner guard, add-by-email upsert — are unit-testable
// without HTTP plumbing. Routes map the discriminated results to statuses.

import type { AppUser } from '../auth/passport.js';
import type { CampaignRole } from '../auth/middleware.js';
import type { Pool } from 'pg';

export interface CampaignListing {
  id: string;
  name: string;
  // The caller's role on this campaign. Site admins resolve to 'owner'
  // everywhere (they bypass membership checks in the middleware too).
  my_role: CampaignRole | null;
}

export interface CampaignMemberRow {
  user_id: string;
  role: CampaignRole;
  added_at: Date;
  display_name: string;
  email: string;
  avatar_url: string | null;
}

export type MemberMutationResult =
  | { ok: true; member: CampaignMemberRow }
  | { ok: false; reason: 'user_not_found' | 'not_a_member' | 'last_owner' };

export type MemberRemovalResult =
  | { ok: true }
  | { ok: false; reason: 'not_a_member' | 'last_owner' };

// Every registered campaign + the caller's role on it. The registry list is
// not secret (campaign ids already surface in the world picker); roles are
// what gate the admin section's edit surfaces.
export async function listCampaignsForUser(pool: Pool, user: AppUser): Promise<CampaignListing[]> {
  const { rows } = await pool.query<{ id: string; name: string; my_role: CampaignRole | null }>(
    `SELECT c.id, c.name, m.role AS my_role
       FROM campaigns c
       LEFT JOIN campaign_members m
         ON m.campaign_id = c.id AND m.user_id = $1
      ORDER BY c.name`,
    [user.id]
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    my_role: r.my_role ?? (user.is_admin ? 'owner' : null),
  }));
}

export async function listMembers(pool: Pool, campaignId: string): Promise<CampaignMemberRow[]> {
  const { rows } = await pool.query<CampaignMemberRow>(
    `SELECT m.user_id, m.role, m.added_at, u.display_name, u.email, u.avatar_url
       FROM campaign_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.campaign_id = $1
      ORDER BY m.role DESC, u.display_name`, // role DESC: 'owner' > 'editor' lexically, owners first
    [campaignId]
  );
  return rows;
}

// True iff this user is the campaign's one and only owner. Guards demotion
// and removal — a campaign must never silently lose its last owner (site
// admins can always step in regardless, so a zero-owner campaign that was
// never claimed is fine; *losing* the last owner by accident is not).
// SELECT-then-mutate is racy without a transaction; acceptable for a
// low-traffic admin surface.
async function isLastOwner(pool: Pool, campaignId: string, userId: string): Promise<boolean> {
  const { rows } = await pool.query<{ user_id: string }>(
    'SELECT user_id FROM campaign_members WHERE campaign_id = $1 AND role = $2',
    [campaignId, 'owner']
  );
  return rows.length === 1 && rows[0].user_id === userId;
}

async function fetchMember(
  pool: Pool,
  campaignId: string,
  userId: string
): Promise<CampaignMemberRow | null> {
  const { rows } = await pool.query<CampaignMemberRow>(
    `SELECT m.user_id, m.role, m.added_at, u.display_name, u.email, u.avatar_url
       FROM campaign_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.campaign_id = $1 AND m.user_id = $2`,
    [campaignId, userId]
  );
  return rows[0] ?? null;
}

// Add (or re-role) a member by email — the admin UI's "add editor" box.
// Upserts, so re-adding an existing member changes their role; that path
// runs through the same last-owner guard as an explicit role change.
export async function addMemberByEmail(
  pool: Pool,
  campaignId: string,
  email: string,
  role: CampaignRole
): Promise<MemberMutationResult> {
  const { rows: userRows } = await pool.query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1',
    [email]
  );
  const userId = userRows[0]?.id;
  if (!userId) return { ok: false, reason: 'user_not_found' };

  if (role === 'editor' && (await isLastOwner(pool, campaignId, userId))) {
    return { ok: false, reason: 'last_owner' };
  }

  await pool.query(
    `INSERT INTO campaign_members (campaign_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (campaign_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [campaignId, userId, role]
  );
  const member = await fetchMember(pool, campaignId, userId);
  // The row was just upserted; a vanished row here means a concurrent delete.
  if (!member) return { ok: false, reason: 'not_a_member' };
  return { ok: true, member };
}

export async function setMemberRole(
  pool: Pool,
  campaignId: string,
  userId: string,
  role: CampaignRole
): Promise<MemberMutationResult> {
  const existing = await fetchMember(pool, campaignId, userId);
  if (!existing) return { ok: false, reason: 'not_a_member' };
  if (role === 'editor' && (await isLastOwner(pool, campaignId, userId))) {
    return { ok: false, reason: 'last_owner' };
  }
  await pool.query(
    'UPDATE campaign_members SET role = $3 WHERE campaign_id = $1 AND user_id = $2',
    [campaignId, userId, role]
  );
  return { ok: true, member: { ...existing, role } };
}

export async function removeMember(
  pool: Pool,
  campaignId: string,
  userId: string
): Promise<MemberRemovalResult> {
  const existing = await fetchMember(pool, campaignId, userId);
  if (!existing) return { ok: false, reason: 'not_a_member' };
  if (existing.role === 'owner' && (await isLastOwner(pool, campaignId, userId))) {
    return { ok: false, reason: 'last_owner' };
  }
  await pool.query('DELETE FROM campaign_members WHERE campaign_id = $1 AND user_id = $2', [
    campaignId,
    userId,
  ]);
  return { ok: true };
}
