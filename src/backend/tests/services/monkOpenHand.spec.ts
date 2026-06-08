// RE-2 — Monk: Empowered Strikes (base L6, unarmed strikes can deal Force)
// and Warrior of the Open Hand's Wholeness of Body (L6, bonus-action self-heal,
// WIS-mod uses per long rest).

import type { Character, Enemy, GameState, Seed } from '../../src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../src/test-fixtures.js';
import type { ActionContext } from '../../src/services/actions/types.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';
import { handleMonkFeature } from '../../src/services/actions/classFeature/monk.js';
import { pcActor } from '../../src/services/actions/actor.js';
import { takeAction } from '../../src/services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

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
const freshTurn = () => ({
  action_used: false,
  bonus_action_used: false,
  reaction_used: false,
  free_interaction_used: false,
});

describe('Wholeness of Body (Open Hand L6)', () => {
  it('heals as a bonus action and consumes a use', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // 1d8 → 8
    const char = makeChar({
      character_class: 'Monk',
      subclass: 'open_hand',
      level: 6,
      wis: 16, // +3 mod → 3 uses
      hp: 3,
      max_hp: 30,
      turn_actions: freshTurn(),
    });
    const c = featCtx(char);
    expect(handleMonkFeature(c, 'wholeness_of_body')).toBe(true);
    expect(pcChar(c).hp).toBeGreaterThan(3);
    expect(pcChar(c).class_resource_uses?.wholeness_of_body_used).toBe(1);
    expect(pcChar(c).turn_actions.bonus_action_used).toBe(true);
  });

  it('is exhausted after WIS-mod uses', () => {
    const char = makeChar({
      character_class: 'Monk',
      subclass: 'open_hand',
      level: 6,
      wis: 16, // 3 uses
      hp: 3,
      max_hp: 30,
      turn_actions: freshTurn(),
      class_resource_uses: { wholeness_of_body_used: 3 },
    });
    const c = featCtx(char);
    handleMonkFeature(c, 'wholeness_of_body');
    expect(c.narrative).toMatch(/exhausted/);
    expect(pcChar(c).hp).toBe(3); // no heal
  });

  it('requires Open Hand (a different subclass cannot use it)', () => {
    const char = makeChar({
      character_class: 'Monk',
      subclass: 'shadow',
      level: 6,
      wis: 16,
      hp: 3,
      max_hp: 30,
      turn_actions: freshTurn(),
    });
    const c = featCtx(char);
    handleMonkFeature(c, 'wholeness_of_body');
    expect(c.narrative).toMatch(/Open Hand/);
  });

  it('requires Monk L6', () => {
    const char = makeChar({
      character_class: 'Monk',
      subclass: 'open_hand',
      level: 5,
      wis: 16,
      hp: 3,
      max_hp: 30,
      turn_actions: freshTurn(),
    });
    const c = featCtx(char);
    handleMonkFeature(c, 'wholeness_of_body');
    expect(c.narrative).toMatch(/level 6/);
    expect(pcChar(c).hp).toBe(3);
  });
});

// Unarmed Monk vs a high-HP dummy; an auto-hit roll, read the damage type.
const ENEMY = `entry_hall#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Empowered Test',
  ship_name: 'Empowered Test',
  intro: '',
  seed_id: 'empowered',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: ENEMY,
        name: 'Dummy',
        hp: 200,
        ac: 5,
        damage: '1d6',
        toHit: 3,
        xp: 50,
      } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function monkState(level: number): GameState {
  const char = makeChar({
    id: 'pc-1',
    character_class: 'Monk',
    subclass: 'open_hand',
    level,
    str: 16,
    dex: 16,
    // no equipped_weapon → unarmed strike
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [char],
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
        hp: 200,
        maxHp: 200,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

describe('Empowered Strikes (Monk L6) — unarmed Force damage', () => {
  it('a L6 Monk unarmed strike deals Force', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 → 20, hits
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: monkState(6),
      seed,
      context: ctx,
    });
    const hit = (r.newState.combat_log ?? []).find((e) => e.kind === 'attack_hit');
    expect(hit && hit.kind === 'attack_hit' && hit.damageType).toBe('force');
  });

  it('a L5 Monk unarmed strike is not Force', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: monkState(5),
      seed,
      context: ctx,
    });
    const hit = (r.newState.combat_log ?? []).find((e) => e.kind === 'attack_hit');
    expect(hit && hit.kind === 'attack_hit' && hit.damageType).not.toBe('force');
  });
});

function monkWith(level: number, over: Partial<Character>): GameState {
  const s = monkState(level);
  s.characters[0] = { ...s.characters[0], ...over } as Character;
  return s;
}
const useFeat = async (state: GameState, featureId: string) =>
  takeAction({
    action: { type: 'use_class_feature', featureId },
    history: [],
    state,
    seed,
    context: ctx,
  });

describe('Fleet Step (Open Hand L11)', () => {
  it('grants a free Step of the Wind after a bonus action', async () => {
    const state = monkWith(11, {
      turn_actions: {
        action_used: false,
        bonus_action_used: true,
        reaction_used: false,
        free_interaction_used: false,
      },
    });
    const r = await useFeat(state, 'fleet_step_dash');
    const after = r.newState.characters[0];
    expect(after.turn_actions.fleet_step_used).toBe(true);
    expect(after.turn_actions.disengaged).toBe(true);
    expect(r.narrative).toMatch(/Fleet Step/);
  });

  it('requires a bonus action to have been used first', async () => {
    const r = await useFeat(monkWith(11, {}), 'fleet_step_dash');
    expect(r.newState.characters[0].turn_actions.fleet_step_used ?? false).toBe(false);
    expect(r.narrative).toMatch(/follows another bonus action/);
  });

  it('does not apply below Open Hand L11', async () => {
    const state = monkWith(10, {
      turn_actions: {
        action_used: false,
        bonus_action_used: true,
        reaction_used: false,
        free_interaction_used: false,
      },
    });
    const r = await useFeat(state, 'fleet_step_dash');
    expect(r.narrative).toMatch(/requires a Warrior of the Open Hand of level 11/);
  });
});

describe('Quivering Palm (Open Hand L17)', () => {
  it('sets the vibrations and spends 4 Focus', async () => {
    const r = await useFeat(
      monkWith(17, { class_resource_uses: { ki_points: 10 } }),
      'quivering_palm'
    );
    const after = r.newState.characters[0];
    expect(after.quivering_palm_target).toBe(ENEMY);
    expect(after.class_resource_uses?.ki_points).toBe(6);
    expect((r.newState.entities ?? []).find((e) => e.id === ENEMY)!.conditions).toContain(
      'quivering_palm'
    );
  });

  it('needs 4 Focus Points', async () => {
    const r = await useFeat(
      monkWith(17, { class_resource_uses: { ki_points: 3 } }),
      'quivering_palm'
    );
    expect(r.newState.characters[0].quivering_palm_target).toBeUndefined();
    expect(r.narrative).toMatch(/needs 4 Focus/);
  });

  it('detonates for Force damage and clears the mark', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05); // enemy fails the CON save → full damage
    const r = await useFeat(
      monkWith(17, { quivering_palm_target: ENEMY, class_resource_uses: { ki_points: 6 } }),
      'quivering_palm_detonate'
    );
    expect((r.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp).toBeLessThan(200);
    expect(r.newState.characters[0].quivering_palm_target).toBeUndefined();
    expect(r.narrative).toMatch(/Quivering Palm/);
  });

  it('requires Open Hand L17 to set', async () => {
    const r = await useFeat(
      monkWith(16, { class_resource_uses: { ki_points: 10 } }),
      'quivering_palm'
    );
    expect(r.newState.characters[0].quivering_palm_target).toBeUndefined();
    expect(r.narrative).toMatch(/requires a Warrior of the Open Hand of level 17/);
  });
});
