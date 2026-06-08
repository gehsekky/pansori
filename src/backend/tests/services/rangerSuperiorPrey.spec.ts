// RE-2 — Superior Hunter's Prey (SRD 5.2.1, Hunter L11): once per turn, when
// you deal Hunter's Mark damage to the marked target, you also deal that extra
// (Force) damage to a different creature within 30 ft of it.

import type { Enemy, GameState, Seed } from '../../src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../src/test-fixtures.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';
import { takeAction } from '../../src/services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const E1 = `entry_hall#0`;
const E2 = `entry_hall#1`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'SHP Test',
  ship_name: 'SHP Test',
  intro: '',
  seed_id: 'shp',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      { id: E1, name: 'Stag', hp: 120, ac: 5, damage: '1d6', toHit: 3, xp: 50 } as unknown as Enemy,
      { id: E2, name: 'Boar', hp: 120, ac: 5, damage: '1d6', toHit: 3, xp: 50 } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function hunterState(level: number): GameState {
  const char = makeChar({
    id: 'pc-1',
    character_class: 'Ranger',
    subclass: 'hunter',
    level,
    str: 16,
    hunters_mark_target_id: E1,
    equipment: { main_hand: 'sw-1' },
    inventory: [{ instance_id: 'sw-1', id: 'shortsword', name: 'Shortsword' }],
    weapon_proficiencies: ['simple', 'martial'],
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [char],
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
        pos: { x: 4, y: 5 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: E1,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 120,
        maxHp: 120,
        conditions: [],
        condition_durations: {},
      },
      {
        id: E2,
        isEnemy: true,
        pos: { x: 7, y: 5 },
        hp: 120,
        maxHp: 120,
        conditions: [],
        condition_durations: {},
      }, // 10 ft from E1
    ],
  } as unknown as GameState;
}

describe('Superior Hunter’s Prey (Hunter L11)', () => {
  it('also damages a second creature within 30 ft of the marked target', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // hit + max dice
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: E1 },
      history: [],
      state: hunterState(11),
      seed,
      context: ctx,
    });
    expect(r.narrative).toMatch(/Superior Hunter's Prey/);
    expect(r.newState.entities?.find((e) => e.id === E2)!.hp).toBeLessThan(120);
  });

  it('does not fire at L10 (control)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: E1 },
      history: [],
      state: hunterState(10),
      seed,
      context: ctx,
    });
    expect(r.narrative).not.toMatch(/Superior Hunter's Prey/);
    expect(r.newState.entities?.find((e) => e.id === E2)!.hp).toBe(120); // untouched
  });
});
