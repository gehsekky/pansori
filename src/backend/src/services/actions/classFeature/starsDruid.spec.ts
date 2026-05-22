// Stars Druid (2024 PHB) — L3 Starry Form. Wild Shape variant that
// keeps the druid's stats and grants a constellation-specific rider:
//   - Archer: ranged spell attack (1d8 + WIS radiant).
//   - Chalice: heal spells add +1d8 to the healed amount.
//   - Dragon: concentration saves treat a sub-10 d20 as a 10.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkConcentration, generateChoices, takeAction } from '../../gameEngine.js';
import { makeChar, makeState } from '../../../test-fixtures.js';
import type { Seed } from '../../../types.js';
import { context as ctx } from '../../../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Stars Druid Test',
  ship_name: 'Stars Druid Test',
  intro: '',
  seed_id: 'stars-druid',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      { id: enemyId, name: 'Goblin', hp: 30, ac: 10, damage: '1d6', toHit: 3, xp: 20 },
    ],
  },
  loot: {},
  npcs: {},
};

function buildState(pc: ReturnType<typeof makeChar>, ally?: ReturnType<typeof makeChar>) {
  const chars = ally ? [pc, ally] : [pc];
  return {
    ...makeState({ id: pc.id }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: chars,
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
      ...(ally
        ? [
            {
              id: ally.id,
              isEnemy: false,
              pos: { x: 3, y: 5 },
              hp: ally.hp,
              maxHp: ally.max_hp,
              conditions: [],
              condition_durations: {},
            },
          ]
        : []),
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

describe('Stars Druid — Starry Form activation', () => {
  it('surfaces the three constellation choices for a Stars Druid L3+', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Druid',
      subclass: 'stars',
      level: 3,
      class_resource_uses: { wild_shape: 2 },
    });
    const state = buildState(pc);
    const choices = generateChoices(state, seed, ctx);
    const ids = choices
      .filter((c) => c.action.type === 'use_class_feature')
      .map((c) => (c.action as { featureId: string }).featureId);
    expect(ids).toContain('starry_form_archer');
    expect(ids).toContain('starry_form_chalice');
    expect(ids).toContain('starry_form_dragon');
  });

  it('does NOT surface for a Moon Druid', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Druid',
      subclass: 'moon',
      level: 3,
      class_resource_uses: { wild_shape: 2 },
    });
    const state = buildState(pc);
    const choices = generateChoices(state, seed, ctx);
    const ids = choices
      .filter((c) => c.action.type === 'use_class_feature')
      .map((c) => (c.action as { featureId: string }).featureId);
    expect(ids).not.toContain('starry_form_archer');
  });

  it('activating Archer consumes a Wild Shape charge + bonus action', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Druid',
      subclass: 'stars',
      level: 3,
      class_resource_uses: { wild_shape: 2 },
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'starry_form_archer' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.starry_form_constellation).toBe('archer');
    expect(after?.class_resource_uses?.wild_shape).toBe(1);
    expect(after?.turn_actions.bonus_action_used).toBe(true);
    expect(result.narrative).toMatch(/Archer/);
  });

  it('rejects activation with no Wild Shape uses', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Druid',
      subclass: 'stars',
      level: 3,
      class_resource_uses: { wild_shape: 0 },
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'starry_form_archer' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/No Wild Shape uses/);
  });

  it('long rest clears the constellation', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Druid',
      subclass: 'stars',
      level: 3,
      starry_form_constellation: 'archer',
    });
    // Resting requires no living enemies in the current room. Mark the
    // goblin as killed so canRestInRoom passes.
    const state = {
      ...buildState(pc),
      combat_active: false,
      enemies_killed: [enemyId],
    };
    const result = await takeAction({
      action: { type: 'long_rest' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.starry_form_constellation).toBeUndefined();
  });
});

describe('Stars Druid — Archer attack', () => {
  it('surfaces the attack choice while Archer is active', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Druid',
      subclass: 'stars',
      level: 3,
      starry_form_constellation: 'archer',
    });
    const state = buildState(pc);
    const choices = generateChoices(state, seed, ctx);
    const atk = choices.find(
      (c) => c.action.type === 'use_class_feature' && c.action.featureId === 'starry_form_attack'
    );
    expect(atk).toBeDefined();
  });

  it('does NOT surface the attack choice with Chalice active', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Druid',
      subclass: 'stars',
      level: 3,
      starry_form_constellation: 'chalice',
    });
    const state = buildState(pc);
    const choices = generateChoices(state, seed, ctx);
    const atk = choices.find(
      (c) => c.action.type === 'use_class_feature' && c.action.featureId === 'starry_form_attack'
    );
    expect(atk).toBeUndefined();
  });

  it('hit applies 1d8 + WIS radiant damage to the target', async () => {
    // Force d20=11 → hits, dmg=5 → 5+wisMod radiant.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Druid',
      subclass: 'stars',
      level: 3,
      wis: 16,
      starry_form_constellation: 'archer',
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'starry_form_attack' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const enemyEnt = result.newState.entities?.find((e) => e.id === enemyId && e.isEnemy);
    // Original enemy HP was 30; damage reduces it. (Action_used isn't
    // asserted because the engine advances initiative on a combat
    // action; the wraparound back to this PC fires FRESH_TURN which
    // resets the flag — same pattern as other combat-action specs.)
    expect(enemyEnt?.hp).toBeLessThan(30);
  });

  it('rejects starry_form_attack with no Archer active', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Druid',
      subclass: 'stars',
      level: 3,
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'starry_form_attack' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Archer constellation/);
  });
});

describe('Stars Druid — Chalice heal bonus', () => {
  it('adds +1d8 to the heal when Chalice is active', async () => {
    // Mock all dice rolls to deterministic medium values.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Druid',
      subclass: 'stars',
      level: 5,
      wis: 16,
      starry_form_constellation: 'chalice',
      spells_known: ['cure_wounds'],
      spell_slots_max: { 1: 4 },
      spell_slots_used: { 1: 0 },
      prepared_spells: ['cure_wounds'],
    });
    const ally = makeChar({
      id: 'ally-1',
      character_class: 'Fighter',
      level: 5,
      hp: 5,
      max_hp: 40,
    });
    const state = buildState(pc, ally);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'cure_wounds', slotLevel: 1 },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Chalice/);
    const afterAlly = result.newState.characters.find((c) => c.id === 'ally-1');
    // Ally healed above their starting 5 HP — bonus included.
    expect(afterAlly?.hp ?? 0).toBeGreaterThan(5);
  });

  it('omits the Chalice bonus when no constellation active', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Druid',
      subclass: 'stars',
      level: 5,
      wis: 16,
      spells_known: ['cure_wounds'],
      spell_slots_max: { 1: 4 },
      spell_slots_used: { 1: 0 },
      prepared_spells: ['cure_wounds'],
    });
    const ally = makeChar({
      id: 'ally-1',
      character_class: 'Fighter',
      level: 5,
      hp: 5,
      max_hp: 40,
    });
    const state = buildState(pc, ally);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'cure_wounds', slotLevel: 1 },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Chalice/);
  });
});

describe('Stars Druid — Dragon concentration floor', () => {
  it('treats a sub-10 d20 concentration save as a 10', () => {
    // Mock d20 to roll a 3 — without floor, save=3+con; with floor, save=10+con.
    let callCount = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      callCount++;
      // First call drives d(20) — return a value that yields 3.
      // d(n) = Math.floor(Math.random()*n) + 1; for n=20, value 0.1 → 3.
      return 0.1; // → d20 = 3
    });
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Druid',
      subclass: 'stars',
      level: 3,
      con: 14, // +2 mod
      starry_form_constellation: 'dragon',
      concentrating_on: { spellId: 'entangle', rounds_left: 10 },
    });
    const state = buildState(pc);
    const result = checkConcentration(pc, state, 8, ctx); // DC = max(10, 4) = 10
    // Floored d20 (10) + con (2) = 12 vs DC 10 → hold.
    expect(result.note).toMatch(/Concentration hold/);
    expect(result.note).toMatch(/Dragon constellation floor/);
    expect(callCount).toBeGreaterThan(0);
  });

  it('does NOT apply the floor when constellation is not Dragon', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // d20 = 3
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Druid',
      subclass: 'stars',
      level: 3,
      con: 14,
      starry_form_constellation: 'chalice',
      concentrating_on: { spellId: 'entangle', rounds_left: 10 },
    });
    const state = buildState(pc);
    const result = checkConcentration(pc, state, 8, ctx);
    // No floor → 3 + 2 = 5 vs DC 10 → break.
    expect(result.note).toMatch(/Concentration broken/);
    expect(result.note).not.toMatch(/Dragon/);
  });
});
