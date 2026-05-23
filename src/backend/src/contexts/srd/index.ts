// Barrel for shared SRD data. Campaign contexts import from here so a
// future reorganization of the underlying files doesn't require touching
// every context.

export { SRD_SPELLS } from './spells.js';
export {
  SRD_CLASS_HIT_DIE,
  SRD_CLASS_ARMOR_PROFICIENCIES,
  SRD_CLASS_WEAPON_PROFICIENCIES,
  SRD_CLASS_SAVING_THROWS,
  SRD_CLASS_PRIMARY_STATS,
  SRD_SPELLCASTING_ABILITY,
  SRD_WEAPON_MASTERY_SLOTS,
  SRD_CLASS_FEATURES,
  SRD_CLASS_SKILLS,
} from './classes.js';
export { BEAST_FORMS, maxBeastCRForLevel, availableBeastForms } from './beast_forms.js';
export { SRD_MONSTERS } from './monsters.js';
export { REINCARNATE_SPECIES, SRD_SPECIES } from './species.js';
export type { Species } from './species.js';
export { SRD_FEATS } from './feats.js';
