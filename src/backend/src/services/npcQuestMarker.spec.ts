// The "quest available" [!] marker on a Talk choice must reflect only quests the
// NPC actually OFFERS in dialogue. Old Elise gives two grove quests, but only
// quest_silent_grove is offered via dialogue — quest_break_trickster
// auto-activates from the world (killing the trickster). So once silent_grove is
// accepted, the [!] must clear, rather than perpetually flagging the follow-up.

import { describe, expect, it } from 'vitest';
import { npcDialogueOffersQuest } from './gameEngine.js';
import { npcs } from '../campaignData/malgovia/entities.js';

describe('npcDialogueOffersQuest — drives the [!] quest marker', () => {
  const elise = npcs['npc_elise_elder'];

  it('Elise exists and is the grove-quest giver', () => {
    expect(elise?.id).toBe('npc_elise_elder');
  });

  it('flags the quest Elise offers in dialogue (quest_silent_grove)', () => {
    expect(npcDialogueOffersQuest(elise, 'quest_silent_grove')).toBe(true);
  });

  it('does NOT flag her follow-up that auto-activates from the world (quest_break_trickster)', () => {
    expect(npcDialogueOffersQuest(elise, 'quest_break_trickster')).toBe(false);
  });

  it('does not flag an unrelated quest', () => {
    expect(npcDialogueOffersQuest(elise, 'quest_shipment')).toBe(false);
  });
});
