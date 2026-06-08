// The base campaign template must stay PLAYABLE — it's what every DB-born
// campaign resolves over. These are the structural guards: the narrative
// pools satisfy the content schema (so a creator GET→edit→PUT round trip
// of the base narratives validates), the stub world is internally
// consistent, and seed generation actually works on it.

import { describe, expect, it } from 'vitest';
import { CAMPAIGN_SECTION_SCHEMAS } from '../../../routes/schemas.js';
import { baseCampaignContext } from '../../../campaignData/srd/baseCampaign.js';
import { generateSeed } from '../../../services/procgen.js';

describe('base campaign template', () => {
  it('narrative pools satisfy the narratives section schema', () => {
    const result = CAMPAIGN_SECTION_SCHEMAS.narratives.safeParse(baseCampaignContext.narratives);
    expect(result.success, JSON.stringify(result.error?.issues?.slice(0, 3))).toBe(true);
  });

  it('the stub world is internally consistent', () => {
    const campaign = baseCampaignContext.campaign!;
    const roomIds = new Set(campaign.rooms.map((r) => r.id));
    for (const region of campaign.regions ?? []) {
      for (const site of region.sites) {
        if (site.kind === 'local') {
          expect(roomIds.has(site.entryRoomId!), `site ${site.id} → ${site.entryRoomId}`).toBe(
            true
          );
        }
      }
      // The marker starts inside the region grid.
      expect(region.startPos.x).toBeLessThan(region.gridWidth);
      expect(region.startPos.y).toBeLessThan(region.gridHeight);
    }
    // Placed enemies reference real rooms.
    for (const roomId of Object.keys(campaign.enemies ?? {})) {
      expect(roomIds.has(roomId), `enemies in unknown room ${roomId}`).toBe(true);
    }
  });

  it('generateSeed produces a playable seed from the template', () => {
    const seed = generateSeed({ ...baseCampaignContext, id: 'db-born-test' }, 1);
    expect(seed.context_id).toBe('db-born-test');
    expect(seed.world_name).toBe('New Campaign');
    expect(seed.rooms.length).toBeGreaterThan(0);
    expect(seed.regions?.length).toBe(1);
    // The cave goblin survived HP scaling.
    expect(seed.enemies.old_cave?.[0]?.hp).toBeGreaterThan(0);
  });

  it('classes and spell system come fully stocked', () => {
    expect(Object.keys(baseCampaignContext.classPrimaryStats).length).toBe(12);
    expect(Object.keys(baseCampaignContext.spellTable ?? {}).length).toBeGreaterThan(100);
    expect((baseCampaignContext.backgrounds ?? []).length).toBeGreaterThan(0);
    // Empty by design — the ambient catalogs compose these in.
    expect(baseCampaignContext.enemyTemplates).toEqual([]);
    expect(baseCampaignContext.lootTable).toEqual([]);
  });
});
