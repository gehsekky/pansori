// Thief Rogue Fast Hands (2024 PHB). Utilize action becomes a
// Bonus Action — pansori applies this to:
//   - the generic `use` action on consumables that would normally
//     cost an action (potions are already bonus-action by RAW).
//   - the `use_healer_kit` Healer-feat action.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const minimalSeed: Seed = {
  context_id: ctx.id,
  world_name: 'Thief Test',
  ship_name: 'Thief Test',
  intro: '',
  seed_id: 'thief',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {},
  loot: {},
  npcs: {},
};

describe('Thief Rogue Fast Hands — Utilize action becomes bonus action', () => {
  it("Thief Rogue uses a Healer's Kit as bonus action (instead of action)", async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const thief = makeChar({
      id: 'pc-1',
      character_class: 'Rogue',
      subclass: 'thief',
      level: 5,
      feats: ['healer'],
      inventory: [{ instance_id: 'kit-1', id: 'healers_kit', name: "Healer's Kit", count: 10 }],
    });
    const wounded = makeChar({ id: 'wounded-1', hp: 5, max_hp: 30 });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
      characters: [thief, wounded],
      active_character_id: 'pc-1',
      initiative_order: [{ id: 'pc-1', roll: 18, is_enemy: false }],
      initiative_idx: 0,
    };
    const result = await takeAction({
      action: { type: 'use_healer_kit', targetCharId: 'wounded-1' },
      history: [],
      state,
      seed: minimalSeed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.turn_actions.bonus_action_used).toBe(true);
    expect(after?.turn_actions.action_used).toBeFalsy();
  });

  it('Non-Thief Rogue uses the kit as a full action (control)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const fighter = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      feats: ['healer'],
      inventory: [{ instance_id: 'kit-1', id: 'healers_kit', name: "Healer's Kit", count: 10 }],
    });
    const wounded = makeChar({ id: 'wounded-1', hp: 5, max_hp: 30 });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
      characters: [fighter, wounded],
      active_character_id: 'pc-1',
      initiative_order: [{ id: 'pc-1', roll: 18, is_enemy: false }],
      initiative_idx: 0,
    };
    const result = await takeAction({
      action: { type: 'use_healer_kit', targetCharId: 'wounded-1' },
      history: [],
      state,
      seed: minimalSeed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.turn_actions.action_used).toBe(true);
    expect(after?.turn_actions.bonus_action_used).toBeFalsy();
  });
});
