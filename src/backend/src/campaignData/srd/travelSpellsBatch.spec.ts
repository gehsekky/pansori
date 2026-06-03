// SRD Conjuration/Transmutation travel batch: Passwall, Teleport, Plane Shift,
// Etherealness, Word of Recall. All out-of-combat narrative utility — catalog
// assertions on level / class lists / out-of-combat gating + V-only components.

import { describe, expect, it } from 'vitest';
import { SRD_SPELLS } from './spells.js';

describe('travel batch — catalog', () => {
  it('all five entries exist at their SRD levels', () => {
    expect(SRD_SPELLS.passwall.level).toBe(5);
    expect(SRD_SPELLS.teleport.level).toBe(7);
    expect(SRD_SPELLS.plane_shift.level).toBe(7);
    expect(SRD_SPELLS.etherealness.level).toBe(7);
    expect(SRD_SPELLS.word_of_recall.level).toBe(6);
  });

  it('all are gated to out-of-combat (travel utility)', () => {
    for (const id of ['passwall', 'teleport', 'plane_shift', 'etherealness', 'word_of_recall']) {
      expect(SRD_SPELLS[id].outOfCombatOnly).toBe(true);
    }
  });

  it('class lists match the SRD', () => {
    expect(SRD_SPELLS.passwall.spellList).toEqual(['arcane']);
    expect(SRD_SPELLS.teleport.spellList).toEqual(['arcane']);
    expect(SRD_SPELLS.plane_shift.spellList).toEqual(['arcane', 'divine', 'primal']);
    expect(SRD_SPELLS.etherealness.spellList).toEqual(['arcane', 'divine']);
    expect(SRD_SPELLS.word_of_recall.spellList).toEqual(['divine']);
  });

  it('the V-only spells are marked non-somatic; Plane Shift carries its 250 GP focus', () => {
    expect(SRD_SPELLS.teleport.somatic).toBe(false);
    expect(SRD_SPELLS.word_of_recall.somatic).toBe(false);
    expect(SRD_SPELLS.plane_shift.materialCost).toBe(250);
  });
});
