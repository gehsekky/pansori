// Regression test for the PC's own death_save action not eating
// phantom 2-failure penalties just because an enemy exists in the
// room.
//
// **Pre-fix bug:** `processDeathSave` always fired the SRD
// "2 death save failures on enemy attack" rule when its `enemy`
// param was truthy — including from the PC-invokes-`death_save`
// action path where no enemy actually attacked. Result: a downed
// PC rolling their own save every turn took 2 extra failures from
// a phantom "attacks your prone form" line whenever any enemy was
// alive nearby. Three turns of self-rolled saves = guaranteed
// death even on triple-20 luck.
//
// Fixed by parameterizing `processDeathSave(..., enemyAttackContext)`:
// the multiattack-loop call path passes true (real attack just
// landed), the PC-action call path defaults to false. Test pins
// the new contract.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../fixtures/testContext.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#0`;

const seedWithGoblin: Seed = {
  context_id: ctx.id,
  world_name: 'Death Save Test',
  ship_name: 'Death Save Test',
  intro: '',
  seed_id: 'death-save-test',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: enemyId,
        name: 'Goblin',
        hp: 50,
        ac: 10,
        damage: '1d4',
        toHit: 3,
        xp: 20,
      },
    ],
  },
  loot: {},
  npcs: {},
};

describe('death_save PC-action path — no phantom 2-failure penalty', () => {
  it('rolls one save and does NOT apply +2 failures when no attack happened this turn', async () => {
    // d20 mocked to 11 (middling, save succeeds at DC 10). PC at 0
    // HP, unconscious, taking their own death_save action while a
    // living goblin exists in the room.
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 → 11
    const pc = makeChar({
      id: 'pc-1',
      hp: 0,
      max_hp: 20,
      conditions: ['unconscious'],
      death_saves: { successes: 0, failures: 0 },
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
          hp: 0,
          maxHp: 20,
          conditions: ['unconscious'],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 50,
          maxHp: 50,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: { type: 'death_save' },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    const after = result.newState.characters[0];
    // Save succeeded (11 ≥ 10). Pre-fix: 1 success, +2 failures from
    // phantom enemy attack = 1 success / 2 failures.
    // Post-fix: 1 success, 0 failures.
    expect(after.death_saves.successes).toBe(1);
    expect(after.death_saves.failures).toBe(0);
    // Narrative should NOT include the phantom-attack line.
    expect(result.narrative).not.toMatch(/attacks your prone form/);
  });

  it('three successful PC-rolled saves stabilize the PC, no phantom failures along the way', async () => {
    // Each save d20 → 11 (mid-roll, ≥ DC 10 success). After 3
    // successes the PC stabilizes.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const pc = makeChar({
      id: 'pc-1',
      hp: 0,
      max_hp: 20,
      conditions: ['unconscious'],
      death_saves: { successes: 2, failures: 0 }, // one save away
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
          hp: 0,
          maxHp: 20,
          conditions: ['unconscious'],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 50,
          maxHp: 50,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: { type: 'death_save' },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    const after = result.newState.characters[0];
    expect(after.stable).toBe(true);
    expect(after.dead).toBe(false);
    expect(result.narrative).toMatch(/stabilise|stabilize/);
  });
});
