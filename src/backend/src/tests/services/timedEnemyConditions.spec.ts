// Timed enemy conditions + Blinded combat wiring.
//
// Enemies have no per-turn condition tick (the PC analogue runs at each PC's
// turn start), so their finite conditions decrement once per round on round
// wrap via `tickEnemyConditions`. Cast paths stamp `spell.conditionDuration`
// onto enemies for non-concentration condition spells. Blinded is now
// mechanically live: attacks against a Blinded enemy have Advantage, and a
// Blinded enemy's own attacks have Disadvantage. Color Spray (a 15-ft cone of
// Blinded) is the showcase + exercises the new cone-aware AoE-condition path.

import type { CombatEntity, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import { takeAction, tickEnemyConditions } from '../../services/gameEngine.js';
import type { ActionContext } from '../../services/actions/types.js';
import { context as ctx } from '../fixtures/testContext.js';
import { enemyActor } from '../../services/actions/actor.js';
import { handleEnemyAttack } from '../../services/actions/enemyAttack.js';

afterEach(() => vi.restoreAllMocks());

function enemyEnt(overrides: Partial<CombatEntity> = {}): CombatEntity {
  return {
    id: 'e1',
    isEnemy: true,
    pos: { x: 2, y: 2 },
    hp: 30,
    maxHp: 30,
    conditions: [],
    condition_durations: {},
    ...overrides,
  };
}

describe('tickEnemyConditions — round-wrap decrement', () => {
  it('decrements a multi-round duration and keeps the condition', () => {
    const st = {
      entities: [enemyEnt({ conditions: ['blinded'], condition_durations: { blinded: 3 } })],
    } as unknown as GameState;
    const out = tickEnemyConditions(st).st;
    const e = out.entities![0];
    expect(e.conditions).toContain('blinded');
    expect(e.condition_durations.blinded).toBe(2);
  });

  it('expires a condition whose duration reaches 0', () => {
    const st = {
      entities: [enemyEnt({ conditions: ['blinded'], condition_durations: { blinded: 1 } })],
    } as unknown as GameState;
    const out = tickEnemyConditions(st).st;
    const e = out.entities![0];
    expect(e.conditions).not.toContain('blinded');
    expect(e.condition_durations.blinded).toBeUndefined();
  });

  it('leaves turn-loop-managed conditions (commanded) untouched', () => {
    const st = {
      entities: [enemyEnt({ conditions: ['commanded'], condition_durations: { commanded: 1 } })],
    } as unknown as GameState;
    const out = tickEnemyConditions(st).st;
    const e = out.entities![0];
    expect(e.conditions).toContain('commanded');
    expect(e.condition_durations.commanded).toBe(1);
  });

  it('leaves conditions without a duration entry (permanent) untouched', () => {
    const st = {
      entities: [enemyEnt({ conditions: ['charmed'], condition_durations: {} })],
    } as unknown as GameState;
    const out = tickEnemyConditions(st).st;
    expect(out.entities![0].conditions).toContain('charmed');
  });
});

// ── Blinded enemy attacks with Disadvantage ───────────────────────────────────
// Flat-damage brute (no damage dice), so only the d20(s) consume Math.random.
// resolveEnemyAttack: roll===1 auto-misses, roll===20 auto-hits. With the
// sequence [0.95, 0.0]: a disadvantaged (Blinded) attacker rolls 20 then 1 and
// keeps the lower (1 → miss); a normal attacker keeps the single 20 (auto-hit).
const brute = {
  id: 'e1',
  name: 'Brute',
  hp: 30,
  ac: 13,
  toHit: 0,
  damage: '8',
  damageType: 'bludgeoning',
} as unknown as Enemy;

function attackCtx(blinded: boolean): ActionContext {
  const target = makeChar({ id: 'pc', ac: 10, hp: 40, max_hp: 40 });
  const ent = enemyEnt({ conditions: blinded ? ['blinded'] : [] });
  return {
    actor: enemyActor(brute, ent),
    context: ctx,
    st: { characters: [target], entities: [ent], round: 1 },
    narrative: '',
  } as unknown as ActionContext;
}
const enemyAttack = {
  type: 'enemy_attack' as const,
  advIdx: 0,
  multiattackIdx: 0,
  targetCharId: 'pc',
};

describe('Blinded enemy — attacks at Disadvantage', () => {
  it('a Blinded attacker keeps the lower roll and misses', () => {
    mockRandom(0.95, 0.0); // disadvantage: rolls 20 then 1, keeps 1 → miss
    const c = attackCtx(true);
    handleEnemyAttack(c, enemyAttack);
    if (c.enemySubAttack?.outcome === 'done') expect(c.enemySubAttack.target.hp).toBe(40);
    else throw new Error('expected a resolved attack');
  });

  it('a sighted attacker keeps the single roll and hits', () => {
    mockRandom(0.95); // normal: single roll 20 → auto-hit → 8 flat damage
    const c = attackCtx(false);
    handleEnemyAttack(c, enemyAttack);
    if (c.enemySubAttack?.outcome === 'done') expect(c.enemySubAttack.target.hp).toBe(32);
    else throw new Error('expected a resolved attack');
  });
});

// ── PC attacks vs a Blinded enemy gain Advantage (narrative note) ─────────────
const enemyId = `entry_hall#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Blinded Test',
  ship_name: 'Blinded Test',
  intro: '',
  seed_id: 'blinded',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      { id: enemyId, name: 'Goblin', hp: 50, ac: 18, damage: '1d6', toHit: 3, xp: 20 },
    ],
  },
  loot: {},
  npcs: {},
};

function fighterState(enemyConditions: string[]) {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 5,
    str: 14,
    hp: 30,
    max_hp: 30,
    inventory: [{ instance_id: 'sw-1', id: 'longsword', name: 'Longsword' }],
    equipment: { main_hand: 'sw-1' },
    weapon_proficiencies: ['simple', 'martial'],
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [pc],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: enemyId, roll: 5, is_enemy: true },
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
        id: enemyId,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 50,
        maxHp: 50,
        conditions: enemyConditions,
        condition_durations: {},
      },
    ],
  };
}

describe('Attack vs Blinded enemy — has Advantage', () => {
  it('a Blinded enemy: attack note shows advantage', async () => {
    mockRandom(0.99);
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: fighterState(['blinded']),
      seed,
      context: ctx,
    });
    expect(r.narrative).toMatch(/advantage/);
  });

  it('a sighted enemy: no advantage from blindness', async () => {
    mockRandom(0.99);
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: fighterState([]),
      seed,
      context: ctx,
    });
    expect(r.narrative).not.toMatch(/advantage/);
  });
});

// ── Color Spray — 15-ft cone of Blinded, 1-round stamped duration ─────────────
// A second PC sits next in initiative so the caster's turn hands off to them
// (not the enemy) — the cast's effect is read before any round wrap that would
// tick the 1-round Blinded back off (that expiry is covered by the unit tests).
function casterState() {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 13,
    int: 18,
    hp: 50,
    max_hp: 50,
    spells_known: ['color_spray'],
    prepared_spells: ['color_spray'],
    spell_slots_max: { 1: 4 },
    spell_slots_used: {},
  });
  const ally = makeChar({ id: 'pc-2', character_class: 'Fighter', level: 5, hp: 40, max_hp: 40 });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [wiz, ally],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: 'pc-2', roll: 12, is_enemy: false },
      { id: enemyId, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 1, y: 2 },
        hp: 50,
        maxHp: 50,
        conditions: [],
        condition_durations: {},
      },
      {
        id: 'pc-2',
        isEnemy: false,
        pos: { x: 1, y: 4 },
        hp: 40,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      },
      {
        id: enemyId,
        isEnemy: true,
        pos: { x: 2, y: 2 },
        hp: 50,
        maxHp: 50,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Color Spray — cone Blinded with a stamped duration', () => {
  it('blinds an enemy in the cone with a 1-round duration on a failed save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // enemy CON save fails
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'color_spray', slotLevel: 1, targetEnemyId: enemyId },
      history: [],
      state: casterState(),
      seed,
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === enemyId && e.isEnemy);
    expect(ent?.conditions).toContain('blinded');
    expect(ent?.condition_durations.blinded).toBe(1);
  });
});

// ── Round-wrap tick fires through takeAction (integration) ────────────────────
// Blindness/Deafness stamps a 10-round Blinded on a failed CON save. With a
// single enemy, the caster's turn → the enemy's turn → back to the caster is one
// full round, so the round-wrap enemy-condition tick decrements 10 → 9.
describe('round-wrap tick — stamped duration decrements during a turn cycle', () => {
  it('Blindness/Deafness Blinded reads 9 after one round wrap', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // enemy CON save fails; enemy whiffs its turn
    const wiz = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 13,
      int: 18,
      hp: 60,
      max_hp: 60,
      spells_known: ['blindness_deafness'],
      prepared_spells: ['blindness_deafness'],
      spell_slots_max: { 2: 3 },
      spell_slots_used: {},
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [wiz],
      active_character_id: 'pc-1',
      initiative_order: [
        { id: 'pc-1', roll: 18, is_enemy: false },
        { id: enemyId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: 'pc-1',
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 60,
          maxHp: 60,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 50,
          maxHp: 50,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'blindness_deafness',
        slotLevel: 2,
        targetEnemyId: enemyId,
      },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === enemyId && e.isEnemy);
    expect(ent?.conditions).toContain('blinded');
    expect(ent?.condition_durations.blinded).toBe(9);
  });
});
