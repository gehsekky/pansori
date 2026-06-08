// RE-2 — Evasion (SRD 5.2.1, Rogue L7 / Monk L7). On a DEX save-for-half
// effect: no damage on success, half on failure; unavailable while
// Incapacitated. Applied in the enemy damage-spell save path
// (resolveEnemySpell), the only place a PC takes enemy save-for-half damage.

import type { Enemy, GameState, Spell } from '../../types.js';
import { describe, expect, it, vi } from 'vitest';
import { hasEvasion } from '../../services/multiclass.js';
import { makeChar } from '../../test-fixtures.js';
import { resolveEnemySpell } from '../../services/gameEngine.js';

describe('hasEvasion', () => {
  it('Rogue and Monk gain it at L7 (not L6); other classes never', () => {
    expect(hasEvasion(makeChar({ character_class: 'Rogue', level: 7 }))).toBe(true);
    expect(hasEvasion(makeChar({ character_class: 'Rogue', level: 6 }))).toBe(false);
    expect(hasEvasion(makeChar({ character_class: 'Monk', level: 7 }))).toBe(true);
    expect(hasEvasion(makeChar({ character_class: 'Fighter', level: 20 }))).toBe(false);
  });

  it('is unavailable while Incapacitated', () => {
    const c = makeChar({ character_class: 'Rogue', level: 9, conditions: ['incapacitated'] });
    expect(hasEvasion(c)).toBe(false);
  });
});

// Flat-damage spell (rollDice('10') === 10, no RNG) so only the save roll
// consumes Math.random — letting the mock dictate save success/failure.
const burst = {
  id: 'burst',
  name: 'Fire Burst',
  damage: '10',
  savingThrow: 'dex',
  saveEffect: 'half',
  damageType: 'fire',
} as unknown as Spell;
const lich = { id: 'lich', name: 'Lich', toHit: 6, spellSaveDC: 14 } as unknown as Enemy;
const stFor = (char: ReturnType<typeof makeChar>) =>
  ({ characters: [char], entities: [] }) as unknown as GameState;
const pc = (cls: string) =>
  makeChar({ id: 'pc-1', character_class: cls, level: 7, dex: 16, hp: 30, max_hp: 30 });

describe('resolveEnemySpell — Evasion on DEX save-for-half', () => {
  it('Rogue takes NO damage on a successful save', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 → 20 → save succeeds (23 vs DC 14)
    const r = resolveEnemySpell({
      enemy: lich,
      spell: burst,
      target: pc('Rogue'),
      st: stFor(pc('Rogue')),
      narrative: '',
    });
    expect(r.target.hp).toBe(30); // 0 damage
    expect(r.narrative).toContain('Evasion');
    vi.restoreAllMocks();
  });

  it('Rogue takes HALF damage on a failed save', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1 → save fails (4 vs DC 14)
    const r = resolveEnemySpell({
      enemy: lich,
      spell: burst,
      target: pc('Rogue'),
      st: stFor(pc('Rogue')),
      narrative: '',
    });
    expect(r.target.hp).toBe(25); // 30 − 5 (half of 10)
    vi.restoreAllMocks();
  });

  it('without Evasion: half on a save, full on a failure', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // save succeeds
    expect(
      resolveEnemySpell({
        enemy: lich,
        spell: burst,
        target: pc('Wizard'),
        st: stFor(pc('Wizard')),
        narrative: '',
      }).target.hp
    ).toBe(25); // half
    vi.restoreAllMocks();
    vi.spyOn(Math, 'random').mockReturnValue(0); // save fails
    expect(
      resolveEnemySpell({
        enemy: lich,
        spell: burst,
        target: pc('Wizard'),
        st: stFor(pc('Wizard')),
        narrative: '',
      }).target.hp
    ).toBe(20); // full
    vi.restoreAllMocks();
  });
});
