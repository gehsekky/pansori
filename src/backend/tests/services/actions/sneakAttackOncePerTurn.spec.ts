// Regression test for Sneak Attack's "once per turn" gate.
//
// **Pre-existing bug:** the attack handler had no
// `turn_actions.sneak_attack_used` flag. A Rogue who could
// multi-hit per turn (via Extra Attack from a multiclass dip, or
// Two-Weapon Fighting's bonus-action off-hand attack) triggered
// Sneak Attack on EVERY qualifying hit instead of just the first.
//
// Fixed by adding `sneak_attack_used` to TurnActions and gating
// the SA block on it. Cleared by FRESH_TURN at turn start.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../../../src/test-fixtures.js';
import type { Seed } from '../../../src/types.js';
import { context as ctx } from '../../../src/campaignData/sandbox.js';
import { takeAction } from '../../../src/services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#0`;

const seedWithGoblin: Seed = {
  context_id: ctx.id,
  world_name: 'SA Once Per Turn',
  ship_name: 'SA Once Per Turn',
  intro: '',
  seed_id: 'sa-opt',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: enemyId,
        name: 'Goblin',
        hp: 200,
        ac: 10,
        damage: '1d6',
        toHit: 3,
        xp: 20,
      },
    ],
  },
  loot: {},
  npcs: {},
};

describe('Sneak Attack — once per turn', () => {
  it('multiclass Rogue/Fighter L5: Extra Attack does NOT re-trigger Sneak Attack', async () => {
    // Fighter 5 / Rogue 2 with Extra Attack. Both attacks auto-hit
    // (d20=20). Sneak Attack should fire on the first attack but
    // NOT the second.
    mockRandom(0.99); // all d20s = 20 → both attacks crit-hit
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 7,
      dex: 16,
      class_levels: { fighter: 5, rogue: 2 },
      inventory: [{ instance_id: 'd-1', id: 'dagger', name: 'Dagger' }],
      equipment: { main_hand: 'd-1' },
      weapon_proficiencies: ['simple', 'martial'],
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [pc, makeChar({ id: 'ally', name: 'Ally', character_class: 'Fighter' })],
      active_character_id: 'pc-1',
      initiative_order: [
        { id: 'pc-1', roll: 18, is_enemy: false },
        { id: 'ally', roll: 17, is_enemy: false },
        { id: enemyId, roll: 5, is_enemy: true },
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
          id: 'ally',
          isEnemy: false as const,
          pos: { x: 6, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 200,
          maxHp: 200,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    // Sneak Attack should appear EXACTLY ONCE in the narrative —
    // first attack triggers it, Extra Attack (second) is gated out.
    const sneakMatches = result.narrative.match(/Sneak Attack/g);
    expect(sneakMatches).toHaveLength(1);
    // And the turn_actions flag should be set.
    expect(result.newState.characters[0].turn_actions.sneak_attack_used).toBe(true);
  });
});
