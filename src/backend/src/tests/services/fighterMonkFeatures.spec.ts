// SRD 5.2.1 class features + Armor Class:
// - Unarmored Defense (Barbarian L1: 10 + DEX + CON, Shield allowed; Monk L1:
//   10 + DEX + WIS, no Shield) and Draconic Resilience's AC (Draconic Sorcery
//   L3: 10 + DEX + CHA) — one AC calculation at a time, the best applies.
// - Fighter Tactical Mind (L2) and Tactical Shift (L5).
// - Monk Unarmored Movement (L2), Slow Fall (L4), Acrobatic Movement (L9),
//   Heightened Focus (L10).

import {
  CORRIDOR_ID,
  makeChar,
  makeState,
  mockRandom,
  seedWithEnemy,
} from '../../test-fixtures.js';
import type { Character, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyLevelUpForClass,
  effectiveSpeed,
  takeAction,
  withDerivedSpeeds,
} from '../../services/gameEngine.js';
import {
  applyTacticalMindTo,
  secondWindMax,
  tacticalMindRescue,
  tacticalShiftFeet,
} from '../../services/fighterFeatures.js';
import { characterAc, unarmoredDefenseBonus } from '../../services/armorClass.js';
import {
  hasAcrobaticMovement,
  martialArtsDieSides,
  slowFallReduction,
  unarmoredMovementBonus,
} from '../../services/monkFeatures.js';
import { applyFallingDamage } from '../../services/damage.js';
import { context as ctx } from '../fixtures/testContext.js';

afterEach(() => vi.restoreAllMocks());

const loot = ctx.lootTable;
const GOBLIN = `${CORRIDOR_ID}#0`;

const withArmor = (over: Partial<Character> = {}): Partial<Character> => ({
  inventory: [{ instance_id: 'armor-1', id: 'chain_mail', name: 'Chain Mail' }],
  equipment: { armor: 'armor-1' },
  ...over,
});
const withShield = (over: Partial<Character> = {}): Partial<Character> => ({
  inventory: [{ instance_id: 'shield-1', id: 'shield', name: 'Shield' }],
  equipment: { shield: 'shield-1' },
  ...over,
});

const monk = (level: number, over: Partial<Character> = {}) =>
  makeChar({
    id: 'pc-1',
    character_class: 'Monk',
    level,
    class_levels: { monk: level },
    dex: 14,
    wis: 16,
    ...over,
  });
const fighter = (level: number, over: Partial<Character> = {}) =>
  makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level,
    class_levels: { fighter: level },
    hp: 20,
    max_hp: 40,
    ...over,
  });

/** A 1v1 grid fight: the PC at `pcPos`, a sturdy goblin at `enemyPos`. */
function gridFight(char: Character, pcPos = { x: 2, y: 2 }, enemyPos = { x: 3, y: 2 }): GameState {
  return {
    ...makeState({ id: char.id }),
    characters: [char],
    active_character_id: char.id,
    current_room: CORRIDOR_ID,
    visited_rooms: ['entry_hall', CORRIDOR_ID],
    combat_active: true,
    initiative_order: [
      { id: char.id, roll: 18, is_enemy: false },
      { id: GOBLIN, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: char.id,
        isEnemy: false,
        pos: pcPos,
        hp: char.hp,
        maxHp: char.max_hp,
        conditions: [],
        condition_durations: {},
      },
      {
        id: GOBLIN,
        isEnemy: true,
        pos: enemyPos,
        hp: 500,
        maxHp: 500,
        conditions: [],
        condition_durations: {},
      },
    ],
    movement_used: {},
  };
}

const act = (state: GameState, action: Record<string, unknown>, seed: Seed = seedWithEnemy) =>
  takeAction({ action: action as never, history: [], state, seed, context: ctx });

// ─── Armor Class ─────────────────────────────────────────────────────────────

describe('Unarmored Defense / Draconic Resilience AC', () => {
  it('Monk: 10 + DEX + WIS with no armor and no Shield', () => {
    expect(characterAc(monk(1), loot)).toBe(15); // 10 + 2 + 3
  });

  it('Monk: a Shield (or armor) switches it off', () => {
    expect(unarmoredDefenseBonus(monk(1, withShield()), loot)).toBe(0);
    expect(characterAc(monk(1, withShield()), loot)).toBe(14); // 10 + 2 + Shield 2
    expect(characterAc(monk(1, withArmor()), loot)).toBe(16); // Chain Mail
  });

  it('Barbarian: 10 + DEX + CON, and a Shield still allowed', () => {
    const barb = makeChar({
      character_class: 'Barbarian',
      class_levels: { barbarian: 1 },
      dex: 14,
      con: 16,
      ...withShield(),
    });
    expect(characterAc(barb, loot)).toBe(17); // 10 + 2 + 3 + Shield 2
    expect(characterAc({ ...barb, ...withArmor() }, loot)).toBe(16);
  });

  it('Draconic Sorcery: 10 + DEX + CHA from Sorcerer level 3', () => {
    const sorc = (lvl: number) =>
      makeChar({
        character_class: 'Sorcerer',
        subclass: 'draconic',
        level: lvl,
        class_levels: { sorcerer: lvl },
        dex: 14,
        cha: 16,
      });
    expect(characterAc(sorc(2), loot)).toBe(12);
    expect(characterAc(sorc(3), loot)).toBe(15);
  });

  it('a multiclass uses the best single calculation (no stacking)', () => {
    const mc = makeChar({
      character_class: 'Monk',
      class_levels: { monk: 1, barbarian: 1 },
      level: 2,
      dex: 14,
      wis: 12,
      con: 18,
    });
    expect(characterAc(mc, loot)).toBe(16); // 10 + 2 + CON 4, not + WIS 1 too
  });

  it('Mage Armor is a competing calculation: only the excess over +3 counts', () => {
    expect(characterAc(monk(1, { wis: 18, mage_armor_active: true }), loot)).toBe(16); // WIS +4
    expect(characterAc(monk(1, { wis: 14, mage_armor_active: true }), loot)).toBe(15); // 13 + 2
  });

  it('a negative modifier never lowers AC', () => {
    expect(characterAc(monk(1, { wis: 6 }), loot)).toBe(12);
  });

  it('an active Shield spell keeps its +5 through a recompute', () => {
    expect(characterAc(monk(1, { conditions: ['shield_spell'] }), loot)).toBe(20);
  });

  it('entering Monk by multiclass recomputes the stored AC', () => {
    const f = makeChar({
      character_class: 'Fighter',
      level: 1,
      class_levels: { fighter: 1 },
      dex: 14,
      wis: 16,
      ac: 12,
    });
    applyLevelUpForClass(f, 'monk', ctx);
    expect(f.ac).toBe(15);
  });

  it('a WIS increase raises a Monk’s stored AC', async () => {
    const m = monk(4, { ac: 15, asi_pending: true });
    const r = await act(
      { ...makeState({ id: 'pc-1' }), characters: [m] },
      {
        type: 'apply_asi',
        stat: 'wis',
      }
    );
    expect(r.newState.characters[0].ac).toBe(16);
  });
});

// ─── Fighter ─────────────────────────────────────────────────────────────────

describe('Fighter Tactical Mind (L2)', () => {
  it('adds a d10 to a failed check and spends a Second Wind only on a rescue', () => {
    const f = fighter(2);
    expect(tacticalMindRescue(f, 10, 15, () => 5)).toEqual({ rescued: true, roll: 5, total: 15 });
    expect(tacticalMindRescue(f, 10, 15, () => 4).rescued).toBe(false);

    const saved = applyTacticalMindTo(f, { total: 10, success: false }, 15, () => 7);
    expect(saved.check).toEqual({ total: 17, success: true });
    expect(saved.char.class_resource_uses?.second_wind).toBe(1);
    expect(saved.note).toMatch(/Tactical Mind/);

    const stillFails = applyTacticalMindTo(f, { total: 5, success: false }, 15, () => 9);
    expect(stillFails.check.success).toBe(false);
    expect(stillFails.char.class_resource_uses?.second_wind).toBeUndefined();
  });

  it('needs Fighter 2 and an unspent Second Wind; passed checks are untouched', () => {
    expect(tacticalMindRescue(fighter(1), 10, 11, () => 10).rescued).toBe(false);
    const spent = fighter(2, { class_resource_uses: { second_wind: secondWindMax(fighter(2)) } });
    expect(tacticalMindRescue(spent, 10, 11, () => 10).rescued).toBe(false);
    expect(applyTacticalMindTo(fighter(2), { total: 20, success: true }, 15).note).toBe('');
  });
});

describe('Fighter Tactical Shift (L5)', () => {
  it('Second Wind grants half Speed of free movement from Fighter 5', async () => {
    expect(tacticalShiftFeet(fighter(4), 30)).toBe(0);
    expect(tacticalShiftFeet(fighter(5), 30)).toBe(15);
    expect(tacticalShiftFeet(fighter(5), 25)).toBe(10); // rounds down to a square

    const r = await act(gridFight(fighter(5)), {
      type: 'use_class_feature',
      featureId: 'second_wind',
    });
    expect(r.newState.characters[0].turn_actions.tactical_shift_ft).toBe(15);
    expect(r.narrative).toMatch(/Tactical Shift/);
  });

  it('a move inside the budget costs no Speed and provokes no Opportunity Attack', async () => {
    const f = fighter(5, {
      turn_actions: {
        action_used: false,
        bonus_action_used: true,
        reaction_used: false,
        free_interaction_used: false,
        tactical_shift_ft: 15,
      },
    });
    const st = gridFight(f);
    const hpBefore = f.hp;
    // Step away from the adjacent goblin (would normally provoke).
    mockRandom(0.99, 0.99, 0.99, 0.99);
    const r = await act(st, { type: 'grid_move', entityId: 'pc-1', to: { x: 1, y: 2 } });
    const after = r.newState.characters[0];
    expect(r.newState.movement_used?.['pc-1'] ?? 0).toBe(0);
    expect(after.turn_actions.tactical_shift_ft).toBe(10);
    expect(after.hp).toBe(hpBefore);
    expect(r.narrative).not.toMatch(/Opportunity attack/);
  });
});

// ─── Monk ────────────────────────────────────────────────────────────────────

describe('Monk Unarmored Movement (L2)', () => {
  it('follows the Monk table and needs no armor and no Shield', () => {
    expect(unarmoredMovementBonus(monk(1), loot)).toBe(0);
    expect(unarmoredMovementBonus(monk(2), loot)).toBe(10);
    expect(unarmoredMovementBonus(monk(6), loot)).toBe(15);
    expect(unarmoredMovementBonus(monk(10), loot)).toBe(20);
    expect(unarmoredMovementBonus(monk(14), loot)).toBe(25);
    expect(unarmoredMovementBonus(monk(18), loot)).toBe(30);
    expect(unarmoredMovementBonus(monk(6, withShield()), loot)).toBe(0);
    expect(unarmoredMovementBonus(monk(6, withArmor()), loot)).toBe(0);
  });

  it('feeds effectiveSpeed and the derived speed map the FE reads', () => {
    const m = monk(6, { speed: 30 });
    expect(effectiveSpeed(m, loot)).toBe(45);
    const st = withDerivedSpeeds({ ...makeState({ id: 'pc-1' }), characters: [m] }, loot);
    expect(st.speed_ft).toEqual({ 'pc-1': 45 });
  });
});

describe('Monk Slow Fall (L4)', () => {
  it('reduces fall damage by 5 × Monk level using the Reaction', () => {
    mockRandom(0.99, 0.99, 0.99, 0.99, 0.99); // 5d6 → 30
    const m = monk(4, { hp: 40, max_hp: 40 });
    const r = applyFallingDamage(m, 50, makeState({ id: 'pc-1' }));
    expect(slowFallReduction(m)).toBe(20);
    expect(r.amountDealt).toBe(10);
    expect(r.char.turn_actions.reaction_used).toBe(true);
    expect(r.narrative).toMatch(/Slow Fall −20/);
  });

  it('negating all the damage means no Prone; no Reaction means no Slow Fall', () => {
    mockRandom(0.01, 0.01); // 2d6 → 2
    const r = applyFallingDamage(monk(4, { hp: 40, max_hp: 40 }), 20, makeState({ id: 'pc-1' }));
    expect(r.amountDealt).toBe(0);
    expect(r.landedProne).toBe(false);

    mockRandom(0.99, 0.99); // 2d6 → 12
    const noReaction = monk(4, {
      hp: 40,
      max_hp: 40,
      turn_actions: {
        action_used: false,
        bonus_action_used: false,
        reaction_used: true,
        free_interaction_used: false,
      },
    });
    expect(applyFallingDamage(noReaction, 20, makeState({ id: 'pc-1' })).amountDealt).toBe(12);
    expect(slowFallReduction(monk(3))).toBe(0);
  });
});

describe('Monk Acrobatic Movement (L9)', () => {
  it('climb and swim cells cost no extra movement while unarmored', async () => {
    expect(hasAcrobaticMovement(monk(8), loot)).toBe(false);
    expect(hasAcrobaticMovement(monk(9), loot)).toBe(true);
    expect(hasAcrobaticMovement(monk(9, withShield()), loot)).toBe(false);

    const swimSeed: Seed = {
      ...seedWithEnemy,
      rooms: seedWithEnemy.rooms.map((room) =>
        room.id === CORRIDOR_ID
          ? {
              ...room,
              swimTerrain: [
                { x: 3, y: 5 },
                { x: 4, y: 5 },
              ],
            }
          : room
      ),
    };
    const st = gridFight(monk(9, { speed: 30 }), { x: 2, y: 5 }, { x: 8, y: 8 });
    const r = await act(st, { type: 'grid_move', entityId: 'pc-1', to: { x: 4, y: 5 } }, swimSeed);
    expect(r.newState.movement_used?.['pc-1']).toBe(10);
  });
});

describe('Monk Heightened Focus (L10)', () => {
  const flurryReady = (level: number, over: Partial<Character> = {}) =>
    monk(level, {
      hp: 30,
      max_hp: 30,
      dex: 16,
      class_resource_uses: { ki_points: level },
      turn_actions: {
        action_used: true,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
      ...over,
    });

  it('Flurry of Blows makes three strikes from Monk 10', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const nine = await act(gridFight(flurryReady(9)), {
      type: 'use_class_feature',
      featureId: 'flurry_of_blows',
    });
    expect(nine.narrative).toMatch(/Strike 2/);
    expect(nine.narrative).not.toMatch(/Strike 3/);
    const ten = await act(gridFight(flurryReady(10)), {
      type: 'use_class_feature',
      featureId: 'flurry_of_blows',
    });
    expect(ten.narrative).toMatch(/Strike 3/);
  });

  it('the Focus-Point Patient Defense grants two Martial Arts dice of Temporary HP', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    expect(martialArtsDieSides(10)).toBe(8);
    const r = await act(gridFight(flurryReady(10)), {
      type: 'use_class_feature',
      featureId: 'patient_defense_dp',
    });
    expect(r.newState.characters[0].temp_hp).toBe(16);
    const free = await act(gridFight(flurryReady(10)), {
      type: 'use_class_feature',
      featureId: 'patient_defense_free',
    });
    expect(free.newState.characters[0].temp_hp ?? 0).toBe(0);
  });
});
