// Caster spell picks at creation — cantrips + level-1 spells chosen from the
// class's spell list. The server re-validates the player's picks against the
// class options + counts and falls back to a curated default.

import {
  SRD_CASTER_SPELL_COUNTS,
  casterSpellCounts,
  defaultCasterSpells,
  resolveCasterSpells,
} from '../../../campaignData/srd/classes.js';
import { describe, expect, it } from 'vitest';
import { casterSpellOptions } from '../../../services/multiclass.js';
import { context as sandbox } from '../../../campaignData/sandbox.js';

const opts = (cls: string) => casterSpellOptions(cls, sandbox.spellTable ?? {});

describe('casterSpellOptions', () => {
  it('returns cantrips (level 0) + level-1 spells on the class list, by name', () => {
    const wiz = opts('Wizard'); // arcane
    expect(wiz.cantrips).toContain('fire_bolt');
    expect(wiz.l1).toContain('magic_missile');
    expect(wiz.l1).not.toContain('fireball'); // level 3, not an L1 option
    // Divine-only spells aren't on the arcane (Wizard) list.
    expect(wiz.cantrips).not.toContain('sacred_flame');
    const cle = opts('Cleric'); // divine
    expect(cle.cantrips).toContain('sacred_flame');
    expect(cle.l1).toContain('cure_wounds');
  });

  it('is empty for a non-caster', () => {
    expect(opts('Fighter')).toEqual({ cantrips: [], l1: [] });
  });
});

describe('caster spell counts + defaults', () => {
  it('every caster default is exactly the (clamped) count, distinct + offered', () => {
    for (const cls of Object.keys(SRD_CASTER_SPELL_COUNTS)) {
      const av = opts(cls);
      const counts = casterSpellCounts(cls, av)!;
      const def = defaultCasterSpells(cls, av, sandbox.classSpells?.[cls] ?? []);
      expect(def.cantrips.length, `${cls} cantrips`).toBe(counts.cantrips);
      expect(def.l1.length, `${cls} l1`).toBe(counts.l1);
      expect(new Set(def.cantrips).size).toBe(def.cantrips.length);
      for (const id of def.cantrips) expect(av.cantrips, `${cls} cantrip offered`).toContain(id);
      for (const id of def.l1) expect(av.l1, `${cls} l1 offered`).toContain(id);
    }
  });

  it('non-caster classes have no counts', () => {
    expect(casterSpellCounts('Fighter', opts('Fighter'))).toBeNull();
    expect(casterSpellCounts('Paladin', opts('Paladin'))).toBeNull(); // half-caster, no L1 slots
  });
});

describe('resolveCasterSpells', () => {
  const wizAv = () => opts('Wizard');

  it('accepts a valid pick (right counts, distinct, all offered)', () => {
    const av = wizAv();
    const chosen = {
      cantrips: av.cantrips.slice(0, 3),
      l1: av.l1.slice(0, 6),
    };
    const res = resolveCasterSpells('Wizard', chosen, av, []);
    expect(res.cantrips).toEqual(chosen.cantrips);
    expect(res.l1).toEqual(chosen.l1);
  });

  it('falls back to the default on wrong count / unoffered / omitted', () => {
    const av = wizAv();
    const def = defaultCasterSpells('Wizard', av, sandbox.classSpells?.Wizard ?? []);
    // too few cantrips
    expect(
      resolveCasterSpells(
        'Wizard',
        { cantrips: av.cantrips.slice(0, 1) },
        av,
        sandbox.classSpells?.Wizard ?? []
      ).cantrips
    ).toEqual(def.cantrips);
    // an unoffered (divine) spell
    expect(
      resolveCasterSpells(
        'Wizard',
        { cantrips: ['sacred_flame', 'fire_bolt', 'ray_of_frost'] },
        av,
        sandbox.classSpells?.Wizard ?? []
      ).cantrips
    ).toEqual(def.cantrips);
    // omitted
    expect(
      resolveCasterSpells('Wizard', undefined, av, sandbox.classSpells?.Wizard ?? []).l1
    ).toEqual(def.l1);
  });

  it('returns empty for a non-caster / half-caster', () => {
    expect(resolveCasterSpells('Fighter', undefined, opts('Fighter'), [])).toEqual({
      cantrips: [],
      l1: [],
    });
    expect(resolveCasterSpells('Ranger', undefined, opts('Ranger'), [])).toEqual({
      cantrips: [],
      l1: [],
    });
  });
});
