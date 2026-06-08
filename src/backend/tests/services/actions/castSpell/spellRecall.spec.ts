// SRD Boon of Spell Recall (epic boon, L19+) — Free Casting: when a spell is
// cast with a level 1–4 slot, roll 1d4; if it matches the slot's level, the
// slot isn't expended. Helper unit + two casts through the real precast path.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../../src/test-fixtures.js';
import type { Seed } from '../../../../src/types.js';
import { context as ctx } from '../../../../src/campaignData/sandbox.js';
import { spellRecallKeepsSlot } from '../../../../src/services/feats.js';
import { takeAction } from '../../../../src/services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

describe('spellRecallKeepsSlot', () => {
  const boon = makeChar({ id: 'pc-1', feats: ['boon_spell_recall'] });
  it('keeps the slot only on a d4 match within levels 1–4, with the boon', () => {
    expect(spellRecallKeepsSlot(boon, 1, 1)).toBe(true);
    expect(spellRecallKeepsSlot(boon, 4, 4)).toBe(true);
    expect(spellRecallKeepsSlot(boon, 3, 2)).toBe(false); // d4 mismatch
    expect(spellRecallKeepsSlot(boon, 5, 5)).toBe(false); // above level 4
    expect(spellRecallKeepsSlot(makeChar({ id: 'pc-2' }), 1, 1)).toBe(false); // no boon
  });
});

const noEnemySeed: Seed = {
  context_id: ctx.id,
  world_name: 'Spell Recall Test',
  ship_name: 'Spell Recall Test',
  intro: '',
  seed_id: 'spell-recall',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function wizardState() {
  const wiz = makeChar({
    id: 'wiz-1',
    character_class: 'Wizard',
    level: 19,
    int: 18,
    spells_known: ['mage_armor'],
    prepared_spells: ['mage_armor'],
    spell_slots_max: { 1: 4 },
    spell_slots_used: {},
    feats: ['boon_spell_recall'],
  });
  return {
    ...makeState({ id: 'wiz-1' }, { current_room: 'entry_hall' }),
    characters: [wiz],
    active_character_id: 'wiz-1',
  };
}

describe('Free Casting — through the cast path', () => {
  it('keeps the level-1 slot when the d4 matches (d4 = 1)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0); // d(4) = 1 → matches slot level 1
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'mage_armor', slotLevel: 1 },
      history: [],
      state: wizardState(),
      seed: noEnemySeed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Spell Recall holds the level-1 slot/);
    expect(result.newState.characters[0].spell_slots_used?.[1] ?? 0).toBe(0);
  });

  it('expends the slot when the d4 does not match (d4 = 2)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.3); // d(4) = 2 ≠ slot level 1
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'mage_armor', slotLevel: 1 },
      history: [],
      state: wizardState(),
      seed: noEnemySeed,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Spell Recall holds/);
    expect(result.newState.characters[0].spell_slots_used?.[1]).toBe(1);
  });
});
