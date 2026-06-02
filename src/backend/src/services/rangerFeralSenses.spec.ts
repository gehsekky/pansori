// RE-2 — Ranger Feral Senses (L18): Blindsight 30 ft. In pansori's model the
// only "can't see" condition is Blinded, so a Feral Senses ranger ignores
// Blinded for attack rolls — no Disadvantage on its own attacks, and no
// Advantage granted to attackers.

import type { Character, Enemy, GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';
import type { ActionContext } from './actions/types.js';
import { context as ctx } from '../contexts/sandbox.js';
import { enemyActor } from './actions/actor.js';
import { handleEnemyAttack } from './actions/enemyAttack.js';
import { hasFeralSenses } from './multiclass.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

describe('hasFeralSenses', () => {
  it('is active at Ranger L18, not L17, and only for Rangers', () => {
    expect(hasFeralSenses(makeChar({ character_class: 'Ranger', level: 18 }))).toBe(true);
    expect(hasFeralSenses(makeChar({ character_class: 'Ranger', level: 17 }))).toBe(false);
    expect(hasFeralSenses(makeChar({ character_class: 'Fighter', level: 20 }))).toBe(false);
  });
});

// ── Enemy-side: a Blinded ranger denies attackers the Blinded advantage ──────
// Mirrors the Elusive integration test. toHit 0 so the attack total equals the
// raw d20; AC 12 → hit needs 12+. Flat 5 damage.
const brute = {
  id: 'brute',
  name: 'Brute',
  hp: 30,
  ac: 13,
  toHit: 0,
  damage: '5',
  damageType: 'slashing',
} as unknown as Enemy;

function ctxFor(target: Character): ActionContext {
  return {
    actor: enemyActor(brute),
    context: ctx,
    st: { characters: [target], entities: [], round: 1 },
    narrative: '',
  } as unknown as ActionContext;
}

function pinRolls(): void {
  const spy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
  spy.mockReturnValueOnce(0.35); // d20 → 8
  spy.mockReturnValueOnce(0.7); // d20 → 15 (only consumed under advantage)
}

const enemyAttack = { type: 'enemy_attack' as const, advIdx: 0, multiattackIdx: 0 };

describe('Feral Senses — enemy-attack advantage suppression', () => {
  it('a Blinded non-Ranger is hit: Blinded grants advantage → higher die (control)', () => {
    pinRolls();
    const fighter = makeChar({
      id: 'f',
      character_class: 'Fighter',
      level: 18,
      ac: 12,
      hp: 20,
      max_hp: 20,
      conditions: ['blinded'],
    });
    const c = ctxFor(fighter);
    handleEnemyAttack(c, { ...enemyAttack, targetCharId: 'f' });
    expect(c.enemySubAttack?.outcome).toBe('done'); // advantage → max(8,15)=15 ≥ 12 → hit
    if (c.enemySubAttack?.outcome === 'done') expect(c.enemySubAttack.target.hp).toBe(15);
  });

  it('a Blinded Ranger L18 is missed: Feral Senses suppresses the advantage', () => {
    pinRolls();
    const ranger = makeChar({
      id: 'r',
      character_class: 'Ranger',
      level: 18,
      ac: 12,
      hp: 20,
      max_hp: 20,
      conditions: ['blinded'],
    });
    const c = ctxFor(ranger);
    handleEnemyAttack(c, { ...enemyAttack, targetCharId: 'r' });
    expect(c.enemySubAttack?.outcome).toBe('done'); // no advantage → roll1 8 < 12 → miss
    if (c.enemySubAttack?.outcome === 'done') expect(c.enemySubAttack.target.hp).toBe(20);
  });
});

// ── PC-side: a Blinded ranger doesn't suffer Disadvantage on its own attacks ──
const ENEMY = `entry_hall#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'FS',
  ship_name: 'FS',
  intro: '',
  seed_id: 'fs',
  rooms: [{ id: 'entry_hall', name: 'S', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: ENEMY,
        name: 'Dummy',
        hp: 60,
        ac: 12,
        damage: '1d4',
        toHit: 2,
        xp: 30,
        dex: 10,
      } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function blindRangerCombat(level: number): GameState {
  const c = makeChar({
    id: 'pc-1',
    character_class: 'Ranger',
    level,
    str: 16,
    conditions: ['blinded'],
    equipped_weapon: 'sw-1',
    inventory: [{ instance_id: 'sw-1', id: 'longsword', name: 'Longsword' }],
    weapon_proficiencies: ['simple', 'martial'],
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
        conditions: ['blinded'],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 60,
        maxHp: 60,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

const attackEnemy = async (state: GameState) =>
  takeAction({
    action: { type: 'attack', targetEnemyId: ENEMY },
    history: [],
    state,
    seed,
    context: ctx,
  });

describe('Feral Senses — no self-attack disadvantage while Blinded', () => {
  it('a Blinded Ranger L18 attacks without disadvantage', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await attackEnemy(blindRangerCombat(18));
    expect(r.narrative).not.toMatch(/disadvantage/i);
  });

  it('a Blinded Ranger L17 still attacks with disadvantage', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await attackEnemy(blindRangerCombat(17));
    expect(r.narrative).toMatch(/disadvantage/i);
  });
});
