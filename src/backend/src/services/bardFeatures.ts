import type { Character, Spell } from '../types.js';
import { abilityMod } from './rulesEngine.js';
import { getClassLevel } from './multiclass.js';

/** Bardic Inspiration uses at full: the Charisma modifier, minimum 1. */
export function bardicInspirationMax(char: Character): number {
  return Math.max(1, abilityMod(char.cha));
}

/** Bardic Inspiration uses left (an unset counter means a full pool). */
export function bardicInspirationLeft(char: Character): number {
  return char.class_resource_uses?.bardic_inspiration ?? bardicInspirationMax(char);
}

// ── Font of Inspiration (L5) ────────────────────────────────────────────────

/** The lowest spell-slot level with a slot left, or 0 when none is open. */
export function lowestOpenSlot(
  char: Pick<Character, 'spell_slots_max' | 'spell_slots_used'>
): number {
  const levels = Object.keys(char.spell_slots_max ?? {})
    .map(Number)
    .sort((a, b) => a - b);
  return (
    levels.find((l) => (char.spell_slots_used?.[l] ?? 0) < (char.spell_slots_max?.[l] ?? 0)) ?? 0
  );
}

/**
 * SRD Bard Font of Inspiration (L5) — expend a spell slot (no action) to regain
 * one expended use of Bardic Inspiration. True when a Bard of level 5+ has an
 * expended use and an open slot to spend.
 */
export function canFontOfInspiration(char: Character): boolean {
  return (
    getClassLevel(char, 'bard') >= 5 &&
    bardicInspirationLeft(char) < bardicInspirationMax(char) &&
    lowestOpenSlot(char) > 0
  );
}

// ── Magical Secrets (L10) ───────────────────────────────────────────────────

/**
 * Spell-list tags a Bard may learn from beyond their own. SRD Magical Secrets
 * (L10) opens the Cleric, Druid and Wizard lists — divine and primal (the Bard
 * list already draws on arcane). Empty below L10.
 */
export function magicalSecretsLists(char: Character): Array<'divine' | 'primal'> {
  return getClassLevel(char, 'bard') >= 10 ? ['divine', 'primal'] : [];
}

// ── Magical Discoveries (College of Lore L6) ────────────────────────────────

/** How many Magical Discoveries spells the character may pick: 2 for a Lore Bard L6+. */
export function magicalDiscoveriesMax(char: Character): number {
  return char.subclass === 'lore' && getClassLevel(char, 'bard') >= 6 ? 2 : 0;
}

/** Picks still open. */
export function pendingMagicalDiscoveries(char: Character): number {
  return Math.max(0, magicalDiscoveriesMax(char) - (char.magical_discoveries ?? []).length);
}

/** The highest spell level the character has slots for (0 with none). */
function highestSlotLevel(char: Character): number {
  return Math.max(
    0,
    ...Object.entries(char.spell_slots_max ?? {})
      .filter(([, n]) => n > 0)
      .map(([l]) => Number(l))
  );
}

/**
 * SRD Magical Discoveries — a spell can be picked when it is on the Cleric,
 * Druid or Wizard list (divine / primal / arcane), is a cantrip or of a level
 * the Bard has slots for, and isn't one the character already knows.
 */
export function isMagicalDiscoveryEligible(char: Character, spell: Spell | undefined): boolean {
  if (!spell) return false;
  const lists = spell.spellList ?? [];
  if (!lists.some((l) => l === 'arcane' || l === 'divine' || l === 'primal')) return false;
  if (spell.level > highestSlotLevel(char)) return false;
  return !(char.spells_known ?? []).includes(spell.id);
}

/** Eligible Magical Discoveries spell ids, sorted by level then name. */
export function magicalDiscoveryOptions(
  char: Character,
  spellTable: Record<string, Spell>
): string[] {
  return Object.values(spellTable)
    .filter((s) => isMagicalDiscoveryEligible(char, s))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    .map((s) => s.id);
}
