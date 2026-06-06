// Campaign membership API — the authz groundwork for the campaign-editing
// admin section. Mounted at /api/campaigns behind requireAuth (index.ts).
//
// Role gates (auth/middleware.ts): viewing the member list needs editor+;
// mutating membership needs owner (site admins pass everything). The actual
// rules live in services/campaignMembers.ts — handlers here only parse,
// delegate, and map result reasons to HTTP statuses.

import {
  AddCampaignMemberSchema,
  CAMPAIGN_SECTION_SCHEMAS,
  CreateCampaignSchema,
  PutCampaignSectionSchema,
  SetCampaignMemberRoleSchema,
  SetCampaignVisibilitySchema,
  parseBody,
} from './schemas.js';
import { CODE_CONTEXTS, CONTEXTS } from '../services/contextStore.js';
import {
  EDITABLE_SECTIONS,
  deleteCampaignSection,
  getCampaignData,
  getCustomsCodeFallback,
  getDbSection,
  isEditableSection,
  putCampaignSection,
  refreshCampaignOverlay,
} from '../services/campaignContent.js';
import { Request, Response, Router } from 'express';
import {
  addMemberByEmail,
  createCampaign,
  listCampaignsForUser,
  listMembers,
  removeMember,
  setCampaignVisibility,
  setMemberRole,
} from '../services/campaignMembers.js';
import { requireAdmin, requireCampaignRole } from '../auth/middleware.js';
import type { AuthedRequest } from '../auth/middleware.js';
import { getItemCatalog } from '../services/itemCatalog.js';
import { getMonsterCatalog } from '../services/monsterCatalog.js';
import { pool } from '../db/pool.js';

export const campaignsRouter = Router();

// The global item catalog (SRD equipment, full definitions) — feeds the
// creator UI's loot-table badge picker. Catalog contents aren't secret
// (it's the SRD), so plain requireAuth (mounted in index.ts) suffices.
campaignsRouter.get('/catalog/items', async (_req: Request, res: Response) => {
  try {
    res.json(await getItemCatalog(pool));
  } catch (err) {
    console.error('[campaigns] item catalog read failed:', err);
    res.status(500).json({ error: 'Failed to read item catalog' });
  }
});

// The global monster catalog (SRD bestiary) — feeds the enemy-templates
// badge picker. EnemyTemplate carries no id, so entries pair {id, definition}.
campaignsRouter.get('/catalog/monsters', async (_req: Request, res: Response) => {
  try {
    res.json(await getMonsterCatalog(pool));
  } catch (err) {
    console.error('[campaigns] monster catalog read failed:', err);
    res.status(500).json({ error: 'Failed to read monster catalog' });
  }
});

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

// Create a DB-born campaign: any authenticated user; creator becomes the
// owner; private by default. The new campaign resolves over the base
// template immediately, so it's playable before any content is authored.
campaignsRouter.post('/', async (req: Request, res: Response) => {
  const parsed = parseBody(req, res, CreateCampaignSchema);
  if (!parsed) return;
  try {
    const result = await createCampaign(pool, (req as AuthedRequest).user, parsed.id, parsed.name);
    if (result === 'exists') {
      res.status(409).json({ error: 'campaign_exists' });
      return;
    }
    // Make it live (base template + no DB sections yet) without a restart.
    await refreshCampaignOverlay(pool, CONTEXTS, CODE_CONTEXTS, parsed.id);
    res.status(201).json(result);
  } catch (err) {
    console.error('[campaigns] create failed:', err);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

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

// ─── Campaign content (DB-authored sections) ─────────────────────────────────
//
// The content-editing API over campaigns.data. Editor+ gated. A section's
// effective value is DB-first (code supplements): GET returns the value the
// engine currently serves plus where it came from; PUT writes the DB
// version and re-resolves the live context immediately (no restart);
// DELETE reverts the section to code.

// Where does a section's effective value come from for this campaign?
// `present` = the DB has a version (wherever it's stored — JSONB key or a
// section's own table; getDbSection abstracts that). The customs sections
// have no literal code field — their code fallback is the code campaign's
// non-catalog entries (getCustomsCodeFallback), resolved by the callers.
function sectionSource(
  present: boolean,
  campaignId: string,
  section: string
): 'db' | 'code' | 'none' {
  if (present) return 'db';
  const code = CODE_CONTEXTS[campaignId] as unknown as Record<string, unknown> | undefined;
  if (code && code[section] !== undefined) return 'code';
  return 'none';
}

// Effective fallback value for a section the DB doesn't carry: the literal
// code field, or — for the customs sections — the code campaign's own
// non-catalog entries.
async function sectionCodeFallback(campaignId: string, section: string): Promise<unknown | null> {
  if (section === 'customItems' || section === 'customMonsters') {
    return getCustomsCodeFallback(pool, CODE_CONTEXTS[campaignId], section);
  }
  const code = CODE_CONTEXTS[campaignId] as unknown as Record<string, unknown> | undefined;
  return code?.[section] ?? null;
}

// The editable sections + each one's current source — drives the admin
// UI's content menu.
campaignsRouter.get(
  '/:campaignId/data',
  requireCampaignRole('editor'),
  async (req: Request, res: Response) => {
    try {
      const campaignId = param(req, 'campaignId');
      // Existence check — a missing campaign has no data row at all.
      if ((await getCampaignData(pool, campaignId)) === null) {
        res.status(404).json({ error: 'campaign_not_found' });
        return;
      }
      const sections = [];
      for (const section of EDITABLE_SECTIONS) {
        const { present } = await getDbSection(pool, campaignId, section);
        let source = sectionSource(present, campaignId, section);
        if (source === 'none' && (await sectionCodeFallback(campaignId, section)) !== null) {
          source = 'code';
        }
        sections.push({ section, source });
      }
      res.json(sections);
    } catch (err) {
      console.error('[campaigns] data listing failed:', err);
      res.status(500).json({ error: 'Failed to list campaign data' });
    }
  }
);

campaignsRouter.get(
  '/:campaignId/data/:section',
  requireCampaignRole('editor'),
  async (req: Request, res: Response) => {
    const section = param(req, 'section');
    if (!isEditableSection(section)) {
      res.status(404).json({ error: 'unknown_section' });
      return;
    }
    try {
      const campaignId = param(req, 'campaignId');
      if ((await getCampaignData(pool, campaignId)) === null) {
        res.status(404).json({ error: 'campaign_not_found' });
        return;
      }
      const { present, value } = await getDbSection(pool, campaignId, section);
      const fallback = present ? null : await sectionCodeFallback(campaignId, section);
      const source = present ? 'db' : fallback !== null ? 'code' : 'none';
      res.json({ section, source, value: present ? value : fallback });
    } catch (err) {
      console.error('[campaigns] section read failed:', err);
      res.status(500).json({ error: 'Failed to read section' });
    }
  }
);

campaignsRouter.put(
  '/:campaignId/data/:section',
  requireCampaignRole('editor'),
  async (req: Request, res: Response) => {
    const section = param(req, 'section');
    if (!isEditableSection(section)) {
      res.status(404).json({ error: 'unknown_section' });
      return;
    }
    const parsed = parseBody(req, res, PutCampaignSectionSchema);
    if (!parsed) return;
    // Per-section structural validation — a malformed section would crash
    // the engine mid-game, so reject anything off-shape with the issues.
    const valueCheck = CAMPAIGN_SECTION_SCHEMAS[section].safeParse(parsed.value);
    if (!valueCheck.success) {
      res.status(400).json({
        error: 'invalid_section_value',
        issues: valueCheck.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }
    try {
      const campaignId = param(req, 'campaignId');
      const updated = await putCampaignSection(pool, campaignId, section, valueCheck.data);
      if (!updated) {
        res.status(404).json({ error: 'campaign_not_found' });
        return;
      }
      // Re-resolve the live context so the edit serves immediately.
      await refreshCampaignOverlay(pool, CONTEXTS, CODE_CONTEXTS, campaignId);
      res.json({ ok: true, section, source: 'db' });
    } catch (err) {
      console.error('[campaigns] section write failed:', err);
      res.status(500).json({ error: 'Failed to write section' });
    }
  }
);

// Revert a section to its code-defined version.
campaignsRouter.delete(
  '/:campaignId/data/:section',
  requireCampaignRole('editor'),
  async (req: Request, res: Response) => {
    const section = param(req, 'section');
    if (!isEditableSection(section)) {
      res.status(404).json({ error: 'unknown_section' });
      return;
    }
    try {
      const campaignId = param(req, 'campaignId');
      const updated = await deleteCampaignSection(pool, campaignId, section);
      if (!updated) {
        res.status(404).json({ error: 'campaign_not_found' });
        return;
      }
      await refreshCampaignOverlay(pool, CONTEXTS, CODE_CONTEXTS, campaignId);
      const fallback = await sectionCodeFallback(campaignId, section);
      res.json({ ok: true, section, source: fallback !== null ? 'code' : 'none' });
    } catch (err) {
      console.error('[campaigns] section revert failed:', err);
      res.status(500).json({ error: 'Failed to revert section' });
    }
  }
);
