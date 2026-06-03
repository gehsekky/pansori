// Haste/Slow turn-flow closeouts shipped 2026-05-23:
//   1. Haste: Extra Attack loop suppressed when the wrapped attack
//      comes through `haste_extra_action` (RAW: one weapon attack
//      only). Detected via the `haste_extra_action_used` flag the
//      wrapper sets before delegating.
//   2. Slow: reactions blocked. `canReact(char)` returns false when
//      the char has 'slowed'; cost.ts `checkBudget` rejects reaction-
//      cost actions with a slowed message.
//   3. Slow: 25% somatic-spell fail. Precast rolls d20 after slot +
//      action-economy consumption; 1-10 fizzles (slot wasted, action
//      wasted, narrative explains the disruption).

import type { Enemy, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { canReact } from '../rulesEngine.js';
import { context as ctx } from '../../campaignData/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const baseSeed: Seed = {
  context_id: ctx.id,
  world_name: 'Closeout Test',
  ship_name: 'Closeout Test',
  intro: '',
  seed_id: 'closeout',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function seedWithEnemy(enemy: Enemy): Seed {
  return { ...baseSeed, enemies: { ['entry_hall']: [enemy] } };
}

function combatStateWith(pc: ReturnType<typeof makeChar>, enemy: Enemy) {
  return {
    ...makeState({ id: pc.id }, { current_room: 'entry_hall', combat_active: true }),
    characters: [pc],
    active_character_id: pc.id,
    initiative_order: [
      { id: pc.id, roll: 18, is_enemy: false },
      { id: enemy.id, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    round: 1,
    entities: [
      {
        id: pc.id,
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: pc.hp,
        maxHp: pc.max_hp,
        conditions: pc.conditions,
        condition_durations: {},
      },
      {
        id: enemy.id,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: enemy.hp,
        maxHp: enemy.hp,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Haste — one weapon attack only on the extra slot', () => {
  it('Extra Attack does NOT fire when the wrapped attack comes through haste_extra_action', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // ensure hits
    const fighter = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5, // Extra Attack threshold — would normally fire twice
      str: 18,
      conditions: ['hasted'],
      turn_actions: {
        action_used: true, // normal action already spent
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
      inventory: [{ instance_id: 'gs-1', id: 'greatsword', name: 'Greatsword' }],
      equipment: { main_hand: 'gs-1' },
      weapon_proficiencies: ['simple', 'martial'],
    });
    const enemy: Enemy = {
      id: `entry_hall#0`,
      name: 'Ogre',
      ac: 8,
      hp: 200,
      damage: '1d6',
      toHit: 4,
      xp: 100,
    };
    const state = combatStateWith(fighter, enemy);
    const result = await takeAction({
      action: {
        type: 'haste_extra_action',
        inner: { type: 'attack', targetEnemyId: enemy.id },
      },
      history: [],
      state,
      seed: seedWithEnemy(enemy),
      context: ctx,
    });
    // Greatsword: 2d6 + STR (4). At L5 with Extra Attack normally
    // 2 swings → ~22 damage. With Haste's single-attack cap → only
    // ~16 max. Just one "Attack" line in narrative (no "Attack 2 — ").
    expect(result.narrative).not.toMatch(/Attack 2 — /);
  });

  it('Normal Attack action still triggers Extra Attack at L5+', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const fighter = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      str: 18,
      // No haste_extra_action_used flag — normal flow.
      inventory: [{ instance_id: 'gs-1', id: 'greatsword', name: 'Greatsword' }],
      equipment: { main_hand: 'gs-1' },
      weapon_proficiencies: ['simple', 'martial'],
    });
    const enemy: Enemy = {
      id: `entry_hall#0`,
      name: 'Ogre',
      ac: 8,
      hp: 200,
      damage: '1d6',
      toHit: 4,
      xp: 100,
    };
    const state = combatStateWith(fighter, enemy);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemy.id },
      history: [],
      state,
      seed: seedWithEnemy(enemy),
      context: ctx,
    });
    expect(result.narrative).toMatch(/Attack 2 — /);
  });
});

describe('Slow — canReact helper', () => {
  it('returns false when char has slowed condition (even with unused reaction)', () => {
    expect(
      canReact({
        turn_actions: { reaction_used: false },
        conditions: ['slowed'],
      })
    ).toBe(false);
  });

  it('returns false when reaction is already used', () => {
    expect(
      canReact({
        turn_actions: { reaction_used: true },
        conditions: [],
      })
    ).toBe(false);
  });

  it('returns true when fresh + not slowed', () => {
    expect(
      canReact({
        turn_actions: { reaction_used: false },
        conditions: [],
      })
    ).toBe(true);
  });
});

describe('Slow — reaction-cost actions rejected at dispatch', () => {
  it('use_reaction (readied action trigger) is rejected on a slowed PC', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      conditions: ['slowed'],
      turn_actions: {
        action_used: true,
        bonus_action_used: true,
        reaction_used: false,
        free_interaction_used: false,
        readied_action: {
          trigger: 'enemy attacks',
          action: { type: 'dodge' },
        },
      },
    });
    const enemy: Enemy = {
      id: `entry_hall#0`,
      name: 'Goblin',
      ac: 10,
      hp: 8,
      damage: '1d6',
      toHit: 4,
      xp: 25,
    };
    const state = combatStateWith(pc, enemy);
    const result = await takeAction({
      action: { type: 'use_reaction' },
      history: [],
      state,
      seed: seedWithEnemy(enemy),
      context: ctx,
    });
    expect(result.narrative).toMatch(/Slowed|can't take reactions/i);
  });
});

describe('Slow — 25% somatic-spell fail', () => {
  it('low d20 roll on a somatic spell fizzles + consumes the slot', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 = 1
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      level: 5,
      wis: 16,
      hp: 30,
      max_hp: 40,
      conditions: ['slowed'],
      spells_known: ['cure_wounds'],
      prepared_spells: ['cure_wounds'],
      spell_slots_max: { 1: 4 },
      spell_slots_used: {},
    });
    const wounded = makeChar({ id: 'ally-1', hp: 5, max_hp: 30 });
    const state = {
      ...makeState({ id: cleric.id }, { current_room: 'entry_hall' }),
      characters: [cleric, wounded],
      active_character_id: cleric.id,
    };
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'cure_wounds', slotLevel: 1 },
      history: [],
      state,
      seed: baseSeed,
      context: ctx,
    });
    // Spell fizzled — slot consumed per RAW.
    const after = result.newState.characters.find((c) => c.id === 'cleric-1');
    expect(after?.spell_slots_used?.[1]).toBe(1);
    // No heal applied to ally.
    const allyAfter = result.newState.characters.find((c) => c.id === 'ally-1');
    expect(allyAfter?.hp).toBe(5); // unchanged
    expect(result.narrative).toMatch(/fizzles|disrupts the somatic/i);
  });

  it('high d20 roll on a somatic spell passes — cast proceeds normally', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 = 20 → passes
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      level: 5,
      wis: 16,
      conditions: ['slowed'],
      spells_known: ['cure_wounds'],
      prepared_spells: ['cure_wounds'],
      spell_slots_max: { 1: 4 },
      spell_slots_used: {},
    });
    const wounded = makeChar({ id: 'ally-1', hp: 5, max_hp: 30 });
    const state = {
      ...makeState({ id: cleric.id }, { current_room: 'entry_hall' }),
      characters: [cleric, wounded],
      active_character_id: cleric.id,
    };
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'cure_wounds', slotLevel: 1 },
      history: [],
      state,
      seed: baseSeed,
      context: ctx,
    });
    // Heal landed (mock random=0.99 → max d8 rolls, ally heals to full).
    const allyAfter = result.newState.characters.find((c) => c.id === 'ally-1');
    expect(allyAfter?.hp).toBeGreaterThan(5);
  });

  it('non-slowed caster never sees the fizzle check', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // would fizzle if slowed
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      level: 5,
      wis: 16,
      spells_known: ['cure_wounds'],
      prepared_spells: ['cure_wounds'],
      spell_slots_max: { 1: 4 },
      spell_slots_used: {},
    });
    const wounded = makeChar({ id: 'ally-1', hp: 5, max_hp: 30 });
    const state = {
      ...makeState({ id: cleric.id }, { current_room: 'entry_hall' }),
      characters: [cleric, wounded],
      active_character_id: cleric.id,
    };
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'cure_wounds', slotLevel: 1 },
      history: [],
      state,
      seed: baseSeed,
      context: ctx,
    });
    const allyAfter = result.newState.characters.find((c) => c.id === 'ally-1');
    // Heal proceeds (min rolls but still some HP).
    expect(allyAfter?.hp).toBeGreaterThan(5);
    expect(result.narrative).not.toMatch(/fizzle/i);
  });
});
