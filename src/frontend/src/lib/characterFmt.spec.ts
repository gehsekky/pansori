import { describe, expect, it } from 'vitest';
import { formatClassLabel, formatSubclass } from './characterFmt';

describe('formatSubclass', () => {
  it('title-cases a single-word id', () => {
    expect(formatSubclass('champion')).toBe('Champion');
    expect(formatSubclass('abjurer')).toBe('Abjurer');
  });

  it('splits snake_case ids on underscores and title-cases each word', () => {
    expect(formatSubclass('battle_master')).toBe('Battle Master');
    expect(formatSubclass('wild_magic')).toBe('Wild Magic');
  });

  it('handles empty segments gracefully', () => {
    // Defensive — engine should never emit "__" but the helper shouldn't crash.
    expect(formatSubclass('')).toBe('');
    expect(formatSubclass('a__b')).toBe('A  B');
  });
});

describe('formatClassLabel', () => {
  it('returns the class alone when subclass is absent', () => {
    expect(formatClassLabel('Fighter')).toBe('Fighter');
    expect(formatClassLabel('Fighter', undefined)).toBe('Fighter');
    expect(formatClassLabel('Fighter', null)).toBe('Fighter');
    expect(formatClassLabel('Fighter', '')).toBe('Fighter');
  });

  it('joins class and formatted subclass with " / "', () => {
    expect(formatClassLabel('Fighter', 'champion')).toBe('Fighter / Champion');
    expect(formatClassLabel('Fighter', 'battle_master')).toBe('Fighter / Battle Master');
    expect(formatClassLabel('Cleric', 'war')).toBe('Cleric / War');
    expect(formatClassLabel('Ranger', 'beastmaster')).toBe('Ranger / Beastmaster');
  });
});
