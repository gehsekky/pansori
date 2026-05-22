// New 2024 PHB spells — Lightning Bolt + Faerie Fire.
// Both are data + small toHit hook (Faerie Fire only).

import { describe, expect, it } from 'vitest';
import { SRD_SPELLS } from '../contexts/srd/index.js';

describe('Lightning Bolt — data', () => {
  it('is registered with 8d6 lightning, line shape, dex-save-for-half', () => {
    const spell = SRD_SPELLS['lightning_bolt'];
    expect(spell).toBeDefined();
    expect(spell?.level).toBe(3);
    expect(spell?.damage).toBe('8d6');
    expect(spell?.damageType).toBe('lightning');
    expect(spell?.savingThrow).toBe('dex');
    expect(spell?.saveEffect).toBe('half');
    expect((spell as { aoeShape?: string })?.aoeShape).toBe('line');
    expect((spell as { blastRadius?: number })?.blastRadius).toBe(100);
    expect(spell?.upcastBonus).toBe('1d6');
    expect(spell?.spellList).toEqual(['arcane']);
  });
});

describe('Faerie Fire — data', () => {
  it('is registered with faerie_fired condition, DEX save, concentration', () => {
    const spell = SRD_SPELLS['faerie_fire'];
    expect(spell).toBeDefined();
    expect(spell?.level).toBe(1);
    expect(spell?.savingThrow).toBe('dex');
    expect(spell?.saveEffect).toBe('negates');
    expect(spell?.condition).toBe('faerie_fired');
    expect(spell?.concentration).toBe(true);
    expect((spell as { aoeShape?: string })?.aoeShape).toBe('cube');
    expect((spell as { blastRadius?: number })?.blastRadius).toBe(20);
    expect(spell?.spellList).toEqual(expect.arrayContaining(['arcane', 'primal']));
  });
});
