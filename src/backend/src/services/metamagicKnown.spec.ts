// RE-2 — Sorcerer Metamagic known-list: RAW you learn 2/4/6 options at sorcerer
// L2/10/17, and a metamagic must be known to be activated. Covers the slot
// count, the choose_metamagic picker, and the activation gate.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { knowsMetamagic, metamagicSlots } from './multiclass.js';
import type { ActionContext } from './actions/types.js';
import type { Character } from '../types.js';
import { handleCasterFeature } from './actions/classFeature/casters.js';
import { handleChooseMetamagic } from './actions/meta.js';
import { makeChar } from '../test-fixtures.js';
import { pcActor } from './actions/actor.js';

afterEach(() => vi.restoreAllMocks());

function featCtx(char: Character): ActionContext {
  return { actor: pcActor(char, 0), context: { classFeatures: {} }, narrative: '', st: {} } as unknown as ActionContext;
}
const pcChar = (c: ActionContext) => {
  if (c.actor.kind !== 'pc') throw new Error('expected pc actor');
  return c.actor.char;
};

describe('metamagicSlots', () => {
  it('is 0/2/4/6 at sorcerer L1/L2/L10/L17', () => {
    const at = (lvl: number) => metamagicSlots(makeChar({ character_class: 'Sorcerer', level: lvl }));
    expect(at(1)).toBe(0);
    expect(at(2)).toBe(2);
    expect(at(9)).toBe(2);
    expect(at(10)).toBe(4);
    expect(at(17)).toBe(6);
  });
});

describe('choose_metamagic — learning options', () => {
  it('a Sorcerer L2 learns an option', () => {
    const c = featCtx(makeChar({ character_class: 'Sorcerer', level: 2, cha: 16 }));
    handleChooseMetamagic(c, { type: 'choose_metamagic', option: 'empowered' });
    expect(pcChar(c).metamagics_known).toEqual(['empowered']);
  });

  it('rejects a non-Sorcerer', () => {
    const c = featCtx(makeChar({ character_class: 'Wizard', level: 10 }));
    handleChooseMetamagic(c, { type: 'choose_metamagic', option: 'empowered' });
    expect(c.narrative).toMatch(/Only Sorcerers/);
    expect(pcChar(c).metamagics_known).toBeUndefined();
  });

  it('rejects when no slot is open (2 known at L2)', () => {
    const c = featCtx(makeChar({ character_class: 'Sorcerer', level: 2, metamagics_known: ['empowered', 'subtle'] }));
    handleChooseMetamagic(c, { type: 'choose_metamagic', option: 'distant' });
    expect(pcChar(c).metamagics_known).toEqual(['empowered', 'subtle']); // unchanged
  });

  it('rejects a duplicate and an unknown option', () => {
    const c = featCtx(makeChar({ character_class: 'Sorcerer', level: 10, metamagics_known: ['empowered'] }));
    handleChooseMetamagic(c, { type: 'choose_metamagic', option: 'empowered' });
    expect(c.narrative).toMatch(/already know/);
    const r = handleChooseMetamagic(c, { type: 'choose_metamagic', option: 'nonsense' });
    expect(r && 'rejected' in r).toBe(true);
  });
});

describe('Metamagic activation gate — must be known', () => {
  it("an unknown option can't be activated, a known one can", () => {
    const unknown = featCtx(makeChar({ character_class: 'Sorcerer', level: 5, cha: 16, class_resource_uses: { sorcery_points: 5 }, turn_actions: { action_used: false, bonus_action_used: false, reaction_used: false, free_interaction_used: false } }));
    handleCasterFeature(unknown, 'metamagic_empowered');
    expect(unknown.narrative).toMatch(/haven't learned/);
    expect(unknown.st.metamagic_active).toBeUndefined();

    const known = featCtx(makeChar({ character_class: 'Sorcerer', level: 5, cha: 16, metamagics_known: ['empowered'], class_resource_uses: { sorcery_points: 5 }, turn_actions: { action_used: false, bonus_action_used: false, reaction_used: false, free_interaction_used: false } }));
    handleCasterFeature(known, 'metamagic_empowered');
    expect(known.st.metamagic_active).toBe('empowered');
    expect(pcChar(known).class_resource_uses?.sorcery_points).toBe(4);
  });
});

describe('knowsMetamagic', () => {
  it('reads the known-list', () => {
    expect(knowsMetamagic(makeChar({ metamagics_known: ['distant'] }), 'distant')).toBe(true);
    expect(knowsMetamagic(makeChar({}), 'distant')).toBe(false);
  });
});
