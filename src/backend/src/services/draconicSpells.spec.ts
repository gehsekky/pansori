// RE-2 — Draconic Sorcery: Draconic Spells (always-prepared spells gained at
// sorcerer L3/5/7/9). pansori merges the ones it has (Chromatic Orb at L3;
// Fear + Fly at L5) into spells_known on subclass-select and on level-up.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyLevelUpForClass, mergeDraconicSpells } from './gameEngine.js';
import type { ActionContext } from './actions/types.js';
import type { Character } from '../types.js';
import { context as ctx } from '../campaignData/sandbox.js';
import { handleSelectSubclass } from './actions/meta.js';
import { makeChar } from '../test-fixtures.js';
import { pcActor } from './actions/actor.js';

afterEach(() => vi.restoreAllMocks());

const sorc = (over: Partial<Character> = {}) =>
  makeChar({ character_class: 'Sorcerer', cha: 16, ...over });

describe('mergeDraconicSpells', () => {
  it('grants Chromatic Orb at L3, + Fear/Fly at L5', () => {
    expect(mergeDraconicSpells(sorc({ level: 3 }))).toEqual(['chromatic_orb']);
    expect(mergeDraconicSpells(sorc({ level: 5 })).sort()).toEqual([
      'chromatic_orb',
      'fear',
      'fly',
    ]);
  });

  it('grants nothing below L3 and preserves existing known spells', () => {
    expect(mergeDraconicSpells(sorc({ level: 2, spells_known: ['fire_bolt'] }))).toEqual([
      'fire_bolt',
    ]);
    expect(mergeDraconicSpells(sorc({ level: 3, spells_known: ['fire_bolt'] })).sort()).toEqual([
      'chromatic_orb',
      'fire_bolt',
    ]);
  });
});

function featCtx(char: Character): ActionContext {
  return {
    actor: pcActor(char, 0),
    context: { classFeatures: {} },
    narrative: '',
  } as unknown as ActionContext;
}
const pcChar = (c: ActionContext) => {
  if (c.actor.kind !== 'pc') throw new Error('expected pc actor');
  return c.actor.char;
};

describe('Draconic Spells — granted on select + level-up', () => {
  it('selecting Draconic at L5 grants the L3 + L5 spells', () => {
    const c = featCtx(sorc({ level: 5 }));
    handleSelectSubclass(c, { type: 'select_subclass', subclass: 'draconic' });
    expect(pcChar(c).spells_known).toEqual(
      expect.arrayContaining(['chromatic_orb', 'fear', 'fly'])
    );
  });

  it('a Draconic Sorcerer leveling 4→5 gains Fear + Fly', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const char = sorc({
      level: 4,
      subclass: 'draconic',
      class_levels: { sorcerer: 4 },
      spells_known: ['chromatic_orb'],
    });
    applyLevelUpForClass(char, 'sorcerer', ctx);
    expect(char.level).toBe(5);
    expect(char.spells_known).toEqual(expect.arrayContaining(['chromatic_orb', 'fear', 'fly']));
  });

  it('a Sorcerer below level 3 (no subclass yet) gains no Draconic spells on level-up', () => {
    // Past L3 every Sorcerer is auto-assigned Draconic, so a subclass-less
    // Sorcerer only exists below L3 — verify no Draconic spells leak in early.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const char = sorc({ level: 1, class_levels: { sorcerer: 1 }, spells_known: [] });
    applyLevelUpForClass(char, 'sorcerer', ctx); // -> L2, still subclass-less
    expect(char.subclass).toBeFalsy();
    expect(char.spells_known).toEqual([]);
  });
});
