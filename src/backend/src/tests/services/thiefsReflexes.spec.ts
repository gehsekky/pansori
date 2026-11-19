// SRD 5.2.1 Thief's Reflexes (Thief Rogue L17): two turns in the first round
// of any combat — the normal one and a second at Initiative − 10.

import { CORRIDOR_ID, makeChar, makeState, seedWithEnemy } from '../../test-fixtures.js';
import type { Character, GameState } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dropExtraTurns, takeAction } from '../../services/gameEngine.js';
import { hasThiefsReflexes, withThiefsReflexes } from '../../services/rogueFeatures.js';
import { context as ctx } from '../fixtures/testContext.js';

afterEach(() => vi.restoreAllMocks());

const GOB = `${CORRIDOR_ID}#0`;

const thief = (level = 17, over: Partial<Character> = {}) =>
  makeChar({
    id: 'pc-1',
    name: 'Thief',
    character_class: 'Rogue',
    subclass: 'thief',
    level,
    class_levels: { rogue: level },
    hp: 80,
    max_hp: 80,
    ...over,
  });

describe("Thief's Reflexes — the extra initiative slot", () => {
  const order = [
    { id: 'pc-1', roll: 22, is_enemy: false },
    { id: GOB, roll: 15, is_enemy: true },
    { id: 'x', roll: 9, is_enemy: true },
  ];

  it('adds a second slot at Initiative − 10 for a Thief of level 17+', () => {
    expect(hasThiefsReflexes(thief(17))).toBe(true);
    expect(hasThiefsReflexes(thief(16))).toBe(false);
    expect(hasThiefsReflexes(thief(17, { subclass: undefined }))).toBe(false);
    expect(withThiefsReflexes(order, [thief()], 4)).toEqual([
      order[0],
      order[1],
      { id: 'pc-1', roll: 12, is_enemy: false, extra_turn_round: 4 },
      order[2],
    ]);
    expect(withThiefsReflexes(order, [thief(16)], 4)).toEqual(order);
  });

  it('is added when combat starts', async () => {
    const st: GameState = {
      ...makeState({ id: 'pc-1' }),
      characters: [thief()],
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
    };
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: GOB } as never,
      history: [],
      state: st,
      seed: seedWithEnemy,
      context: ctx,
    });
    const slots = (r.newState.initiative_order ?? []).filter((e) => e.id === 'pc-1');
    expect(slots).toHaveLength(2);
    expect(slots[1].roll).toBe(slots[0].roll - 10);
    expect(slots[1].extra_turn_round).toBeDefined();
    expect(r.narrative).toContain("Thief's Reflexes");
  });
});

describe("Thief's Reflexes — turn flow", () => {
  /** Round 7 (an old round counter is fine): Thief 20 → goblin 15 → Thief 10. */
  function roundOne(): GameState {
    // Reaction already spent, so a goblin hit doesn't pause for Uncanny Dodge.
    const char = thief(17, {
      turn_actions: {
        action_used: false,
        bonus_action_used: false,
        reaction_used: true,
        free_interaction_used: false,
      },
    });
    return {
      ...makeState({ id: char.id }),
      characters: [char],
      active_character_id: char.id,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      combat_active: true,
      round: 7,
      initiative_order: [
        { id: char.id, roll: 20, is_enemy: false },
        { id: GOB, roll: 15, is_enemy: true },
        { id: char.id, roll: 10, is_enemy: false, extra_turn_round: 7 },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: char.id,
          isEnemy: false,
          pos: { x: 1, y: 1 },
          hp: 80,
          maxHp: 80,
          conditions: [],
          condition_durations: {},
        },
        {
          id: GOB,
          isEnemy: true,
          pos: { x: 8, y: 5 },
          hp: 500,
          maxHp: 500,
          conditions: [],
          condition_durations: {},
        },
      ],
      movement_used: {},
    };
  }

  const endTurn = (state: GameState) =>
    takeAction({
      action: { type: 'end_turn' } as never,
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });

  it('takes the second turn after the goblin, then the slot disappears', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const first = await endTurn(roundOne());
    expect(first.newState.initiative_idx).toBe(2); // the Thief's second turn
    expect(first.newState.active_character_id).toBe('pc-1');
    expect(first.newState.round).toBe(7);

    const second = await endTurn(first.newState);
    expect(second.newState.round).toBe(8);
    expect(second.newState.initiative_order).toHaveLength(2);
    expect(second.newState.initiative_order.some((e) => e.extra_turn_round !== undefined)).toBe(
      false
    );
    expect(second.newState.initiative_idx).toBe(0); // Thief's normal round-2 turn
  });

  it('passes over a stale slot from an earlier round', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const st = { ...roundOne(), round: 8 }; // the slot belonged to round 7
    const r = await endTurn(st);
    // Goblin acts, the stale slot is skipped, and the round wraps to the Thief.
    expect(r.newState.round).toBe(9);
    expect(r.newState.initiative_idx).toBe(0);
    expect(r.newState.initiative_order).toHaveLength(2);
  });
});

describe('dropExtraTurns', () => {
  it('removes the extra slots and keeps the cursor on the same entry', () => {
    const st = {
      ...makeState({ id: 'pc-1' }),
      initiative_order: [
        { id: 'a', roll: 20, is_enemy: false },
        { id: 'a', roll: 10, is_enemy: false, extra_turn_round: 1 },
        { id: 'b', roll: 5, is_enemy: true },
      ],
    };
    const out = dropExtraTurns(st, 2);
    expect(out.st.initiative_order.map((e) => e.id)).toEqual(['a', 'b']);
    expect(out.idx).toBe(1); // still 'b'
    expect(dropExtraTurns(out.st, 1).st).toBe(out.st); // nothing to drop: unchanged
  });
});
