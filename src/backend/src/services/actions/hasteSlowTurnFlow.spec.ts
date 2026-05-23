// SRD 5.2.1 Haste + Slow turn-flow refactor (2026-05-23).
//
// Haste — "It gains an additional action on each of its turns. That
// action can be used only to take the Attack, Dash, Disengage, Hide,
// or Utilize action." Wired via the `haste_extra_action` wrapper that
// clears action_used and marks `haste_extra_action_used = true`.
//
// Slow — "It can use either an action or a bonus action on its turn,
// not both." Wired via a post-dispatch hook in takeAction that mirrors
// the false→true transition on either slot to the other so the choice
// generator naturally hides the remaining type.

import type { Enemy, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../../contexts/sandbox.js';
import { generateChoices } from '../gameEngine.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const baseSeed: Seed = {
  context_id: ctx.id,
  world_name: 'Turn Flow Test',
  ship_name: 'Turn Flow Test',
  intro: '',
  seed_id: 'turn-flow',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {},
  loot: {},
  npcs: {},
};

function seedWithEnemy(enemy: Enemy): Seed {
  return { ...baseSeed, enemies: { [ctx.startRoomId]: [enemy] } };
}

function combatStateWith(pc: ReturnType<typeof makeChar>, enemy: Enemy) {
  return {
    ...makeState(
      { id: pc.id },
      { current_room: ctx.startRoomId, combat_active: true }
    ),
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

describe('Slow — action OR bonus action, not both', () => {
  it('Slowed PC who attacks (action) also has bonus_action locked', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      str: 16,
      conditions: ['slowed'],
      inventory: [{ instance_id: 'sw-1', id: 'longsword', name: 'Longsword' }],
      equipped_weapon: 'sw-1',
      weapon_proficiencies: ['simple', 'martial'],
    });
    const enemy: Enemy = {
      id: `${ctx.startRoomId}#0`,
      name: 'Goblin',
      ac: 10,
      hp: 50,
      damage: '1d6',
      toHit: 4,
      xp: 25,
    };
    const state = combatStateWith(pc, enemy);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemy.id },
      history: [],
      state,
      seed: seedWithEnemy(enemy),
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.turn_actions.action_used).toBe(true);
    expect(after?.turn_actions.bonus_action_used).toBe(true);
    expect(result.narrative).toMatch(/Slowed: bonus action locked/);
  });

  it('Slowed PC who uses a bonus action also has action locked', async () => {
    // Cleric with Healing Word (bonus action) and Cure Wounds (action).
    // After casting Healing Word, the action slot should be locked.
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      level: 5,
      wis: 16,
      hp: 20,
      max_hp: 40,
      conditions: ['slowed'],
      spells_known: ['healing_word'],
      prepared_spells: ['healing_word'],
      spell_slots_max: { 1: 4 },
      spell_slots_used: {},
    });
    const wounded = makeChar({ id: 'ally-1', hp: 5, max_hp: 30 });
    const state = {
      ...makeState({ id: cleric.id }, { current_room: ctx.startRoomId }),
      characters: [cleric, wounded],
      active_character_id: cleric.id,
    };
    const result = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'healing_word',
        slotLevel: 1,
        targetCharId: 'ally-1',
      },
      history: [],
      state,
      seed: baseSeed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'cleric-1');
    expect(after?.turn_actions.bonus_action_used).toBe(true);
    expect(after?.turn_actions.action_used).toBe(true);
    expect(result.narrative).toMatch(/Slowed: action locked/);
  });

  it('non-slowed PC retains both slots after one is used', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      str: 16,
      // No 'slowed' condition.
      inventory: [{ instance_id: 'sw-1', id: 'longsword', name: 'Longsword' }],
      equipped_weapon: 'sw-1',
      weapon_proficiencies: ['simple', 'martial'],
    });
    const enemy: Enemy = {
      id: `${ctx.startRoomId}#0`,
      name: 'Goblin',
      ac: 10,
      hp: 50,
      damage: '1d6',
      toHit: 4,
      xp: 25,
    };
    const state = combatStateWith(pc, enemy);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemy.id },
      history: [],
      state,
      seed: seedWithEnemy(enemy),
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.turn_actions.action_used).toBe(true);
    expect(after?.turn_actions.bonus_action_used).toBeFalsy();
  });
});

describe('Haste — extra-action menu', () => {
  it('surfaces the Haste extra menu after the normal action is spent', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      str: 16,
      conditions: ['hasted'],
      turn_actions: {
        action_used: true,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
      inventory: [{ instance_id: 'sw-1', id: 'longsword', name: 'Longsword' }],
      equipped_weapon: 'sw-1',
      weapon_proficiencies: ['simple', 'martial'],
    });
    const enemy: Enemy = {
      id: `${ctx.startRoomId}#0`,
      name: 'Goblin',
      ac: 10,
      hp: 50,
      damage: '1d6',
      toHit: 4,
      xp: 25,
    };
    const state = combatStateWith(pc, enemy);
    const choices = generateChoices(state, seedWithEnemy(enemy), ctx);
    const hasteAttack = choices.find(
      (c) =>
        c.action.type === 'haste_extra_action' &&
        c.action.inner.type === 'attack'
    );
    const hasteDash = choices.find(
      (c) =>
        c.action.type === 'haste_extra_action' &&
        c.action.inner.type === 'dash'
    );
    expect(hasteAttack).toBeDefined();
    expect(hasteDash).toBeDefined();
  });

  it('Haste-extra Dash succeeds even when action_used is already true', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      str: 16,
      conditions: ['hasted'],
      turn_actions: {
        action_used: true,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
      inventory: [{ instance_id: 'sw-1', id: 'longsword', name: 'Longsword' }],
      equipped_weapon: 'sw-1',
      weapon_proficiencies: ['simple', 'martial'],
    });
    const enemy: Enemy = {
      id: `${ctx.startRoomId}#0`,
      name: 'Goblin',
      ac: 10,
      hp: 50,
      damage: '1d6',
      toHit: 4,
      xp: 25,
    };
    const state = combatStateWith(pc, enemy);
    const result = await takeAction({
      action: {
        type: 'haste_extra_action',
        inner: { type: 'dash' },
      },
      history: [],
      state,
      seed: seedWithEnemy(enemy),
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.turn_actions.haste_extra_action_used).toBe(true);
    // Dash sets action_used = true (which it already was) — that's
    // expected. The marker flag is what tells the choice generator
    // that the extra slot has been spent.
    expect(after?.turn_actions.action_used).toBe(true);
    expect(result.narrative).toMatch(/surges with Haste|Dash/i);
  });

  it('rejects haste_extra_action when PC is not Hasted', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      turn_actions: {
        action_used: true,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
      inventory: [{ instance_id: 'sw-1', id: 'longsword', name: 'Longsword' }],
      equipped_weapon: 'sw-1',
      weapon_proficiencies: ['simple', 'martial'],
    });
    const enemy: Enemy = {
      id: `${ctx.startRoomId}#0`,
      name: 'Goblin',
      ac: 10,
      hp: 50,
      damage: '1d6',
      toHit: 4,
      xp: 25,
    };
    const state = combatStateWith(pc, enemy);
    const result = await takeAction({
      action: {
        type: 'haste_extra_action',
        inner: { type: 'dash' },
      },
      history: [],
      state,
      seed: seedWithEnemy(enemy),
      context: ctx,
    });
    expect(result.narrative).toMatch(/not Hasted/i);
  });

  it('rejects a second haste_extra_action in the same turn', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      conditions: ['hasted'],
      turn_actions: {
        action_used: true,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
        haste_extra_action_used: true,
      },
      inventory: [{ instance_id: 'sw-1', id: 'longsword', name: 'Longsword' }],
      equipped_weapon: 'sw-1',
      weapon_proficiencies: ['simple', 'martial'],
    });
    const enemy: Enemy = {
      id: `${ctx.startRoomId}#0`,
      name: 'Goblin',
      ac: 10,
      hp: 50,
      damage: '1d6',
      toHit: 4,
      xp: 25,
    };
    const state = combatStateWith(pc, enemy);
    const result = await takeAction({
      action: {
        type: 'haste_extra_action',
        inner: { type: 'dash' },
      },
      history: [],
      state,
      seed: seedWithEnemy(enemy),
      context: ctx,
    });
    expect(result.narrative).toMatch(/already used your Haste extra/i);
  });
});
