import type { GameState } from '../types.js';

interface HasStateAndNarrative {
  st: GameState;
  narrative: string;
}

// SRD 5.2.1 monster save traits shared by every place an enemy rolls a saving
// throw.
//
// - Magic Resistance: "Advantage on saving throws against spells and other
//   magical effects." Callers OR `magicResistanceAdvantage(...)` into the
//   save's advantage for spell / magical-feature saves only.
// - Legendary Resistance (N/Day): "If the creature fails a saving throw, it can
//   choose to succeed instead." Callers pass the rolled outcome through
//   `legendaryResist(...)`, which may flip a failure to a success and spend a
//   use (tracked in `GameState.legendary_resistance_used`, cleared on a Long
//   Rest).
//   Simplification: the stat blocks' higher "N/Day in Lair" count isn't
//   applied; the base count is used everywhere.

interface SaveTraits {
  id: string;
  name?: string;
  magicResistance?: boolean;
  legendaryResistance?: number;
}

/** Advantage from Magic Resistance on a save against a spell or magical effect. */
export function magicResistanceAdvantage(
  enemy: Partial<SaveTraits> | null | undefined,
  magical = true
): boolean {
  return magical && !!enemy?.magicResistance;
}

/** Legendary Resistance uses left for this enemy. */
export function legendaryResistanceLeft(st: GameState, enemy: Partial<SaveTraits>): number {
  if (!enemy.legendaryResistance || !enemy.id) return 0;
  return Math.max(0, enemy.legendaryResistance - (st.legendary_resistance_used?.[enemy.id] ?? 0));
}

/**
 * Apply Legendary Resistance to a rolled save. Returns the final outcome and a
 * narrative note (empty when nothing changed). Spends a use by updating
 * `st.legendary_resistance_used` in place.
 *
 * AI policy (the rules leave the choice to the creature): it spends a use on a
 * save that would impose a condition or other effect, and keeps its uses
 * through a save whose only stake is damage (`damageOnly`), where succeeding
 * merely halves or negates the damage.
 */
export function legendaryResist(
  st: GameState,
  enemy: Partial<SaveTraits> | null | undefined,
  failed: boolean,
  opts: { damageOnly?: boolean } = {}
): { failed: boolean; note: string } {
  if (!failed || !enemy?.id || opts.damageOnly) return { failed, note: '' };
  const left = legendaryResistanceLeft(st, enemy);
  if (left <= 0) return { failed, note: '' };
  st.legendary_resistance_used = {
    ...(st.legendary_resistance_used ?? {}),
    [enemy.id]: (st.legendary_resistance_used?.[enemy.id] ?? 0) + 1,
  };
  const name = enemy.name ?? 'The creature';
  return {
    failed: false,
    note: ` 👑 ${name} uses Legendary Resistance and succeeds instead (${left - 1} left).`,
  };
}

/**
 * The d20 for an enemy save rolled outside `rollConditionSave`: with
 * Advantage when Magic Resistance applies (a spell / magical effect).
 */
export function enemySaveD20(
  enemy: Partial<SaveTraits> | null | undefined,
  magical: boolean,
  roll: () => number = () => Math.floor(Math.random() * 20) + 1
): number {
  const first = roll();
  return magicResistanceAdvantage(enemy, magical) ? Math.max(first, roll()) : first;
}

/**
 * `legendaryResist` for an action context: applies to `ctx.st`, appends the
 * note to `ctx.narrative`, and returns whether the save still failed.
 */
export function legendaryResistInto(
  ctx: HasStateAndNarrative,
  enemy: Partial<SaveTraits> | null | undefined,
  failed: boolean,
  opts: { damageOnly?: boolean } = {}
): boolean {
  const r = legendaryResist(ctx.st, enemy, failed, opts);
  ctx.narrative += r.note;
  return r.failed;
}
