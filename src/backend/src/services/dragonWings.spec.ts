// RE-2 — Draconic Sorcery Dragon Wings (L14): a Bonus Action grants a Fly
// Speed of 60 ft; once per long rest, or restored by spending 3 Sorcery Points.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionContext } from './actions/types.js';
import type { Character } from '../types.js';
import { handleCasterFeature } from './actions/classFeature/casters.js';
import { makeChar } from '../test-fixtures.js';
import { pcActor } from './actions/actor.js';

afterEach(() => vi.restoreAllMocks());

function featCtx(char: Character): ActionContext {
  return { actor: pcActor(char, 0), context: { classFeatures: {} }, narrative: '' } as unknown as ActionContext;
}
const pcChar = (c: ActionContext) => {
  if (c.actor.kind !== 'pc') throw new Error('expected pc actor');
  return c.actor.char;
};
const fresh = () => ({ action_used: false, bonus_action_used: false, reaction_used: false, free_interaction_used: false });
const draconic14 = (over: Partial<Character> = {}) =>
  makeChar({ character_class: 'Sorcerer', subclass: 'draconic', level: 14, cha: 16, turn_actions: fresh(), ...over });

describe('Dragon Wings (Draconic L14)', () => {
  it('grants Fly Speed 60 as a bonus action (first use is free)', () => {
    const c = featCtx(draconic14());
    expect(handleCasterFeature(c, 'dragon_wings')).toBe(true);
    expect(pcChar(c).fly_speed_ft).toBe(60);
    expect(pcChar(c).class_resource_uses?.dragon_wings_used).toBe(1);
    expect(pcChar(c).turn_actions.bonus_action_used).toBe(true);
  });

  it('after the free use, costs 3 sorcery points', () => {
    const c = featCtx(draconic14({ class_resource_uses: { dragon_wings_used: 1, sorcery_points: 5 } }));
    handleCasterFeature(c, 'dragon_wings');
    expect(pcChar(c).fly_speed_ft).toBe(60);
    expect(pcChar(c).class_resource_uses?.sorcery_points).toBe(2);
  });

  it('is blocked when expended with too few sorcery points', () => {
    const c = featCtx(draconic14({ class_resource_uses: { dragon_wings_used: 1, sorcery_points: 2 } }));
    handleCasterFeature(c, 'dragon_wings');
    expect(c.narrative).toMatch(/expended/);
    expect(pcChar(c).fly_speed_ft).toBeUndefined();
  });

  it('requires Draconic L14', () => {
    const c = featCtx(draconic14({ level: 13 }));
    handleCasterFeature(c, 'dragon_wings');
    expect(pcChar(c).fly_speed_ft).toBeUndefined();
    expect(c.narrative).toMatch(/level 14/);
  });
});
