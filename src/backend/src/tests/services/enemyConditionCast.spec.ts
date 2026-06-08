// Enemy single-target condition spells (Hold Person → Paralyzed, Cause Fear →
// Frightened): resolveEnemySpell routes a no-damage condition spell to the
// condition resolver, which applies it on a confirmed failed save (the PC's
// rerolls auto-resolve first) and respects immunity.

import type { CombatEntity, Enemy, GameState, Spell } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../../campaignData/sandbox.js';
import { resolveEnemySpell } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const mage = { id: 'mage', name: 'Mage', toHit: 6, spellSaveDC: 14 } as unknown as Enemy;

const holdPerson = (): Spell =>
  ({
    id: 'hold_personish',
    name: 'Hold Person',
    savingThrow: 'wis',
    condition: 'paralyzed',
    conditionDuration: 10,
  }) as unknown as Spell;

const ent = (id: string, isEnemy: boolean): CombatEntity =>
  ({
    id,
    pos: { x: 0, y: 0 },
    isEnemy,
    hp: 30,
    maxHp: 30,
    conditions: [],
  }) as unknown as CombatEntity;

function fight(pc: ReturnType<typeof makeChar>): GameState {
  return {
    ...makeState({ id: pc.id }, { combat_active: true }),
    characters: [pc],
    entities: [ent('mage', true), ent(pc.id, false)],
  } as unknown as GameState;
}

describe('resolveEnemySpell — single-target condition cast', () => {
  it('paralyzes a PC who fails the WIS save', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // save d20 → 1, fails
    const pc = makeChar({ id: 'pc1', wis: 10, hp: 30, max_hp: 30 });
    const r = resolveEnemySpell({
      enemy: mage,
      spell: holdPerson(),
      target: pc,
      st: fight(pc),
      narrative: '',
      context: ctx,
    });
    const out = r.st.characters[0];
    expect(out.conditions).toContain('paralyzed');
    expect(out.condition_durations?.paralyzed).toBe(10);
  });

  it('spares a PC who makes the save', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 → 20, saves
    const pc = makeChar({ id: 'pc1', wis: 16, hp: 30, max_hp: 30 });
    const r = resolveEnemySpell({
      enemy: mage,
      spell: holdPerson(),
      target: pc,
      st: fight(pc),
      narrative: '',
      context: ctx,
    });
    expect(r.st.characters[0].conditions).not.toContain('paralyzed');
  });

  it('does not affect a PC immune to the condition', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const pc = makeChar({
      id: 'pc1',
      wis: 10,
      hp: 30,
      max_hp: 30,
      condition_immunities: ['paralyzed'],
    });
    const r = resolveEnemySpell({
      enemy: mage,
      spell: holdPerson(),
      target: pc,
      st: fight(pc),
      narrative: '',
      context: ctx,
    });
    expect(r.st.characters[0].conditions).not.toContain('paralyzed');
  });
});
