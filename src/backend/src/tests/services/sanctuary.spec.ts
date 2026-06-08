// SRD Sanctuary — a ward: a creature attacking the warded PC must make a Wisdom
// save vs the caster's spell DC or lose the attack. Covers the cast (stamps the
// DC), the enemy-attack block on a failed save, the pass-through on a success,
// and combat-end teardown.

import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { endCombatState, takeAction } from '../../services/gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { SRD_SPELLS } from '../../campaignData/srd/spells.js';
import { context as ctx } from '../../campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Sanctuary Test',
  ship_name: 'Sanctuary Test',
  intro: '',
  seed_id: 'sanc',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: ENEMY,
        name: 'Brute',
        hp: 50,
        ac: 12,
        damage: '1d6+2',
        toHit: 6,
        xp: 50,
        wis: 10,
      } as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function stateWith(charOverrides: Partial<Character>): GameState {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Cleric',
    level: 5,
    wis: 18,
    ac: 13,
    hp: 30,
    max_hp: 30,
    spells_known: ['sanctuary'],
    prepared_spells: ['sanctuary'],
    spell_slots_max: { 1: 4 },
    spell_slots_used: {},
    ...charOverrides,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [pc],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: ENEMY, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    round: 1,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 50,
        maxHp: 50,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

describe('Sanctuary — catalog & cast', () => {
  it('is a self-or-ally ward', () => {
    expect(SRD_SPELLS.sanctuary).toMatchObject({
      level: 1,
      targetType: 'self_or_ally',
      sanctuary: true,
    });
  });

  it("cast stamps the caster's spell DC on the ward", async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'sanctuary', slotLevel: 1 },
      history: [],
      state: stateWith({}),
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].sanctuary_dc).toBe(15); // 8 + prof(3) + WIS(+4)
  });
});

describe('Sanctuary — enemy attack', () => {
  it('an attacker that fails the WIS save cannot attack the ward', async () => {
    // sanctuary_dc 30 is unbeatable → the enemy always fails → attack lost.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: stateWith({ sanctuary_dc: 30 }),
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].hp).toBe(30); // unharmed — the attack was turned aside
    expect(r.narrative).toMatch(/Sanctuary/);
  });

  it('an attacker that succeeds on the WIS save attacks normally', async () => {
    // sanctuary_dc 2 is trivially beaten → the enemy attacks (and hits) normally.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: stateWith({ sanctuary_dc: 2 }),
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].hp).toBeLessThan(30); // ward bypassed → took the hit
  });
});

describe('Sanctuary — teardown', () => {
  it('endCombatState clears the ward', () => {
    const ended = endCombatState(stateWith({ sanctuary_dc: 15 }));
    expect(ended.characters[0].sanctuary_dc).toBeUndefined();
  });
});
