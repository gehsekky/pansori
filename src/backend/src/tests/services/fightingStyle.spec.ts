// RE-2 — Fighting Style framework (SRD 5.2.1). Covers slot accounting,
// the membership helper, and the `choose_fighting_style` handler. The
// passive effects (Archery → ranged to-hit, Two-Weapon → off-hand damage)
// are small additions to the attack pipelines, covered by the broader
// attack suite staying green.

import {
  defenseAcBonus,
  fightingStyleSlots,
  fightingStyleSlotsForClassLevel,
  hasFightingStyle,
  resolveCreationFightingStyles,
} from '../../services/fightingStyle.js';
import { describe, expect, it, vi } from 'vitest';
import { rollCriticalGwf, rollDiceGwf } from '../../services/rulesEngine.js';
import type { ActionContext } from '../../services/actions/types.js';
import type { LootItem } from '../../types.js';
import { handleChooseFightingStyle } from '../../services/actions/meta.js';
import { makeChar } from '../../test-fixtures.js';
import { pcActor } from '../../services/actions/actor.js';

describe('fightingStyleSlots', () => {
  it('Fighter gains 1 at L1 and a second at L7', () => {
    expect(fightingStyleSlots(makeChar({ character_class: 'Fighter', level: 1 }))).toBe(1);
    expect(fightingStyleSlots(makeChar({ character_class: 'Fighter', level: 6 }))).toBe(1);
    expect(fightingStyleSlots(makeChar({ character_class: 'Fighter', level: 7 }))).toBe(2);
  });

  it('Paladin and Ranger gain one at L2 (none at L1)', () => {
    expect(fightingStyleSlots(makeChar({ character_class: 'Paladin', level: 1 }))).toBe(0);
    expect(fightingStyleSlots(makeChar({ character_class: 'Paladin', level: 2 }))).toBe(1);
    expect(fightingStyleSlots(makeChar({ character_class: 'Ranger', level: 2 }))).toBe(1);
  });

  it('non-martial classes get no Fighting Style', () => {
    expect(fightingStyleSlots(makeChar({ character_class: 'Wizard', level: 20 }))).toBe(0);
  });

  it('multiclass sums the per-class grants', () => {
    const c = makeChar({
      character_class: 'Fighter',
      level: 9,
      class_levels: { fighter: 7, paladin: 2 },
    });
    expect(fightingStyleSlots(c)).toBe(3); // Fighter L1 + Fighter L7 + Paladin L2
  });
});

describe('hasFightingStyle', () => {
  it('reflects the chosen styles', () => {
    const c = makeChar({ fighting_styles: ['archery'] });
    expect(hasFightingStyle(c, 'archery')).toBe(true);
    expect(hasFightingStyle(c, 'defense')).toBe(false);
  });
});

function ctxFor(char: ReturnType<typeof makeChar>): ActionContext {
  return {
    actor: pcActor(char, 0),
    st: { characters: [char] },
    narrative: '',
  } as unknown as ActionContext;
}

describe('handleChooseFightingStyle', () => {
  it('adds a valid style when a slot is available', () => {
    const ctx = ctxFor(makeChar({ character_class: 'Fighter', level: 1 }));
    const result = handleChooseFightingStyle(ctx, {
      type: 'choose_fighting_style',
      style: 'archery',
    });
    expect(result).toBeUndefined();
    if (ctx.actor.kind !== 'pc') throw new Error('expected pc actor');
    expect(ctx.actor.char.fighting_styles).toEqual(['archery']);
  });

  it('rejects an unknown / PHB-only style', () => {
    const ctx = ctxFor(makeChar({ character_class: 'Fighter', level: 1 }));
    expect(
      handleChooseFightingStyle(ctx, { type: 'choose_fighting_style', style: 'dueling' })
    ).toMatchObject({ rejected: expect.stringContaining('Unknown') });
  });

  it('refuses a duplicate style', () => {
    const ctx = ctxFor(
      makeChar({ character_class: 'Fighter', level: 7, fighting_styles: ['archery'] })
    );
    handleChooseFightingStyle(ctx, { type: 'choose_fighting_style', style: 'archery' });
    expect(ctx.narrative).toContain('already have');
  });

  it('refuses a pick when no slot is available', () => {
    // Fighter L1 = 1 slot, already used on archery.
    const ctx = ctxFor(
      makeChar({ character_class: 'Fighter', level: 1, fighting_styles: ['archery'] })
    );
    handleChooseFightingStyle(ctx, { type: 'choose_fighting_style', style: 'two_weapon' });
    expect(ctx.narrative).toContain('no Fighting Style choice');
    if (ctx.actor.kind !== 'pc') throw new Error('expected pc actor');
    expect(ctx.actor.char.fighting_styles).toEqual(['archery']); // unchanged
  });

  it('rejects a non-PC actor', () => {
    const ctx = ctxFor(makeChar({ character_class: 'Fighter', level: 7 }));
    // @ts-expect-error — force a non-pc actor for the guard test
    ctx.actor = { kind: 'enemy', enemy: { id: 'orc', name: 'Orc' } };
    expect(
      handleChooseFightingStyle(ctx, { type: 'choose_fighting_style', style: 'archery' })
    ).toMatchObject({ rejected: expect.stringContaining('PC') });
  });
});

const lootTable = [
  { id: 'chainmail', armorAcBase: 16 },
  { id: 'shield', ac_bonus: 2 },
] as unknown as LootItem[];

describe('defenseAcBonus', () => {
  const armored = (styles: string[]) =>
    makeChar({
      fighting_styles: styles,
      equipment: { armor: 'armor-1' },
      inventory: [{ instance_id: 'armor-1', id: 'chainmail', name: 'Chain Mail', quantity: 1 }],
    });

  it('+1 with Defense while wearing body armor', () => {
    expect(defenseAcBonus(armored(['defense']), lootTable)).toBe(1);
  });

  it('0 without the Defense style', () => {
    expect(defenseAcBonus(armored(['archery']), lootTable)).toBe(0);
  });

  it('0 when unarmored even with the style', () => {
    expect(
      defenseAcBonus(makeChar({ fighting_styles: ['defense'], equipment: {} }), lootTable)
    ).toBe(0);
  });

  it('0 with only a shield (no body armor)', () => {
    const c = makeChar({
      fighting_styles: ['defense'],
      equipment: { armor: 'shield-1' },
      inventory: [{ instance_id: 'shield-1', id: 'shield', name: 'Shield', quantity: 1 }],
    });
    expect(defenseAcBonus(c, lootTable)).toBe(0);
  });
});

describe('Great Weapon Fighting rollers (treat 1s/2s as 3)', () => {
  it('rollDiceGwf floors each die at 3', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // every d(n) → 1 → bumped to 3
    expect(rollDiceGwf('2d6')).toBe(6); // 3 + 3
    expect(rollDiceGwf('1d12+4')).toBe(7); // 3 + flat 4
    vi.restoreAllMocks();
  });

  it('rollCriticalGwf doubles the dice and floors each at 3', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // every die → 1 → 3
    expect(rollCriticalGwf('2d6')).toBe(12); // 4 dice × 3
    vi.restoreAllMocks();
  });

  it('does not touch dice that already roll above 2', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d(6) → 6, untouched
    expect(rollDiceGwf('1d6')).toBe(6);
    vi.restoreAllMocks();
  });
});

describe('handleChooseFightingStyle — Defense bumps AC immediately', () => {
  it('+1 AC on picking Defense while armored', () => {
    const char = makeChar({
      character_class: 'Fighter',
      level: 1,
      ac: 16,
      equipment: { armor: 'armor-1' },
      inventory: [{ instance_id: 'armor-1', id: 'chainmail', name: 'Chain Mail', quantity: 1 }],
    });
    const ctx = {
      actor: pcActor(char, 0),
      st: { characters: [char] },
      context: { lootTable },
      narrative: '',
    } as unknown as ActionContext;
    handleChooseFightingStyle(ctx, { type: 'choose_fighting_style', style: 'defense' });
    if (ctx.actor.kind !== 'pc') throw new Error('expected pc actor');
    expect(ctx.actor.char.ac).toBe(17); // 16 + 1
  });
});

describe('fightingStyleSlotsForClassLevel', () => {
  it('Fighter: 1 at L1, 2 at L7; Paladin/Ranger: 1 at L2; others 0', () => {
    expect([1, 6, 7].map((l) => fightingStyleSlotsForClassLevel('Fighter', l))).toEqual([1, 1, 2]);
    expect([1, 2].map((l) => fightingStyleSlotsForClassLevel('Paladin', l))).toEqual([0, 1]);
    expect([1, 2].map((l) => fightingStyleSlotsForClassLevel('Ranger', l))).toEqual([0, 1]);
    expect(fightingStyleSlotsForClassLevel('Wizard', 20)).toBe(0);
  });
});

describe('resolveCreationFightingStyles', () => {
  it('gives a Fighter the chosen style (validated)', () => {
    expect(resolveCreationFightingStyles('Fighter', 'archery')).toEqual(['archery']);
  });

  it('falls back to the default for an omitted or invalid choice', () => {
    expect(resolveCreationFightingStyles('Fighter', undefined)).toEqual(['defense']);
    expect(resolveCreationFightingStyles('Fighter', 'dueling')).toEqual(['defense']); // PHB-only
  });

  it('is empty for classes without a level-1 style (Paladin/Ranger pick at L2)', () => {
    expect(resolveCreationFightingStyles('Paladin', 'defense')).toEqual([]);
    expect(resolveCreationFightingStyles('Ranger', 'archery')).toEqual([]);
    expect(resolveCreationFightingStyles('Wizard', 'archery')).toEqual([]);
  });
});
