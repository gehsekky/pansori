// SRD Misty Step (L2): a bonus-action teleport up to 30 ft (6 squares) to an
// unoccupied space. Reuses the Dimension Door safest-cell teleport, range-capped.

import type { Enemy, GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';
import { context as ctx } from '../campaignData/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = 'entry_hall#0';
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Misty Step Test',
  ship_name: 'Misty Step Test',
  intro: '',
  seed_id: 'misty-step',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    entry_hall: [
      {
        id: ENEMY,
        name: 'Ogre',
        hp: 60,
        ac: 10,
        damage: '1d6',
        toHit: 3,
        xp: 20,
      } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function casterState(): GameState {
  const char = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 5,
    int: 16,
    spell_slots_max: { 2: 2 },
    spell_slots_used: {},
    spells_known: ['misty_step'],
    prepared_spells: ['misty_step'],
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [char],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: ENEMY, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 0, y: 0 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 1, y: 0 },
        hp: 60,
        maxHp: 60,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

const cheby = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe('Misty Step — bonus-action teleport (≤30 ft)', () => {
  it('teleports the caster to a free cell within 6 squares, away from the enemy', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'misty_step', slotLevel: 2, targetCharId: 'pc-1' },
      history: [],
      state: casterState(),
      seed,
      context: ctx,
    });
    const pos = r.newState.entities?.find((e) => e.id === 'pc-1')?.pos ?? { x: 0, y: 0 };
    const enemyPos = { x: 1, y: 0 };
    expect(pos).not.toEqual({ x: 0, y: 0 }); // moved
    expect(cheby(pos, { x: 0, y: 0 })).toBeLessThanOrEqual(6); // …within Misty Step's 30 ft
    expect(cheby(pos, enemyPos)).toBeGreaterThan(1); // …and not adjacent to the ogre anymore
  });
});
