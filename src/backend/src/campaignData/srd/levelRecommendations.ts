// Static per-class level-up recommendations (D-03).
//
// A plain lookup table — NOT a computed heuristic — that the level-up cascade
// consults to flag exactly ONE option per relevant step with a `★ Recommended`
// tag and a one-line rationale (LVL-03). The player can always pick any other
// option; the recommendation never forces a build (D-01).
//
// Keyed by `Character.character_class` (PascalCase, e.g. `'Wizard'`), the same
// keys used by `SRD_CASTER_SPELL_COUNTS` / `SRD_WEAPON_MASTERY_SLOTS` /
// `classWeaponProficiencies`. Every spell id resolves in the campaign spell
// catalog and every spell/ability name greps clean (exact-name) against
// docs/srd-5.2.1.txt — strict-SRD only, no PHB content. The
// levelRecommendations.spec.ts guard (Plan 03) asserts catalog-resolvability.
//
// `masteries` entries are weapon ids (matching the loot-table weapon ids the
// mastery step offers); the generator flags the first match present in the
// offered list.

import type { AbilityKey } from '../../types.js';

export interface LevelRecommendation {
  /** The ability score to bump at an ASI step. */
  asi: AbilityKey;
  /** One-line rationale (≤ ~60 chars) shown under the flagged ASI option. */
  asiReason: string;
  /** Recommended spells to learn (ids resolve in the spell catalog). */
  spells: string[];
  /** One-line rationale for the flagged spell pick. */
  spellReason: string;
  /** Recommended weapon-mastery picks, by weapon id (martials only). */
  masteries?: string[];
  /** One-line rationale for the flagged mastery pick. */
  masteryReason?: string;
}

export const LEVEL_RECOMMENDATIONS: Record<string, LevelRecommendation> = {
  // SRD: Wizard spell list — Intelligence is the wizard's spellcasting ability.
  Wizard: {
    asi: 'int',
    asiReason: 'Your spellcasting ability — raises spell DC & attack.',
    spells: ['fireball', 'counterspell', 'fly'],
    spellReason: 'Reliable AoE at this tier.',
  },
  // SRD: Sorcerer spell list — Charisma is the sorcerer's spellcasting ability.
  Sorcerer: {
    asi: 'cha',
    asiReason: 'Your spellcasting ability — raises spell DC & attack.',
    spells: ['fireball', 'haste', 'counterspell'],
    spellReason: 'Reliable AoE at this tier.',
  },
  // SRD: Bard spell list — Charisma is the bard's spellcasting ability.
  Bard: {
    asi: 'cha',
    asiReason: 'Your spellcasting ability — raises spell DC & attack.',
    spells: ['hypnotic_pattern', 'mass_healing_word', 'fly'],
    spellReason: 'Locks down a cluster of foes.',
  },
  // SRD: Warlock spell list — Charisma is the warlock's spellcasting ability.
  Warlock: {
    asi: 'cha',
    asiReason: 'Your spellcasting ability — raises spell DC & attack.',
    spells: ['counterspell', 'hypnotic_pattern', 'fly'],
    spellReason: 'Shuts down an enemy caster.',
  },
  // SRD: Cleric spell list — Wisdom is the cleric's spellcasting ability.
  // Prepared caster (D-07): no per-level learn step; the ASI hint still applies.
  Cleric: {
    asi: 'wis',
    asiReason: 'Your spellcasting ability — raises spell DC & attack.',
    spells: ['spirit_guardians', 'mass_healing_word'],
    spellReason: 'A strong prepared default at this tier.',
  },
  // SRD: Weapon Mastery — Strength powers a fighter's melee attacks & damage.
  Fighter: {
    asi: 'str',
    asiReason: 'Powers your melee attacks and damage.',
    spells: [],
    spellReason: '',
    masteries: ['greatsword', 'greataxe', 'longsword'],
    masteryReason: 'A solid default for your weapons.',
  },
  // SRD: Weapon Mastery — Dexterity drives a rogue's finesse attacks & AC.
  Rogue: {
    asi: 'dex',
    asiReason: 'Drives your finesse attacks, AC, and stealth.',
    spells: [],
    spellReason: '',
    masteries: ['rapier', 'shortsword', 'scimitar'],
    masteryReason: 'A solid default for your finesse weapons.',
  },
};
