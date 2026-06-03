// 2024 PHB Polymorph (L4 transmutation). WIS save or target is
// transformed into a small beast. Per the 2024 PHB rewrite the form's
// HP is **Temporary Hit Points**, not a separate buffer:
//   - Damage absorbs into entity.temp_hp first; excess carries to hp.
//   - When temp_hp depletes the form drops automatically (condition +
//     polymorph_state cleared; the entity's real hp is unchanged).
//   - Healing can't restore temp_hp, so the 2014 heal exploit is
//     structurally blocked.
// Pansori MVP auto-picks Wolf (11 HP) as the form regardless of
// target CR.

import type { GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { breakConcentration, takeAction } from '../gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../../campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Polymorph Test',
  ship_name: 'Polymorph Test',
  intro: '',
  seed_id: 'polymorph',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
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
        hp: 60,
        maxHp: 60,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Polymorph — cast effect (2024 temp HP rule)', () => {
  it('failed WIS save grants 11 temp HP + applies polymorphed condition', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 = 1 → fail
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
    // Real HP is NOT swapped (2024 PHB rewrite — form HP is temp HP).
    expect(enemyEnt?.hp).toBe(60);
    expect(enemyEnt?.maxHp).toBe(60);
    // Wolf form pool lives on temp_hp.
    expect(enemyEnt?.temp_hp).toBe(11);
    expect(enemyEnt?.polymorph_state).toEqual({ formName: 'Wolf' });
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
    expect(enemyEnt?.temp_hp).toBeUndefined();
    expect(enemyEnt?.polymorph_state).toBeUndefined();
  });
});

describe('Polymorph — form drops when temp_hp depletes', () => {
  it('damage absorbs into temp_hp first, excess to hp; form drops at 0 temp_hp', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 9,
      str: 18,
      // Greatsword for predictable hit + damage
      inventory: [{ instance_id: 'gs-1', id: 'greatsword', name: 'Greatsword' }],
      equipment: { main_hand: 'gs-1' },
      weapon_proficiencies: ['martial'],
      skill_proficiencies: [],
    });
    const polyState: GameState = {
      ...buildState(pc),
      // Manually polymorph the ogre — 4 HP of wolf form left.
      entities: (buildState(pc).entities ?? []).map((e) =>
        e.id === enemyId && e.isEnemy
          ? {
              ...e,
              hp: 60,
              maxHp: 60,
              temp_hp: 4,
              polymorph_state: { formName: 'Wolf' },
              conditions: [...e.conditions, 'polymorphed'],
            }
          : e
      ),
    };
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: polyState,
      seed,
      context: ctx,
    });
    const enemyEnt = result.newState.entities?.find((e) => e.id === enemyId && e.isEnemy);
    // 4 HP of temp_hp soaks first. Greatsword damage at L9 is 2d6+4
    // (avg ~11) → temp_hp depletes, excess flows to hp. So polymorph
    // ends and the ogre is back in its real form, slightly chipped.
    expect(enemyEnt?.temp_hp).toBeUndefined(); // form drops
    expect(enemyEnt?.polymorph_state).toBeUndefined();
    expect(enemyEnt?.conditions ?? []).not.toContain('polymorphed');
    // Some excess damage applied to the real HP — at minimum some
    // chipping (could vary by damage roll), at most a few points.
    expect(enemyEnt?.hp ?? 60).toBeLessThan(60);
    expect(enemyEnt?.hp ?? 0).toBeGreaterThan(0); // ogre survives the spillover
  });
});

describe('Polymorph — concentration drop reverts', () => {
  it('drops polymorphed condition + clears temp_hp + polymorph_state', () => {
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
              temp_hp: 8, // chipped down from the 11 wolf HP
              polymorph_state: { formName: 'Wolf' },
            }
          : e
      ),
    };
    const { st } = breakConcentration(pc, polyState, ctx);
    const enemyEnt = st.entities?.find((e) => e.id === enemyId && e.isEnemy);
    // Real HP unchanged (was never swapped).
    expect(enemyEnt?.hp).toBe(60);
    expect(enemyEnt?.maxHp).toBe(60);
    // Temp HP buffer + state cleared.
    expect(enemyEnt?.temp_hp).toBeUndefined();
    expect(enemyEnt?.polymorph_state).toBeUndefined();
    expect(enemyEnt?.conditions).not.toContain('polymorphed');
  });
});
