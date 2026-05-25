// RE-2 — Cleric Divine Intervention (L10): as a Magic action, cast a Cleric
// spell (level 1-5, non-Reaction) with no slot or Material components, 1/Long
// Rest. Greater Divine Intervention (L20, the Wish option) is deferred —
// pansori implements no Wish spell.

import type { Character, Enemy, GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from './gameEngine.js';
import { makeChar, makeState } from '../test-fixtures.js';
import { context as ctx } from '../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `${ctx.startRoomId}#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'DI',
  ship_name: 'DI',
  intro: '',
  seed_id: 'di',
  rooms: [{ id: ctx.startRoomId, name: 'S', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      {
        id: ENEMY,
        name: 'Dummy',
        hp: 80,
        ac: 5,
        damage: '1d4',
        toHit: 3,
        xp: 50,
        dex: 10,
      } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

// L10 cleric with NO level-1 slots left — so any successful Guiding Bolt
// here can only be the slot-free Divine Intervention cast.
function clericCombat(over: Partial<Character> = {}): GameState {
  const c = makeChar({
    id: 'pc-1',
    character_class: 'Cleric',
    level: 10,
    wis: 16,
    spells_known: ['guiding_bolt'],
    prepared_spells: ['guiding_bolt'],
    spell_slots_max: { 1: 2 },
    spell_slots_used: { 1: 2 }, // exhausted
    ...over,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [c],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: ENEMY, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: 40,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 80,
        maxHp: 80,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

const diCast = async (state: GameState) =>
  takeAction({
    action: {
      type: 'cast_spell',
      spellId: 'guiding_bolt',
      slotLevel: 1,
      targetEnemyId: ENEMY,
      divineIntervention: true,
    },
    history: [],
    state,
    seed,
    context: ctx,
  });

describe('Divine Intervention — free cast', () => {
  it('casts a Cleric spell with no slot and marks the 1/LR use', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // spell attack hits
    const r = await diCast(clericCombat());
    const after = r.newState.characters[0];
    const enemyHp = (r.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp;
    expect(enemyHp).toBeLessThan(80); // Guiding Bolt landed
    expect(after.spell_slots_used?.[1]).toBe(2); // no slot consumed (still exhausted)
    expect(after.class_resource_uses?.divine_intervention_used).toBe(1);
    expect(r.narrative).toMatch(/Divine Intervention/);
  });

  it('bypasses preparation — can cast an unprepared Cleric spell', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await diCast(clericCombat({ prepared_spells: [] }));
    const enemyHp = (r.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp;
    expect(enemyHp).toBeLessThan(80);
    expect(r.narrative).not.toMatch(/not prepared/);
  });
});

describe('Divine Intervention — gating', () => {
  it('requires Cleric level 10', async () => {
    const r = await diCast(clericCombat({ level: 9 }));
    expect(r.narrative).toMatch(/requires Cleric level 10/);
    expect((r.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp).toBe(80); // nothing cast
  });

  it('rejects a non-Cleric spell', async () => {
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'magic_missile', // arcane list
        slotLevel: 1,
        targetEnemyId: ENEMY,
        divineIntervention: true,
      },
      history: [],
      state: clericCombat({ spells_known: ['magic_missile'], prepared_spells: ['magic_missile'] }),
      seed,
      context: ctx,
    });
    expect(r.narrative).toMatch(/must be a Cleric spell/);
  });

  it('is once per long rest, and a long rest restores it', async () => {
    // Already spent → rejected.
    const spent = clericCombat({ class_resource_uses: { divine_intervention_used: 1 } });
    const r1 = await diCast(spent);
    expect(r1.narrative).toMatch(/spent/);

    // A long rest clears the use (rest in an enemy-free seed).
    const restSeed: Seed = { ...seed, enemies: { [ctx.startRoomId]: [] } };
    const rested = await takeAction({
      action: { type: 'long_rest' },
      history: [],
      state: {
        ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: false }),
        characters: [
          makeChar({
            id: 'pc-1',
            character_class: 'Cleric',
            level: 10,
            class_resource_uses: { divine_intervention_used: 1 },
          }),
        ],
        active_character_id: 'pc-1',
      } as unknown as GameState,
      seed: restSeed,
      context: ctx,
    });
    expect(
      rested.newState.characters[0].class_resource_uses?.divine_intervention_used
    ).toBeUndefined();
  });
});

describe('Divine Intervention — choice surface', () => {
  it('offers a slot-free cast for an eligible prepared Cleric spell at L10', () => {
    const state = clericCombat();
    const choices = generateChoices(state, seed, ctx);
    const di = choices.find((c) => c.label.includes('Divine Intervention'));
    expect(di).toBeTruthy();
    expect(di?.label).toMatch(/Guiding Bolt/);
  });

  it('drops the offer once Divine Intervention is spent', () => {
    const state = clericCombat({ class_resource_uses: { divine_intervention_used: 1 } });
    const choices = generateChoices(state, seed, ctx);
    expect(choices.find((c) => c.label.includes('Divine Intervention'))).toBeFalsy();
  });
});
