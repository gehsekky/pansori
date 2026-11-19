import type { Character, Enemy } from '../types.js';
import { abilityMod } from './rulesEngine.js';
import { getClassLevel } from './multiclass.js';

// SRD: Ranger class features that read off character / creature state.

// ── Hunter's Lore (Hunter L3) ───────────────────────────────────────────────

/**
 * SRD Hunter's Lore (Hunter L3) — while a creature is marked by your Hunter's
 * Mark, you know its Immunities, Resistances and Vulnerabilities. Returns the
 * narrative line revealing them ('' when the character lacks the feature).
 */
export function huntersLoreNote(char: Character, enemy: Enemy): string {
  if (char.subclass !== 'hunter' || getClassLevel(char, 'ranger') < 3) return '';
  const parts: string[] = [];
  const list = (xs: string[] | undefined) => (xs ?? []).join(', ');
  if (enemy.immunities?.length) parts.push(`immune to ${list(enemy.immunities)} damage`);
  if (enemy.condition_immunities?.length) {
    parts.push(`can't be ${list(enemy.condition_immunities)}`);
  }
  const resist = [
    ...(enemy.resistances ?? []),
    ...(enemy.nonmagical_resistances ?? []).map((t) => `nonmagical ${t}`),
  ];
  if (resist.length) parts.push(`resists ${resist.join(', ')}`);
  if (enemy.vulnerabilities?.length) parts.push(`vulnerable to ${list(enemy.vulnerabilities)}`);
  return parts.length > 0
    ? ` 🏹 Hunter's Lore: ${enemy.name} — ${parts.join('; ')}.`
    : ` 🏹 Hunter's Lore: ${enemy.name} has no immunities, resistances or vulnerabilities.`;
}

// ── Nature's Veil (L14) ─────────────────────────────────────────────────────

/** SRD Nature's Veil uses per Long Rest — the WIS modifier, minimum 1. */
export function naturesVeilMax(char: Character): number {
  return Math.max(1, abilityMod(char.wis));
}

/** Nature's Veil uses left (`natures_veil_used` counts spent uses). */
export function naturesVeilLeft(char: Character): number {
  if (getClassLevel(char, 'ranger') < 14) return 0;
  return Math.max(0, naturesVeilMax(char) - (char.class_resource_uses?.natures_veil_used ?? 0));
}

/** `condition_sources.invisible` marker for Nature's Veil (attacking doesn't end it). */
export const NATURES_VEIL_SOURCE = 'natures_veil';
