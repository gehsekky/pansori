// RE-2 — Indomitable Might (SRD 5.2.1, Barbarian L18): if your total for a
// Strength check is less than your Strength score, use the score in place of
// the total. `applyIndomitableMight` floors the total; wired into the
// STR(Athletics) contests in combatTactical (grapple, shove, escape).

import type { Character, Enemy } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionContext } from '../../services/actions/types.js';
import { applyIndomitableMight } from '../../services/multiclass.js';
import { handleGrapple } from '../../services/actions/combatTactical.js';
import { makeChar } from '../../test-fixtures.js';
import { pcActor } from '../../services/actions/actor.js';

afterEach(() => vi.restoreAllMocks());

describe('applyIndomitableMight', () => {
  const barb = (level: number, str = 20) => makeChar({ character_class: 'Barbarian', level, str });

  it('floors a low STR-check total at the STR score (L18)', () => {
    expect(applyIndomitableMight(barb(18), 12)).toBe(20); // total 12 < STR 20 → 20
  });

  it('leaves a total already above the STR score unchanged', () => {
    expect(applyIndomitableMight(barb(18), 25)).toBe(25);
  });

  it('is a no-op below L18 and for non-Barbarians', () => {
    expect(applyIndomitableMight(barb(17), 12)).toBe(12);
    expect(
      applyIndomitableMight(makeChar({ character_class: 'Fighter', level: 20, str: 20 }), 12)
    ).toBe(12);
  });
});

const orc = { id: 'orc-1', name: 'Orc', toHit: 10, dex: 10, hp: 20 } as unknown as Enemy;

function grappleCtx(char: Character): ActionContext {
  return {
    actor: pcActor(char, 0),
    context: { classSkills: { Barbarian: [] } }, // no Athletics prof → roll is d20 + STR mod
    enemy: orc,
    enemyAlive: true,
    livingEnemiesInRoom: [orc],
    st: {
      combat_active: true,
      characters: [char],
      entities: [
        {
          id: char.id,
          isEnemy: false,
          pos: { x: 1, y: 1 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
        {
          id: 'orc-1',
          isEnemy: true,
          pos: { x: 2, y: 1 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
      ],
    },
    narrative: '',
    usedInitiative: false,
  } as unknown as ActionContext;
}

const grappledOrc = (ctx: ActionContext) =>
  ctx.st.entities?.find((e) => e.id === 'orc-1')?.conditions.includes('grappled');

describe('Indomitable Might — grapple contest (integration)', () => {
  // The grapple now resolves the enemy's d20 first (it's the skillCheck DC),
  // then the player's. enemy d20 → 15; player d20 → 1 (raw total well under 15).
  // Without the floor the grapple fails; with it the player's total becomes
  // STR 20 > 15.
  function pinRolls() {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    spy.mockReturnValueOnce(0.7).mockReturnValueOnce(0);
  }

  it('a Barbarian L18 grapples on a roll that would otherwise lose', () => {
    pinRolls();
    const ctx = grappleCtx(
      makeChar({ id: 'pc-1', character_class: 'Barbarian', level: 18, str: 20 })
    );
    handleGrapple(ctx, { type: 'grapple' });
    expect(grappledOrc(ctx)).toBe(true); // floored to STR 20 > 15
  });

  it('a Barbarian L17 fails the same contest (control)', () => {
    pinRolls();
    const ctx = grappleCtx(
      makeChar({ id: 'pc-1', character_class: 'Barbarian', level: 17, str: 20 })
    );
    handleGrapple(ctx, { type: 'grapple' });
    expect(grappledOrc(ctx)).toBeFalsy(); // raw 6 < 15
  });
});
