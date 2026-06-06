// Campaign membership API — the authz groundwork for the campaign-editing
// admin section. Mounted at /api/campaigns behind requireAuth (index.ts).
//
// Role gates (auth/middleware.ts): viewing the member list needs editor+;
// mutating membership needs owner (site admins pass everything). The actual
// rules live in services/campaignMembers.ts — handlers here only parse,
// delegate, and map result reasons to HTTP statuses.

import {
  AddCampaignMemberSchema,
  SetCampaignMemberRoleSchema,
  SetCampaignVisibilitySchema,
  parseBody,
} from './schemas.js';
import { Request, Response, Router } from 'express';
import {
  addMemberByEmail,
  listCampaignsForUser,
  listMembers,
  removeMember,
  setCampaignVisibility,
  setMemberRole,
} from '../services/campaignMembers.js';
import { requireAdmin, requireCampaignRole } from '../auth/middleware.js';
import type { AuthedRequest } from '../auth/middleware.js';
import { pool } from '../db/pool.js';

export const campaignsRouter = Router();

// Express types params as string | string[]; these routes never declare
// repeatable params, so collapse to the string (requireCampaignRole already
// 400s a malformed :campaignId before any handler runs).
function param(req: Request, key: string): string {
  const v = req.params[key];
  return typeof v === 'string' ? v : '';
}

const MUTATION_STATUS: Record<'user_not_found' | 'not_a_member' | 'last_owner', number> = {
  user_not_found: 404,
  not_a_member: 404,
  // Demoting/removing the sole owner is a conflict with the invariant, not a
  // permissions failure — transfer ownership first.
  last_owner: 409,
};

// All registered campaigns + the caller's role on each (admins read as
// owner everywhere). Drives the admin section's campaign list.
campaignsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const campaigns = await listCampaignsForUser(pool, (req as AuthedRequest).user);
    res.json(campaigns);
  } catch (err) {
    console.error('[campaigns] list failed:', err);
    res.status(500).json({ error: 'Failed to list campaigns' });
  }
});

campaignsRouter.get(
  '/:campaignId/members',
  requireCampaignRole('editor'),
  async (req: Request, res: Response) => {
    try {
      res.json(await listMembers(pool, param(req, 'campaignId')));
    } catch (err) {
      console.error('[campaigns] member list failed:', err);
      res.status(500).json({ error: 'Failed to list members' });
    }
  }
);

// Add a member by email (upsert — re-adding an existing member re-roles them).
campaignsRouter.post(
  '/:campaignId/members',
  requireCampaignRole('owner'),
  async (req: Request, res: Response) => {
    const parsed = parseBody(req, res, AddCampaignMemberSchema);
    if (!parsed) return;
    try {
      const result = await addMemberByEmail(
        pool,
        param(req, 'campaignId'),
        parsed.email,
        parsed.role
      );
      if (!result.ok) {
        res.status(MUTATION_STATUS[result.reason]).json({ error: result.reason });
        return;
      }
      res.status(201).json(result.member);
    } catch (err) {
      console.error('[campaigns] add member failed:', err);
      res.status(500).json({ error: 'Failed to add member' });
    }
  }
);

campaignsRouter.put(
  '/:campaignId/members/:userId',
  requireCampaignRole('owner'),
  async (req: Request, res: Response) => {
    const parsed = parseBody(req, res, SetCampaignMemberRoleSchema);
    if (!parsed) return;
    try {
      const result = await setMemberRole(
        pool,
        param(req, 'campaignId'),
        param(req, 'userId'),
        parsed.role
      );
      if (!result.ok) {
        res.status(MUTATION_STATUS[result.reason]).json({ error: result.reason });
        return;
      }
      res.json(result.member);
    } catch (err) {
      console.error('[campaigns] role change failed:', err);
      res.status(500).json({ error: 'Failed to change role' });
    }
  }
);

// Promote a campaign to global / demote to private. Site-admin only — this
// is the one campaign capability owners do NOT get.
campaignsRouter.put(
  '/:campaignId/visibility',
  requireAdmin,
  async (req: Request, res: Response) => {
    const parsed = parseBody(req, res, SetCampaignVisibilitySchema);
    if (!parsed) return;
    try {
      const updated = await setCampaignVisibility(
        pool,
        param(req, 'campaignId'),
        parsed.visibility
      );
      if (!updated) {
        res.status(404).json({ error: 'campaign_not_found' });
        return;
      }
      res.json({ ok: true, visibility: parsed.visibility });
    } catch (err) {
      console.error('[campaigns] visibility change failed:', err);
      res.status(500).json({ error: 'Failed to change visibility' });
    }
  }
);

campaignsRouter.delete(
  '/:campaignId/members/:userId',
  requireCampaignRole('owner'),
  async (req: Request, res: Response) => {
    try {
      const result = await removeMember(pool, param(req, 'campaignId'), param(req, 'userId'));
      if (!result.ok) {
        res.status(MUTATION_STATUS[result.reason]).json({ error: result.reason });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[campaigns] remove member failed:', err);
      res.status(500).json({ error: 'Failed to remove member' });
    }
  }
);
