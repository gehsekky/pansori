// SRD Mirror Image — illusory duplicates absorb hits. When a creature HITS the
// warded PC, a d6 per remaining duplicate is rolled; any 3+ means a duplicate
// takes the hit (no damage) and is destroyed. Covers cast, absorb-on-hit,
// miss-doesn't-consume, and combat-end teardown.

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
  world_name: 'Mirror Image Test',
  ship_name: 'Mirror Image Test',
  intro: '',
  seed_id: 'mi',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      { id: ENEMY, name: 'Brute', hp: 50, ac: 12, damage: '1d6+1', toHit: 6, xp: 50 } as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function stateWith(charOverrides: Partial<Character>): GameState {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 5,
    int: 18,
    ac: 13,
    hp: 30,
    max_hp: 30,
    spells_known: ['mirror_image'],
    prepared_spells: ['mirror_image'],
    spell_slots_max: { 2: 2 },
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

describe('Mirror Image — catalog & cast', () => {
  it('is a self buff that conjures 3 duplicates', () => {
    expect(SRD_SPELLS.mirror_image).toMatchObject({
      level: 2,
      targetType: 'self',
      mirrorImages: 3,
    });
  });

  it('cast sets mirror_images to 3', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'mirror_image', slotLevel: 2 },
      history: [],
      state: stateWith({}),
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].mirror_images).toBe(3);
  });
});

describe('Mirror Image — absorbs hits', () => {
  it('a hit destroys a duplicate instead of damaging the PC', async () => {
    // High rolls: the enemy hits, and the d6 image rolls come up 3+ → absorbed.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: stateWith({ mirror_images: 3 }),
      seed,
      context: ctx,
    });
    const pc = r.newState.characters[0];
    expect(pc.hp).toBe(30); // no damage — a duplicate took the hit
    expect(pc.mirror_images).toBe(2); // one duplicate shattered
    expect(r.narrative).toMatch(/mirror image/i);
  });

  it('a missed attack does not consume a duplicate', async () => {
    // Low rolls: the enemy's attack misses → no image roll happens.
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: stateWith({ mirror_images: 3 }),
      seed,
      context: ctx,
    });
    const pc = r.newState.characters[0];
    expect(pc.hp).toBe(30);
    expect(pc.mirror_images).toBe(3); // untouched
  });
});

describe('Mirror Image — teardown', () => {
  it('endCombatState clears mirror_images', () => {
    const ended = endCombatState(stateWith({ mirror_images: 2 }));
    expect(ended.characters[0].mirror_images).toBeUndefined();
  });
});
