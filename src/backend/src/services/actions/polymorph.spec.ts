// 2024 PHB Polymorph (L4 transmutation). WIS save or transform target
// into a small beast (pansori MVP auto-picks Wolf at 11 HP). The new
// stats live on the entity (hp, maxHp swapped); originals stashed on
// `polymorph_state`. Concentration drop reverts. RAW excess-damage
// carryover on form-drops-to-0 not modeled — pansori MVP keeps the
// polymorphed creature dead if their new-form HP hits 0.

import type { GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { breakConcentration, takeAction } from '../gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Polymorph Test',
  ship_name: 'Polymorph Test',
  intro: '',
  seed_id: 'polymorph',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      {
        id: enemyId,
        name: 'Ogre',
        hp: 60,
        ac: 11,
        damage: '2d8+4',
        toHit: 6,
        wis: 7, // -2 mod → vulnerable to WIS save
        xp: 100,
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
        hp: 60,
        maxHp: 60,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Polymorph — cast effect', () => {
  it('failed WIS save swaps HP to 11 + applies polymorphed condition', async () => {
    // d20 = 1 → ogre save 1 + -2 = -1 vs DC 15+ → fail.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 9,
      int: 18,
      spells_known: ['polymorph'],
      spell_slots_max: { 4: 1 },
      spell_slots_used: { 4: 0 },
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'polymorph', slotLevel: 4 },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const enemyEnt = result.newState.entities?.find((e) => e.id === enemyId && e.isEnemy);
    expect(enemyEnt?.conditions).toContain('polymorphed');
    expect(enemyEnt?.hp).toBe(11); // Wolf HP
    expect(enemyEnt?.maxHp).toBe(11);
    expect(enemyEnt?.polymorph_state).toEqual({
      formName: 'Wolf',
      originalHp: 60,
      originalMaxHp: 60,
    });
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.concentrating_on?.spellId).toBe('polymorph');
  });

  it('successful WIS save resists polymorph', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 = 20
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      int: 16,
      spells_known: ['polymorph'],
      spell_slots_max: { 4: 1 },
      spell_slots_used: { 4: 0 },
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'polymorph', slotLevel: 4 },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const enemyEnt = result.newState.entities?.find((e) => e.id === enemyId && e.isEnemy);
    expect(enemyEnt?.conditions ?? []).not.toContain('polymorphed');
    expect(enemyEnt?.hp).toBe(60); // unchanged
    expect(enemyEnt?.polymorph_state).toBeUndefined();
  });
});

describe('Polymorph — concentration drop reverts', () => {
  it('drops the polymorphed condition + restores original HP', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 9,
      concentrating_on: { spellId: 'polymorph', condition: 'polymorphed', rounds_left: 100 },
    });
    const state = buildState(pc);
    // Manually mark the ogre polymorphed.
    const polyState: GameState = {
      ...state,
      entities: (state.entities ?? []).map((e) =>
        e.id === enemyId && e.isEnemy
          ? {
              ...e,
              conditions: [...e.conditions, 'polymorphed'],
              hp: 8, // chipped down from the 11 wolf HP
              maxHp: 11,
              polymorph_state: { formName: 'Wolf', originalHp: 60, originalMaxHp: 60 },
            }
          : e
      ),
    };
    const { st } = breakConcentration(pc, polyState, ctx);
    const enemyEnt = st.entities?.find((e) => e.id === enemyId && e.isEnemy);
    // Alive in new form → restore original HP/maxHp.
    expect(enemyEnt?.hp).toBe(60);
    expect(enemyEnt?.maxHp).toBe(60);
    expect(enemyEnt?.polymorph_state).toBeUndefined();
    expect(enemyEnt?.conditions).not.toContain('polymorphed');
  });

  it('keeps the polymorphed creature dead when new-form HP hit 0', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 9,
      concentrating_on: { spellId: 'polymorph', condition: 'polymorphed', rounds_left: 100 },
    });
    const state = buildState(pc);
    const polyState: GameState = {
      ...state,
      entities: (state.entities ?? []).map((e) =>
        e.id === enemyId && e.isEnemy
          ? {
              ...e,
              conditions: [...e.conditions, 'polymorphed'],
              hp: 0, // killed in new form
              maxHp: 11,
              polymorph_state: { formName: 'Wolf', originalHp: 60, originalMaxHp: 60 },
            }
          : e
      ),
    };
    const { st } = breakConcentration(pc, polyState, ctx);
    const enemyEnt = st.entities?.find((e) => e.id === enemyId && e.isEnemy);
    expect(enemyEnt?.hp).toBe(0); // stays dead — pansori MVP
    expect(enemyEnt?.maxHp).toBe(60); // maxHp restored for housekeeping
    expect(enemyEnt?.polymorph_state).toBeUndefined();
  });
});
