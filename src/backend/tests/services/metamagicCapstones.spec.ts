// RE-2 — Sorcerer capstones. Sorcery Incarnate (L7): activate Innate Sorcery
// by spending 2 Sorcery Points when out of free uses, AND stack up to TWO
// Metamagics on one spell while Innate Sorcery is active. Arcane Apotheosis
// (L20): one Metamagic per turn is free while Innate Sorcery is active.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionContext } from '../../src/services/actions/types.js';
import type { Character } from '../../src/types.js';
import { handleCasterFeature } from '../../src/services/actions/classFeature/casters.js';
import { makeChar } from '../../src/test-fixtures.js';
import { pcActor } from '../../src/services/actions/actor.js';

afterEach(() => vi.restoreAllMocks());

const fresh = () => ({
  action_used: false,
  bonus_action_used: false,
  reaction_used: false,
  free_interaction_used: false,
});
function featCtx(char: Character): ActionContext {
  return {
    actor: pcActor(char, 0),
    context: { classFeatures: {} },
    narrative: '',
    st: {},
  } as unknown as ActionContext;
}
const pcChar = (c: ActionContext) => {
  if (c.actor.kind !== 'pc') throw new Error('expected pc actor');
  return c.actor.char;
};

describe('Sorcery Incarnate (L7) — activate Innate Sorcery via 2 SP', () => {
  it('spends 2 sorcery points to activate when out of free uses', () => {
    const c = featCtx(
      makeChar({
        character_class: 'Sorcerer',
        level: 7,
        cha: 16,
        turn_actions: fresh(),
        class_resource_uses: { innate_sorcery_used: 2, sorcery_points: 5 },
      })
    );
    handleCasterFeature(c, 'innate_sorcery');
    expect(pcChar(c).conditions).toContain('innate_sorcery');
    expect(pcChar(c).class_resource_uses?.sorcery_points).toBe(3); // 5 - 2
  });

  it('a L6 sorcerer out of uses cannot (no Sorcery Incarnate)', () => {
    const c = featCtx(
      makeChar({
        character_class: 'Sorcerer',
        level: 6,
        turn_actions: fresh(),
        class_resource_uses: { innate_sorcery_used: 2, sorcery_points: 5 },
      })
    );
    handleCasterFeature(c, 'innate_sorcery');
    expect(pcChar(c).conditions).not.toContain('innate_sorcery');
    expect(c.narrative).toMatch(/expended/);
  });
});

describe('Sorcery Incarnate (L7) — two Metamagics stack while Innate active', () => {
  it('a second metamagic stacks (Innate active, L7)', () => {
    const c = featCtx(
      makeChar({
        character_class: 'Sorcerer',
        level: 7,
        cha: 16,
        turn_actions: fresh(),
        conditions: ['innate_sorcery'],
        metamagics_known: ['empowered', 'distant'],
        class_resource_uses: { sorcery_points: 9 },
      })
    );
    handleCasterFeature(c, 'metamagic_empowered');
    handleCasterFeature(c, 'metamagic_distant');
    expect(c.st.metamagic_active).toEqual(['empowered', 'distant']);
  });

  it('without Innate Sorcery active, the second metamagic replaces the first', () => {
    const c = featCtx(
      makeChar({
        character_class: 'Sorcerer',
        level: 7,
        cha: 16,
        turn_actions: fresh(),
        metamagics_known: ['empowered', 'distant'],
        class_resource_uses: { sorcery_points: 9 },
      })
    );
    handleCasterFeature(c, 'metamagic_empowered');
    handleCasterFeature(c, 'metamagic_distant');
    expect(c.st.metamagic_active).toEqual(['distant']);
  });
});

describe('Arcane Apotheosis (L20) — one free Metamagic per turn while Innate active', () => {
  it('the first metamagic is free; the second costs sorcery points', () => {
    const c = featCtx(
      makeChar({
        character_class: 'Sorcerer',
        level: 20,
        cha: 16,
        turn_actions: fresh(),
        conditions: ['innate_sorcery'],
        metamagics_known: ['empowered', 'distant'],
        class_resource_uses: { sorcery_points: 6 },
      })
    );
    handleCasterFeature(c, 'metamagic_empowered'); // free
    expect(pcChar(c).class_resource_uses?.sorcery_points).toBe(6); // unchanged
    expect(pcChar(c).turn_actions.metamagic_free_used).toBe(true);
    handleCasterFeature(c, 'metamagic_distant'); // now costs 1
    expect(pcChar(c).class_resource_uses?.sorcery_points).toBe(5);
  });

  it('a L19 sorcerer pays for every metamagic (no Apotheosis)', () => {
    const c = featCtx(
      makeChar({
        character_class: 'Sorcerer',
        level: 19,
        cha: 16,
        turn_actions: fresh(),
        conditions: ['innate_sorcery'],
        metamagics_known: ['empowered'],
        class_resource_uses: { sorcery_points: 6 },
      })
    );
    handleCasterFeature(c, 'metamagic_empowered');
    expect(pcChar(c).class_resource_uses?.sorcery_points).toBe(5); // paid 1
  });
});
