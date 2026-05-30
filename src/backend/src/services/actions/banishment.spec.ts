// 2024 PHB Banishment (L4 abjuration). CHA save or the target is
// banished — sent to a harmless demiplane for the duration. Pansori
// models this as the `banished` condition + concentration link:
//   - Enemy turn loop skips banished entities.
//   - Player attack/cast target selection filters them out.
//   - breakConcentration strips the linked condition, returning them.
// RAW upcast (+1 target per slot above 4th) deferred; pansori MVP
// hits one target via the save branch.

import type { GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { breakConcentration, generateChoices, takeAction } from '../gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Banishment Test',
  ship_name: 'Banishment Test',
  intro: '',
  seed_id: 'banishment',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  enemies: {
    [ctx.startRoomId]: [
      {
        id: enemyId,
        name: 'Goblin',
        hp: 30,
        ac: 12,
        damage: '1d6',
        toHit: 4,
        cha: 8, // -1 mod → save bonus -1 → vulnerable to a DC ~13+ banish
        xp: 20,
      },
    ],
  },
  loot: {},
  npcs: {},
};

function buildState(pc: ReturnType<typeof makeChar>): GameState {
  return {
    ...makeState({ id: pc.id }, { current_room: ctx.startRoomId, combat_active: true }),
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

describe('Banishment — cast effect', () => {
  it('failed CHA save applies banished + sets concentration', async () => {
    // Force d20 = 1 — goblin's CHA save rolls 1 + -1 = 0 vs DC ~16
    // (pc int 18 → DC = 8 + prof + 4 = 16 at L9). Fails.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 9,
      int: 18,
      spells_known: ['banishment'],
      spell_slots_max: { 4: 1 },
      spell_slots_used: { 4: 0 },
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'banishment', slotLevel: 4 },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const enemyEnt = result.newState.entities?.find((e) => e.id === enemyId && e.isEnemy);
    expect(enemyEnt?.conditions).toContain('banished');
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.concentrating_on?.spellId).toBe('banishment');
    expect(after?.concentrating_on?.condition).toBe('banished');
  });

  it('successful CHA save resists banishment', async () => {
    // Force d20 = 20 — goblin's save crushes any reasonable DC.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      int: 16,
      spells_known: ['banishment'],
      spell_slots_max: { 4: 1 },
      spell_slots_used: { 4: 0 },
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'banishment', slotLevel: 4 },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const enemyEnt = result.newState.entities?.find((e) => e.id === enemyId && e.isEnemy);
    expect(enemyEnt?.conditions ?? []).not.toContain('banished');
  });
});

describe('Banishment — target filtering', () => {
  it('banished enemy is filtered out of player attack/cast targets', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      str: 14,
      spells_known: [],
      spell_slots_max: {},
      spell_slots_used: {},
    });
    const state = buildState(pc);
    // Manually mark the enemy banished.
    const banishedState: GameState = {
      ...state,
      entities: (state.entities ?? []).map((e) =>
        e.id === enemyId && e.isEnemy ? { ...e, conditions: [...e.conditions, 'banished'] } : e
      ),
    };
    const choices = generateChoices(banishedState, seed, ctx);
    const attackChoices = choices.filter((c) => c.action.type === 'attack');
    expect(attackChoices.length).toBe(0);
  });
});

describe('Banishment — concentration drop returns the enemy', () => {
  it('breakConcentration strips banished from the entity', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      concentrating_on: { spellId: 'banishment', condition: 'banished', rounds_left: 10 },
    });
    const state = buildState(pc);
    const banishedState: GameState = {
      ...state,
      entities: (state.entities ?? []).map((e) =>
        e.id === enemyId && e.isEnemy ? { ...e, conditions: [...e.conditions, 'banished'] } : e
      ),
    };
    const { st } = breakConcentration(pc, banishedState, ctx);
    const enemyEnt = st.entities?.find((e) => e.id === enemyId && e.isEnemy);
    expect(enemyEnt?.conditions ?? []).not.toContain('banished');
  });
});
