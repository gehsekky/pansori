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
  // SRD Deafened — the creature can't hear and auto-fails any ability check that
  // requires hearing. No attack/save modifiers (deafened ≠ silenced; it doesn't
  // block Verbal spell components RAW, though pansori's precast currently gates
  // on it). Registered for completeness so tickConditions gives it a duration;
  // pansori models no hearing-gated checks, so the auto-fail half is narration.
  { id: 'deafened', duration: 1 },
  // SRD Blur — attackers have Disadvantage against the blurred creature (same
  // attacker-side gate as Invisible). Concentration-linked (cleared on the
  // caster's concentration drop), so 'permanent' here keeps tickConditions from
  // auto-expiring it.
  { id: 'blurred', duration: 'permanent', imposesDisadvantageOnAttackers: true },
  // SRD Holy Aura — a warded ally: attackers have Disadvantage against it. (Its
  // Advantage on ALL saves is a literal `holy_warded` check in rollConditionSave,
  // like `hopeful` / `hasted`.) Party-wide, concentration-linked (cleared on the
  // caster's concentration drop), so 'permanent' keeps tickConditions from
  // auto-expiring it. (The fiend/undead-hit-blinds-attacker rider is deferred.)
  { id: 'holy_warded', duration: 'permanent', imposesDisadvantageOnAttackers: true },
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
    // SRD Petrified — Incapacitated (the enemy-turn skip + concentration gate
    // read the incap set), attacks against it have Advantage, auto-fails STR/DEX
    // saves, can't move. Deferred: "Resistance to all damage" — the damage
    // pipeline keys off a type-list `resistances`, not conditions, and no SRD
    // content in pansori applies Petrified yet (no Flesh to Stone), so it has no
    // live trigger; wire an all-type resistance when a petrify source ships.
    grantsAdvantageToAttackers: true,
    autoFailSaves: ['str', 'dex'],
    blocksMovement: true,
  },
  { id: 'incapacitated', duration: 1 },
  // SRD Thief Devious Strikes (Daze) — the target can take only one of move /
  // action / bonus action on its next turn. pansori carries it as a marker for
  // narrative + future enforcement (the per-turn restriction isn't gated yet).
  { id: 'dazed', duration: 1 },
  { id: 'grappled', duration: 1, blocksMovement: true },
  // 2024 PHB Banishment — target removed from combat to a harmless
  // demiplane. Duration is concentration-linked (cleared by the
  // caster's concentration drop via the linked-condition path in
  // breakConcentration). Marked 'permanent' here so tickConditions
  // doesn't auto-expire it round-by-round; the caster's concentration
  // is the actual timer.
  { id: 'banished', duration: 'permanent' },
  // 2024 PHB Polymorph — target transformed into a beast. Duration
  // is concentration-linked; the caster's drop reverts the entity
  // via the polymorph_state stash. Same 'permanent' shape as
  // banished so tickConditions doesn't auto-expire it.
  { id: 'polymorphed', duration: 'permanent' },
  // 2024 PHB Haste — Speed doubled, +2 AC, advantage on Dex saves.
  // Concentration-linked; cleared on caster's concentration drop +
  // applies the `incapacitated` lethargy condition for one round.
  // Permanent duration here means tickConditions doesn't auto-expire;
  // the caster's concentration is the real timer.
  { id: 'hasted', duration: 'permanent' },
  // 2024 PHB Slow — Speed halved, -2 AC, -2 Dex saves. Concentration-
  // linked, cleared on caster's concentration drop. Per RAW the
  // target also repeats the save at the end of each of its turns to
  // throw off the effect — pansori MVP doesn't auto-fire this
  // recurring save (deferred). Permanent duration here means
  // tickConditions doesn't auto-expire; concentration is the timer.
  { id: 'slowed', duration: 'permanent' },
  // SRD Bestow Curse — a generic hindering curse. RAW lets the caster choose
  // one of several effects; pansori models the common debuff: the cursed
  // creature attacks at Disadvantage. Concentration-linked (duration up to 1
  // min), so 'permanent' here keeps tickConditions from auto-expiring it — the
  // caster's concentration is the timer (breakConcentration strips it).
  { id: 'cursed', duration: 'permanent', imposesDisadvantageOnSelfAttacks: true },
  // SRD Heat Metal — a creature seared by the hot metal has Disadvantage on its
  // attacks until the start of the caster's next turn (≈ 1 round). The round-
  // wrap tick expires it.
  { id: 'heat_seared', duration: 1, imposesDisadvantageOnSelfAttacks: true },
  // SRD Ray of Enfeeblement — an enervated creature attacks at Disadvantage.
  // Save-ends + concentration govern the duration, so 'permanent' keeps
  // tickConditions from auto-expiring it (like cursed).
  { id: 'enfeebled', duration: 'permanent', imposesDisadvantageOnSelfAttacks: true },
  // SRD Enlarge/Reduce — Enlarged: weapon attacks deal +1d4 damage (and
  // Advantage on STR checks/saves, narrated). Reduced: weapon attacks deal
  // -1d4 damage and Disadvantage on STR saves. The ±1d4 is applied at the
  // weapon-damage sites (resolveOneAttack / computeEnemyAttack) by checking
  // these condition ids. Concentration-linked, so 'permanent' keeps
  // tickConditions from auto-expiring them (breakConcentration / combat end
  // clears them, like cursed).
  { id: 'enlarged', duration: 'permanent' },
  { id: 'reduced', duration: 'permanent', disadvantageSaves: ['str'] },
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
