// Dev seeder for the starter campaign (The Sky Is Falling). Run on the HOST
// against the dev DB (mapped at localhost:5432) with:
//
//   npm run seed:sky
//
// It upserts the campaign row then writes every section through the real
// putCampaignSection pipeline (the same path the creator UI's PUT route uses),
// so the result is byte-identical to authoring it by hand. Idempotent: a re-run
// resets data + replaces every section.
//
// The running dev backend caches campaigns in memory (loaded at boot by
// applyCampaignOverlays), so after seeding, reload it to pick up the changes:
//
//   docker compose restart backend      (or: npm run restart)
//
// Seeded `global` so any dev user sees it in the world picker without needing a
// membership row — a starter campaign is world-readable by design.

import 'dotenv/config';
import {
  SKY_CAMPAIGN_ID,
  SKY_CAMPAIGN_NAME,
  SKY_CAMPAIGN_SECTIONS,
} from '../campaignData/skyIsFalling/index.js';
import { pool } from '../db/pool.js';
import { putCampaignSection } from '../services/campaignContent.js';

async function main(): Promise<void> {
  console.log(`[seed:sky] seeding ${SKY_CAMPAIGN_ID} (${SKY_CAMPAIGN_NAME})…`);

  // Upsert the campaign row first (sections write into it); reset its JSONB so a
  // re-seed is a clean replace-all. Relational sections (regions/rooms/quests/
  // factions/acts) are replace-all in their own stores.
  await pool.query(
    `INSERT INTO campaigns (id, name, visibility, data, name_overridden)
       VALUES ($1, $2, 'global', '{}'::jsonb, FALSE)
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name, visibility = 'global',
           data = '{}'::jsonb, name_overridden = FALSE, updated_at = NOW()`,
    [SKY_CAMPAIGN_ID, SKY_CAMPAIGN_NAME]
  );

  for (const { section, value } of SKY_CAMPAIGN_SECTIONS) {
    const ok = await putCampaignSection(pool, SKY_CAMPAIGN_ID, section, value);
    console.log(`[seed:sky]   ${ok ? '✓' : '✗'} ${section}`);
    if (!ok) throw new Error(`putCampaignSection failed for "${section}"`);
  }

  console.log(
    `[seed:sky] done — ${SKY_CAMPAIGN_SECTIONS.length} sections written. ` +
      `Restart the backend to load it (docker compose restart backend).`
  );
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('[seed:sky] FAILED:', err);
    await pool.end();
    process.exit(1);
  });
