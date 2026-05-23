import type { Character } from '../../types.js';

/**
 * Single source of truth for D&D 5.5e condition rules.
 *
 * Each condition is one `ConditionDef` declaring every cross-cutting
 * effect the engine cares about: duration on inflict, advantage /
 * disadvantage grants, save modifiers, movement gates, and an on-expire
 * hook for the rare condition that mutates other character state
 * (Shield spell's AC bump).
 *
 * Code that previously branched on hard-coded condition Sets
 * (`ADVANTAGE_CONDITIONS`, `DISADV_CONDITIONS`, `STR_DEX_AUTO_FAIL`,
 * `CONDITION_DURATION`) now reads the registry. Adding a new condition
 * is a single registry entry; the attack-resolution / save-resolution /
 * movement / tick paths pick it up automatically.
 *
 * Out of scope (managed by other systems, still ride in `char.conditions`):
 *   `raging`           — Barbarian rage. Damage bonus + resistance live
 *                        in attack handlers and `applyEnemyAttackNarrative`.
 *   `wild_shaped`      — Druid Wild Shape. Stat overrides handled by
 *                        beast-form lookup.
 *   `large_form`       — Goliath species feature. Speed bonus in
 *                        `effectiveSpeed`; duration set inline by the
 *                        feature handler.
 *   `charmed`          — Tracks `charmer_id` separately; "cannot attack
 *                        your charmer" enforced at the attack site.
 *
 * Frightened's "cannot move closer to source" constraint stays in
 * `gridMove` since it's a one-off movement rule, not a uniform gate.
 */

export type AbilityKind = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export interface ConditionDef {
  /** Canonical id stored in `char.conditions[]`. */
  id: string;
  /**
   * Rounds the condition lasts when applied via `inflictCondition`.
   * `'permanent'` means no automatic tick-down (only cleared by game
   * logic — death save recovery, Restoration, etc.).
   */
  duration: number | 'permanent';
  /**
   * Attackers of a creature with this condition roll with advantage.
   * SRD 5.2.1: paralyzed, stunned, prone (melee only — we don't model
   * range yet), blinded, restrained.
   */
  grantsAdvantageToAttackers?: boolean;
  /**
   * Attackers of a creature with this condition roll with disadvantage.
   * SRD: invisible (attackers can't see the creature).
   */
  imposesDisadvantageOnAttackers?: boolean;
  /** Self attacks roll with disadvantage. SRD: poisoned, prone, frightened, blinded, restrained. */
  imposesDisadvantageOnSelfAttacks?: boolean;
  /** Self attacks roll with advantage. SRD: invisible. */
  grantsAdvantageOnSelfAttacks?: boolean;
  /** Saves that auto-fail. SRD: paralyzed / stunned / unconscious / petrified → STR + DEX. */
  autoFailSaves?: AbilityKind[];
  /** Disadvantage on these saves. SRD: restrained → DEX. */
  disadvantageSaves?: AbilityKind[];
  /** Movement gate: creature's speed is effectively 0. SRD: grappled, restrained. */
  blocksMovement?: boolean;
  /**
   * Hook fired by `tickConditions` when the condition expires. Used
   * for non-standard conditions that mutated other character state on
   * application (Shield spell's +5 AC). Most conditions need no hook.
   */
  onExpire?(char: Character): Character;
}

const defs: ConditionDef[] = [
  {
    id: 'paralyzed',
    duration: 1,
    grantsAdvantageToAttackers: true,
    autoFailSaves: ['str', 'dex'],
    blocksMovement: true,
  },
  {
    id: 'stunned',
    duration: 1,
    grantsAdvantageToAttackers: true,
    autoFailSaves: ['str', 'dex'],
    blocksMovement: true,
  },
  {
    id: 'prone',
    duration: 1,
    grantsAdvantageToAttackers: true,
    imposesDisadvantageOnSelfAttacks: true,
  },
  {
    id: 'blinded',
    duration: 1,
    grantsAdvantageToAttackers: true,
    imposesDisadvantageOnSelfAttacks: true,
  },
  {
    id: 'restrained',
    duration: 1,
    grantsAdvantageToAttackers: true,
    imposesDisadvantageOnSelfAttacks: true,
    disadvantageSaves: ['dex'],
    blocksMovement: true,
  },
  {
    id: 'poisoned',
    duration: 2,
    imposesDisadvantageOnSelfAttacks: true,
  },
  {
    id: 'frightened',
    duration: 2,
    imposesDisadvantageOnSelfAttacks: true,
  },
  {
    id: 'invisible',
    duration: 2,
    imposesDisadvantageOnAttackers: true,
    grantsAdvantageOnSelfAttacks: true,
  },
  // Unconscious + petrified: no auto-expire; cleared by death-save recovery
  // / Restoration. Saves auto-fail while present. The pre-registry code
  // omitted them from CONDITION_DURATION (treated as permanent) and from
  // ADVANTAGE_CONDITIONS — only the STR_DEX_AUTO_FAIL set covered them.
  // Registry mirrors that exactly.
  {
    id: 'unconscious',
    duration: 'permanent',
    autoFailSaves: ['str', 'dex'],
  },
  {
    id: 'petrified',
    duration: 'permanent',
    autoFailSaves: ['str', 'dex'],
  },
  { id: 'incapacitated', duration: 1 },
  { id: 'grappled', duration: 1, blocksMovement: true },
  // 2024 PHB Banishment — target removed from combat to a harmless
  // demiplane. Duration is concentration-linked (cleared by the
  // caster's concentration drop via the linked-condition path in
  // breakConcentration). Marked 'permanent' here so tickConditions
  // doesn't auto-expire it round-by-round; the caster's concentration
  // is the actual timer.
  { id: 'banished', duration: 'permanent' },
  // Engine-internal: Shield spell bumps AC +5 on cast (in reaction.ts);
  // ticking the condition off must reverse the bump.
  {
    id: 'shield_spell',
    duration: 1,
    onExpire: (char) => ({ ...char, ac: char.ac - 5 }),
  },
];

export const CONDITIONS: Readonly<Record<string, ConditionDef>> = Object.freeze(
  Object.fromEntries(defs.map((d) => [d.id, d]))
);

// ─── Query helpers ────────────────────────────────────────────────────────────

/** Duration in rounds, or 1 for unknown conditions (matches pre-registry default). */
export function getConditionDuration(id: string): number | 'permanent' {
  return CONDITIONS[id]?.duration ?? 1;
}

export function conditionGrantsAdvantageToAttackers(conditions: string[]): boolean {
  return conditions.some((c) => CONDITIONS[c]?.grantsAdvantageToAttackers === true);
}

export function conditionImposesDisadvantageOnAttackers(conditions: string[]): boolean {
  return conditions.some((c) => CONDITIONS[c]?.imposesDisadvantageOnAttackers === true);
}

export function conditionImposesDisadvantageOnSelfAttacks(conditions: string[]): boolean {
  return conditions.some((c) => CONDITIONS[c]?.imposesDisadvantageOnSelfAttacks === true);
}

export function conditionGrantsAdvantageOnSelfAttacks(conditions: string[]): boolean {
  return conditions.some((c) => CONDITIONS[c]?.grantsAdvantageOnSelfAttacks === true);
}

export function autoFailsSave(conditions: string[], ability: AbilityKind): boolean {
  return conditions.some((c) => CONDITIONS[c]?.autoFailSaves?.includes(ability) === true);
}

export function disadvantageOnSave(conditions: string[], ability: AbilityKind): boolean {
  return conditions.some((c) => CONDITIONS[c]?.disadvantageSaves?.includes(ability) === true);
}

export function blocksMovement(conditions: string[]): boolean {
  return conditions.some((c) => CONDITIONS[c]?.blocksMovement === true);
}

/**
 * Run the on-expire hook for any condition in `expired`. Returns a new
 * Character with all hooks applied in order. Conditions without a hook
 * are a no-op.
 */
export function applyExpiryHooks(char: Character, expired: string[]): Character {
  let next = char;
  for (const id of expired) {
    const hook = CONDITIONS[id]?.onExpire;
    if (hook) next = hook(next);
  }
  return next;
}

// ─── Set views (compat shims for the pre-registry exports) ───────────────────

/**
 * Pre-registry call sites read these Sets directly. They now derive
 * from the registry but keep the same membership for compatibility.
 * New code should prefer the query helpers above — Sets force callers
 * to wire `conditions.some((c) => SET.has(c))` boilerplate at every site.
 */
function setFor(predicate: (d: ConditionDef) => boolean): ReadonlySet<string> {
  return new Set(defs.filter(predicate).map((d) => d.id));
}

export const ADVANTAGE_CONDITIONS = setFor((d) => d.grantsAdvantageToAttackers === true);
export const DISADV_CONDITIONS = setFor((d) => d.imposesDisadvantageOnSelfAttacks === true);
export const PLAYER_ADV_CONDITIONS = setFor((d) => d.grantsAdvantageOnSelfAttacks === true);
export const ENEMY_DISADV_CONDITIONS = setFor((d) => d.imposesDisadvantageOnAttackers === true);
