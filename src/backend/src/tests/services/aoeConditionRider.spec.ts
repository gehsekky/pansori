// AoE damage spells that ALSO apply a rider condition to creatures that fail
// their save: Sunburst (Blinded, CON save-ends) and Weird (Frightened,
// concentration, WIS save-ends + 5d10 recurring). The condition is applied in
// runAoeSpell to every failed+surviving target in the blast.

import type { GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../../campaignData/sandbox.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const E1 = 'entry_hall#0';
const E2 = 'entry_hall#1';

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'AoE Rider Test',
  ship_name: 'AoE Rider Test',
  intro: '',
  seed_id: 'aoe-rider',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    entry_hall: [
      { id: E1, name: 'Ogre', hp: 400, ac: 10, damage: '1d6', toHit: 3, xp: 50, con: 10, wis: 10 },
      { id: E2, name: 'Brute', hp: 400, ac: 10, damage: '1d6', toHit: 3, xp: 50, con: 10, wis: 10 },
    ],
  },
  loot: {},
  npcs: {},
};

function casterState(spellId: string, slot: number): GameState {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 17,
    int: 20,
    hp: 80,
    max_hp: 80,
    spells_known: [spellId],
    prepared_spells: [spellId],
    spell_slots_max: { [slot]: 1 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [wiz],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: E1, roll: 5, is_enemy: true },
      { id: E2, roll: 4, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 2, y: 2 },
        hp: 80,
        maxHp: 80,
        conditions: [],
        condition_durations: {},
      },
      {
        id: E1,
        isEnemy: true,
        pos: { x: 3, y: 3 },
        hp: 400,
        maxHp: 400,
        conditions: [],
        condition_durations: {},
      },
      {
        id: E2,
        isEnemy: true,
        pos: { x: 4, y: 3 },
        hp: 400,
        maxHp: 400,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

const entOf = (r: Awaited<ReturnType<typeof takeAction>>, id: string) =>
  r.newState.entities?.find((e) => e.id === id);

describe('Sunburst — Blinded rider on failed CON save', () => {
  it('blinds every surviving enemy that fails (CON save-ends stamped)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // saves fail, min damage → survive
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'sunburst', slotLevel: 8, targetEnemyId: E1 },
      history: [],
      state: casterState('sunburst', 8),
      seed,
      context: ctx,
    });
    for (const id of [E1, E2]) {
      const e = entOf(r, id)!;
      expect(e.hp).toBeGreaterThan(0); // survived
      expect(e.conditions).toContain('blinded');
      expect(e.save_ends?.blinded?.ability).toBe('con'); // re-save each turn
    }
  });

  it('does not blind a creature that saves', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // saves succeed
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'sunburst', slotLevel: 8, targetEnemyId: E1 },
      history: [],
      state: casterState('sunburst', 8),
      seed,
      context: ctx,
    });
    expect(entOf(r, E1)!.conditions).not.toContain('blinded');
  });
});

describe('Weird — Frightened rider + concentration on failed WIS save', () => {
  it('frightens failing enemies, records the source, links concentration, and wires recurring damage', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'weird', slotLevel: 9, targetEnemyId: E1 },
      history: [],
      state: casterState('weird', 9),
      seed,
      context: ctx,
    });
    const e = entOf(r, E1)!;
    expect(e.conditions).toContain('frightened');
    expect(e.frightened_by).toBe('pc-1');
    expect(e.save_ends?.frightened?.recurDice).toBe('5d10');
    expect(r.newState.characters[0].concentrating_on?.spellId).toBe('weird');
    expect(r.newState.characters[0].concentrating_on?.condition).toBe('frightened');
  });
});
