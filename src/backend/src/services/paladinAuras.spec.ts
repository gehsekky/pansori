// RE-2 — Paladin aura upgrades: Aura Expansion (L18, 10→30 ft), Aura of
// Courage (L10, Frightened immunity in the aura), and Oath of Devotion's
// Aura of Devotion (L7, Charmed immunity). Covered here at the helper level;
// the wiring (conditionSavingThrow short-circuit + the turn-end clear) is
// exercised by the full suite.

import type { CombatEntity, GameState } from '../types.js';
import { auraConditionImmunity, auraOfProtectionBonus } from './gameEngine.js';
import { describe, expect, it } from 'vitest';
import { makeChar } from '../test-fixtures.js';

const ent = (id: string, x: number, y: number): CombatEntity => ({
  id,
  isEnemy: false,
  side: 'pc',
  pos: { x, y },
  hp: 10,
  maxHp: 10,
  conditions: [],
  condition_durations: {},
});
const gs = (characters: ReturnType<typeof makeChar>[], entities: CombatEntity[] = []) =>
  ({ characters, entities }) as unknown as GameState;
const ally = () => makeChar({ id: 'ally', character_class: 'Rogue', level: 5 });

describe('Aura Expansion (L18) — 30 ft radius', () => {
  it('an L18 paladin covers an ally at 25 ft; an L17 paladin (10 ft) does not', () => {
    const a = ally();
    const l18 = makeChar({ id: 'pal', character_class: 'Paladin', level: 18, cha: 16 });
    const l17 = makeChar({ id: 'pal', character_class: 'Paladin', level: 17, cha: 16 });
    // ally 5 squares away = 25 ft.
    expect(auraOfProtectionBonus(a, gs([l18, a], [ent('pal', 1, 1), ent('ally', 6, 6)]))).toBe(3);
    expect(auraOfProtectionBonus(a, gs([l17, a], [ent('pal', 1, 1), ent('ally', 6, 6)]))).toBe(0);
  });
});

describe('auraConditionImmunity — Courage (L10) + Devotion (L7)', () => {
  it('Aura of Courage (L10) grants Frightened immunity, not Charmed', () => {
    const pal = makeChar({ id: 'pal', character_class: 'Paladin', level: 10, cha: 16 });
    const imm = auraConditionImmunity(pal, gs([pal]));
    expect(imm.has('frightened')).toBe(true);
    expect(imm.has('charmed')).toBe(false);
  });

  it('does not grant Frightened immunity below L10', () => {
    const pal = makeChar({ id: 'pal', character_class: 'Paladin', level: 9, cha: 16 });
    expect(auraConditionImmunity(pal, gs([pal])).has('frightened')).toBe(false);
  });

  it('Aura of Devotion (Oath of Devotion L7) grants Charmed immunity', () => {
    const pal = makeChar({
      id: 'pal',
      character_class: 'Paladin',
      subclass: 'devotion',
      level: 7,
      cha: 16,
    });
    expect(auraConditionImmunity(pal, gs([pal])).has('charmed')).toBe(true);
  });

  it('a non-Devotion L7 paladin grants no Charmed immunity', () => {
    const pal = makeChar({ id: 'pal', character_class: 'Paladin', level: 7, cha: 16 });
    expect(auraConditionImmunity(pal, gs([pal])).has('charmed')).toBe(false);
  });

  it('covers an ally in range but not beyond it (10 ft at L10)', () => {
    const pal = makeChar({ id: 'pal', character_class: 'Paladin', level: 10, cha: 16 });
    const a = ally();
    expect(
      auraConditionImmunity(a, gs([pal, a], [ent('pal', 1, 1), ent('ally', 2, 2)])).has(
        'frightened'
      )
    ).toBe(true); // 5 ft
    expect(
      auraConditionImmunity(a, gs([pal, a], [ent('pal', 1, 1), ent('ally', 6, 6)])).has(
        'frightened'
      )
    ).toBe(false); // 25 ft
  });

  it('Aura Expansion stretches the immunity to 30 ft at L18', () => {
    const pal = makeChar({
      id: 'pal',
      character_class: 'Paladin',
      subclass: 'devotion',
      level: 18,
      cha: 16,
    });
    const a = ally();
    expect(
      auraConditionImmunity(a, gs([pal, a], [ent('pal', 1, 1), ent('ally', 6, 6)])).has('charmed')
    ).toBe(true); // 25 ft, within the expanded 30 ft
  });

  it('is inactive while the paladin is incapacitated', () => {
    const pal = makeChar({
      id: 'pal',
      character_class: 'Paladin',
      level: 10,
      cha: 16,
      conditions: ['unconscious'],
    });
    expect(auraConditionImmunity(pal, gs([pal])).size).toBe(0);
  });
});
