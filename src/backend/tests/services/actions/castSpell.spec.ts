import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Spell } from '../../../src/types.js';
import { pickCastPrefix } from '../../../src/services/actions/castSpell/index.js';

afterEach(() => vi.restoreAllMocks());

function spellFixture(overrides: Partial<Spell> = {}): Spell {
  return {
    id: 'test_spell',
    name: 'Test Spell',
    level: 1,
    castTime: 'action',
    desc: 'test',
    ...overrides,
  } as Spell;
}

describe('pickCastPrefix', () => {
  it('returns the engine default when no narratives.cast pool is set', () => {
    const spell = spellFixture();
    const out = pickCastPrefix(spell, { name: 'Bjorn', spell: 'Test Spell', slotNote: '' });
    expect(out).toBe('Bjorn casts Test Spell');
  });

  it('includes slotNote in the default prefix', () => {
    const spell = spellFixture();
    const out = pickCastPrefix(spell, { name: 'Sage', spell: 'Fireball', slotNote: ' (lvl 4)' });
    expect(out).toBe('Sage casts Fireball (lvl 4)');
  });

  it('uses a pool entry and substitutes {name} and {spell}', () => {
    const spell = spellFixture({
      narratives: { cast: ['{name} weaves the words of {spell}'] },
    });
    const out = pickCastPrefix(spell, { name: 'Sage', spell: 'Magic Missile', slotNote: '' });
    expect(out).toBe('Sage weaves the words of Magic Missile');
  });

  it('substitutes {target} when provided', () => {
    const spell = spellFixture({
      narratives: { cast: ['{name} touches {target} — {spell}'] },
    });
    const out = pickCastPrefix(spell, {
      name: 'Aria',
      spell: 'Cure Wounds',
      slotNote: '',
      target: 'Bjorn',
    });
    expect(out).toBe('Aria touches Bjorn — Cure Wounds');
  });

  it('substitutes empty string when {target} token is present but no target passed', () => {
    const spell = spellFixture({
      narratives: { cast: ['{name} aims at {target}!'] },
    });
    const out = pickCastPrefix(spell, { name: 'Sage', spell: 'X', slotNote: '' });
    expect(out).toBe('Sage aims at !');
  });

  it('substitutes {slotNote} mid-string (placement may differ across pool entries)', () => {
    const spell = spellFixture({
      narratives: { cast: ['{name} channels {spell}{slotNote} into a beam'] },
    });
    const out = pickCastPrefix(spell, { name: 'Sage', spell: 'Eldritch Blast', slotNote: '' });
    expect(out).toBe('Sage channels Eldritch Blast into a beam');
  });

  it('falls back to default when narratives.cast is an empty array', () => {
    const spell = spellFixture({ narratives: { cast: [] } });
    const out = pickCastPrefix(spell, { name: 'Bjorn', spell: 'Test', slotNote: '' });
    expect(out).toBe('Bjorn casts Test');
  });

  it('replaces multiple occurrences of the same token', () => {
    const spell = spellFixture({
      narratives: { cast: ['{name} draws breath. {name} casts {spell}'] },
    });
    const out = pickCastPrefix(spell, { name: 'Sage', spell: 'Counterspell', slotNote: '' });
    expect(out).toBe('Sage draws breath. Sage casts Counterspell');
  });

  it('picks one of multiple pool entries (deterministic via Math.random)', () => {
    const spell = spellFixture({
      narratives: { cast: ['variant A: {spell}', 'variant B: {spell}', 'variant C: {spell}'] },
    });
    vi.spyOn(Math, 'random').mockReturnValue(0); // pick index 0
    expect(pickCastPrefix(spell, { name: 'X', spell: 'Y', slotNote: '' })).toBe('variant A: Y');
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // pick index 1
    expect(pickCastPrefix(spell, { name: 'X', spell: 'Y', slotNote: '' })).toBe('variant B: Y');
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // pick index 2
    expect(pickCastPrefix(spell, { name: 'X', spell: 'Y', slotNote: '' })).toBe('variant C: Y');
  });
});
