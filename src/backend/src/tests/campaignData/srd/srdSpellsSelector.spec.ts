// The `srdSpells` selector is how a campaign curates which SRD magic exists in
// its world (the low-magic / themed-setting path) instead of spreading the
// whole SRD_SPELLS catalog into its spellTable. It mirrors `srdItems`, but
// returns an id-keyed Record because spellTable is id-keyed (not an array).

import { ALL_SRD_SPELL_IDS, SRD_SPELLS, srdSpells } from '../../../campaignData/srd/spells.js';
import { describe, expect, it } from 'vitest';
import type { Spell } from '../../../types.js';

describe('SRD_SPELLS catalog integrity', () => {
  it('every entry key matches its spell id', () => {
    for (const [key, spell] of Object.entries(SRD_SPELLS)) {
      expect(spell.id).toBe(key);
    }
  });

  it('ALL_SRD_SPELL_IDS enumerates the whole catalog', () => {
    expect(ALL_SRD_SPELL_IDS).toEqual(Object.keys(SRD_SPELLS));
    expect(ALL_SRD_SPELL_IDS.length).toBeGreaterThan(0);
  });
});

describe('srdSpells selector', () => {
  it('returns a curated table of the canonical objects keyed by id', () => {
    const picked = srdSpells('fire_bolt', 'cure_wounds');
    expect(Object.keys(picked)).toEqual(['fire_bolt', 'cure_wounds']);
    expect(picked.fire_bolt).toBe(SRD_SPELLS.fire_bolt);
    expect(picked.cure_wounds).toBe(SRD_SPELLS.cure_wounds);
  });

  it('curates a strict subset — unrequested spells are absent', () => {
    const picked = srdSpells('fire_bolt');
    expect(picked.fireball).toBeUndefined();
    expect(Object.keys(picked)).toHaveLength(1);
  });

  it('layers campaign-specific spells on top via spread', () => {
    const custom: Spell = {
      id: 'star_song',
      name: 'Star Song',
      level: 1,
      castTime: 'action',
      desc: 'A campaign-original cantrip used to prove the spread layering.',
    };
    const table: Record<string, Spell> = { ...srdSpells('fire_bolt'), star_song: custom };
    expect(table.fire_bolt).toBe(SRD_SPELLS.fire_bolt);
    expect(table.star_song).toBe(custom);
  });

  it('throws on an unknown id (catches typos / removed spells at load)', () => {
    expect(() => srdSpells('fire_bolt', 'power_word_yeet')).toThrow(
      /unknown SRD spell id "power_word_yeet"/
    );
  });

  it('empty selection yields an empty table (a no-magic setting)', () => {
    expect(srdSpells()).toEqual({});
  });
});
