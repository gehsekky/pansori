// RE-2 — Warlock base features: Magical Cunning (L2) — a bonus action to regain
// expended Pact Magic slots (half, round up), 1/long rest. Eldritch Master
// (L20) upgrades it to regain ALL expended Pact Magic slots.

import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { ActionContext } from '../../services/actions/types.js';
import { context as ctx } from '../fixtures/testContext.js';
import { handleChooseMysticArcanum } from '../../services/actions/meta.js';
import { pcActor } from '../../services/actions/actor.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'WL',
  ship_name: 'WL',
  intro: '',
  seed_id: 'wl',
  rooms: [{ id: 'entry_hall', name: 'S', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: ENEMY,
        name: 'Cultist',
        hp: 40,
        ac: 12,
        damage: '1d6',
        toHit: 3,
        xp: 30,
      } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function warlockCombat(over: Partial<Character> = {}): GameState {
  const c = makeChar({
    id: 'pc-1',
    character_class: 'Warlock',
    subclass: 'fiend',
    level: 5,
    cha: 16,
    hp: 40,
    max_hp: 40,
    spell_slots_max: { 3: 2 },
    spell_slots_used: { 3: 2 }, // both pact slots expended
    ...over,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
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
        hp: 40,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

const useMC = async (state: GameState) =>
  takeAction({
    action: { type: 'use_class_feature', featureId: 'magical_cunning' },
    history: [],
    state,
    seed,
    context: ctx,
  });

describe('Magical Cunning (L2)', () => {
  it('regains half (round up) of the expended Pact Magic slots', async () => {
    const r = await useMC(warlockCombat()); // 2 expended, max 2 → regain ceil(2/2) = 1
    expect(r.newState.characters[0].spell_slots_used?.[3]).toBe(1);
    expect(r.newState.characters[0].class_resource_uses?.magical_cunning_used).toBe(1);
    expect(r.narrative).toMatch(/Magical Cunning/);
  });

  it('requires a Warlock of level 2', async () => {
    const r = await useMC(warlockCombat({ level: 1 }));
    expect(r.newState.characters[0].spell_slots_used?.[3]).toBe(2); // unchanged
    expect(r.narrative).toMatch(/requires a Warlock of level 2/);
  });

  it('is spent once per long rest', async () => {
    const r = await useMC(warlockCombat({ class_resource_uses: { magical_cunning_used: 1 } }));
    expect(r.newState.characters[0].spell_slots_used?.[3]).toBe(2); // no regain
    expect(r.narrative).toMatch(/spent/);
  });
});

describe('Eldritch Master (L20)', () => {
  it('regains ALL expended Pact Magic slots', async () => {
    const r = await useMC(
      warlockCombat({ level: 20, spell_slots_max: { 5: 4 }, spell_slots_used: { 5: 4 } })
    );
    expect(r.newState.characters[0].spell_slots_used?.[5]).toBe(0); // all four back
    expect(r.narrative).toMatch(/Eldritch Master|all of them/);
  });
});

function arcanumCtx(char: Character): ActionContext {
  return { actor: pcActor(char, 0), context: ctx, narrative: '' } as unknown as ActionContext;
}
const arcChar = (c: ActionContext) => {
  if (c.actor.kind !== 'pc') throw new Error('expected pc actor');
  return c.actor.char;
};

describe('Mystic Arcanum (L11/13/15/17)', () => {
  it('designates a level-6 spell as the L11 arcanum', () => {
    const c = arcanumCtx(makeChar({ character_class: 'Warlock', subclass: 'fiend', level: 11 }));
    handleChooseMysticArcanum(c, { type: 'choose_mystic_arcanum', spellId: 'heal' });
    expect(arcChar(c).mystic_arcanum?.[6]).toBe('heal');
  });

  it('a level-7 arcanum requires Warlock L13', () => {
    const c = arcanumCtx(makeChar({ character_class: 'Warlock', subclass: 'fiend', level: 11 }));
    handleChooseMysticArcanum(c, { type: 'choose_mystic_arcanum', spellId: 'resurrection' });
    expect(arcChar(c).mystic_arcanum?.[7]).toBeUndefined();
  });

  it('casts the designated arcanum with no slot, once per long rest', async () => {
    const state = warlockCombat({
      level: 11,
      hp: 10,
      max_hp: 90,
      spell_slots_max: {},
      spell_slots_used: {},
      mystic_arcanum: { 6: 'heal' },
    });
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'heal', slotLevel: 6, mysticArcanum: true },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = r.newState.characters[0];
    expect(after.hp).toBeGreaterThan(10); // Heal landed (self)
    expect(after.class_resource_uses?.mystic_arcanum_6).toBe(1); // tier spent
    expect(r.narrative).toMatch(/Mystic Arcanum/);
  });
});
