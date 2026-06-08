// RE-2 — Fighter Indomitable (SRD 5.2.1, L9). Reroll a failed saving throw
// with a +Fighter-level bonus; 1/2/3 uses (L9/13/17) per long rest, tracked as
// `class_resource_uses.indomitable`. Auto-resolved player-favorably: a use is
// spent only when the reroll rescues the save. Wired into the three PC save
// sites Aura of Protection touches — enemy-spell saves (covered here via
// resolveEnemySpell), concentration saves (checkConcentration), and on-hit
// condition saves (exercised by the full enemy-attack suite).

import type { Enemy, GameState, Spell } from '../../src/types.js';
import { checkConcentration, resolveEnemySpell } from '../../src/services/gameEngine.js';
import {
  consumeIndomitable,
  indomitableBonus,
  tryIndomitableReroll,
} from '../../src/services/indomitable.js';
import { describe, expect, it, vi } from 'vitest';
import { indomitableMaxUses, indomitableRemaining } from '../../src/services/multiclass.js';
import { makeChar } from '../../src/test-fixtures.js';

describe('indomitable use counts', () => {
  it('is 1 at L9, 2 at L13, 3 at L17, and 0 below L9', () => {
    const fighter = (level: number) => makeChar({ character_class: 'Fighter', level });
    expect(indomitableMaxUses(fighter(8))).toBe(0);
    expect(indomitableMaxUses(fighter(9))).toBe(1);
    expect(indomitableMaxUses(fighter(12))).toBe(1);
    expect(indomitableMaxUses(fighter(13))).toBe(2);
    expect(indomitableMaxUses(fighter(17))).toBe(3);
    expect(indomitableMaxUses(fighter(20))).toBe(3);
  });

  it('is 0 for a non-Fighter, even at high level', () => {
    expect(indomitableMaxUses(makeChar({ character_class: 'Wizard', level: 20 }))).toBe(0);
  });

  it('remaining = max minus uses spent, never negative', () => {
    expect(indomitableRemaining(makeChar({ character_class: 'Fighter', level: 13 }))).toBe(2);
    expect(
      indomitableRemaining(
        makeChar({ character_class: 'Fighter', level: 13, class_resource_uses: { indomitable: 1 } })
      )
    ).toBe(1);
    expect(
      indomitableRemaining(
        makeChar({ character_class: 'Fighter', level: 9, class_resource_uses: { indomitable: 5 } })
      )
    ).toBe(0);
  });

  it('the reroll bonus equals the Fighter level', () => {
    expect(indomitableBonus(makeChar({ character_class: 'Fighter', level: 9 }))).toBe(9);
    expect(indomitableBonus(makeChar({ character_class: 'Rogue', level: 9 }))).toBe(0);
  });
});

describe('tryIndomitableReroll policy', () => {
  const f9 = () => makeChar({ character_class: 'Fighter', level: 9 });

  it('spends a use only when the reroll succeeds', () => {
    expect(tryIndomitableReroll(f9(), () => true)).toEqual({ saved: true, used: true });
  });

  it('does not spend a use when the reroll also fails', () => {
    expect(tryIndomitableReroll(f9(), () => false)).toEqual({ saved: false, used: false });
  });

  it('does nothing — and never rolls — when no uses remain', () => {
    const spent = makeChar({
      character_class: 'Fighter',
      level: 9,
      class_resource_uses: { indomitable: 1 },
    });
    const reroll = vi.fn(() => true);
    expect(tryIndomitableReroll(spent, reroll)).toEqual({ saved: false, used: false });
    expect(reroll).not.toHaveBeenCalled();
  });
});

describe('consumeIndomitable', () => {
  it('increments the used count, preserving other resources', () => {
    const c = makeChar({
      character_class: 'Fighter',
      level: 9,
      class_resource_uses: { indomitable: 1, second_wind: 1 },
    });
    const after = consumeIndomitable(c);
    expect(after.class_resource_uses.indomitable).toBe(2);
    expect(after.class_resource_uses.second_wind).toBe(1); // untouched
  });
});

// Flat-damage spell (rollDice('10') === 10, no RNG) so only the save rolls
// consume Math.random — and the mock feeds the same d20 to both the original
// save and the Indomitable reroll. Save DC 14; the Fighter has DEX 10 (+0), so
// the reroll's only edge is the +Fighter-level bonus.
const burst = {
  id: 'burst',
  name: 'Fire Burst',
  damage: '10',
  savingThrow: 'dex',
  saveEffect: 'half',
  damageType: 'fire',
} as unknown as Spell;
const lich = { id: 'lich', name: 'Lich', toHit: 6, spellSaveDC: 14 } as unknown as Enemy;
const fighter = (over = {}) =>
  makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 9,
    dex: 10,
    hp: 30,
    max_hp: 30,
    ...over,
  });
const stFor = (char: ReturnType<typeof makeChar>) =>
  ({ characters: [char], entities: [] }) as unknown as GameState;

describe('resolveEnemySpell — Indomitable defers to an interactive save_reroll', () => {
  it('a failed save commits full damage and surfaces a winning reroll (use not yet spent)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.55); // d20 → 12: 12<14 fails, 12+9=21 saves
    const r = resolveEnemySpell({
      enemy: lich,
      spell: burst,
      target: fighter(),
      st: stFor(fighter()),
      narrative: '',
    });
    expect(r.target.hp).toBe(20); // full 10 now — the window refunds on accept
    expect(r.target.class_resource_uses.indomitable ?? 0).toBe(0); // deferred to the window
    expect(r.pendingSaveReroll?.source).toBe('indomitable');
    expect(r.pendingSaveReroll?.succeeds).toBe(true);
    expect(r.pendingSaveReroll?.damageRefund).toBe(5); // full 10 − half 5
    vi.restoreAllMocks();
  });

  it('still surfaces the window when the reroll would fail (the player decides)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1: 1<14 and 1+9=10<14 both fail
    const r = resolveEnemySpell({
      enemy: lich,
      spell: burst,
      target: fighter(),
      st: stFor(fighter()),
      narrative: '',
    });
    expect(r.target.hp).toBe(20); // failed → full 10
    expect(r.target.class_resource_uses.indomitable ?? 0).toBe(0);
    expect(r.pendingSaveReroll?.succeeds).toBe(false);
    vi.restoreAllMocks();
  });

  it('cannot reroll once the daily use is spent', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.55); // would rescue if a use were available
    const r = resolveEnemySpell({
      enemy: lich,
      spell: burst,
      target: fighter({ class_resource_uses: { indomitable: 1 } }),
      st: stFor(fighter()),
      narrative: '',
    });
    expect(r.target.hp).toBe(20); // failed → full 10
    expect(r.target.class_resource_uses.indomitable).toBe(1); // unchanged
    vi.restoreAllMocks();
  });

  it('a sub-L9 Fighter has no reroll to use', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.55);
    const r = resolveEnemySpell({
      enemy: lich,
      spell: burst,
      target: fighter({ level: 8 }),
      st: stFor(fighter({ level: 8 })),
      narrative: '',
    });
    expect(r.target.hp).toBe(20); // failed → full 10, no rescue
    expect(r.target.class_resource_uses.indomitable ?? 0).toBe(0);
    vi.restoreAllMocks();
  });
});

describe('checkConcentration — Indomitable on the CON save', () => {
  const concentrator = (over = {}) =>
    fighter({ con: 10, concentrating_on: { spellId: 'bless' }, ...over });

  it('rerolls a failed concentration save to hold, spending a use', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.55); // d20 → 12; DC 20: 12 fails, 12+9=21 holds
    const c = concentrator();
    const r = checkConcentration(c, stFor(c), 40); // dmg 40 → DC 20
    expect(r.char.concentrating_on).toBeTruthy(); // still concentrating
    expect(r.char.class_resource_uses.indomitable).toBe(1);
    expect(r.note).toContain('Indomitable');
    vi.restoreAllMocks();
  });

  it('breaks concentration when even the reroll fails — no use spent', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1; DC 20: 1 and 1+9=10 both fail
    const c = concentrator();
    const r = checkConcentration(c, stFor(c), 40);
    expect(r.char.concentrating_on).toBeFalsy(); // dropped
    expect(r.char.class_resource_uses?.indomitable ?? 0).toBe(0);
    vi.restoreAllMocks();
  });
});
