// Regression test for the rangedInMelee disadvantage rule.
//
// **Pre-fix bug:** pansori applied "ranged in melee" disadvantage
// to every ranged-weapon attack, regardless of whether an enemy was
// actually adjacent. This made bows strictly worse than melee
// weapons in any combat. RAW (2024 PHB): disadvantage applies only
// when a non-incapacitated enemy is within 5 ft of the attacker.
//
// The fix in toHit.ts checks grid distance to any living
// non-incapacitated enemy. These tests pin the new behavior so the
// bug can't silently regress.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../campaignData/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#0`;

const seedWithGoblin: Seed = {
  context_id: ctx.id,
  world_name: 'Ranged Test',
  ship_name: 'Ranged Test',
  intro: '',
  seed_id: 'ranged-test',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: enemyId,
        name: 'Goblin',
        hp: 40,
        ac: 12,
        damage: '1d6',
        toHit: 3,
        xp: 20,
      },
    ],
  },
  loot: {},
  npcs: {},
};

function buildRanger(opts: { rangerPos: { x: number; y: number }; enemyConditions?: string[] }) {
  const ranger = makeChar({
    id: 'pc-1',
    character_class: 'Ranger',
    level: 3,
    dex: 16,
    inventory: [
      { instance_id: 'bow-1', id: 'shortbow', name: 'Shortbow' },
      { instance_id: 'arrow-1', id: 'arrows', name: 'Arrows', count: 20 },
    ],
    equipped_weapon: 'bow-1',
    weapon_proficiencies: ['simple', 'martial'],
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [ranger],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: enemyId, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: opts.rangerPos,
        hp: 20,
        maxHp: 20,
        conditions: [],
        condition_durations: {},
      },
      {
        id: enemyId,
        isEnemy: true,
        // Standard enemy position at (5, 5); ranger position varies.
        pos: { x: 5, y: 5 },
        hp: 40,
        maxHp: 40,
        conditions: opts.enemyConditions ?? [],
        condition_durations: {},
      },
    ],
  };
}

describe('rangedInMelee disadvantage — distance check', () => {
  it('does NOT apply when the ranger is far from any enemy', async () => {
    mockRandom(0.99, 0.5, 0.5);
    // Ranger at (0,5), goblin at (5,5) — 25 ft apart. Plenty of room.
    const state = buildRanger({ rangerPos: { x: 0, y: 5 } });
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    // No "ranged in melee" annotation in the to-hit math.
    expect(result.narrative).not.toMatch(/ranged in melee/);
    expect(result.narrative).not.toMatch(/disadvantage/);
  });

  it('DOES apply when an enemy is within 5 ft of the ranger', async () => {
    mockRandom(0.99, 0.5, 0.5, 0.5, 0.5);
    // Ranger at (4,5), goblin at (5,5) — 5 ft (one square) apart.
    const state = buildRanger({ rangerPos: { x: 4, y: 5 } });
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).toMatch(/ranged in melee/);
  });

  it('does NOT apply when the adjacent enemy is incapacitated', async () => {
    mockRandom(0.99, 0.5, 0.5);
    // Adjacent goblin but incapacitated → no threat → no disadvantage.
    const state = buildRanger({
      rangerPos: { x: 4, y: 5 },
      enemyConditions: ['incapacitated'],
    });
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/ranged in melee/);
  });
});
