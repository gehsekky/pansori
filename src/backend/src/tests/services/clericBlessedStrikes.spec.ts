// RE-2 — Cleric Blessed Strikes (L7), Improved at L14: choose Divine Strike
// (+1d8 radiant on a weapon hit once/turn, 2d8 at L14) or Potent Spellcasting
// (+WIS to Cleric cantrip damage).

import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { divineStrikeDie, potentSpellcastingBonus } from '../../services/multiclass.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { ActionContext } from '../../services/actions/types.js';
import { context as ctx } from '../fixtures/testContext.js';
import { handleChooseBlessedStrikes } from '../../services/actions/meta.js';
import { pcActor } from '../../services/actions/actor.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const cleric = (over: Partial<Character> = {}) =>
  makeChar({ character_class: 'Cleric', level: 7, wis: 16, ...over });

describe('Blessed Strikes helpers', () => {
  it('divineStrikeDie: 1d8 at L7, 2d8 at L14, null otherwise', () => {
    expect(divineStrikeDie(cleric({ blessed_strikes: 'divine_strike' }))).toBe('1d8');
    expect(divineStrikeDie(cleric({ level: 14, blessed_strikes: 'divine_strike' }))).toBe('2d8');
    expect(divineStrikeDie(cleric({ level: 6, blessed_strikes: 'divine_strike' }))).toBeNull();
    expect(divineStrikeDie(cleric({ blessed_strikes: 'potent_spellcasting' }))).toBeNull();
  });

  it('potentSpellcastingBonus: WIS on a cleric cantrip when chosen', () => {
    const c = cleric({ blessed_strikes: 'potent_spellcasting' }); // WIS 16 → +3
    expect(potentSpellcastingBonus(c, { level: 0 })).toBe(3);
    expect(potentSpellcastingBonus(c, { level: 1 })).toBe(0); // not a cantrip
    expect(
      potentSpellcastingBonus(cleric({ blessed_strikes: 'divine_strike' }), { level: 0 })
    ).toBe(0);
  });
});

function featCtx(char: Character): ActionContext {
  return {
    actor: pcActor(char, 0),
    context: { classFeatures: {} },
    narrative: '',
  } as unknown as ActionContext;
}
const pcChar = (c: ActionContext) => {
  if (c.actor.kind !== 'pc') throw new Error('expected pc actor');
  return c.actor.char;
};

describe('choose_blessed_strikes', () => {
  it('a Cleric L7 picks an option', () => {
    const c = featCtx(cleric());
    handleChooseBlessedStrikes(c, { type: 'choose_blessed_strikes', option: 'divine_strike' });
    expect(pcChar(c).blessed_strikes).toBe('divine_strike');
  });
  it('requires Cleric L7', () => {
    const c = featCtx(cleric({ level: 6 }));
    handleChooseBlessedStrikes(c, { type: 'choose_blessed_strikes', option: 'divine_strike' });
    expect(pcChar(c).blessed_strikes).toBeUndefined();
  });
});

const ENEMY = `entry_hall#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'BS',
  ship_name: 'BS',
  intro: '',
  seed_id: 'bs',
  rooms: [{ id: 'entry_hall', name: 'S', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: ENEMY,
        name: 'Dummy',
        hp: 80,
        ac: 10,
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

function clericCombat(over: Partial<Character> = {}): GameState {
  const c = cleric({
    id: 'pc-1',
    str: 16,
    prepared_spells: ['sacred_flame'],
    spells_known: ['sacred_flame'],
    spell_slots_max: { 1: 4 },
    spell_slots_used: {},
    equipment: { main_hand: 'm-1' },
    inventory: [{ instance_id: 'm-1', id: 'mace', name: 'Mace' }],
    weapon_proficiencies: ['simple', 'martial'],
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
        hp: 80,
        maxHp: 80,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

describe('Divine Strike — extra radiant on a weapon hit (once/turn)', () => {
  it('a L7 Cleric adds Divine Strike radiant on a weapon hit', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // hits
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: clericCombat({ blessed_strikes: 'divine_strike' }),
      seed,
      context: ctx,
    });
    expect(r.narrative).toMatch(/Divine Strike/);
    expect(r.newState.characters[0].turn_actions.divine_strike_used).toBe(true);
  });
});

describe('Potent Spellcasting — +WIS to Cleric cantrip damage', () => {
  it('Sacred Flame deals +WIS with Potent Spellcasting', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // enemy fails the DEX save; dice fixed
    const withPotent = await takeAction({
      action: { type: 'cast_spell', spellId: 'sacred_flame', slotLevel: 0, targetEnemyId: ENEMY },
      history: [],
      state: clericCombat({ blessed_strikes: 'potent_spellcasting' }),
      seed,
      context: ctx,
    });
    const without = await takeAction({
      action: { type: 'cast_spell', spellId: 'sacred_flame', slotLevel: 0, targetEnemyId: ENEMY },
      history: [],
      state: clericCombat(),
      seed,
      context: ctx,
    });
    const hpWith = (withPotent.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp;
    const hpWithout = (without.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp;
    expect(hpWithout - hpWith).toBe(3); // +WIS mod
  });
});

describe('Improved Blessed Strikes (L14) — Potent Spellcasting temp HP', () => {
  it('a damaging Cleric cantrip grants 2×WIS temporary HP to the caster', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // enemy fails the DEX save
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'sacred_flame', slotLevel: 0, targetEnemyId: ENEMY },
      history: [],
      state: clericCombat({ level: 14, blessed_strikes: 'potent_spellcasting' }),
      seed,
      context: ctx,
    });
    // The enemy turn can chip the temp HP, so assert the granted amount from
    // the (deterministic) cast narrative: 2 × WIS mod (+3) = 6.
    expect(r.narrative).toMatch(/gains 6 temporary HP/);
    expect(r.newState.characters[0].temp_hp ?? 0).toBeGreaterThan(0);
  });

  it('does not grant temp HP below L14', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'sacred_flame', slotLevel: 0, targetEnemyId: ENEMY },
      history: [],
      state: clericCombat({ level: 7, blessed_strikes: 'potent_spellcasting' }),
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].temp_hp ?? 0).toBe(0);
  });
});
