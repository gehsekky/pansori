// The "quest available" [!] marker on a Talk choice must reflect only quests the
// NPC actually OFFERS in dialogue. Old Elise gives the grove quest
// (quest_silent_grove) via dialogue; quests she doesn't offer (or that only
// advance from the world) must NOT flag her [!], so it clears once accepted.

import { describe, expect, it } from 'vitest';
import { npcDialogueOffersQuest } from '../../src/services/gameEngine.js';
import { npcs } from '../../src/campaignData/malgovia/entities.js';

describe('npcDialogueOffersQuest — drives the [!] quest marker', () => {
  const elise = npcs['npc_elise_elder'];

  it('Elise exists and is the grove-quest giver', () => {
    expect(elise?.id).toBe('npc_elise_elder');
  });

  it('flags the quest Elise offers in dialogue (quest_silent_grove)', () => {
    expect(npcDialogueOffersQuest(elise, 'quest_silent_grove')).toBe(true);
  });

  it('does not flag an unrelated quest she never offers in dialogue', () => {
    expect(npcDialogueOffersQuest(elise, 'quest_shipment')).toBe(false);
  });
});
