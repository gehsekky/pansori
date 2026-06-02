// RE-2 — Slippery Mind (SRD 5.2.1, Rogue L15): proficiency in Wisdom and
// Charisma saving throws. Applied at `hasSaveProficiency`, the central save-
// proficiency helper (used by on-hit condition saves and lair-AoE saves), so
// it flows through every save path that consults it. A Rogue's class save
// proficiencies are DEX + INT, so WIS/CHA proficiency can only come from
// Slippery Mind — making this a clean probe of the feature in isolation.

import { describe, expect, it } from 'vitest';
import { context as ctx } from '../campaignData/sandbox.js';
import { hasSaveProficiency } from './gameEngine.js';
import { hasSlipperyMind } from './multiclass.js';
import { makeChar } from '../test-fixtures.js';

describe('hasSlipperyMind', () => {
  it('is granted at Rogue L15, not L14', () => {
    expect(hasSlipperyMind(makeChar({ character_class: 'Rogue', level: 15 }))).toBe(true);
    expect(hasSlipperyMind(makeChar({ character_class: 'Rogue', level: 14 }))).toBe(false);
  });

  it('is false for non-Rogues', () => {
    expect(hasSlipperyMind(makeChar({ character_class: 'Wizard', level: 20 }))).toBe(false);
  });

  it('counts Rogue levels in a multiclass', () => {
    expect(
      hasSlipperyMind(
        makeChar({ character_class: 'Fighter', level: 18, class_levels: { fighter: 3, rogue: 15 } })
      )
    ).toBe(true);
  });
});

describe('hasSaveProficiency — Slippery Mind grant', () => {
  const rogue = (level: number) => makeChar({ character_class: 'Rogue', level });

  it('a Rogue L15 is proficient in WIS and CHA saves', () => {
    const r = rogue(15);
    expect(hasSaveProficiency(r, 'wis', ctx)).toBe(true);
    expect(hasSaveProficiency(r, 'cha', ctx)).toBe(true);
  });

  it('a Rogue L14 is not (feature not yet online)', () => {
    const r = rogue(14);
    expect(hasSaveProficiency(r, 'wis', ctx)).toBe(false);
    expect(hasSaveProficiency(r, 'cha', ctx)).toBe(false);
  });

  it('grants only WIS/CHA — not STR or CON', () => {
    const r = rogue(20);
    expect(hasSaveProficiency(r, 'str', ctx)).toBe(false);
    expect(hasSaveProficiency(r, 'con', ctx)).toBe(false);
  });

  it('leaves the Rogue class save proficiencies (DEX, INT) intact', () => {
    const r = rogue(20);
    expect(hasSaveProficiency(r, 'dex', ctx)).toBe(true);
    expect(hasSaveProficiency(r, 'int', ctx)).toBe(true);
  });

  it('does not grant WIS/CHA to a non-Rogue lacking class proficiency', () => {
    // Fighter class saves are STR + CON, so WIS/CHA stay unproficient.
    const f = makeChar({ character_class: 'Fighter', level: 20 });
    expect(hasSaveProficiency(f, 'wis', ctx)).toBe(false);
    expect(hasSaveProficiency(f, 'cha', ctx)).toBe(false);
  });
});
