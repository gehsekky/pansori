// SRD Fire Shield — a self buff that grants Cold resistance and retaliates with
// Fire against melee attackers. Covers the cast (sets the retaliate + resistance),
// the retaliation in the enemy-turn loop, and the combat-end teardown.

import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { endCombatState, takeAction } from '../../services/gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { SRD_SPELLS } from '../../campaignData/srd/spells.js';
import { context as ctx } from '../fixtures/testContext.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;

function seedWith(enemy: Partial<Enemy>): Seed {
  return {
    context_id: ctx.id,
    world_name: 'Fire Shield Test',
    ship_name: 'Fire Shield Test',
    intro: '',
    seed_id: 'fs',
    rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
    enemies: {
      ['entry_hall']: [
        {
          id: ENEMY,
          name: 'Brute',
          hp: 50,
          ac: 12,
          damage: '1d6+1',
          toHit: 6,
          xp: 50,
          str: 14,
          ...enemy,
        } as Enemy,
      ],
    },
    loot: {},
    npcs: {},
  };
}

function stateWith(charOverrides: Partial<Character>): GameState {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 7,
    int: 18,
    ac: 13,
    hp: 40,
    max_hp: 40,
    spells_known: ['fire_shield'],
    prepared_spells: ['fire_shield'],
    spell_slots_max: { 4: 1 },
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
        hp: 40,
        maxHp: 40,
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

describe('Fire Shield — catalog', () => {
  it('is a self buff with Cold resistance + a 2d8 Fire retaliate', () => {
    expect(SRD_SPELLS.fire_shield).toMatchObject({
      level: 4,
      targetType: 'self',
      grantResistances: ['cold'],
      fireShield: { dice: '2d8', damageType: 'fire' },
    });
  });
});

describe('Fire Shield — cast', () => {
  it('arms the retaliate and grants Cold resistance', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'fire_shield', slotLevel: 4 },
      history: [],
      state: stateWith({}),
      seed: seedWith({}),
      context: ctx,
    });
    const pc = r.newState.characters[0];
    expect(pc.fire_shield).toEqual({ dice: '2d8', damageType: 'fire' });
    expect(pc.spell_resistances).toContain('cold');
  });
});

describe('Fire Shield — retaliation', () => {
  it('sears an adjacent enemy that hits the warded PC in melee', async () => {
    // High rolls: the enemy hits (PC takes damage), triggering the shield, and
    // the 2d8 retaliate rolls high.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: stateWith({ fire_shield: { dice: '2d8', damageType: 'fire' } }),
      seed: seedWith({}),
      context: ctx,
    });
    const e = r.newState.entities?.find((x) => x.id === ENEMY)!;
    expect(e.hp).toBeLessThan(50); // took Fire Shield retaliate damage
    expect(r.narrative).toMatch(/Fire Shield/);
  });

  it('does not retaliate if the enemy misses (PC took no damage)', async () => {
    // Low rolls: the enemy's attack misses, so the shield never triggers.
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: stateWith({ fire_shield: { dice: '2d8', damageType: 'fire' } }),
      seed: seedWith({}),
      context: ctx,
    });
    expect(r.newState.entities?.find((x) => x.id === ENEMY)!.hp).toBe(50); // unharmed
  });
});

describe('Fire Shield — teardown', () => {
  it('endCombatState clears fire_shield and spell_resistances', () => {
    const st = stateWith({
      fire_shield: { dice: '2d8', damageType: 'fire' },
      spell_resistances: ['cold'],
    });
    const ended = endCombatState(st);
    expect(ended.characters[0].fire_shield).toBeUndefined();
    expect(ended.characters[0].spell_resistances).toBeUndefined();
  });
});
