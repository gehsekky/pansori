// Campaign membership operations — the logic behind routes/campaigns.ts.
// Kept route-free (pool injected, plain results) so the rules — owner ⊃
// editor, the last-owner guard, add-by-email upsert — are unit-testable
// without HTTP plumbing. Routes map the discriminated results to statuses.

import type { AppUser } from '../auth/passport.js';
import type { CampaignRole } from '../auth/middleware.js';
import type { Pool } from 'pg';

export type CampaignVisibility = 'global' | 'private';

export interface CampaignListing {
  id: string;
  name: string;
  // 'global' campaigns are visible to every user; 'private' ones only to
  // members. Only site admins flip this (setCampaignVisibility).
  visibility: CampaignVisibility;
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

// Campaigns the caller can see + their role on each: global campaigns for
// everyone, private ones only for members (site admins see all). This is
// both the admin-section list and the visibility source for play surfaces.
export async function listCampaignsForUser(pool: Pool, user: AppUser): Promise<CampaignListing[]> {
  const { rows } = await pool.query<{
    id: string;
    name: string;
    visibility: CampaignVisibility;
    my_role: CampaignRole | null;
  }>(
    `SELECT c.id, c.name, c.visibility, m.role AS my_role
       FROM campaigns c
       LEFT JOIN campaign_members m
         ON m.campaign_id = c.id AND m.user_id = $1
      WHERE c.visibility = 'global' OR m.role IS NOT NULL OR $2
      ORDER BY c.name`,
    [user.id, user.is_admin]
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    visibility: r.visibility,
    my_role: r.my_role ?? (user.is_admin ? 'owner' : null),
  }));
}

// The campaign ids this user may see/play: global ones + any membership.
// Gates the new-game context list and session creation.
export async function listVisibleCampaignIds(pool: Pool, user: AppUser): Promise<Set<string>> {
  if (user.is_admin) {
    const { rows } = await pool.query<{ id: string }>('SELECT id FROM campaigns');
    return new Set(rows.map((r) => r.id));
  }
  const { rows } = await pool.query<{ id: string }>(
    `SELECT c.id
       FROM campaigns c
       LEFT JOIN campaign_members m
         ON m.campaign_id = c.id AND m.user_id = $1
      WHERE c.visibility = 'global' OR m.role IS NOT NULL`,
    [user.id]
  );
  return new Set(rows.map((r) => r.id));
}

// Create a DB-born campaign: private by default, creator becomes its
// owner. 'exists' when the id is taken (incl. the code built-ins, which
// the registry sync owns).
export async function createCampaign(
  pool: Pool,
  user: AppUser,
  id: string,
  name: string
): Promise<'exists' | CampaignListing> {
  const { rowCount } = await pool.query(
    `INSERT INTO campaigns (id, name, visibility)
     VALUES ($1, $2, 'private')
     ON CONFLICT (id) DO NOTHING`,
    [id, name]
  );
  if (!rowCount) return 'exists';
  await pool.query(
    `INSERT INTO campaign_members (campaign_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (campaign_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [id, user.id, 'owner']
  );
  return { id, name, visibility: 'private', my_role: 'owner' };
}

// Admin-only: promote a campaign to global / demote back to private.
export async function setCampaignVisibility(
  pool: Pool,
  campaignId: string,
  visibility: CampaignVisibility
): Promise<boolean> {
  const { rowCount } = await pool.query(
    'UPDATE campaigns SET visibility = $2, updated_at = NOW() WHERE id = $1',
    [campaignId, visibility]
  );
  return (rowCount ?? 0) > 0;
}

// Rename a campaign. Sets name_overridden so the boot-time registry sync
// (which propagates code world_name renames for the built-ins) leaves the
// new name alone.
export async function renameCampaign(
  pool: Pool,
  campaignId: string,
  name: string
): Promise<boolean> {
  const { rowCount } = await pool.query(
    'UPDATE campaigns SET name = $2, name_overridden = TRUE, updated_at = NOW() WHERE id = $1',
    [campaignId, name]
  );
  return (rowCount ?? 0) > 0;
}

export async function listMembers(pool: Pool, campaignId: string): Promise<CampaignMemberRow[]> {
  const { rows } = await pool.query<CampaignMemberRow>(
    `SELECT m.user_id, m.role, m.added_at, u.display_name, u.email, u.avatar_url
       FROM campaign_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.campaign_id = $1
      ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END,
               u.display_name`, // owners, then editors, then players
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

  if (role !== 'owner' && (await isLastOwner(pool, campaignId, userId))) {
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
  if (role !== 'owner' && (await isLastOwner(pool, campaignId, userId))) {
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
