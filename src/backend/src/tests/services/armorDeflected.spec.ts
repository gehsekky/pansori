// Regression test for the `armorItem` lookup in computeEnemyAttack.
//
// **Pre-fix bug:** the function-scoped armorItem capture matched on
// `i.id === char.equipped_armor`, but `equipped_armor` stores an
// `instance_id` (per routes/game.ts character creation). The
// mismatch meant armorItem was always undefined → the
// `enemyDeflected` narrative pool, defined in every context, never
// fired on missed enemy attacks against armored PCs.
//
// Fixed in 2026-05-22. This test pins the new behavior so the bug
// can't silently regress.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../campaignData/sandbox.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#0`;

const seedWithGoblin: Seed = {
  context_id: ctx.id,
  world_name: 'Deflected Test',
  ship_name: 'Deflected Test',
  intro: '',
  seed_id: 'deflected-test',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: enemyId,
        name: 'Goblin',
        hp: 10,
        ac: 10,
        damage: '1d6',
        // Negative toHit so a low d20 reliably misses, exercising the
        // deflected branch on an armored target.
        toHit: -10,
        xp: 20,
      },
    ],
  },
  loot: {},
  npcs: {},
};

describe('Enemy miss vs armored PC — deflected narrative fires', () => {
  it('uses the enemyDeflected pool when armorItem resolves correctly', async () => {
    // Force d20 low so the enemy attack misses; the deflected branch
    // is the miss-with-armor narrative path.
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 3,
      hp: 30,
      max_hp: 30,
      ac: 16,
      armor_proficiencies: ['light', 'medium', 'heavy'],
      inventory: [{ instance_id: 'a-1', id: 'chain_mail', name: 'Chain Mail' }],
      equipment: { armor: 'a-1' },
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [pc],
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
          pos: { x: 4, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    // Sandbox enemyDeflected pool entries contain "deflected" or
    // "turns ... blow" — pre-fix this narrative was unreachable.
    // Match either variant.
    expect(result.narrative).toMatch(/deflected|turns the/);
    // And the {armor} substitution should land — pre-fix armorItem
    // was undefined so the pool's `{armor}` token never expanded.
    expect(result.narrative).toContain('Chain Mail');
  });

  it('does NOT fire deflected pool when the PC wears no armor', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 3,
      hp: 20,
      max_hp: 20,
      ac: 12,
      // No equipped_armor.
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [pc],
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
          pos: { x: 4, y: 5 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/deflected|turns the/);
  });
});
