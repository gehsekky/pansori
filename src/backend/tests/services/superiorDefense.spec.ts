// RE-2 — Superior Defense (SRD 5.2.1, Monk L18): spend 3 Focus Points for
// Resistance to all damage except Force, for the encounter (or until
// Incapacitated). Handled in classFeature/monk.ts (sets a `superior_defense`
// condition + spends ki); the resistance is honored in computeEnemyAttack and
// the condition clears at combat end.

import type { Character, Enemy } from '../../src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enemyActor, pcActor } from '../../src/services/actions/actor.js';
import type { ActionContext } from '../../src/services/actions/types.js';
import { handleEnemyAttack } from '../../src/services/actions/enemyAttack.js';
import { handleMonkFeature } from '../../src/services/actions/classFeature/monk.js';
import { makeChar } from '../../src/test-fixtures.js';
import { context as sandboxCtx } from '../../src/campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

function featCtx(char: Character): ActionContext {
  return {
    actor: pcActor(char, 0),
    context: { classFeatures: {} },
    st: { characters: [char], combat_active: true },
    narrative: '',
  } as unknown as ActionContext;
}
const pcChar = (c: ActionContext) => {
  if (c.actor.kind !== 'pc') throw new Error('expected pc actor');
  return c.actor.char;
};

describe('handleMonkFeature — superior_defense', () => {
  it('spends 3 ki and activates the resistance for a Monk L18', () => {
    const char = makeChar({
      character_class: 'Monk',
      level: 18,
      class_resource_uses: { ki_points: 5 },
    });
    const c = featCtx(char);
    expect(handleMonkFeature(c, 'superior_defense')).toBe(true);
    expect(pcChar(c).conditions).toContain('superior_defense');
    expect(pcChar(c).class_resource_uses.ki_points).toBe(2);
  });

  it('requires L18, enough ki, and not being already active', () => {
    const l17 = featCtx(
      makeChar({ character_class: 'Monk', level: 17, class_resource_uses: { ki_points: 5 } })
    );
    handleMonkFeature(l17, 'superior_defense');
    expect(pcChar(l17).conditions).not.toContain('superior_defense');

    const lowKi = featCtx(
      makeChar({ character_class: 'Monk', level: 18, class_resource_uses: { ki_points: 2 } })
    );
    handleMonkFeature(lowKi, 'superior_defense');
    expect(pcChar(lowKi).conditions).not.toContain('superior_defense');
    expect(lowKi.narrative).toMatch(/Discipline Points/);
  });
});

// Auto-hit flat-20 enemy; damageType varies. Reaction pre-spent so Deflect
// Attacks (also a Monk L18 feature) doesn't stack onto the assertion.
const brute = (damageType: string) =>
  ({
    id: 'brute',
    name: 'Brute',
    hp: 50,
    ac: 10,
    toHit: 100,
    damage: '20',
    damageType,
  }) as unknown as Enemy;

function ctxFor(monk: Character, enemy: Enemy): ActionContext {
  return {
    actor: enemyActor(enemy),
    context: sandboxCtx,
    st: { characters: [monk], entities: [], round: 1 },
    narrative: '',
  } as unknown as ActionContext;
}

const defendedMonk = (conditions: string[]) =>
  makeChar({
    id: 'pc-1',
    character_class: 'Monk',
    level: 18,
    hp: 40,
    max_hp: 40,
    conditions,
    turn_actions: {
      action_used: false,
      bonus_action_used: false,
      reaction_used: true, // suppress Deflect Attacks for a clean Superior-Defense assertion
      free_interaction_used: false,
    },
  });

const attack = {
  type: 'enemy_attack' as const,
  targetCharId: 'pc-1',
  advIdx: 0,
  multiattackIdx: 0,
};
const hpAfter = (ctx: ActionContext) => {
  if (ctx.enemySubAttack?.outcome !== 'done') throw new Error('expected done');
  return ctx.enemySubAttack.target.hp;
};

describe('Superior Defense — resistance (integration)', () => {
  it('halves non-force damage while active', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const ctx = ctxFor(defendedMonk(['superior_defense']), brute('slashing'));
    handleEnemyAttack(ctx, attack);
    expect(hpAfter(ctx)).toBe(30); // 20 → 10
  });

  it('does not reduce force damage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const ctx = ctxFor(defendedMonk(['superior_defense']), brute('force'));
    handleEnemyAttack(ctx, attack);
    expect(hpAfter(ctx)).toBe(20); // full 20
  });

  it('does nothing without the condition (control)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const ctx = ctxFor(defendedMonk([]), brute('slashing'));
    handleEnemyAttack(ctx, attack);
    expect(hpAfter(ctx)).toBe(20); // full 20
  });
});
