import { backgroundGrants, getBackground } from './backgrounds.js';
import { describe, expect, it } from 'vitest';
import { context as ctx } from '../contexts/sandbox.js';

describe('getBackground', () => {
  it('returns the background record by id', () => {
    expect(getBackground('soldier', ctx)?.name).toBe('Soldier');
    expect(getBackground('sage', ctx)?.skillProficiencies).toContain('arcana');
  });

  it('returns undefined for an unknown id', () => {
    expect(getBackground('nonexistent', ctx)).toBeUndefined();
  });
});

describe('backgroundGrants', () => {
  it('reports the full grant shape for a 2024-PHB background', () => {
    const bg = getBackground('soldier', ctx)!;
    const grants = backgroundGrants(bg);
    expect(grants.skillProficiencies).toEqual(['athletics', 'intimidation']);
    expect(grants.toolProficiency).toBe('Gaming set');
    expect(grants.language).toBe('Common');
    expect(grants.originFeat).toBe('tough');
    expect(grants.abilityScoreIncreases).toEqual(['str', 'dex', 'con']);
  });

  it('normalizes absent optional fields to null / empty', () => {
    const bg = {
      id: 'minimal',
      name: 'Minimal',
      desc: '',
      skillProficiencies: ['perception'],
      feature: 'none',
      featureDesc: '',
    };
    const grants = backgroundGrants(bg);
    expect(grants.toolProficiency).toBeNull();
    expect(grants.language).toBeNull();
    expect(grants.originFeat).toBeNull();
    expect(grants.abilityScoreIncreases).toEqual([]);
    expect(grants.startingEquipment).toEqual([]);
  });
});
