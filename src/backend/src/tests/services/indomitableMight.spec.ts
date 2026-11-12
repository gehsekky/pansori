// RE-2 — Indomitable Might (SRD 5.2.1, Barbarian L18): if your total for a
// Strength check is less than your Strength score, use the score in place of
// the total. `applyIndomitableMight` floors the total; wired into the
// STR (Athletics) escape check in combatTactical. (Grapple and Shove are saves
// the target makes, so there's no PC check to floor.)

import type { Character, Enemy } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionContext } from '../../services/actions/types.js';
import { applyIndomitableMight } from '../../services/multiclass.js';
import { handleTryEscapeGrapple } from '../../services/actions/combatTactical.js';
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

// The PC is held by the orc with escape DC 15.
function heldCtx(char: Character): ActionContext {
  const held = { ...char, conditions: ['grappled'] } as Character;
  return {
    actor: pcActor(held, 0),
    context: { classSkills: { Barbarian: [] } }, // no Athletics prof → roll is d20 + STR mod
    enemy: orc,
    enemyAlive: true,
    livingEnemiesInRoom: [orc],
    seed: { enemies: {} },
    st: {
      combat_active: true,
      characters: [held],
      entities: [
        {
          id: char.id,
          isEnemy: false,
          pos: { x: 1, y: 1 },
          hp: 30,
          maxHp: 30,
          conditions: ['grappled'],
          condition_durations: {},
          grappled_by: 'orc-1',
          grapple_escape_dc: 15,
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

const stillHeld = (ctx: ActionContext, id: string) =>
  ctx.st.entities?.find((e) => e.id === id)?.conditions.includes('grappled');

describe('Indomitable Might — escaping a grapple (integration)', () => {
  // d20 → 1: the raw Athletics total (1 + 5 = 6) misses DC 15; floored to
  // STR 20 it escapes.
  it('a Barbarian L18 escapes on a roll that would otherwise fail', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const ctx = heldCtx(makeChar({ id: 'pc-1', character_class: 'Barbarian', level: 18, str: 20 }));
    handleTryEscapeGrapple(ctx, { type: 'try_escape_grapple' });
    expect(stillHeld(ctx, 'pc-1')).toBe(false);
  });

  it('a Barbarian L17 stays held on the same roll (control)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const ctx = heldCtx(makeChar({ id: 'pc-1', character_class: 'Barbarian', level: 17, str: 20 }));
    handleTryEscapeGrapple(ctx, { type: 'try_escape_grapple' });
    expect(stillHeld(ctx, 'pc-1')).toBe(true);
  });
});
