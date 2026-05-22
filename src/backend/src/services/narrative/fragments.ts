/**
 * NarrativeFragment — structured emission from action handlers.
 *
 * Today, handlers emit prose strings (`ctx.narrative += ...`) and
 * structured events (`pushEvent(ctx.st, {...})`) in parallel for the
 * same outcome. With ~68 narrative emissions and ~22 events across
 * the handlers, those streams diverge by 3:1; new handlers easily
 * emit one without the other.
 *
 * A fragment is the single-source intent. Handlers push fragments to
 * `ctx.fragments`; the composer (services/narrative/compose.ts) reads
 * them after the handler returns and produces (a) prose appended to
 * `ctx.narrative` and (b) `CombatEvent`s pushed to `state.combat_log`.
 *
 * **Scope (C.1):** attack-handler kinds only — `attack_hit`,
 * `attack_miss`, `attack_kill`. Subsequent stages add `spell_*`,
 * `class_feature_*`, and the enemy-side kinds that unblock the
 * `applyEnemyAttackNarrative` migration. Until a handler is migrated,
 * it continues to emit narrative+events directly; the composer
 * no-ops on an empty fragments array.
 *
 * **Coexistence:** fragments are additive. A migrated handler emits
 * fragments only (composer fills in prose and events). A
 * non-migrated handler emits narrative+events directly and pushes
 * zero fragments. Mixed mode is safe — composer is a pure addition.
 */

import type { Enemy, LootItem } from '../../types.js';

/**
 * A bonus or follow-up note attached to an attack outcome. The
 * composer wraps each `label` in `fmt.note('[label]')` so the FE
 * renders it as a styled mechanical aside, and so it never reaches
 * LLM input as polluting prose (see `stripForLlm`).
 *
 * Examples: `{ label: 'Sneak Attack 2d6: +7' }`,
 * `{ label: 'Rage: +2' }`, `{ label: 'Cunning Strike — Trip: DEX 13
 * vs DC 14 — orc is prone!' }`.
 */
export interface AttackBonusNote {
  label: string;
}

export interface AttackHitFragment {
  kind: 'attack_hit';
  attackerId: string;
  attackerName: string;
  /** Snapshot of the target Enemy (used for buildCombatHitNarrative
   *  pool tiering by HP%, name lookup, enemyReactions pool). */
  target: Enemy;
  /** Equipped weapon when the attack landed; null for unarmed strikes. */
  weapon: LootItem | null;
  damage: number;
  damageType: string;
  isCrit: boolean;
  toHit: number;
  targetAc: number;
  /** Pre-built fmt.note-wrapped roll detail
   *  ("(d20 18+5 STR+2 prof = 25 vs AC 16)"). Constructed handler-side
   *  with the exact bonus modifiers in play; the composer just
   *  appends it after the main hit prose. */
  atkNote: string;
  /** Conditional bonus notes (Sneak Attack, Rage, Cunning Strike
   *  results, weapon-mastery effects, etc.) — order preserved. */
  bonuses?: AttackBonusNote[];
}

export interface AttackMissFragment {
  kind: 'attack_miss';
  attackerId: string;
  attackerName: string;
  target: Enemy;
  /** The actual weapon-label string used today ("your longsword" /
   *  "your fists") — passed in so the composer doesn't redo lookup. */
  weaponLabel: string;
  toHit: number;
  targetAc: number;
  atkNote: string;
  /** Why the miss happened. `'fumble'` triggers the "Natural 1"
   *  narrative + Heroic Inspiration grant note via `followups`.
   *  Defaults to `'normal'` (pool-picked miss prose). */
  reason?: 'normal' | 'fumble';
  /** Optional notes appended after the miss (Heroic Inspiration
   *  grant, Studied Attacks marker, Graze damage). */
  bonuses?: AttackBonusNote[];
}

export interface AttackKillFragment {
  kind: 'attack_kill';
  attackerId: string;
  attackerName: string;
  victimId: string;
  victimName: string;
  xp: number;
  /** Engine-built kill prose (from context.narratives.killShot pool
   *  picked with target substitution). Carried as a passthrough so
   *  the composer doesn't need to redo the lookup; future PRs may
   *  structure this. */
  killProse: string;
}

/**
 * Spell attack-roll outcomes. Map to the same `attack_hit` /
 * `attack_miss` `CombatEvent` kinds as weapon attacks (the combat log
 * is outcome-driven, not source-driven). The prose differs because
 * spells don't use weapon verbs / combatHit pool — instead the
 * composer assembles `castPrefix + atkNote + crit-prefix + damage-line
 * + bonuses`, mirroring the pre-migration hardcoded format.
 *
 * `castPrefix` is pre-built by the handler via `pickCastPrefix` from
 * `castSpell.ts`. This avoids a circular import (composer → spell
 * helper → composer). Same pattern as `atkNote` and `killProse`.
 */
export interface SpellAttackHitFragment {
  kind: 'spell_attack_hit';
  attackerId: string;
  attackerName: string;
  /** Snapshot of the target Enemy (id + name carried via event). */
  target: Enemy;
  spellId: string;
  spellName: string;
  /** Pre-built cast-prefix prose ("{name} casts {spell}{slotNote}" or a
   *  spell-specific pool entry — see `Spell.narratives.cast`). */
  castPrefix: string;
  damage: number;
  damageType: string;
  isCrit: boolean;
  toHit: number;
  targetAc: number;
  /** "(spell attack 18+5 = 23 vs AC 16)" pre-built by handler. */
  atkNote: string;
  bonuses?: AttackBonusNote[];
}

export interface SpellAttackMissFragment {
  kind: 'spell_attack_miss';
  attackerId: string;
  attackerName: string;
  target: Enemy;
  spellId: string;
  spellName: string;
  castPrefix: string;
  toHit: number;
  targetAc: number;
  atkNote: string;
  bonuses?: AttackBonusNote[];
}

/**
 * Spell heal — no CombatEvent today. The composer skips the event push
 * for fragments that return a null event. Adding a `heal` CombatEvent
 * kind is a future enhancement once heals need to show in combat_log.
 */
export interface SpellHealFragment {
  kind: 'spell_heal';
  castPrefix: string;
  healed: number;
  targetName: string;
  isSelf: boolean;
  targetNewHp: number;
  targetMaxHp: number;
  bonuses?: AttackBonusNote[];
}

/**
 * Utility spell (no damage / save / attack / condition). Carries the
 * fully-composed prose (either `spell.narrative` with `{name}`
 * substituted, or the default cast prefix). The composer appends
 * verbatim; no event.
 */
export interface SpellUtilityFragment {
  kind: 'spell_utility';
  prose: string;
}

/**
 * Save-spell with damage. The target rolled a save against the
 * spell's DC; damage is full if saveFailed, half on save (when
 * `saveEffect === 'half'`), or zero on save (when `saveEffect ===
 * 'negates'`). Emits an `attack_hit` CombatEvent for the damage
 * outcome — players see save spells in the combat log alongside
 * weapon and spell-attack hits.
 */
export interface SpellSaveDamageFragment {
  kind: 'spell_save_damage';
  attackerId: string;
  attackerName: string;
  target: Enemy;
  spellId: string;
  spellName: string;
  castPrefix: string;
  saveAbility: string; // 'STR' / 'DEX' / etc. (uppercase for display)
  saveDC: number;
  saveFailed: boolean;
  damage: number;
  damageType: string;
  /** True when this is a half-on-save spell that gave half damage. */
  halfOnSave: boolean;
  bonuses?: AttackBonusNote[];
}

/**
 * Save-spell with no damage (pure condition application). Composer
 * emits a `condition_applied` CombatEvent when `conditionApplied` is
 * present and not blocked by immunity.
 */
export interface SpellSaveConditionFragment {
  kind: 'spell_save_condition';
  attackerId: string;
  attackerName: string;
  target: Enemy;
  spellId: string;
  spellName: string;
  castPrefix: string;
  saveAbility: string;
  saveDC: number;
  saveFailed: boolean;
}

/**
 * Auto-hit AOE / single-target spell (Magic Missile single-target,
 * Spirit Guardians on-enter, etc.). No attack roll, no save —
 * just lands. Emits `attack_hit` event.
 */
export interface SpellAutoHitFragment {
  kind: 'spell_auto_hit';
  attackerId: string;
  attackerName: string;
  target: Enemy;
  spellId: string;
  spellName: string;
  castPrefix: string;
  damage: number;
  damageType: string;
  bonuses?: AttackBonusNote[];
}

/**
 * Multi-target spell summary (Magic Missile / Eldritch Blast). Each
 * dart/beam hits a target; the composer renders a single cast prefix
 * + per-target damage lines + total, and emits one `attack_hit`
 * CombatEvent per non-zero-damage target.
 */
export interface SpellMultiTargetFragment {
  kind: 'spell_multi_target';
  attackerId: string;
  attackerName: string;
  spellId: string;
  spellName: string;
  castPrefix: string;
  damageType: string;
  /** Per-projectile result. `note` carries the resistance/immune
   *  inline annotation from `applyDamageMultiplier` if any. */
  hits: Array<{
    enemyId: string;
    enemyName: string;
    targetAc: number;
    damage: number;
    killed: boolean;
    note?: string;
  }>;
  totalDamage: number;
  /** Caller-supplied "dart 1 → ..." style line labels — kept as data
   *  so the composer renders them uniformly. */
  labels: string[];
}

/**
 * Enemy → PC attack outcome. Carries pre-built prose (pool-picked
 * "enemy attacks target! takes X damage." + parenthesized
 * resistance/ward/temp_hp notes + inspiration/bardic notes + condition
 * application) plus the event payload. The fragment is built by
 * `computeEnemyAttack` (no state mutation); commit happens at
 * `commitEnemyAttack` time — which is deferred to Shield-decline for
 * Shield-eligible hits (closes the Shield-vs-concentration ordering
 * bug: applyDamage and its concentration save only fire when damage
 * actually lands).
 */
export interface EnemyAttackHitFragment {
  kind: 'enemy_attack_hit';
  attackerEnemyId: string;
  attackerName: string;
  targetCharId: string;
  targetName: string;
  damage: number;
  damageType: string;
  atkTotal: number;
  targetAc: number;
  prose: string;
}

export interface EnemyAttackMissFragment {
  kind: 'enemy_attack_miss';
  attackerEnemyId: string;
  attackerName: string;
  targetCharId: string;
  targetName: string;
  atkTotal: number;
  targetAc: number;
  prose: string;
}

/**
 * A condition landed on a target — Cunning Strike Trip / Poison,
 * weapon-mastery Topple, save-spell condition (Hold Person, Bane),
 * Stunning Strike, grapple/shove. The handler builds the prose
 * (handler-specific format — "[X — Trip: DEX 13 vs DC 14 — orc is
 * prone!]" vs "The X is poisoned!") and passes it verbatim. Composer
 * appends it and emits a `condition_applied` CombatEvent.
 *
 * Save-failed-and-condition-resists / immunity paths stay as inline
 * `ctx.narrative += fmt.note(...)` since they don't emit events.
 */
export interface ConditionAppliedFragment {
  kind: 'condition_applied';
  targetId: string;
  targetName: string;
  condition: string;
  source: string;
  prose: string;
}

export type NarrativeFragment =
  | AttackHitFragment
  | AttackMissFragment
  | AttackKillFragment
  | SpellAttackHitFragment
  | SpellAttackMissFragment
  | SpellHealFragment
  | SpellUtilityFragment
  | SpellSaveDamageFragment
  | SpellSaveConditionFragment
  | SpellAutoHitFragment
  | SpellMultiTargetFragment
  | ConditionAppliedFragment
  | EnemyAttackHitFragment
  | EnemyAttackMissFragment;
