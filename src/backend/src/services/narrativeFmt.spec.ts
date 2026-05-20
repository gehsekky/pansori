import {
  type NarrativePart,
  fmt,
  parseNarrativeTokens,
  stripNarrativeTokens,
} from './narrativeFmt.js';
import { describe, expect, it } from 'vitest';

describe('narrativeFmt', () => {
  it('fmt.* produce token strings of the expected shape', () => {
    expect(fmt.dmg(5)).toBe('{{dmg|5}}');
    expect(fmt.hp(23, 45)).toBe('{{hp|23/45}}');
    expect(fmt.hp(1)).toBe('{{hp|1}}');
    expect(fmt.roll(18)).toBe('{{roll|18}}');
    expect(fmt.dc(14)).toBe('{{dc|DC 14}}');
    expect(fmt.ac(16)).toBe('{{ac|AC 16}}');
    expect(fmt.save('DEX', 12)).toBe('{{save|DEX 12}}');
    expect(fmt.note('Sneak Attack 2d6: +7')).toBe('{{note|Sneak Attack 2d6: +7}}');
  });

  it('parseNarrativeTokens splits prose and tokens', () => {
    const s = `Bjorn slashes the orc for ${fmt.dmg(8)} damage.`;
    const parts = parseNarrativeTokens(s);
    expect(parts).toEqual<NarrativePart[]>([
      { type: 'text', text: 'Bjorn slashes the orc for ' },
      { type: 'token', kind: 'dmg', display: '8' },
      { type: 'text', text: ' damage.' },
    ]);
  });

  it('parseNarrativeTokens handles back-to-back tokens', () => {
    const s = `${fmt.roll(18)} vs ${fmt.ac(16)} — hit for ${fmt.dmg(7)}.`;
    const parts = parseNarrativeTokens(s);
    expect(parts.filter((p) => p.type === 'token').map((p) => (p as { kind: string }).kind)).toEqual([
      'roll',
      'ac',
      'dmg',
    ]);
  });

  it('parseNarrativeTokens returns a single text part when no tokens', () => {
    expect(parseNarrativeTokens('plain prose')).toEqual([{ type: 'text', text: 'plain prose' }]);
  });

  it('parseNarrativeTokens returns [] for empty input', () => {
    expect(parseNarrativeTokens('')).toEqual([]);
  });

  it('parseNarrativeTokens ignores unknown kinds', () => {
    // Malformed/unknown tokens stay as plain text — defensive against
    // future-format strings or stray double braces in prose.
    const s = 'before {{xx|nope}} after';
    expect(parseNarrativeTokens(s)).toEqual([{ type: 'text', text: s }]);
  });

  it('stripNarrativeTokens returns just the display text', () => {
    const s = `Bjorn slashes the orc for ${fmt.dmg(8)} damage. (HP ${fmt.hp(12, 20)})`;
    expect(stripNarrativeTokens(s)).toBe('Bjorn slashes the orc for 8 damage. (HP 12/20)');
  });

  it('stripNarrativeTokens is a no-op on plain prose', () => {
    expect(stripNarrativeTokens('nothing to strip here')).toBe('nothing to strip here');
  });

  it('round-trips pipes in display text', () => {
    // Tokens use `|` as the kind/display separator. Display text containing
    // `|` (e.g. "STR|DEX save") must survive the round trip intact.
    const built = fmt.note('STR|DEX save'); // -> {{note|STR\0P\0DEX save}}
    expect(stripNarrativeTokens(built)).toBe('STR|DEX save');
    const parts = parseNarrativeTokens(built);
    expect(parts).toEqual<NarrativePart[]>([
      { type: 'token', kind: 'note', display: 'STR|DEX save' },
    ]);
  });
});
