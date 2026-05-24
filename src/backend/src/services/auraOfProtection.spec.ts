// RE-2 — Aura of Protection (SRD 5.2.1, Paladin L6). You and allies within
// 10 ft of a conscious L6+ Paladin gain +CHA mod (min +1) to saving throws;
// best aura when several are present. Wired into the three PC save sites
// (enemy-spell saves, on-hit condition saves, concentration saves) — covered
// here at the helper level; the wiring is exercised by the full suite.

import type { CombatEntity, GameState } from '../types.js';
import { describe, expect, it } from 'vitest';
import { auraOfProtectionBonus } from './gameEngine.js';
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

const paladin = (over = {}) =>
  makeChar({ id: 'pal', character_class: 'Paladin', level: 6, cha: 16, ...over });

describe('auraOfProtectionBonus', () => {
  it('the paladin benefits from their own aura (CHA mod)', () => {
    const pal = paladin();
    expect(auraOfProtectionBonus(pal, gs([pal]))).toBe(3); // CHA 16 → +3
  });

  it('grants a minimum of +1 even with a low CHA', () => {
    const pal = paladin({ cha: 10 });
    expect(auraOfProtectionBonus(pal, gs([pal]))).toBe(1);
  });

  it('is inactive below Paladin L6', () => {
    const pal = paladin({ level: 5 });
    expect(auraOfProtectionBonus(pal, gs([pal]))).toBe(0);
  });

  it('covers an ally within 10 ft but not one beyond it', () => {
    const pal = paladin();
    const ally = makeChar({ id: 'ally', character_class: 'Rogue', level: 5 });
    expect(
      auraOfProtectionBonus(ally, gs([pal, ally], [ent('pal', 1, 1), ent('ally', 2, 2)]))
    ).toBe(3); // 5 ft
    expect(
      auraOfProtectionBonus(ally, gs([pal, ally], [ent('pal', 1, 1), ent('ally', 6, 6)]))
    ).toBe(0); // 25 ft
  });

  it('is inactive while the paladin is unconscious/incapacitated', () => {
    const pal = paladin({ conditions: ['unconscious'] });
    const ally = makeChar({ id: 'ally', character_class: 'Rogue', level: 5 });
    expect(
      auraOfProtectionBonus(ally, gs([pal, ally], [ent('pal', 1, 1), ent('ally', 1, 2)]))
    ).toBe(0);
  });

  it('grants nothing without a qualifying paladin', () => {
    const f = makeChar({ id: 'f', character_class: 'Fighter', level: 20, cha: 20 });
    expect(auraOfProtectionBonus(f, gs([f]))).toBe(0);
  });

  it('assumes the party is together off the grid (out of combat)', () => {
    const pal = paladin();
    const ally = makeChar({ id: 'ally', character_class: 'Rogue', level: 5 });
    expect(auraOfProtectionBonus(ally, gs([pal, ally]))).toBe(3); // no entities → in range
  });

  it('takes the best of multiple paladins', () => {
    const p1 = makeChar({ id: 'p1', character_class: 'Paladin', level: 6, cha: 14 }); // +2
    const p2 = makeChar({ id: 'p2', character_class: 'Paladin', level: 6, cha: 18 }); // +4
    const ally = makeChar({ id: 'ally', character_class: 'Rogue', level: 5 });
    expect(auraOfProtectionBonus(ally, gs([p1, p2, ally]))).toBe(4);
  });
});
