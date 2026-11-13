// SRD 5.2.1 Druid features:
// - Wild Shape "No Spellcasting" (Beast Spells at L18 lifts it, except for a
//   costly / consumed Material component).
// - Primal Order (L1): Magician (extra Druid cantrip, +WIS to Arcana/Nature) or
//   Warden (Martial weapons, Medium armor).
// - Elemental Fury (L7): Potent Spellcasting (+WIS to Druid cantrip damage;
//   L15 +300 ft range) or Primal Strike (+1d8 elemental once per turn; L15 2d8).
// - Circle of the Land Nature's Ward (L10): Poisoned immunity + the land's
//   damage Resistance.

import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseSandboxSeed, makeChar, makeState } from '../../test-fixtures.js';
import { conditionImmunitiesFor, generateChoices, takeAction } from '../../services/gameEngine.js';
import {
  druidCantripRangeBonus,
  magicianCheckBonus,
  naturesWardResistance,
  primalStrikeDie,
  primalStrikeType,
  wildShapeBlocksCasting,
} from '../../services/druidFeatures.js';
import { context as ctx } from '../fixtures/testContext.js';
import { evergreenWildShape } from '../../services/actions/classFeature/druid.js';
import { potentSpellcastingBonus } from '../../services/multiclass.js';

afterEach(() => vi.restoreAllMocks());

const druid = (level: number, over: Partial<Character> = {}) =>
  makeChar({
    id: 'pc-1',
    character_class: 'Druid',
    level,
    class_levels: { druid: level },
    wis: 16,
    spells_known: ['cure_wounds', 'revivify'],
    prepared_spells: ['cure_wounds', 'revivify'],
    spell_slots_max: { 1: 4, 3: 2 },
    spell_slots_used: {},
    gold: 1000,
    ...over,
  });

const outOfCombat = (char: Character): GameState => ({
  ...makeState({ id: 'pc-1' }),
  characters: [char],
  active_character_id: 'pc-1',
});

const act = (state: GameState, action: Record<string, unknown>, s: Seed = baseSandboxSeed) =>
  takeAction({ action: action as never, history: [], state, seed: s, context: ctx });

describe('Wild Shape: no spellcasting', () => {
  const shaped = (level: number) => druid(level, { conditions: ['wild_shaped'] });

  it('blocks casting in a beast form, and hides the spells', async () => {
    const r = await act(outOfCombat(shaped(5)), {
      type: 'cast_spell',
      spellId: 'cure_wounds',
      slotLevel: 1,
    });
    expect(r.narrative).toMatch(/can't cast spells while in Wild Shape/);
    expect(r.newState.characters[0].spell_slots_used?.[1] ?? 0).toBe(0);
    const casts = generateChoices(outOfCombat(shaped(5)), baseSandboxSeed, ctx).filter(
      (c) => (c.action as { type: string }).type === 'cast_spell'
    );
    expect(casts).toEqual([]);
  });

  it('Beast Spells (L18) allows it, except for a costly Material component', () => {
    expect(wildShapeBlocksCasting(shaped(18), { materialCost: 0 })).toBe(false);
    expect(wildShapeBlocksCasting(shaped(18), { materialCost: 300 })).toBe(true); // Revivify
    expect(wildShapeBlocksCasting(druid(5), {})).toBe(false); // not shaped
    // A spell-driven shapeshift (Shapechange) isn't Wild Shape.
    expect(
      wildShapeBlocksCasting({ ...shaped(5), shapeshift_spell: 'shapechange' } as Character, {})
    ).toBe(false);
  });
});

describe('Primal Order', () => {
  it('Warden trains Martial weapons and Medium armor', async () => {
    const r = await act(outOfCombat(druid(1)), { type: 'choose_primal_order', option: 'warden' });
    const pc = r.newState.characters[0];
    expect(pc.primal_order).toBe('warden');
    expect(pc.weapon_proficiencies).toContain('martial');
    expect(pc.armor_proficiencies).toContain('medium');
  });

  it('Magician learns a Druid cantrip and adds WIS to Arcana / Nature', async () => {
    const r = await act(outOfCombat(druid(1)), {
      type: 'choose_primal_order',
      option: 'magician',
      cantrip: 'produce_flame',
    });
    const pc = r.newState.characters[0];
    expect(pc.primal_order).toBe('magician');
    expect(pc.spells_known).toContain('produce_flame');
    expect(magicianCheckBonus(pc, 'nature')).toBe(3);
    expect(magicianCheckBonus(pc, 'religion')).toBe(0);
  });

  it('Magician refuses a cantrip that isn’t a Druid cantrip', async () => {
    const r = await act(outOfCombat(druid(1)), {
      type: 'choose_primal_order',
      option: 'magician',
      cantrip: 'fire_bolt',
    });
    expect(r.newState.characters[0].primal_order).toBeUndefined();
  });

  it('is offered once, with a cantrip picker for Magician', () => {
    const choices = generateChoices(outOfCombat(druid(1)), baseSandboxSeed, ctx);
    const magician = choices.find((c) => c.label.startsWith('Primal Order: Magician'));
    expect(magician?.pickOption?.param).toBe('cantrip');
    const chosen = generateChoices(
      outOfCombat(druid(1, { primal_order: 'warden' })),
      baseSandboxSeed,
      ctx
    );
    expect(chosen.some((c) => c.label.startsWith('Primal Order'))).toBe(false);
  });
});

describe('Elemental Fury', () => {
  it('Potent Spellcasting adds WIS to Druid cantrips only (and still serves Clerics)', () => {
    const d = druid(7, { elemental_fury: 'potent_spellcasting' });
    expect(potentSpellcastingBonus(d, { level: 0, spellList: ['primal'] })).toBe(3);
    expect(potentSpellcastingBonus(d, { level: 0, spellList: ['arcane'] })).toBe(0);
    expect(potentSpellcastingBonus(d, { level: 1, spellList: ['primal'] })).toBe(0);
    expect(
      potentSpellcastingBonus(druid(6, { elemental_fury: 'potent_spellcasting' }), {
        level: 0,
        spellList: ['primal'],
      })
    ).toBe(0);
    const cleric = makeChar({
      character_class: 'Cleric',
      level: 7,
      class_levels: { cleric: 7 },
      wis: 16,
      blessed_strikes: 'potent_spellcasting',
    });
    expect(potentSpellcastingBonus(cleric, { level: 0 })).toBe(3);
  });

  it('Improved Potent Spellcasting (L15) adds 300 ft to a Druid cantrip of 10+ ft', () => {
    const d15 = druid(15, { elemental_fury: 'potent_spellcasting' });
    expect(druidCantripRangeBonus(d15, { level: 0, rangeFt: 60, spellList: ['primal'] })).toBe(300);
    expect(druidCantripRangeBonus(d15, { level: 0, rangeFt: 5, spellList: ['primal'] })).toBe(0);
    expect(
      druidCantripRangeBonus(druid(14, { elemental_fury: 'potent_spellcasting' }), {
        level: 0,
        rangeFt: 60,
        spellList: ['primal'],
      })
    ).toBe(0);
  });

  it('Primal Strike is 1d8, 2d8 from L15, and picks a type the target doesn’t resist', () => {
    expect(primalStrikeDie(druid(7, { elemental_fury: 'primal_strike' }))).toBe('1d8');
    expect(primalStrikeDie(druid(15, { elemental_fury: 'primal_strike' }))).toBe('2d8');
    expect(primalStrikeDie(druid(7))).toBeNull();
    expect(primalStrikeType({ resistances: ['cold'] })).toBe('fire');
    expect(primalStrikeType({ vulnerabilities: ['thunder'] })).toBe('thunder');
    expect(primalStrikeType({ immunities: ['cold', 'fire'], resistances: ['lightning'] })).toBe(
      'thunder'
    );
  });

  it('Primal Strike lands on a weapon hit and is marked used for the turn', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const ENEMY = 'entry_hall#0';
    const s = {
      context_id: ctx.id,
      world_name: 'D',
      ship_name: 'D',
      intro: '',
      seed_id: 'd',
      rooms: [{ id: 'entry_hall', name: 'S', desc: '' }],
      enemies: {
        entry_hall: [
          { id: ENEMY, name: 'Brute', hp: 300, ac: 10, damage: '1d4', toHit: 3, xp: 50 } as Enemy,
        ],
      },
      loot: {},
      npcs: {},
    } as unknown as Seed;
    // One attack (a Druid has no Extra Attack): the rider lands and is marked used.
    const pc = druid(7, {
      elemental_fury: 'primal_strike',
      equipment: { main_hand: 'staff-1' },
      inventory: [{ instance_id: 'staff-1', id: 'quarterstaff', name: 'Quarterstaff' }],
    });
    const st = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [pc],
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
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
        {
          id: ENEMY,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 300,
          maxHp: 300,
          conditions: [],
          condition_durations: {},
        },
      ],
    } as unknown as GameState;
    const first = await act(st, { type: 'attack', targetEnemyId: ENEMY }, s);
    expect(first.narrative).toMatch(/Primal Strike 1d8/);
    expect(first.newState.characters[0].turn_actions.primal_strike_used).toBe(true);
  });
});

describe("Nature's Ward", () => {
  it('Land Druid 10: Poisoned immunity and the land’s Resistance', () => {
    const land = druid(10, { subclass: 'land', circle_land: 'arid' });
    expect(conditionImmunitiesFor(land, outOfCombat(land)).has('poisoned')).toBe(true);
    expect(naturesWardResistance(land)).toBe('fire');
    expect(naturesWardResistance({ ...land, circle_land: 'polar' } as Character)).toBe('cold');
    const low = druid(9, { subclass: 'land', circle_land: 'arid' });
    expect(naturesWardResistance(low)).toBeNull();
    expect(conditionImmunitiesFor(low, outOfCombat(low)).has('poisoned')).toBe(false);
  });
});

describe('Wild Shape economy', () => {
  const feature = (st: GameState, featureId: string, option?: string) =>
    act(st, { type: 'use_class_feature', featureId, option });
  const uses = (st: GameState) => st.characters[0].class_resource_uses?.wild_shape;

  it('Wild Shape is a Bonus Action in combat and grants temp HP = Druid level', async () => {
    const st = {
      ...outOfCombat(druid(4, { class_resource_uses: { wild_shape: 2 } })),
      combat_active: true,
    } as GameState;
    const r = await feature(st, 'wild_shape');
    const pc = r.newState.characters[0];
    expect(pc.conditions).toContain('wild_shaped');
    expect(pc.temp_hp).toBe(4);
    expect(pc.turn_actions.bonus_action_used).toBe(true);
    expect(pc.turn_actions.action_used).toBeFalsy();
  });

  it('Wild Companion: a Wild Shape use buys a fey familiar that leaves on a Long Rest', async () => {
    const st = outOfCombat(druid(2, { class_resource_uses: { wild_shape: 2 } }));
    const r = await feature(st, 'wild_companion_ws', 'Cat');
    expect(uses(r.newState)).toBe(1);
    const fam = r.newState.summoned_allies ?? [];
    expect(fam.map((a) => a.name)).toEqual(['Cat']);
    expect(fam[0].wild_companion).toBe(true);
    const rested = await act(r.newState, { type: 'long_rest' });
    expect(rested.newState.summoned_allies ?? []).toEqual([]);
  });

  it('Wild Companion can spend a spell slot instead', async () => {
    const r = await feature(outOfCombat(druid(2)), 'wild_companion_slot', 'Owl');
    expect(r.newState.characters[0].spell_slots_used?.[1]).toBe(1);
    expect((r.newState.summoned_allies ?? []).map((a) => a.name)).toEqual(['Owl']);
  });

  it('Wild Resurgence: a slot buys a use when none are left', async () => {
    const empty = outOfCombat(druid(5, { class_resource_uses: { wild_shape: 0 } }));
    const r = await feature(empty, 'wild_resurgence_ws');
    expect(uses(r.newState)).toBe(1);
    expect(r.newState.characters[0].spell_slots_used?.[1]).toBe(1);
    const notEmpty = await feature(
      outOfCombat(druid(5, { class_resource_uses: { wild_shape: 1 } })),
      'wild_resurgence_ws'
    );
    expect(notEmpty.narrative).toMatch(/still have a Wild Shape use/);
  });

  it('Wild Resurgence: a use buys a level-1 slot, once per Long Rest', async () => {
    const st = outOfCombat(
      druid(5, { class_resource_uses: { wild_shape: 2 }, spell_slots_used: { 1: 2 } })
    );
    const r = await feature(st, 'wild_resurgence_slot');
    expect(r.newState.characters[0].spell_slots_used?.[1]).toBe(1);
    expect(uses(r.newState)).toBe(1);
    const again = await feature(r.newState, 'wild_resurgence_slot');
    expect(again.newState.characters[0].spell_slots_used?.[1]).toBe(1);
  });

  it('Archdruid: Nature Magician turns 2 uses into a level-4 slot; Evergreen refills one', async () => {
    const st = outOfCombat(
      druid(20, {
        class_resource_uses: { wild_shape: 4 },
        spell_slots_max: { 4: 3 },
        spell_slots_used: { 4: 2 },
      })
    );
    const r = await feature(st, 'nature_magician', '2');
    expect(r.newState.characters[0].spell_slots_used?.[4]).toBe(1);
    expect(uses(r.newState)).toBe(2);
    const again = await feature(r.newState, 'nature_magician', '1');
    expect(again.narrative).toMatch(/after a Long Rest/);

    const drained = druid(20, { class_resource_uses: { wild_shape: 0 } });
    expect(evergreenWildShape(drained).class_resource_uses?.wild_shape).toBe(1);
    const full = druid(20, { class_resource_uses: { wild_shape: 2 } });
    expect(evergreenWildShape(full).class_resource_uses?.wild_shape).toBe(2);
    expect(
      evergreenWildShape(druid(19, { class_resource_uses: { wild_shape: 0 } })).class_resource_uses
        ?.wild_shape
    ).toBe(0);
  });
});
