import { NextFunction, Request, Response } from 'express';
import type { AppUser } from './passport.js';
import { pool } from '../db/pool.js';

// After requireAuth, downstream handlers can use AuthedRequest to access
// req.user as non-undefined without a `!` assertion.
export type AuthedRequest = Request & { user: AppUser };

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// ─── Campaign roles ──────────────────────────────────────────────────────────
//
// Three-tier hierarchy on campaign_members: owner ⊃ editor ⊃ player.
// Owners manage members (and everything below); editors edit campaign
// content; players can see and play a private campaign (membership is what
// makes it show up in their new-game picker) but can't edit anything.
// Site admins (users.is_admin) bypass membership checks entirely.

export type CampaignRole = 'owner' | 'editor' | 'player';

const ROLE_RANK: Record<CampaignRole, number> = { player: 1, editor: 2, owner: 3 };

// Gate on the site-admin flag. Mount after requireAuth.
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if ((req as AuthedRequest).user?.is_admin) return next();
  res.status(403).json({ error: 'Admin access required' });
}

// After requireCampaignRole, handlers can read the resolved role (admins
// resolve to 'owner' — they can do anything an owner can).
export type CampaignAuthedRequest = AuthedRequest & { campaign_role: CampaignRole };

// Gate on campaign membership at `minRole` or above, resolved from the
// route's :campaignId param. Mount after requireAuth. Non-members and
// under-ranked members get 403 — campaign ids are public (the world picker
// lists them), so there's no existence leak to hide behind a 404.
export function requireCampaignRole(minRole: CampaignRole) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthedRequest).user;
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    if (user.is_admin) {
      (req as CampaignAuthedRequest).campaign_role = 'owner';
      return next();
    }
    const campaignId = req.params.campaignId;
    if (typeof campaignId !== 'string' || !campaignId) {
      res.status(400).json({ error: 'Missing campaign id' });
      return;
    }
    try {
      const { rows } = await pool.query<{ role: CampaignRole }>(
        'SELECT role FROM campaign_members WHERE campaign_id = $1 AND user_id = $2',
        [campaignId, user.id]
      );
      const role = rows[0]?.role;
      if (role && ROLE_RANK[role] >= ROLE_RANK[minRole]) {
        (req as CampaignAuthedRequest).campaign_role = role;
        return next();
      }
      res.status(403).json({ error: 'Insufficient campaign role' });
    } catch (err) {
      console.error('[auth] campaign role check failed:', err);
      res.status(500).json({ error: 'Role check failed' });
    }
  };
}
