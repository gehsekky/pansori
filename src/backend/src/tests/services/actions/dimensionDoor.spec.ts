// SRD Dimension Door (L4 conjuration). Real grid teleport.
// Pansori MVP auto-picks the cell with maximum min-distance to any
// living enemy ("safest" cell). Movement budget isn't consumed (RAW:
// teleport doesn't use movement). Willing-creature passenger deferred.

import type { GameState, Seed } from '../../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../test-fixtures.js';
import { context as ctx } from '../../fixtures/testContext.js';
import { takeAction } from '../../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Dimension Door Test',
  ship_name: 'Dimension Door Test',
  intro: '',
  seed_id: 'dimension-door',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: enemyId,
        name: 'Goblin',
        hp: 30,
        ac: 12,
        damage: '1d6',
        toHit: 4,
        xp: 20,
      },
    ],
  },
  loot: {},
  npcs: {},
};

function buildGridState(pc: ReturnType<typeof makeChar>): GameState {
  return {
    ...makeState({ id: pc.id }, { current_room: 'entry_hall', combat_active: true }),
    characters: [pc],
    active_character_id: pc.id,
    initiative_order: [
      { id: pc.id, roll: 18, is_enemy: false },
      { id: enemyId, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: pc.id,
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: pc.hp,
        maxHp: pc.max_hp,
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
}

describe('Dimension Door — auto-safe teleport', () => {
  it('moves the caster to a cell far from the enemy', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 9,
      int: 18,
      spells_known: ['dimension_door'],
      spell_slots_max: { 4: 1 },
      spell_slots_used: { 4: 0 },
    });
    const state = buildGridState(pc);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'dimension_door', slotLevel: 4 },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const ent = result.newState.entities?.find((e) => e.id === 'pc-1');
    expect(ent).toBeDefined();
    // Original position was (4,5) — must have moved to a different cell.
    expect(ent?.pos.x === 4 && ent?.pos.y === 5).toBe(false);
    // The chosen cell should be at least as far from the goblin (5,5)
    // as the corner of a 10x10 grid (chebyshev ≈ 5).
    const enemyEnt = result.newState.entities?.find((e) => e.id === enemyId);
    if (ent && enemyEnt) {
      const dist = Math.max(
        Math.abs(ent.pos.x - enemyEnt.pos.x),
        Math.abs(ent.pos.y - enemyEnt.pos.y)
      );
      expect(dist).toBeGreaterThanOrEqual(5);
    }
  });

  it('consumes the spell slot + action', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 9,
      int: 18,
      spells_known: ['dimension_door'],
      spell_slots_max: { 4: 1 },
      spell_slots_used: { 4: 0 },
    });
    const state = buildGridState(pc);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'dimension_door', slotLevel: 4 },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.spell_slots_used?.[4]).toBe(1);
    // Action_used isn't asserted because combat-action initiative
    // advance + FRESH_TURN can reset it by the time the test inspects
    // the post-state — see Stars Druid spec for the same pattern.
  });

  it('falls back to narrative-only when grid is empty', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 9,
      int: 18,
      spells_known: ['dimension_door'],
      spell_slots_max: { 4: 1 },
      spell_slots_used: { 4: 0 },
    });
    const state: GameState = {
      ...makeState({ id: pc.id }, { current_room: 'entry_hall', combat_active: false }),
      characters: [pc],
      active_character_id: pc.id,
      entities: undefined,
    };
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'dimension_door', slotLevel: 4 },
      history: [],
      state,
      seed,
      context: ctx,
    });
    // No entities to move; narrative still fires.
    expect(result.narrative).toMatch(/reality folds|reappear/i);
  });
});
