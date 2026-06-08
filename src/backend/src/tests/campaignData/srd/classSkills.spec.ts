// 2024 class skill proficiencies — "choose N from the class list". The server
// re-validates the player's chosen list against the class options and falls
// back to the curated default on anything invalid.

import {
  SRD_CLASS_SKILLS,
  SRD_CLASS_SKILL_CHOICES,
  defaultClassSkills,
  resolveClassSkills,
} from '../../../campaignData/srd/classes.js';
import { describe, expect, it } from 'vitest';

describe('SRD_CLASS_SKILL_CHOICES / defaultClassSkills', () => {
  it('every class default is exactly `count` distinct offered options', () => {
    for (const [cls, choice] of Object.entries(SRD_CLASS_SKILL_CHOICES)) {
      const def = defaultClassSkills(cls, SRD_CLASS_SKILLS[cls] ?? []);
      expect(def.length, `${cls} default count`).toBe(choice.count);
      expect(new Set(def).size, `${cls} distinct`).toBe(choice.count);
      for (const sk of def) expect(choice.options, `${cls} default in options`).toContain(sk);
    }
  });

  it('the default prefers the curated picks (trimmed to count)', () => {
    // Wizard's curated list has 3, but the class chooses 2 — keep the first 2.
    expect(defaultClassSkills('Wizard', SRD_CLASS_SKILLS.Wizard)).toEqual([
      'arcana',
      'investigation',
    ]);
  });

  it('Bard chooses any 3 of the 18 skills; Rogue 4, Ranger 3, others 2', () => {
    expect(SRD_CLASS_SKILL_CHOICES.Bard.count).toBe(3);
    expect(SRD_CLASS_SKILL_CHOICES.Bard.options).toHaveLength(18);
    expect(SRD_CLASS_SKILL_CHOICES.Rogue.count).toBe(4);
    expect(SRD_CLASS_SKILL_CHOICES.Ranger.count).toBe(3);
    expect(SRD_CLASS_SKILL_CHOICES.Fighter.count).toBe(2);
  });
});

describe('resolveClassSkills', () => {
  const fallback = SRD_CLASS_SKILLS.Fighter; // ['athletics', 'intimidation']

  it('accepts a valid choice (right count, all offered, distinct)', () => {
    expect(resolveClassSkills('Fighter', ['acrobatics', 'history'], fallback)).toEqual([
      'acrobatics',
      'history',
    ]);
  });

  it('lower-cases the chosen ids', () => {
    expect(resolveClassSkills('Fighter', ['Acrobatics', 'HISTORY'], fallback)).toEqual([
      'acrobatics',
      'history',
    ]);
  });

  it('falls back to the curated default when the choice is omitted', () => {
    expect(resolveClassSkills('Fighter', undefined, fallback)).toEqual([...fallback]);
  });

  it('falls back on wrong count, duplicates, or an unoffered skill', () => {
    expect(resolveClassSkills('Fighter', ['acrobatics'], fallback)).toEqual([...fallback]); // too few
    expect(resolveClassSkills('Fighter', ['acrobatics', 'history', 'insight'], fallback)).toEqual([
      ...fallback,
    ]); // too many
    expect(resolveClassSkills('Fighter', ['acrobatics', 'acrobatics'], fallback)).toEqual([
      ...fallback,
    ]); // duplicate
    expect(resolveClassSkills('Fighter', ['acrobatics', 'arcana'], fallback)).toEqual([
      ...fallback,
    ]); // arcana not on the Fighter list
  });

  it('uses the fallback for a class with no choice table', () => {
    expect(resolveClassSkills('Artificer', ['arcana', 'history'], ['perception'])).toEqual([
      'perception',
    ]);
  });
});
