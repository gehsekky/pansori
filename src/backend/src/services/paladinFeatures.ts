import type { Character, GameState } from '../types.js';
import { abilityMod } from './rulesEngine.js';
import { distanceFeet } from './gridEngine.js';
import { getClassLevel } from './multiclass.js';

// SRD: Paladin class features that read off character / combat state.

/** SRD Paladin aura radius — 10 ft, expanding to 30 ft at L18 (Aura Expansion). */
export function paladinAuraRangeFt(p: Character): number {
  return getClassLevel(p, 'paladin') >= 18 ? 30 : 10;
}

/** A Paladin's aura is inactive while they're Incapacitated (or worse) or dead. */
export function paladinAuraActive(p: Character): boolean {
  if (p.dead || p.hp <= 0) return false;
  return !(p.conditions ?? []).some((c) =>
    ['incapacitated', 'paralyzed', 'stunned', 'unconscious', 'petrified'].includes(c)
  );
}

/**
 * Whether the PC `charId` stands in Paladin `p`'s aura. The Paladin is always
 * in their own aura; off the grid the party is assumed to be together.
 */
export function inPaladinAura(st: GameState, p: Character, charId: string): boolean {
  if (p.id === charId) return true;
  const pEnt = st.entities?.find((e) => e.id === p.id);
  const cEnt = st.entities?.find((e) => e.id === charId && !e.isEnemy);
  if (!pEnt || !cEnt) return true;
  return distanceFeet(pEnt.pos, cEnt.pos) <= paladinAuraRangeFt(p);
}

// ── Abjure Foes (L9) ────────────────────────────────────────────────────────

/** SRD Abjure Foes — how many creatures it targets: the CHA modifier, minimum 1. */
export function abjureFoesTargetCount(char: Character): number {
  return Math.max(1, abilityMod(char.cha));
}

/** SRD Abjure Foes range. */
export const ABJURE_FOES_RANGE_FT = 60;

/**
 * Enemy grid-entity tag marking a Frightened that Abjure Foes applied — it
 * ends early when the creature takes damage (`breakAbjureOnDamage`).
 */
export const ABJURED_TAG = 'abjured';

// ── Restoring Touch (L14) ───────────────────────────────────────────────────

/** SRD Restoring Touch — conditions Lay on Hands can end, 5 pool points each. */
export const RESTORING_TOUCH_CONDITIONS = [
  'blinded',
  'charmed',
  'deafened',
  'frightened',
  'paralyzed',
  'stunned',
];

/**
 * The conditions this Paladin's Lay on Hands can end for 5 pool points:
 * Poisoned at any level, plus the Restoring Touch list from L14.
 */
export function layOnHandsCurable(char: Character): string[] {
  return getClassLevel(char, 'paladin') >= 14
    ? ['poisoned', ...RESTORING_TOUCH_CONDITIONS]
    : ['poisoned'];
}

// ── Smite of Protection (Oath of Devotion L15) ──────────────────────────────

/** True for an Oath of Devotion Paladin of level 15+ (casting Divine Smite raises the cover). */
export function hasSmiteOfProtection(char: Character): boolean {
  return char.subclass === 'devotion' && getClassLevel(char, 'paladin') >= 15;
}

/**
 * SRD Oath of Devotion Smite of Protection — after a L15 Devotion Paladin
 * casts Divine Smite, they and their allies in the Aura of Protection have
 * Half Cover until the start of the Paladin's next turn
 * (`turn_actions.smite_of_protection`, which resets when that turn starts).
 * Returns the AC bonus (2 or 0) for PC `charId`.
 */
export function smiteOfProtectionAc(st: GameState, charId: string): number {
  return st.characters.some(
    (p) =>
      !!p.turn_actions?.smite_of_protection &&
      hasSmiteOfProtection(p) &&
      paladinAuraActive(p) &&
      inPaladinAura(st, p, charId)
  )
    ? 2
    : 0;
}
