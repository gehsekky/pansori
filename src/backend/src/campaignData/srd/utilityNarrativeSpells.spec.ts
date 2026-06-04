// Out-of-combat utility / exploration spells — SRD entries whose RAW effect is
// narrative / exploratory / DM-adjudicated (planar travel, place-illusions,
// wards, social influence). Like Augury / Commune / Divination, they resolve as
// narrative utility (no damage / save / condition). This pins their catalog
// shape so they stay data-only and on the right class lists.

import { describe, expect, it } from 'vitest';
import { SRD_SPELLS } from './spells.js';

// [id, level, spellLists]
const NARRATIVE: Array<[string, number, string[]]> = [
  ['arcanists_magic_aura', 2, ['arcane']],
  ['illusory_script', 1, ['arcane']],
  ['private_sanctum', 4, ['arcane']],
  ['secret_chest', 4, ['arcane']],
  ['contact_other_plane', 5, ['arcane']],
  ['dream', 5, ['arcane']],
  ['teleportation_circle', 5, ['arcane']],
  ['guards_and_wards', 6, ['arcane']],
  ['instant_summons', 6, ['arcane']],
  ['transport_via_plants', 6, ['primal']],
  ['magnificent_mansion', 7, ['arcane']],
  ['mirage_arcane', 7, ['arcane', 'primal']],
  ['sequester', 7, ['arcane']],
  ['symbol', 7, ['arcane', 'divine', 'primal']],
  ['demiplane', 8, ['arcane']],
  ['glibness', 8, ['arcane']],
  ['antipathy_sympathy', 8, ['arcane', 'primal']],
  ['clone', 8, ['arcane']],
  ['astral_projection', 9, ['divine', 'arcane']],
];

describe('utility / exploration spells — catalog', () => {
  for (const [id, level, lists] of NARRATIVE) {
    it(`${id} is a data-only narrative spell (L${level}, ${lists.join('/')})`, () => {
      const s = SRD_SPELLS[id];
      expect(s, id).toBeDefined();
      expect(s.level).toBe(level);
      expect(s.spellList).toEqual(lists);
      expect(s.narrative, `${id} narrative`).toBeTruthy();
      // No combat-mechanical fields — these resolve through the utility branch.
      expect(s.damage, `${id} damage`).toBeUndefined();
      expect(s.savingThrow, `${id} save`).toBeUndefined();
      expect(s.condition, `${id} condition`).toBeUndefined();
      expect(s.heal, `${id} heal`).toBeUndefined();
      expect(s.attackRoll, `${id} attackRoll`).toBeUndefined();
    });
  }

  it('the long (1 min+) casts are gated out of combat', () => {
    for (const id of [
      'illusory_script',
      'contact_other_plane',
      'dream',
      'teleportation_circle',
      'guards_and_wards',
      'instant_summons',
      'magnificent_mansion',
      'mirage_arcane',
      'symbol',
      'antipathy_sympathy',
      'clone',
      'astral_projection',
    ]) {
      expect(SRD_SPELLS[id].outOfCombatOnly, id).toBe(true);
    }
  });
});
