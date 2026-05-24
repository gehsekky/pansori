// RE-2 — Fighting Style framework (SRD 5.2.1). Covers slot accounting,
// the membership helper, and the `choose_fighting_style` handler. The
// passive effects (Archery → ranged to-hit, Two-Weapon → off-hand damage)
// are small additions to the attack pipelines, covered by the broader
// attack suite staying green.

import { describe, expect, it } from 'vitest';
import { fightingStyleSlots, hasFightingStyle } from './fightingStyle.js';
import type { ActionContext } from './actions/types.js';
import { handleChooseFightingStyle } from './actions/meta.js';
import { makeChar } from '../test-fixtures.js';
import { pcActor } from './actions/actor.js';

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
