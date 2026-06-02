// Cone of Cold, Stinking Cloud, Wall of Fire — three more AoE
// spells (2024 PHB).

import { describe, expect, it } from 'vitest';
import { SRD_SPELLS } from '../campaignData/srd/index.js';

describe('Cone of Cold', () => {
  it('L5 cone, 8d8 cold, CON-save-half', () => {
    const s = SRD_SPELLS['cone_of_cold'];
    expect(s?.level).toBe(5);
    expect(s?.damage).toBe('8d8');
    expect(s?.damageType).toBe('cold');
    expect(s?.savingThrow).toBe('con');
    expect(s?.saveEffect).toBe('half');
    expect((s as { aoeShape?: string })?.aoeShape).toBe('cone');
    expect((s as { blastRadius?: number })?.blastRadius).toBe(60);
    expect(s?.upcastBonus).toBe('1d8');
  });
});

describe('Stinking Cloud', () => {
  it('L3 sphere, poisoned condition, CON-save-negates, concentration', () => {
    const s = SRD_SPELLS['stinking_cloud'];
    expect(s?.level).toBe(3);
    expect(s?.condition).toBe('poisoned');
    expect(s?.concentration).toBe(true);
    expect(s?.savingThrow).toBe('con');
    expect((s as { aoeShape?: string })?.aoeShape).toBe('sphere');
    expect((s as { blastRadius?: number })?.blastRadius).toBe(20);
    expect(s?.rangeFt).toBe(90);
  });
});

describe('Wall of Fire', () => {
  it('L4 line, 5d8 fire, DEX-save-half, concentration', () => {
    const s = SRD_SPELLS['wall_of_fire'];
    expect(s?.level).toBe(4);
    expect(s?.damage).toBe('5d8');
    expect(s?.damageType).toBe('fire');
    expect(s?.savingThrow).toBe('dex');
    expect(s?.saveEffect).toBe('half');
    expect(s?.concentration).toBe(true);
    expect((s as { aoeShape?: string })?.aoeShape).toBe('line');
    expect(s?.spellList).toEqual(expect.arrayContaining(['arcane', 'primal']));
  });
});
