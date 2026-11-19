import { getClassLevel, hasSkillProficiency } from './multiclass.js';
import { ALL_SKILLS } from '../campaignData/srd/classes.js';
import { BARBARIAN_SKILL_OPTIONS } from './barbarianFeatures.js';
import type { Character } from '../types.js';

/** A feature that grants proficiency in skills of the player's choice. */
export interface BonusSkillGrant {
  /** Key into `Character.bonus_skill_picks`. */
  source: string;
  /** Feature name for menus and narration. */
  label: string;
  count: number;
  options: string[];
}

/**
 * Every "gain proficiency in a skill of your choice" grant the character has.
 *  - SRD Barbarian Primal Knowledge (L3): one skill from the Barbarian list.
 *  - SRD College of Lore Bonus Proficiencies (Bard L3): three skills, any.
 */
export function bonusSkillGrants(char: Character): BonusSkillGrant[] {
  const grants: BonusSkillGrant[] = [];
  if (getClassLevel(char, 'barbarian') >= 3) {
    grants.push({
      source: 'primal_knowledge',
      label: 'Primal Knowledge',
      count: 1,
      options: BARBARIAN_SKILL_OPTIONS,
    });
  }
  if (char.subclass === 'lore' && getClassLevel(char, 'bard') >= 3) {
    grants.push({
      source: 'lore_bonus_proficiencies',
      label: 'Bonus Proficiencies',
      count: 3,
      options: [...ALL_SKILLS],
    });
  }
  return grants;
}

/**
 * Grants with picks still open, each with the options the character isn't
 * already proficient in. A grant whose options are all taken is dropped (there
 * is nothing left to choose).
 */
export function pendingBonusSkills(char: Character): BonusSkillGrant[] {
  return bonusSkillGrants(char)
    .map((g) => ({
      ...g,
      count: g.count - (char.bonus_skill_picks?.[g.source]?.length ?? 0),
      options: g.options.filter((s) => !hasSkillProficiency(char, s)),
    }))
    .filter((g) => g.count > 0 && g.options.length > 0);
}
