// Heal narrative reports actual amount restored (post-cap), not
// the raw rolled value. Spotted in a real game log: Cleric cast
// Healing Word on Fighter at 0/8 HP, narrative said "restores 13
// HP to Fighter (now 8/8)" — Fighter's max HP is 8, so only 8 HP
// was actually applied. The displayed 13 was the raw roll
// (2d4 + WIS + Disciple of Life), not the capped amount.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../src/test-fixtures.js';
import type { Seed } from '../../src/types.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';
import { takeAction } from '../../src/services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const noEnemySeed: Seed = {
  context_id: ctx.id,
  world_name: 'Heal Display Test',
  ship_name: 'Heal Display Test',
  intro: '',
  seed_id: 'heal-display',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

describe('Heal narrative — actual amount applied (capped at max HP)', () => {
  it('Healing Word on a 0/8 HP Fighter reports the capped HP, not the rolled value', async () => {
    // Force max d4 rolls so the raw heal exceeds max_hp.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      subclass: 'life',
      level: 1,
      wis: 14,
      spells_known: ['healing_word'],
      prepared_spells: ['healing_word'],
      spell_slots_max: { 1: 2 },
      spell_slots_used: {},
    });
    // Fighter at 0/8 — match the real-game scenario.
    const fighter = makeChar({
      id: 'fighter-1',
      character_class: 'Fighter',
      hp: 0,
      max_hp: 8,
    });
    const state = {
      ...makeState({ id: 'cleric-1' }, { current_room: 'entry_hall' }),
      characters: [cleric, fighter],
      active_character_id: 'cleric-1',
    };
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'healing_word', slotLevel: 1 },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    // Raw heal: 2d4 (8) + WIS mod (2) + Disciple of Life (3 = 2 + spell.level 1) = 13.
    // Fighter's max is 8, so only 8 HP gets applied (0 → 8).
    // Narrative should say "restores 8 HP" not "restores 13 HP".
    expect(result.narrative).toMatch(/restores 8 HP/);
    expect(result.narrative).not.toMatch(/restores 13 HP/);
    // Sanity: Fighter actually got healed to full.
    const after = result.newState.characters.find((c) => c.id === 'fighter-1');
    expect(after?.hp).toBe(8);
  });

  it('Healing Word that fits under the cap reports the full rolled value', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      level: 1,
      wis: 14,
      spells_known: ['healing_word'],
      prepared_spells: ['healing_word'],
      spell_slots_max: { 1: 2 },
      spell_slots_used: {},
    });
    // Target has plenty of room (1/100).
    const wounded = makeChar({
      id: 'wounded-1',
      hp: 1,
      max_hp: 100,
    });
    const state = {
      ...makeState({ id: 'cleric-1' }, { current_room: 'entry_hall' }),
      characters: [cleric, wounded],
      active_character_id: 'cleric-1',
    };
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'healing_word', slotLevel: 1 },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    // Without Life subclass: 2d4 (max 8) + WIS mod (2) = 10. No cap hit.
    // Narrative should report 10 HP.
    expect(result.narrative).toMatch(/restores 10 HP/);
  });
});
