// LEVEL_RECOMMENDATIONS SRD-clean + catalog-resolve guard (T-03-01 / LVL-03).
//
// The level-up recommendation table is authored content shipped into the
// catalog. This guard enforces, for EVERY class entry:
//   1. every spell id resolves in the campaign spell catalog (ctx.spellTable),
//   2. every leveled (non-cantrip) spell is on that class's spell list
//      (classSpellListTag → casterSpellOptionsByLevel) — guards a wrong-list
//      typo or a PHB id slipping onto a class that can't cast it,
//   3. every spell/mastery NAME appears (exact-name) in docs/srd-5.2.1.txt —
//      so a PHB-only id (whose name is absent from the SRD) fails the gate,
//   4. each `asi` is a valid AbilityKey and the rationale strings are non-empty.
//
// Per the plan: we assert PRESENCE in the SRD (the strict-SRD invariant), not
// absence of specific forbidden tokens.

import { casterSpellOptionsByLevel, classSpellListTag } from '../../services/multiclass.js';
import { describe, expect, it } from 'vitest';
import { LEVEL_RECOMMENDATIONS } from '../../campaignData/srd/levelRecommendations.js';
import { SRD_ITEMS } from '../../campaignData/srd/index.js';
import { context as ctx } from '../fixtures/testContext.js';
import { readFileSync } from 'fs';

const VALID_ABILITIES = new Set(['str', 'dex', 'con', 'int', 'wis', 'cha']);

// The SRD text is the source of truth for exact-name checks.
const SRD_TEXT = readFileSync(
  new URL('../../../../../docs/srd-5.2.1.txt', import.meta.url),
  'utf-8'
);

const spellTable = ctx.spellTable ?? {};
const classEntries = Object.entries(LEVEL_RECOMMENDATIONS);

// All eligible (non-cantrip) spell ids a class can learn at high tier, flattened.
// maxLevel 9 = "every spell the class lists" for the on-list assertion.
function classLeveledSpellSet(cls: string): Set<string> {
  const byLevel = casterSpellOptionsByLevel(cls, spellTable, 9);
  const set = new Set<string>();
  for (let lvl = 1; lvl <= 9; lvl++) for (const id of byLevel[lvl] ?? []) set.add(id);
  return set;
}

describe('LEVEL_RECOMMENDATIONS — catalog-resolve + SRD-clean guard', () => {
  it('has at least one entry (sanity)', () => {
    expect(classEntries.length).toBeGreaterThan(0);
  });

  describe.each(classEntries)('%s entry', (cls, rec) => {
    it('every recommended spell id resolves in the spell catalog', () => {
      for (const id of rec.spells) {
        expect(spellTable[id], `${cls} recommends unknown spell id "${id}"`).toBeDefined();
      }
    });

    it('every leveled (non-cantrip) recommended spell is on the class spell list', () => {
      const tag = classSpellListTag(cls);
      const leveled = rec.spells.filter((id) => (spellTable[id]?.level ?? 0) >= 1);
      if (leveled.length === 0) return; // martials / cantrip-only — nothing to check
      // The class must draw from a spell list to recommend leveled spells.
      expect(tag, `${cls} recommends leveled spells but has no spell-list tag`).toBeDefined();
      const onList = classLeveledSpellSet(cls);
      for (const id of leveled) {
        expect(
          onList.has(id),
          `${cls}'s leveled recommendation "${id}" is not on its ${tag} list`
        ).toBe(true);
      }
    });

    it('every recommended spell NAME appears exactly in the SRD text', () => {
      for (const id of rec.spells) {
        const name = spellTable[id]?.name;
        expect(name, `spell id "${id}" has no catalog name`).toBeTruthy();
        expect(SRD_TEXT.includes(name!), `spell "${name}" (${id}) is not in the SRD text`).toBe(
          true
        );
      }
    });

    it('every recommended mastery NAME appears exactly in the SRD text', () => {
      for (const weaponId of rec.masteries ?? []) {
        const name = SRD_ITEMS[weaponId]?.name;
        expect(name, `mastery weapon id "${weaponId}" is not in the item catalog`).toBeTruthy();
        expect(
          SRD_TEXT.includes(name!),
          `weapon "${name}" (${weaponId}) is not in the SRD text`
        ).toBe(true);
      }
    });

    it('asi is a valid AbilityKey and the rationale strings are non-empty', () => {
      expect(VALID_ABILITIES.has(rec.asi), `${cls} has invalid asi "${rec.asi}"`).toBe(true);
      expect(rec.asiReason.trim().length).toBeGreaterThan(0);
      // Spell/mastery reasons must be non-empty whenever there is something to
      // recommend (martials have no spells → an empty spellReason is allowed).
      if (rec.spells.length > 0) expect(rec.spellReason.trim().length).toBeGreaterThan(0);
      if ((rec.masteries ?? []).length > 0) {
        expect((rec.masteryReason ?? '').trim().length).toBeGreaterThan(0);
      }
    });
  });
});
