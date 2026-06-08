// Condition-fidelity cleanups.
//
// - Enemy self-disadvantage now covers the full registry set
//   (DISADV_CONDITIONS): blinded / frightened (wired earlier) PLUS poisoned /
//   restrained / prone — common via Web / Entangle / Ensnaring Strike / Shove /
//   Topple. A so-conditioned enemy attacks with Disadvantage.
// - Deafened is registered; Petrified carries its combat flags (attackers have
//   Advantage, can't move).
// - Concentration ends when the caster is incapacitated (the post-action sweep).

import {
  ADVANTAGE_CONDITIONS,
  CONDITIONS,
  DISADV_CONDITIONS,
} from '../../services/conditions/registry.js';
import type { Enemy, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import type { ActionContext } from '../../services/actions/types.js';
import { context as ctx } from '../../campaignData/sandbox.js';
import { enemyActor } from '../../services/actions/actor.js';
import { handleEnemyAttack } from '../../services/actions/enemyAttack.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#0`;

// ── Registry hygiene ──────────────────────────────────────────────────────────
describe('condition registry — Deafened + Petrified', () => {
  it('Deafened is registered', () => {
    expect(CONDITIONS.deafened).toBeDefined();
  });
  it('Petrified grants attackers Advantage, blocks movement, auto-fails STR/DEX', () => {
    const p = CONDITIONS.petrified;
    expect(p.grantsAdvantageToAttackers).toBe(true);
    expect(p.blocksMovement).toBe(true);
    expect(p.autoFailSaves).toEqual(['str', 'dex']);
    expect(ADVANTAGE_CONDITIONS.has('petrified')).toBe(true);
  });
  it('DISADV_CONDITIONS covers poisoned, restrained, and prone', () => {
    expect(DISADV_CONDITIONS.has('poisoned')).toBe(true);
    expect(DISADV_CONDITIONS.has('restrained')).toBe(true);
    expect(DISADV_CONDITIONS.has('prone')).toBe(true);
  });
});

// ── Enemy self-disadvantage (poisoned / restrained) ───────────────────────────
// Flat-damage brute; resolveEnemyAttack auto-misses on a 1, auto-hits on a 20.
// Sequence [0.95, 0.0]: a disadvantaged attacker rolls 20 then 1 and keeps the
// lower (1 → miss); an unafflicted attacker keeps the single 20 (auto-hit).
const brute = {
  id: 'e1',
  name: 'Brute',
  hp: 30,
  ac: 13,
  toHit: 0,
  damage: '8',
  damageType: 'bludgeoning',
} as unknown as Enemy;

function attackCtx(conditions: string[]): ActionContext {
  const target = makeChar({ id: 'pc', ac: 10, hp: 40, max_hp: 40 });
  const ent = {
    id: 'e1',
    isEnemy: true,
    pos: { x: 2, y: 2 },
    hp: 30,
    maxHp: 30,
    conditions,
    condition_durations: {},
  };
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

describe('Enemy self-disadvantage — poisoned / restrained attack at Disadvantage', () => {
  for (const cond of ['poisoned', 'restrained'] as const) {
    it(`a ${cond} attacker keeps the lower roll and misses`, () => {
      mockRandom(0.95, 0.0);
      const c = attackCtx([cond]);
      handleEnemyAttack(c, enemyAttack);
      if (c.enemySubAttack?.outcome === 'done') expect(c.enemySubAttack.target.hp).toBe(40);
      else throw new Error('expected a resolved attack');
    });
  }

  it('an unafflicted attacker keeps the single roll and hits', () => {
    mockRandom(0.95);
    const c = attackCtx([]);
    handleEnemyAttack(c, enemyAttack);
    if (c.enemySubAttack?.outcome === 'done') expect(c.enemySubAttack.target.hp).toBe(32);
    else throw new Error('expected a resolved attack');
  });
});

// ── Concentration ends on incapacitation (post-action sweep) ──────────────────
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Concentration Test',
  ship_name: 'Concentration Test',
  intro: '',
  seed_id: 'conc',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      { id: enemyId, name: 'Goblin', hp: 20, ac: 12, damage: '1d4', toHit: 2, xp: 10 },
    ],
  },
  loot: {},
  npcs: {},
};

describe('Concentration — ends when the caster is incapacitated', () => {
  it('a stunned, concentrating caster loses concentration after its turn resolves', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // enemy whiffs; nothing extra happens
    const wiz = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      hp: 30,
      max_hp: 30,
      // Concentrating on a spell, and Stunned (duration high enough to survive
      // the round tick so it's still present when the post-action sweep runs).
      conditions: ['stunned'],
      condition_durations: { stunned: 5 },
      concentrating_on: { spellId: 'hold_person', condition: 'paralyzed', rounds_left: 10 },
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
    };
    const r = await takeAction({
      action: { type: 'pass' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].concentrating_on).toBeNull();
  });
});
