// RE-2 — Stroke of Luck (SRD 5.2.1, Rogue L20): once per short/long rest, turn
// a failed D20 Test into a 20. This file covers the helper + the ability-check
// (skillCheck) and saving-throw (resolveEnemySpell, checkConcentration) hooks.
// The attack-roll case is covered in strokeOfLuckAttack.spec.ts.

import type { Enemy, GameState, Spell } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkConcentration, resolveEnemySpell } from '../../services/gameEngine.js';
import { consumeStrokeOfLuck, strokeOfLuckAvailable } from '../../services/strokeOfLuck.js';
import { makeChar, mockRandom } from '../../test-fixtures.js';
import { skillCheck } from '../../services/rulesEngine.js';

afterEach(() => vi.restoreAllMocks());

describe('strokeOfLuckAvailable / consumeStrokeOfLuck', () => {
  it('is available to an L20 Rogue who has not used it', () => {
    expect(strokeOfLuckAvailable(makeChar({ character_class: 'Rogue', level: 20 }))).toBe(true);
  });

  it('is unavailable below L20, to non-Rogues, and once used', () => {
    expect(strokeOfLuckAvailable(makeChar({ character_class: 'Rogue', level: 19 }))).toBe(false);
    expect(strokeOfLuckAvailable(makeChar({ character_class: 'Wizard', level: 20 }))).toBe(false);
    expect(
      strokeOfLuckAvailable(
        makeChar({
          character_class: 'Rogue',
          level: 20,
          class_resource_uses: { stroke_of_luck: 1 },
        })
      )
    ).toBe(false);
  });

  it('consume marks the single use, preserving other resources', () => {
    const after = consumeStrokeOfLuck(
      makeChar({ character_class: 'Rogue', level: 20, class_resource_uses: { second_wind: 1 } })
    );
    expect(after.class_resource_uses.stroke_of_luck).toBe(1);
    expect(after.class_resource_uses.second_wind).toBe(1);
  });
});

// skillCheck(score, dc, prof, level, disadv, expertise, joat, adv,
//            halflingLucky, reliableTalent, strokeOfLuck, reviveD20Pen)
describe('skillCheck — Stroke of Luck', () => {
  it('turns a failed check into a 20 when that rescues it', () => {
    mockRandom(0.2); // d20 → 5
    const r = skillCheck(10, 15, false, 1, false, false, false, false, false, false, true);
    expect(r.roll).toBe(20);
    expect(r.success).toBe(true);
    expect(r.strokeOfLuckUsed).toBe(true);
  });

  it('does not fire when even a 20 would miss the DC', () => {
    mockRandom(0.2); // d20 → 5; 20 + 0 mod = 20 < DC 25
    const r = skillCheck(10, 25, false, 1, false, false, false, false, false, false, true);
    expect(r.strokeOfLuckUsed).toBe(false);
    expect(r.success).toBe(false);
  });

  it('does not fire on a check that already succeeded', () => {
    mockRandom(0.99); // d20 → 20, passes DC 5 on its own
    const r = skillCheck(10, 5, false, 1, false, false, false, false, false, false, true);
    expect(r.strokeOfLuckUsed).toBe(false);
  });

  it('does nothing without the feature available', () => {
    mockRandom(0.2);
    const r = skillCheck(10, 15, false, 1, false, false, false, false, false, false, false);
    expect(r.strokeOfLuckUsed).toBe(false);
    expect(r.success).toBe(false);
  });
});

// CON-save spell so Evasion (DEX-only) doesn't enter the picture.
const conBurst = {
  id: 'burst',
  name: 'Thunder Burst',
  damage: '10',
  savingThrow: 'con',
  saveEffect: 'half',
  damageType: 'thunder',
} as unknown as Spell;
const lich = { id: 'lich', name: 'Lich', toHit: 6, spellSaveDC: 14 } as unknown as Enemy;
const stFor = (c: ReturnType<typeof makeChar>) =>
  ({ characters: [c], entities: [] }) as unknown as GameState;
const rogue = (over = {}) =>
  makeChar({ id: 'r', character_class: 'Rogue', level: 20, con: 10, hp: 30, max_hp: 30, ...over });

describe('resolveEnemySpell — Stroke of Luck on a failed save', () => {
  it('rescues a failed save and spends the use', () => {
    mockRandom(0); // save d20 → 1, fails; 20 + 0 mod = 20 ≥ DC 14 → SoL rescues
    const r = resolveEnemySpell({
      enemy: lich,
      spell: conBurst,
      target: rogue(),
      st: stFor(rogue()),
      narrative: '',
    });
    expect(r.target.hp).toBe(25); // saved → half of 10
    expect(r.target.class_resource_uses.stroke_of_luck).toBe(1);
    expect(r.narrative).toContain('Stroke of Luck');
  });

  it('a Rogue L19 has no use — takes full damage (control)', () => {
    mockRandom(0);
    const r = resolveEnemySpell({
      enemy: lich,
      spell: conBurst,
      target: rogue({ level: 19 }),
      st: stFor(rogue({ level: 19 })),
      narrative: '',
    });
    expect(r.target.hp).toBe(20); // failed → full 10
    expect(r.target.class_resource_uses.stroke_of_luck ?? 0).toBe(0);
  });
});

describe('checkConcentration — Stroke of Luck on the CON save', () => {
  const conc = (over = {}) => rogue({ concentrating_on: { spellId: 'bless' }, ...over });

  it('turns a failed concentration save into a 20 to hold, spending the use', () => {
    mockRandom(0); // d20 → 1; DC 20 (40 dmg); 20 + 0 ≥ 20 → SoL holds
    const c = conc();
    const r = checkConcentration(c, stFor(c), 40);
    expect(r.char.concentrating_on).toBeTruthy();
    expect(r.char.class_resource_uses.stroke_of_luck).toBe(1);
    expect(r.note).toContain('Stroke of Luck');
  });

  it('a Rogue L19 drops concentration (control)', () => {
    mockRandom(0);
    const c = conc({ level: 19 });
    const r = checkConcentration(c, stFor(c), 40);
    expect(r.char.concentrating_on).toBeFalsy();
    expect(r.char.class_resource_uses?.stroke_of_luck ?? 0).toBe(0);
  });
});
