// Regression test for grid_move's opportunity-attack damage path.
//
// **Pre-existing bug:** when an enemy's OA hits a moving PC,
// gridMove applied `hp = Math.max(0, hp - dmg)` directly. That
// bypasses every PC-side damage gate that lives in `applyDamage`:
//   - Temp HP absorption.
//   - Exhaustion-4 max-HP clamp.
//   - Knock-out detection (proper transition to unconscious).
//   - SRD concentration save (this was called separately so it
//     happened to fire, but as a side-effect of the bypass it
//     ran on the WRONG hp value).
// Concentration was double-handled (the in-handler
// `checkConcentration` call AND the now-unused damage-time check).
//
// Fixed by routing the OA damage through `applyDamage`. This spec
// proves the temp-HP path works (the most obvious pre-fix gap:
// temp HP was ignored, the OA just chewed into HP).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;

const seedWithGoblin: Seed = {
  context_id: ctx.id,
  world_name: 'OA Damage Test',
  ship_name: 'OA Damage Test',
  intro: '',
  seed_id: 'oa-test',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      {
        id: enemyId,
        name: 'Goblin',
        hp: 30,
        ac: 10,
        damage: '1d6',
        toHit: 20, // auto-hit
        xp: 20,
      },
    ],
  },
  loot: {},
  npcs: {},
};

describe('grid_move OA damage — routes through applyDamage', () => {
  it('temp HP absorbs OA damage before HP drops', async () => {
    // PC at (4, 5) with goblin adjacent at (5, 5). Move to (3, 5)
    // — out of melee, triggers OA. d6 → 6. PC has 8 temp HP and
    // 30 HP. Pre-fix: HP dropped to 24 (full 6 damage applied),
    // temp HP stayed at 8. Post-fix: temp HP absorbs all 6, HP
    // stays at 30, temp HP drops to 2.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 3,
      hp: 30,
      max_hp: 30,
      temp_hp: 8,
      speed: 30,
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
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
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: { type: 'grid_move', entityId: 'pc-1', to: { x: 3, y: 5 } },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    const after = result.newState.characters[0];
    // HP unchanged at 30; temp HP burned down by 6 to 2.
    expect(after.hp).toBe(30);
    expect(after.temp_hp).toBe(2);
    expect(result.narrative).toMatch(/Opportunity attack/);
  });
});
