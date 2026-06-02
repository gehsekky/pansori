// RE-2 — Cleric Divine Order (L1): choose Protector (Martial weapon + Heavy
// armor training) or Thaumaturge (an extra Cleric cantrip + WIS, min +1, to
// Intelligence (Arcana/Religion) checks).

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Character } from '../types.js';
import { context as ctx } from '../campaignData/sandbox.js';
import { handleChooseDivineOrder } from './actions/meta.js';
import { makeChar } from '../test-fixtures.js';
import { pcActor } from './actions/actor.js';

afterEach(() => vi.restoreAllMocks());

const cleric = (over: Partial<Character> = {}) =>
  makeChar({ character_class: 'Cleric', level: 1, wis: 16, ...over });

// Minimal ActionContext wrapper carrying the sandbox context (for spellTable).
function featCtx(char: Character) {
  return {
    actor: pcActor(char, 0),
    context: ctx,
    narrative: '',
  } as unknown as Parameters<typeof handleChooseDivineOrder>[0];
}
const pcChar = (c: ReturnType<typeof featCtx>) => {
  if (c.actor.kind !== 'pc') throw new Error('expected pc actor');
  return c.actor.char;
};

describe('Divine Order — Protector', () => {
  it('grants Martial weapon + Heavy armor training', () => {
    const c = featCtx(
      cleric({ weapon_proficiencies: ['simple'], armor_proficiencies: ['light', 'medium'] })
    );
    handleChooseDivineOrder(c, { type: 'choose_divine_order', option: 'protector' });
    const char = pcChar(c);
    expect(char.divine_order).toBe('protector');
    expect(char.weapon_proficiencies).toContain('martial');
    expect(char.armor_proficiencies).toContain('heavy');
  });

  it('does not duplicate already-held proficiencies', () => {
    const c = featCtx(
      cleric({ weapon_proficiencies: ['simple', 'martial'], armor_proficiencies: ['heavy'] })
    );
    handleChooseDivineOrder(c, { type: 'choose_divine_order', option: 'protector' });
    const char = pcChar(c);
    expect(char.weapon_proficiencies.filter((w) => w === 'martial')).toHaveLength(1);
    expect(char.armor_proficiencies.filter((a) => a === 'heavy')).toHaveLength(1);
  });
});

describe('Divine Order — Thaumaturge', () => {
  it('learns the chosen Cleric cantrip', () => {
    const c = featCtx(cleric({ spells_known: ['sacred_flame'] }));
    handleChooseDivineOrder(c, {
      type: 'choose_divine_order',
      option: 'thaumaturge',
      cantrip: 'guidance',
    });
    const char = pcChar(c);
    expect(char.divine_order).toBe('thaumaturge');
    expect(char.spells_known).toContain('guidance');
  });

  it('rejects a non-Cleric cantrip', () => {
    const c = featCtx(cleric({ spells_known: [] }));
    const res = handleChooseDivineOrder(c, {
      type: 'choose_divine_order',
      option: 'thaumaturge',
      cantrip: 'fire_bolt', // arcane
    });
    expect(res).toEqual({ rejected: expect.stringMatching(/isn't a Cleric cantrip/) });
    expect(pcChar(c).divine_order).toBeUndefined();
  });

  it('sets the order even with no cantrip chosen (skill bonus only)', () => {
    const c = featCtx(cleric());
    handleChooseDivineOrder(c, { type: 'choose_divine_order', option: 'thaumaturge' });
    expect(pcChar(c).divine_order).toBe('thaumaturge');
  });
});

describe('Divine Order — gating', () => {
  it('rejects non-Clerics', () => {
    const c = featCtx(makeChar({ character_class: 'Fighter', level: 5 }));
    handleChooseDivineOrder(c, { type: 'choose_divine_order', option: 'protector' });
    expect(pcChar(c).divine_order).toBeUndefined();
  });
});
