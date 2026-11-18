import type { BrutalStrikeEffect, Character } from '../types.js';
import { getClassLevel, hasSkillProficiency, skillKey } from './multiclass.js';

// ── Primal Knowledge (L3) ────────────────────────────────────────────────────

/** SRD Barbarian skill list (the "choose 2" options at level 1). */
export const BARBARIAN_SKILL_OPTIONS = [
  'animal_handling',
  'athletics',
  'intimidation',
  'nature',
  'perception',
  'survival',
];

/**
 * SRD Barbarian Primal Knowledge (L3) — skills whose checks a raging Barbarian
 * may make as Strength checks.
 */
export const PRIMAL_KNOWLEDGE_SKILLS = [
  'acrobatics',
  'intimidation',
  'perception',
  'stealth',
  'survival',
];

/**
 * The ability score to roll a `skill` check with. While a Barbarian of level 3+
 * is raging, Primal Knowledge lets an Acrobatics / Intimidation / Perception /
 * Stealth / Survival check be made as a Strength check; it's the player's
 * option, so the better of the two scores is used. Otherwise returns `score`.
 */
export function primalKnowledgeScore(char: Character, skill: string, score: number): number {
  if (getClassLevel(char, 'barbarian') < 3) return score;
  if (!(char.conditions ?? []).includes('raging')) return score;
  if (!PRIMAL_KNOWLEDGE_SKILLS.includes(skillKey(skill))) return score;
  return Math.max(score, char.str);
}

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
 * SRD Barbarian Primal Knowledge (L3): one skill from the Barbarian list.
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

// ── Instinctive Pounce (L7) ──────────────────────────────────────────────────

/**
 * SRD Barbarian Instinctive Pounce (L7) — entering a Rage also lets you move up
 * to half your Speed. Returns the extra movement in feet (0 below L7).
 */
export function instinctivePounceFeet(char: Character, speedFt: number): number {
  if (getClassLevel(char, 'barbarian') < 7) return 0;
  return Math.floor(speedFt / 2 / 5) * 5;
}

// ── Brutal Strike (L9 / L13 / L17) ──────────────────────────────────────────

/** The Brutal Strike effects the character can choose from. */
export function brutalStrikeOptions(char: Character): BrutalStrikeEffect[] {
  const lvl = getClassLevel(char, 'barbarian');
  if (lvl < 9) return [];
  // SRD Improved Brutal Strike (L13) — Staggering Blow and Sundering Blow.
  return lvl >= 13
    ? ['forceful', 'hamstring', 'staggering', 'sundering']
    : ['forceful', 'hamstring'];
}

/** How many different effects one Brutal Strike applies — 2 at L17, else 1. */
export function brutalStrikeMaxEffects(char: Character): number {
  return getClassLevel(char, 'barbarian') >= 17 ? 2 : 1;
}

/** Brutal Strike's extra damage dice — 1d10, or 2d10 at L17. */
export function brutalStrikeDice(char: Character): string {
  return getClassLevel(char, 'barbarian') >= 17 ? '2d10' : '1d10';
}

/** The pending Brutal Strike effects as a list (accepts the old single-string shape). */
export function brutalStrikeRiders(
  pending: BrutalStrikeEffect[] | BrutalStrikeEffect | undefined
): BrutalStrikeEffect[] {
  if (!pending) return [];
  return Array.isArray(pending) ? pending : [pending];
}

export const BRUTAL_STRIKE_LABELS: Record<BrutalStrikeEffect, string> = {
  forceful: 'Forceful Blow (push 15 ft, then close in)',
  hamstring: 'Hamstring Blow (−15 ft Speed)',
  staggering: 'Staggering Blow (Disadvantage on its next save; no Opportunity Attacks)',
  sundering: 'Sundering Blow (+5 to the next attack roll against it by someone else)',
};

/** Grid-entity condition tag for a Sundering Blow applied by `barbarianId`. */
export function sunderedTag(barbarianId: string): string {
  return `sundered_by_${barbarianId}`;
}

// ── Mindless Rage (Berserker L6) ─────────────────────────────────────────────

/**
 * SRD Path of the Berserker Mindless Rage (L6) — while raging, Immunity to the
 * Charmed and Frightened conditions.
 */
export function mindlessRageActive(char: Character): boolean {
  return (
    char.subclass === 'berserker' &&
    getClassLevel(char, 'barbarian') >= 6 &&
    (char.conditions ?? []).includes('raging')
  );
}
