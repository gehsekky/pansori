// Web, Hold Monster, Suggestion (SRD) — three more spells.
// All use the existing condition-application pattern in
// castSpell; this spec pins the spell data shape.

import { describe, expect, it } from 'vitest';
import { SRD_SPELLS } from '../campaignData/srd/index.js';

describe('Web', () => {
  it('L2 restrained AoE cube, DEX-save-negates, concentration', () => {
    const s = SRD_SPELLS['web'];
    expect(s?.level).toBe(2);
    expect(s?.condition).toBe('restrained');
    expect(s?.concentration).toBe(true);
    expect(s?.savingThrow).toBe('dex');
    expect(s?.saveEffect).toBe('negates');
    expect((s as { aoeShape?: string })?.aoeShape).toBe('cube');
    expect((s as { blastRadius?: number })?.blastRadius).toBe(20);
    expect(s?.spellList).toEqual(['arcane']);
  });
});

describe('Suggestion', () => {
  it('L2 charmed single target, WIS-save-negates, concentration', () => {
    const s = SRD_SPELLS['suggestion'];
    expect(s?.level).toBe(2);
    expect(s?.condition).toBe('charmed');
    expect(s?.concentration).toBe(true);
    expect(s?.savingThrow).toBe('wis');
    expect((s as { aoeShape?: string })?.aoeShape).toBeUndefined();
    expect(s?.rangeKind).toBe('ranged');
    expect(s?.rangeFt).toBe(30);
    expect(s?.spellList).toEqual(['arcane']);
  });
});

describe('Hold Monster', () => {
  it('L5 paralyzed any creature, WIS-save-negates, concentration', () => {
    const s = SRD_SPELLS['hold_monster'];
    expect(s?.level).toBe(5);
    expect(s?.condition).toBe('paralyzed');
    expect(s?.concentration).toBe(true);
    expect(s?.savingThrow).toBe('wis');
    expect(s?.saveEffect).toBe('negates');
    expect(s?.rangeFt).toBe(90);
    expect(s?.spellList).toEqual(['arcane']);
  });
});
