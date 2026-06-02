// RE-4 — line of sight enforced on ranged attacks. A solid room obstacle
// strictly between attacker and a non-adjacent target blocks the shot; the
// same obstacle off the sightline does not. (The pure geometry lives in
// gridLineOfSight.spec.ts; this proves the wiring through the attack path.)

import type { GridPos, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import { context as ctx } from '../../campaignData/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;

// PC at (1,1) with a shortbow; enemy at (1,5) — 4 squares away, well within
// ranged reach. `obstacle` is placed on the room.
function losSeed(obstacle: GridPos): Seed {
  return {
    context_id: ctx.id,
    world_name: 'LoS Test',
    ship_name: 'LoS Test',
    intro: '',
    seed_id: 'los',
    rooms: [{ id: 'entry_hall', name: 'Start', desc: '', obstacles: [obstacle] }],
    enemies: {
      ['entry_hall']: [
        { id: ENEMY, name: 'Goblin', hp: 30, ac: 10, damage: '1d6', toHit: 3, xp: 20 },
      ],
    },
    loot: {},
    npcs: {},
  };
}

function archerState() {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 5,
    dex: 16,
    hp: 30,
    max_hp: 30,
    inventory: [
      { instance_id: 'bow-1', id: 'shortbow', name: 'Shortbow' },
      { instance_id: 'arr-1', id: 'arrows', name: 'Arrows', quantity: 20 },
    ],
    equipped_weapon: 'bow-1',
    weapon_proficiencies: ['simple', 'martial'],
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
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 1, y: 1 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 1, y: 5 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('line of sight — ranged attack', () => {
  it('is blocked by a wall directly between attacker and target', async () => {
    mockRandom(0.99);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: archerState(),
      seed: losSeed({ x: 1, y: 3 }), // on the (1,1)→(1,5) line
      context: ctx,
    });
    expect(result.narrative).toMatch(/No line of sight/);
    // The enemy takes no damage — the shot never resolved.
    expect(result.newState.entities?.find((e) => e.id === ENEMY)?.hp).toBe(30);
  });

  it('lands when the obstacle is off the sightline', async () => {
    mockRandom(0.99); // hits
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: archerState(),
      seed: losSeed({ x: 3, y: 3 }), // off the (1,1)→(1,5) line
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/No line of sight/);
    expect(result.newState.entities?.find((e) => e.id === ENEMY)?.hp).toBeLessThan(30);
  });
});
