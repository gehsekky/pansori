// RE-2 — Relentless Rage (SRD 5.2.1, Barbarian L11): if you drop to 0 HP while
// raging (and aren't killed outright), a CON save — DC 10, +5 per prior use
// this rest — leaves you at 2× Barbarian level HP instead. Wired into the
// enemy-attack knockout path (resolveEnemySubAttack), beside Orc Relentless
// Endurance; the DC counter resets on a short or long rest.

import type { Character, Enemy } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionContext } from '../../services/actions/types.js';
import { enemyActor } from '../../services/actions/actor.js';
import { handleEnemyAttack } from '../../services/actions/enemyAttack.js';
import { makeChar } from '../../test-fixtures.js';
import { context as sandboxCtx } from '../fixtures/testContext.js';

afterEach(() => vi.restoreAllMocks());

// Auto-hit (toHit 100) flat-20 damage. Rage halves all incoming damage in this
// engine, so 20 → 10, dropping the 10/40-HP barbarian to exactly 0 (remainder
// 0 < max 40 → not massive death) so Relentless Rage can trigger. (A non-raging
// control takes the full 20 and still lands at 0.)
const brute = {
  id: 'brute',
  name: 'Brute',
  hp: 50,
  ac: 10,
  toHit: 100,
  damage: '20',
  damageType: 'slashing',
} as unknown as Enemy;

function ctxFor(barb: Character): ActionContext {
  return {
    actor: enemyActor(brute),
    context: sandboxCtx,
    st: { characters: [barb], entities: [], round: 1 },
    narrative: '',
  } as unknown as ActionContext;
}

// Pin the attack roll + narrative pick; the CON save then reads `def`.
function pin(def: number) {
  const spy = vi.spyOn(Math, 'random').mockReturnValue(def);
  spy.mockReturnValueOnce(0.5).mockReturnValueOnce(0.5);
}

const barb = (over = {}) =>
  makeChar({
    id: 'pc-1',
    character_class: 'Barbarian',
    level: 11,
    con: 14, // +2
    hp: 10,
    max_hp: 40,
    conditions: ['raging'],
    ...over,
  });

const attack = {
  type: 'enemy_attack' as const,
  targetCharId: 'pc-1',
  advIdx: 0,
  multiattackIdx: 0,
};
const targetOf = (ctx: ActionContext) => {
  if (ctx.enemySubAttack?.outcome !== 'done') throw new Error('expected done');
  return ctx.enemySubAttack.target;
};

describe('Relentless Rage — drop to 0 while raging', () => {
  it('a passing CON save keeps the barbarian up at 2× level HP', () => {
    pin(0.99); // CON save d20 → 20; 20 + 2 ≥ DC 10
    const ctx = ctxFor(barb());
    handleEnemyAttack(ctx, attack);
    const t = targetOf(ctx);
    expect(t.hp).toBe(22); // 2 × Barbarian level 11
    expect(t.class_resource_uses.relentless_rage_used).toBe(1);
    expect(ctx.narrative).toContain('Relentless Rage');
  });

  it('a failed CON save lets the barbarian drop', () => {
    pin(0); // CON save d20 → 1; 1 + 2 < DC 10
    const ctx = ctxFor(barb());
    handleEnemyAttack(ctx, attack);
    const t = targetOf(ctx);
    expect(t.hp).toBe(0);
    expect(t.class_resource_uses?.relentless_rage_used ?? 0).toBe(0);
    expect(ctx.narrative).not.toContain('Relentless Rage');
  });

  it('the DC climbs +5 per use — a roll that passed at DC 10 fails at DC 15', () => {
    pin(0.55); // CON save d20 → 12; 12 + 2 = 14 ≥ 10 but < 15
    const ctx = ctxFor(barb({ class_resource_uses: { relentless_rage_used: 1 } }));
    handleEnemyAttack(ctx, attack);
    expect(targetOf(ctx).hp).toBe(0); // failed the escalated DC
  });

  it('does nothing when the barbarian is not raging (control)', () => {
    pin(0.99);
    const ctx = ctxFor(barb({ conditions: [] }));
    handleEnemyAttack(ctx, attack);
    expect(targetOf(ctx).hp).toBe(0);
    expect(ctx.narrative).not.toContain('Relentless Rage');
  });
});
