// Test-only campaign seeding — mounted ONLY when the same gate that exposes
// the test-login bypass is set (NODE_ENV !== 'production' &&
// E2E_TEST_LOGIN_ENABLED === 'true'; the mount is in index.ts). It plants the
// throwaway e2e campaign (services/e2eCampaign.ts) into the database so the
// Playwright suite can drive a real DB campaign end-to-end without the project
// shipping a built-in one. In the e2e the database is ephemeral and discarded
// after the run, so there's no teardown to do here; the write is idempotent
// (replace-all) so reruns against a persistent dev DB stay clean.

import { CODE_CONTEXTS, CONTEXTS } from '../services/contextStore.js';
import {
  E2E_CAMPAIGN_ID,
  E2E_CAMPAIGN_NAME,
  E2E_CAMPAIGN_SECTIONS,
} from '../services/e2eCampaign.js';
import { Request, Response, Router } from 'express';
import { putCampaignSection, refreshCampaignOverlay } from '../services/campaignContent.js';
import { pool } from '../db/pool.js';

export const testSeedRouter = Router();

// Seed (or re-seed) the throwaway e2e campaign and make it live. Seeded
// `global` so every test user sees it as the sole picker campaign (the world
// picker auto-selects when there's a single visible campaign). Returns the id.
testSeedRouter.post('/seed-campaign', async (_req: Request, res: Response) => {
  try {
    // Upsert the campaign row first (sections below write into it), resetting
    // its JSONB data so a re-seed is a clean replace-all. Relational sections
    // (regions/rooms) are replace-all in their own stores.
    await pool.query(
      `INSERT INTO campaigns (id, name, visibility, data, name_overridden)
         VALUES ($1, $2, 'global', '{}'::jsonb, FALSE)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name, visibility = 'global',
             data = '{}'::jsonb, name_overridden = FALSE, updated_at = NOW()`,
      [E2E_CAMPAIGN_ID, E2E_CAMPAIGN_NAME]
    );

    for (const { section, value } of E2E_CAMPAIGN_SECTIONS) {
      await putCampaignSection(pool, E2E_CAMPAIGN_ID, section, value);
    }

    // Resolve it over the base template so it plays without a restart.
    await refreshCampaignOverlay(pool, CONTEXTS, CODE_CONTEXTS, E2E_CAMPAIGN_ID);

    res.status(201).json({ id: E2E_CAMPAIGN_ID, name: E2E_CAMPAIGN_NAME });
  } catch (err) {
    console.error('[testSeed] seed-campaign failed:', err);
    res.status(500).json({ error: 'seed failed', detail: String(err) });
  }
});
