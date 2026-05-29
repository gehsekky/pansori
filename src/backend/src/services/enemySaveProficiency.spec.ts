// SRD 5.2.1 — a creature adds its proficiency bonus to saving throws it's
// proficient in. `resolveEnemySpell` (enemy damage spell vs a PC) previously
// added only the ability modifier + Aura of Protection, so the shipped features
// that grant save proficiency never reached enemy spell saves. This covers the
// fix: class save proficiency + Resilient (feat) + Slippery Mind (Rogue L15) +
// Disciplined Survivor (Monk L14), all credited when `context` is supplied.
//
// All tests pin the same save d20 = 12 (Math.random 0.55) against DC 14 with a
// +0 ability modifier, so the +proficiency bonus is the ONLY thing that can flip
// the negate-save from fail (12 < 14) to pass (12 + prof ≥ 14).

import type { Enemy, GameState, Spell } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, mockRandom } from '../test-fixtures.js';
import { context as ctx } from '../contexts/sandbox.js';
import { resolveEnemySpell } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const mage = { id: 'mage', name: 'Mage', toHit: 6, spellSaveDC: 14 } as unknown as Enemy;
const stFor = (c: ReturnType<typeof makeChar>) =>
  ({ characters: [c], entities: [] }) as unknown as GameState;

// Flat 10 damage (no damage-roll RNG) so the single save d20 is the only random.
function negateSpell(save: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'): Spell {
  return {
    id: 'blast',
    name: 'Fire Wave',
    damage: '10',
    savingThrow: save,
    saveEffect: 'negates',
    damageType: 'fire',
  } as unknown as Spell;
}

// d20 = 12 (0.55 → floor(0.55*20)+1). 12 < 14 fails; 12 + prof (≥3 here) saves.
const ROLL_12 = 0.55;

describe('resolveEnemySpell — class save proficiency', () => {
  it('a Wizard saves on a proficient ability (INT) thanks to the proficiency bonus', () => {
    mockRandom(ROLL_12);
    const wiz = makeChar({
      id: 'w',
      character_class: 'Wizard',
      level: 5,
      int: 10,
      hp: 30,
      max_hp: 30,
    });
    const r = resolveEnemySpell({
      enemy: mage,
      spell: negateSpell('int'),
      target: wiz,
      st: stFor(wiz),
      narrative: '',
      context: ctx,
    });
    expect(r.target.hp).toBe(30); // 12 + prof(3) = 15 ≥ 14 → negated
  });

  it('the same Wizard fails on a NON-proficient ability (CON) — same roll', () => {
    mockRandom(ROLL_12);
    const wiz = makeChar({
      id: 'w',
      character_class: 'Wizard',
      level: 5,
      con: 10,
      hp: 30,
      max_hp: 30,
    });
    const r = resolveEnemySpell({
      enemy: mage,
      spell: negateSpell('con'),
      target: wiz,
      st: stFor(wiz),
      narrative: '',
      context: ctx,
    });
    expect(r.target.hp).toBe(20); // 12 + 0 = 12 < 14 → full 10
  });

  it('without context the proficiency bonus is skipped (backward-compatible)', () => {
    mockRandom(ROLL_12);
    const wiz = makeChar({
      id: 'w',
      character_class: 'Wizard',
      level: 5,
      int: 10,
      hp: 30,
      max_hp: 30,
    });
    const r = resolveEnemySpell({
      enemy: mage,
      spell: negateSpell('int'),
      target: wiz,
      st: stFor(wiz),
      narrative: '',
    });
    expect(r.target.hp).toBe(20); // no context → no prof → 12 < 14 → full 10
  });
});

describe('resolveEnemySpell — features that widen save proficiency', () => {
  it('Resilient (feat) grants the chosen ability — a Wizard with Resilient (CON) saves', () => {
    mockRandom(ROLL_12);
    const wiz = makeChar({
      id: 'w',
      character_class: 'Wizard',
      level: 5,
      con: 10,
      hp: 30,
      max_hp: 30,
      feat_choices: { resilient: { saveProficiencies: ['con'] } },
    });
    const r = resolveEnemySpell({
      enemy: mage,
      spell: negateSpell('con'),
      target: wiz,
      st: stFor(wiz),
      narrative: '',
      context: ctx,
    });
    expect(r.target.hp).toBe(30); // feat-granted CON proficiency rescues the save
  });

  it('Slippery Mind (Rogue L15) grants WIS — saves on a WIS save', () => {
    mockRandom(ROLL_12);
    const rogue = makeChar({
      id: 'r',
      character_class: 'Rogue',
      level: 15,
      wis: 10,
      hp: 60,
      max_hp: 60,
    });
    const r = resolveEnemySpell({
      enemy: mage,
      spell: negateSpell('wis'),
      target: rogue,
      st: stFor(rogue),
      narrative: '',
      context: ctx,
    });
    expect(r.target.hp).toBe(60); // Slippery Mind → WIS proficient → saves
  });

  it('a Rogue L14 (no Slippery Mind yet) fails the same WIS save', () => {
    mockRandom(ROLL_12);
    const rogue = makeChar({
      id: 'r',
      character_class: 'Rogue',
      level: 14,
      wis: 10,
      hp: 60,
      max_hp: 60,
    });
    const r = resolveEnemySpell({
      enemy: mage,
      spell: negateSpell('wis'),
      target: rogue,
      st: stFor(rogue),
      narrative: '',
      context: ctx,
    });
    expect(r.target.hp).toBe(50); // not proficient → 12 < 14 → full 10
  });

  it('Disciplined Survivor (Monk L14) grants all saves — saves on a non-class WIS save', () => {
    mockRandom(ROLL_12);
    const monk = makeChar({
      id: 'm',
      character_class: 'Monk',
      level: 14,
      wis: 10,
      hp: 90,
      max_hp: 90,
    });
    const r = resolveEnemySpell({
      enemy: mage,
      spell: negateSpell('wis'),
      target: monk,
      st: stFor(monk),
      narrative: '',
      context: ctx,
    });
    expect(r.target.hp).toBe(90); // proficient in every save → rescues the WIS save
  });
});
