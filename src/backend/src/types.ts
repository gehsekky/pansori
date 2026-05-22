// ─── Loot ─────────────────────────────────────────────────────────────────────

// Cross-cutting types live in src/shared/types.ts (single source of
// truth) and are synced into this workspace by `npm run sync-types`.
// Re-export here so external importers can keep using these names from
// `./types`; the internal `import type { ... }` line below also brings
// them into this file's own scope so the workspace-only interfaces
// (LootItem.mastery, Trap.condition, etc.) can reference them.
export * from './shared-types.js';
import type {
  AbilityKey,
  Background,
  CombatEntity,
  CombatEvent,
  ConditionName,
  District,
  Faction,
  Feat,
  GameChoice,
  GameConsequence,
  GridPos,
  LocationType,
  LootItem,
  NpcAttitude,
  NpcTemplate,
  PendingReaction,
  PlacedNpc,
  Quest,
  QuestProgress,
  RoomObject,
  StructuredAction,
} from './shared-types.js';

// `LootItem` is re-exported from ./shared-types (see src/shared/types.ts).

// `WeaponMastery` is re-exported from ./shared-types (see src/shared/types.ts).

// ─── Seed (procedurally generated world state) ────────────────────────────────

export interface Trap {
  id: string;
  name: string;
  desc: string; // flavour description shown when detected
  dc: number; // Perception DC to detect; Dexterity DC to disarm
  damage: string; // dice expr on trigger (e.g. '2d6')
  damageType: string;
  condition?: ConditionName; // optional condition applied on trigger
  conditionDuration?: number; // rounds; undefined = until cleared
  triggerNarrative: string; // text when trap fires (use {name}, {dmg})
  detectNarrative: string; // text when party spots the trap
  disarmSuccess: string; // text on successful disarm
  disarmFail: string; // text on failed disarm (trap fires)
}

// `RoomObject` is re-exported from ./shared-types (see src/shared/types.ts).

export interface Room {
  id: string;
  name: string;
  desc: string;
  canRest?: boolean;
  trap?: Trap; // static trap defined in context; can be overridden per-room
  objects?: RoomObject[];
  difficultTerrain?: GridPos[]; // squares costing 2× movement to enter
  coverPositions?: GridPos[]; // squares granting half cover (+2 AC) to occupant
  // Static obstacles (columns, walls, debris) — fully block movement and
  // count as cover for ranged attacks behind them. Seeded by procgen for
  // combat rooms, can also be authored in roomPool entries.
  obstacles?: GridPos[];
  // Ambient lighting per SRD 5.2.1 p.11 "Vision and Light". Default 'bright'
  // (the room is well-lit; tactical fog-of-war is disabled). 'dim' makes the
  // whole room Lightly Obscured (Disadvantage on sight-based Perception).
  // 'dark' makes squares outside a PC's lit radius Heavily Obscured
  // (Blinded for sight), enabling true fog-of-war on the combat grid.
  lighting?: 'bright' | 'dim' | 'dark';
}

// `ConditionName` is re-exported from ./shared-types (see src/shared/types.ts).

export interface OnHitEffect {
  condition: ConditionName;
  ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  dc: number;
}

// Boss phase changes. When the boss's hp drops below `hpPct` of its max,
// the engine transitions to that phase, applies the listed effects to the
// boss's effective stats for the rest of the fight, and emits a
// `phase_transition` event with the narrative. Phases are evaluated in
// order; the first un-entered phase whose threshold has been crossed
// fires. Phases run "lowest hp first" — e.g. [50%, 25%] means the 50%
// phase fires first, then 25%, never both at once.
//
// Phases mutate the *seed's* runtime Enemy stats in-place during a
// takeAction call. On a fresh request, the engine re-applies all phases
// up to `entity.phase_index` so the seed-from-DB looks correct.
export interface BossPhase {
  hpPct: number;
  name: string;
  narrative: string;
  effects: BossPhaseEffect[];
}

export type BossPhaseEffect =
  | { kind: 'set_multiattack'; value: number }
  | { kind: 'set_damage'; dice: string }
  | { kind: 'set_to_hit'; value: number }
  | { kind: 'set_ac'; value: number }
  | { kind: 'set_on_hit_effect'; effect: OnHitEffect }
  | { kind: 'add_resistance'; damageType: string }
  | { kind: 'heal'; amount: number };

// Legendary actions (SRD p.221). Fire AFTER another creature's turn ends —
// the legendary creature spends points from `legendary_action_points` to
// take a quick action. Pool refreshes at the start of the legendary
// creature's own turn. The engine fires at most one legendary action per
// post-PC-turn slot, choosing the lowest-cost available action.
export interface LegendaryAction {
  id: string;
  name: string;
  cost: number; // points consumed when used (typical 1-3)
  kind: 'extra_attack'; // start small; more kinds as content demands
  narrative?: string;
}

// Lair actions (SRD p.221). Fire on initiative count 20 (round-start in
// Pansori's simpler model) when a creature with `lair_actions` is in the
// current room. The engine fires one lair action per round, chosen at
// random from the list.
export type LairAction = {
  id: string;
  name: string;
  kind: 'aoe_save_damage'; // AoE damage with save-for-half
  dice: string; // e.g. '4d6'
  damageType: string;
  savingThrow: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  saveDC: number;
  narrative: string; // pre-effect description (e.g. "The walls shake...")
};

export interface EnemyTemplate {
  name: string;
  cr: number;
  hp: number;
  ac: number;
  damage: string;
  toHit: number;
  xp: number;
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
  onHitEffect?: OnHitEffect;
  multiattack?: number; // number of attacks per turn (default 1)
  resistances?: string[]; // damage types dealt at half damage
  vulnerabilities?: string[]; // damage types dealt at double damage
  immunities?: string[]; // damage types that deal no damage
  condition_immunities?: string[]; // conditions that cannot be applied
  damageType?: string; // primary damage type for this enemy's attack
  // Spell-casting (see Enemy.spells for runtime behaviour).
  spells?: string[];
  castChance?: number;
  spellSaveDC?: number;
  spellAttackBonus?: number;
  // Tactical movement (SRD 5.2.1 p.190). Engine-level defaults: 5 ft melee
  // reach, 30 ft walking speed. Override for reach weapons (10 ft) or
  // larger/faster monsters.
  attackReachFt?: number;
  speedFt?: number;
  // HP-threshold phase transitions for boss encounters. Order does not
  // matter — engine sorts by descending hpPct internally.
  phases?: BossPhase[];
  // Boss-only systems (SRD p.221). Bosses with `legendary_actions` get
  // `legendary_pool` points per round to spend on post-PC-turn actions;
  // bosses with `lair_actions` fire one environment effect on round wrap.
  legendary_actions?: LegendaryAction[];
  legendary_pool?: number; // points per round; default 3 if legendary_actions set
  lair_actions?: LairAction[];
}

export interface Enemy {
  id: string; // stable per-instance id (distinct from roomId; multiple enemies share a room)
  name: string;
  hp: number;
  ac: number;
  damage: string;
  toHit: number;
  xp: number;
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
  onHitEffect?: OnHitEffect;
  multiattack?: number;
  resistances?: string[];
  vulnerabilities?: string[];
  immunities?: string[];
  condition_immunities?: string[];
  // Primary damage type for this enemy's basic attack. Mirrors
  // EnemyTemplate.damageType; carries through procgen so PCs with species
  // resistance to a given type can take half damage RAW.
  damageType?: string;
  // Spell-casting enemies (e.g. cultists, acolytes, mages). On their turn,
  // they roll castChance (0–1) to decide cast vs attack; if cast wins, one
  // spell from `spells` is picked. Spells must exist in context.spellTable
  // and currently only damage spells with a single-target resolution are
  // supported on the enemy side. The casting flow also opens a Counterspell
  // reaction window for any eligible PC.
  spells?: string[];
  castChance?: number; // 0..1 probability per turn; 0 or undefined = never cast
  spellSaveDC?: number; // DC for save-based spells; defaults to 8 + prof(CR-derived) + caster mod
  spellAttackBonus?: number; // +mod for spell-attack-roll spells; defaults to toHit
  // Tactical movement (SRD 5.2.1 p.190). Mirrors EnemyTemplate fields and is
  // carried through procgen. attackReachFt defaults to 5 ft (the default
  // melee reach); speedFt defaults to 30 ft (the default humanoid walk).
  attackReachFt?: number;
  speedFt?: number;
  // Boss phase definitions (carried over from template). Runtime phase
  // index lives on the matching CombatEntity, not here, so phase progress
  // survives state serialization without touching the seed payload.
  phases?: BossPhase[];
  // Max hp captured at seed time so phase thresholds can be re-evaluated
  // against the *original* HP after damage reduces hp below maxHp.
  maxHp?: number;
  // Boss-only systems (SRD p.221). Mirrors EnemyTemplate fields and is
  // carried through procgen. `legendary_action_points` is the current
  // pool; refreshes on this enemy's own turn start.
  legendary_actions?: LegendaryAction[];
  legendary_pool?: number;
  legendary_action_points?: number;
  lair_actions?: LairAction[];
}

export interface Seed {
  context_id: string;
  world_name: string;
  ship_name: string;
  intro: string;
  rooms: Room[];
  connections: Record<string, string[]>;
  enemies: Record<string, Enemy[]>;
  loot: Record<string, LootItem>;
  npcs: Record<string, PlacedNpc>;
  seed_id: string;
}

// ─── Game state ───────────────────────────────────────────────────────────────

// `CoverLevel` is re-exported from ./shared-types (see src/shared/types.ts).

export interface TurnActions {
  action_used: boolean;
  bonus_action_used: boolean;
  reaction_used: boolean;
  free_interaction_used: boolean;
  dodging?: boolean; // Dodge action: enemy attacks have disadvantage until next turn
  disengaged?: boolean; // Disengage action: no opportunity attacks this turn
  // Barbarian Reckless Attack (PHB p.49): advantage on STR melee attacks this turn,
  // but enemies have advantage on attacks vs the Barbarian until their next turn.
  reckless?: boolean;
  // SRD 5.2.1 p.67 Quickened Spell metamagic: you can't use Quickened if a
  // level 1+ spell was already cast this turn, AND you can't cast a level 1+
  // spell on the same turn that you used Quickened.
  leveled_spell_cast?: boolean; // set after any non-cantrip spell resolves
  quickened_used?: boolean; // set when Quickened Spell metamagic is consumed
  // Heroic Inspiration pending — when set, the next attack roll gets
  // advantage and both this flag + char.inspiration are cleared (one-shot).
  inspiration_pending?: boolean;
  // Lucky feat (2024 PHB) — when set, the next PC attack roll gets
  // advantage. Decoupled from inspiration_pending so a PC can stack
  // sources or use Lucky without burning their Heroic Inspiration.
  // Set by `use_luck`, cleared on consumption (one-shot).
  luck_pending?: boolean;
  // Sharpshooter feat (2024 PHB) — when true, ranged-weapon attacks
  // this turn take -5 to hit / +10 damage and ignore half + three-
  // quarters cover. Toggled by `toggle_sharpshooter`; auto-clears at
  // turn end (FRESH_TURN reset). Sticky across multiple attacks in
  // the same turn (matches how players actually use it).
  sharpshooter_active?: boolean;
  // Savage Attacker feat (2024 PHB origin) — once per turn, on a
  // weapon-damage hit, reroll damage and take the higher. This flag
  // marks the reroll as already spent this turn so multi-hit turns
  // (Extra Attack, two-weapon) only benefit once.
  savage_attacker_used?: boolean;
  // Sneak Attack (Rogue) — once per turn. Without this gate, a
  // multiclass Rogue with Extra Attack (Fighter/Ranger/Paladin/
  // Barbarian/Monk multiclass) or any Rogue using Two-Weapon
  // Fighting could trigger SA on every hit. RAW: only on the
  // first qualifying hit. Cleared by FRESH_TURN at turn start.
  sneak_attack_used?: boolean;
  // Great Weapon Master damage rider (2024 PHB) — once per turn,
  // a heavy-weapon hit adds +profBonus damage. Same shape as
  // Savage Attacker / Sneak Attack once-per-turn gates.
  gwm_used?: boolean;
  // 2024 PHB Rogue Cunning Strike (L5+) — when set, the next Sneak Attack
  // spends 1 die for the chosen effect (trip, poison, withdraw, disarm)
  // and one SA die is removed from the damage roll. Cleared after applied.
  cunning_strike_pending?: 'trip' | 'poison' | 'withdraw' | 'disarm';
  movement_budget_remaining?: number; // feet remaining this turn; initialized to speed at turn start
  readied_action?: {
    trigger: string;
    action: StructuredAction;
  };
  // 2024 PHB Monk — Patient Defense and Step of the Wind can each be used
  // once per turn without spending Discipline Points; spending 1 DP grants
  // both effects. This flag marks the free monk bonus action as consumed
  // this turn.
  monk_free_used?: boolean;
  // 2024 PHB Monk L5 — Stunning Strike is once per turn (was per-hit in
  // 2014). Set when the monk has already taken their stun shot this turn.
  monk_stunning_strike_used?: boolean;
  // 2024 PHB Fighter L9 — Tactical Master. When attacking with any weapon
  // whose mastery you've trained, the Fighter may swap in Push, Sap, or
  // Slow for that attack. Cleared when the attack resolves.
  tactical_master_mastery?: 'push' | 'sap' | 'slow';
}

export interface DeathSaves {
  successes: number;
  failures: number;
}

// ─── NPC system ───────────────────────────────────────────────────────────────

// `NpcAttitude` is re-exported from ./shared-types (see src/shared/types.ts).

// `NpcShopEntry` is re-exported from ./shared-types (see src/shared/types.ts).

// `NpcDialogueResponse` is re-exported from ./shared-types (see src/shared/types.ts).

// `NpcTemplate` is re-exported from ./shared-types (see src/shared/types.ts).

// `PlacedNpc` is re-exported from ./shared-types (see src/shared/types.ts).

// ─── Backgrounds ──────────────────────────────────────────────────────────────

// `Background` is re-exported from ./shared-types (see src/shared/types.ts).

// ─── Spell system ─────────────────────────────────────────────────────────────

/**
 * Per-spell narrative pools — one entry per resolution stage. Each pool
 * is a `string[]` so the engine picks one at random (matching the
 * pattern of context.narratives.combatHit, weaponVerbs, etc.).
 *
 * Tokens substituted in pool strings:
 *   {name}       caster name
 *   {spell}      spell display name
 *   {slotNote}   upcast hint, e.g. " (lvl 3)" or "" — already includes
 *                leading space, so place adjacent to other text
 *   {target}     primary target name (where applicable)
 *
 * The engine appends mechanical outcome data (damage tokens, save
 * results) AFTER the chosen prose, so pool entries should be flavor-
 * only — don't try to substitute damage numbers here, the engine adds
 * them outside the pool.
 *
 * Pools are optional; missing pools fall back to engine defaults.
 */
export interface SpellNarrative {
  /** Cast-prefix prose for spells with mechanical effects (replaces
   *  the default "{name} casts {spell}{slotNote}!" lead-in). The
   *  engine appends the rest of the mechanical resolution after. */
  cast?: string[];
}

export interface Spell {
  id: string;
  name: string;
  desc: string;
  level: number; // 0 = cantrip
  castTime: 'action' | 'bonus_action' | 'reaction';
  damage?: string; // dice expr, e.g. '8d6'
  damageType?: string;
  savingThrow?: AbilityKey;
  saveEffect?: 'half' | 'negates';
  attackRoll?: boolean; // true = uses spell attack roll vs enemy AC
  heal?: string; // dice expr for healing
  condition?: ConditionName;
  conditionDuration?: number; // rounds; undefined = permanent until cleared
  narrative?: string; // override text for utility spells (single-string;
  //                     for richer per-stage flavor use `narratives` below)
  narratives?: SpellNarrative;
  concentration?: boolean; // true = breaks if caster takes damage and fails CON save
  // Round budget for concentration spells (SRD 5.2.1 — 1 round = 6 sec).
  // 10 rounds = 1 minute (the default for Bless, Hold Person, Bane, etc.);
  // 100 rounds = 10 minutes (Spirit Guardians); 600 rounds = 1 hour
  // (Hex, Detect Magic-as-concentration). Only used when concentration is
  // true. Defaults to 10 if unspecified.
  durationRounds?: number;
  upcastBonus?: string; // extra dice per slot above base level, e.g. '1d6'
  blastRadius?: number; // AOE radius in feet; undefined = single target
  // SRD 5.2.1 p.193 — Areas of Effect. Default is 'sphere' (radius from a point).
  //   sphere: blastRadius = radius
  //   cone:   blastRadius = length of the cone, originating from caster
  //   cube:   blastRadius = side length of cube emanating from caster
  //   line:   blastRadius = length (5 ft wide), from caster outward
  aoeShape?: 'sphere' | 'cone' | 'cube' | 'line';
  ritualCasting?: boolean; // castable as ritual (no slot cost, only out of combat)
  verbal?: boolean; // has verbal component (blocked when deafened)
  // 2024 PHB spell-list tags. A spell can belong to multiple lists
  // (e.g. Healing Word is on the Cleric, Druid, and Bard lists →
  // ['divine', 'primal', 'arcane']). Used by Magic Initiate to
  // validate that the player's spell pick comes from the matching
  // list. Absent on context-local utility spells that aren't tied
  // to a class list.
  spellList?: Array<'arcane' | 'divine' | 'primal'>;
  // SRD 5.2.1: spell range. 'self' = no external target; 'touch' = adjacent
  // only (≤ 5 ft / 1 grid square); 'ranged' uses rangeFt for the max distance.
  // When unspecified, the engine treats the spell as untargeted/utility.
  rangeKind?: 'self' | 'touch' | 'ranged';
  rangeFt?: number;
  // 2024 PHB — some spells require a costly material component that's
  // consumed on cast (Identify's 100 gp pearl, Revivify's 300 gp diamond,
  // Resurrection's 1000 gp diamond, etc.). Engine deducts from char.gold
  // on cast and blocks the cast if the caster can't afford it. Free
  // material components (just listed in the description) don't set this.
  materialCost?: number;
}

// ─── Beast Forms (2024 PHB Wild Shape) ───────────────────────────────────────
// Each form is a curated beast stat block the druid can transform into.
// Replaces equipped-weapon attacks while in form. Form-specific traits
// (Bear's physical resistance, Wolf's pack tactics, Hawk's flying) apply
// while the wild_shaped condition is active and char.wild_shape_form
// matches this form's id.

export interface BeastForm {
  id: string;
  name: string;
  cr: number; // determines whether Moon (level/3) or base (1/4 → 1/2 → 1) Druids can access
  // Attack profile while shifted. Replaces the druid's equipped weapon.
  attackName: string;
  attackToHit: number; // flat bonus added to d20 (form's natural attack bonus)
  attackDamage: string; // dice expr e.g. '2d4+2'
  attackDamageType: string;
  // Optional traits:
  flying?: boolean; // grants flying movement (no OAs from ground enemies)
  climbing?: boolean; // grants climb speed
  packTactics?: boolean; // advantage on attacks when any ally is within 5 ft
  physicalResistance?: boolean; // resistance to non-magical bludgeoning/piercing/slashing
  speedFt?: number; // movement speed override (default 30)
  descriptor: string; // short flavor for narratives
}

// ─── Structured actions ───────────────────────────────────────────────────────

// `AbilityKey` is re-exported from ./shared-types (see src/shared/types.ts).

// `StructuredAction` is re-exported from ./shared-types (see src/shared/types.ts).

// Compass direction tag for grid movement choices — drives the 3x3 D-pad
// on the frontend so it can place each arrow in the right cell.
// `ChoiceDirection` is re-exported from ./shared-types (see src/shared/types.ts).

// Semantic kind hint for the frontend. Optional: untagged choices fall back
// to the plain text-button rendering. The frontend uses `kind` to route
// choices to specialised renderers (D-pad for grid_move, icon row for the
// default-action universals). New kinds can be added incrementally.
// `ChoiceKind` is re-exported from ./shared-types (see src/shared/types.ts).

// `GameChoice` is re-exported from ./shared-types (see src/shared/types.ts).

export interface InventoryItem {
  instance_id: string;
  id: string;
  name: string;
  [key: string]: unknown;
}

// ─── Character (per-character state) ─────────────────────────────────────────

export interface Character {
  id: string;
  name: string;
  /**
   * Primary / first class — taken at character creation. Single-class
   * characters carry only this. Multiclass characters use it for
   * tie-breaking (e.g. saving-throw profs come from the FIRST class
   * only per 2024 PHB) and as the display label.
   *
   * For per-class level lookups, prefer `class_levels` via the
   * `getClassLevels` / `getClassLevel` helpers in `services/multiclass.ts`.
   */
  character_class: string;
  /**
   * Per-class level breakdown (multiclassing — 2024 PHB Ch. 1). Keys
   * are class names lowercased (`'fighter'`, `'wizard'`); values are
   * the level taken in that class. Sum across all keys should equal
   * `level`. Absent on legacy single-class PCs — `getClassLevels`
   * synthesizes `{[character_class]: level}` in that case.
   */
  class_levels?: Record<string, number>;
  portrait_url: string | null;
  hp: number;
  max_hp: number;
  ac: number;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  xp: number;
  level: number;
  gold: number;
  inventory: InventoryItem[];
  equipped_weapon: string | null;
  equipped_armor: string | null;
  equipped_shield: string | null;
  conditions: string[];
  condition_durations: Record<string, number>;
  death_saves: DeathSaves;
  stable: boolean;
  dead: boolean;
  turn_actions: TurnActions;
  initiative_roll: number | null;
  hit_die: number;
  hit_dice_remaining: number;
  // Per-rest class resource pools (e.g. rage_uses, action_surge)
  class_resource_uses: Record<string, number>;
  // True when the character has levelled up to an ASI level and hasn't chosen their improvement yet
  asi_pending: boolean;
  // 0 = none; 1–6 = exhaustion level per 5e PHB (cumulative penalties)
  exhaustion_level: number;
  // Background
  background_id: string | null;
  skill_proficiencies: string[]; // from background + class (e.g. ['Perception', 'Stealth'])
  tool_proficiencies: string[]; // from background (e.g. ["Thieves' Tools"])
  // Spell system — slots keyed by spell level (1 = 1st-level, etc.)
  spell_slots_max: Record<number, number>;
  spell_slots_used: Record<number, number>;
  spells_known: string[]; // spell IDs from context.spellTable
  // 5e proficiencies (populated at session creation from context tables)
  armor_proficiencies: string[]; // e.g. ['light', 'medium', 'shield']
  weapon_proficiencies: string[]; // e.g. ['simple', 'martial']
  // 2024 PHB Weapon Mastery — weapon ids the PC has mastered. Class-based
  // grant: Fighter/Paladin/Ranger get 2-3 at L1, Barbarian/Rogue get 2,
  // Wizard/Druid/Bard get 0 by default. Wielding a weapon NOT in this list
  // doesn't grant its mastery property even if the weapon has one.
  weapon_masteries?: string[];
  // Bardic Inspiration die granted by a Bard (PHB p.53 / 2024 p.52). The
  // die is stored as a dice expression ('d6', 'd8', ...) and consumed on
  // the next d20 test (attack/save/check). 2024 PHB expands what the die
  // can apply to — Pansori applies it to attack-roll consumption today;
  // save consumption follows the Heroic Inspiration pattern.
  bardic_inspiration_die?: string;
  /**
   * 2024 PHB Divine Smite spell — bonus-action pre-buff. When the
   * Paladin casts the spell, this records the number of d8 radiant
   * dice queued for the next weapon-attack hit. Cleared when the
   * next weapon hit consumes the buff (or at the end of the next
   * turn, per RAW — duration tracking is a follow-up).
   */
  divine_smite_dice?: number;
  // 2024 PHB Wild Shape — id of the active BeastForm while wild_shaped.
  // Cleared on dismiss_wild_shape.
  wild_shape_form?: string;
  attuned_items: string[]; // instance_ids of attuned magic items (max 3)
  // `rounds_left` ticks down on each round wrap; concentration ends
  // automatically when it reaches 0. 10 rounds = 1 minute (the most
  // common duration). Default applied on cast if the Spell entry
  // doesn't specify; longer-lasting buffs (Spirit Guardians = 100,
  // Hex = ~600) override via Spell.durationRounds.
  concentrating_on?: {
    spellId: string;
    condition?: string;
    rounds_left?: number;
  } | null;
  // Extended 5e fields
  subclass?: string; // e.g. 'battle_master', 'thief', 'evoker'
  speed?: number; // movement speed in feet; defaults to 30
  feats?: string[];
  /**
   * Per-feat selections that the player made when taking a feat — e.g.
   * which ability the +1 half-feat bonus went to, or which abilities a
   * `save-proficiency` feat (Resilient) granted save profs in. Keyed
   * by feat id. Absent when no feat needed a runtime choice.
   */
  feat_choices?: Record<
    string,
    {
      abilityBonus?: AbilityKey;
      saveProficiencies?: AbilityKey[];
      // Magic Initiate — the chosen L1 spell id (so the cast handler
      // can identify the free-cast spell from `feat_choices`).
      magicInitiateL1?: string;
    }
  >;
  expertise_skills?: string[]; // skills with double proficiency bonus (Rogue/Bard)
  prepared_spells?: string[]; // spell ids currently prepared (Cleric/Paladin/Druid)
  charmer_id?: string; // entity id of the charmer when charmed
  // SRD 5.2.1 p.11: Darkvision treats Darkness as Dim Light within this radius
  // (typically 60 ft for elves/dwarves/halflings/etc.). Default 0 = no
  // darkvision (typical human).
  darkvision_ft?: number;
  // SRD 5.2.1 p.17–18: Temporary Hit Points. Absorb damage before HP. Don't
  // stack with themselves (replace if higher); expire on a Long Rest.
  temp_hp?: number;
  // 2024 PHB Heroic Inspiration: granted automatically on a Nat 1 d20.
  // Player can spend it on a later d20 to gain advantage (one-shot).
  inspiration?: boolean;
  // SRD 5.2.1 p.11 — Hide action stores the Stealth check total as the DC
  // for anyone trying to find you. While the `invisible` condition is set
  // and hide_dc > 0, enemies must beat hide_dc with a passive Perception
  // (or active Search) to reveal you before they can target effectively.
  // Cleared when invisible is cleared.
  hide_dc?: number;
  // 2024 PHB — some conditions track the entity that caused them. Primary
  // use: Frightened can't willingly move closer to its source. Keyed by
  // condition name; cleared whenever the condition is removed.
  condition_sources?: Record<string, string>;
  // 2024 PHB Species (formerly "race"). Determines size, speed, darkvision,
  // resistances, and innate cantrips. See contexts/srd/species.ts. Optional
  // because pre-species saves still need to load — defaults applied as
  // "Human" when missing.
  species?: string;
  // Multiplayer ownership: the userId of the human controlling this PC.
  // In solo mode every PC is owned by the host (= session.user_id). In
  // multiplayer the host can reassign via session_participants UI; the
  // assignment lives on the character so per-PC ownership reads in one
  // hop without a join. Optional because pre-MP saves don't carry it —
  // normalizeState backfills missing values to session.user_id.
  owner_user_id?: string;
}

// ─── Reactive spell window ───────────────────────────────────────────────────

// A `pending_reaction` snapshot pauses the enemy-turn loop mid-resolution
// and gives an eligible PC the chance to spend their reaction (PHB p.190).
// The engine stores enough state to resume after the player decides:
//   - resumeFromInitiativeIdx / resumeFromMultiattackIdx: where in the
//     auto-resolve loop to pick up.
//   - trigger: the in-flight attack details (so the reaction can negate or
//     respond to the specific hit when it lands).
//   - narrativeSoFar: text accumulated before the pause, prepended to the
//     final narrative when combat resumes.
//   - eligibleCharIds: which party member(s) may declare the reaction.
// Fields shared by every reaction-window variant: who triggered it, who can
// react, where to resume the enemy turn loop.

// Shield (PHB p.275). Triggers BEFORE damage applies — accepting negates the
// hit retroactively. pendingDamage/pendingNarrative are stashed so a decline
// can apply them as if Shield was never offered.
// `PendingShieldReaction` is re-exported from ./shared-types (see src/shared/types.ts).

// Hellish Rebuke (PHB p.252). Triggers AFTER damage applies — accepting deals
// 2d10 fire damage back to the attacker (DEX save for half). No state to
// stash: the damage that triggered Rebuke is already on the books, and a
// decline just lets the loop continue.
// `PendingHellishRebukeReaction` is re-exported from ./shared-types (see src/shared/types.ts).

// Counterspell (PHB p.234). Triggers BEFORE an enemy spell resolves — the
// engine snapshots the enemy's intent (spell id + level + intended target)
// so a Counterspell accept can nullify it, and a decline lets the spell
// fire as normal during the resume.
// `PendingCounterspellReaction` is re-exported from ./shared-types (see src/shared/types.ts).

// `PendingReaction` is re-exported from ./shared-types (see src/shared/types.ts).

// ─── Combat event log ───────────────────────────────────────────────────────
//
// Structured events emitted in parallel to the narrative string. The
// narrative continues to be the source of prose flavour (the "what does
// this look like in fiction" channel). Events are the "mechanics" channel —
// terse, scannable, structured. The frontend renders them in a dedicated
// combat-log panel separate from the narrative.
//
// Kept as a circular buffer on state.combat_log; capped at COMBAT_LOG_MAX
// so long sessions don't accumulate state.

// `COMBAT_LOG_MAX` is re-exported from ./shared-types (see src/shared/types.ts).

// `CombatEvent` is re-exported from ./shared-types (see src/shared/types.ts).

// ─── Game state (world/party container) ──────────────────────────────────────

export interface GameState {
  // Schema version. `normalizeState` stamps this with
  // `CURRENT_SCHEMA_VERSION` on every load; older saves (or saves
  // missing the field — pre-versioning) are routed through the
  // migration ladder in `services/stateSchema.ts`. See that module
  // for the version history and migration rules.
  schemaVersion?: number;

  // Party
  characters: Character[];
  active_character_id: string;

  // World
  current_room: string;
  visited_rooms: string[];
  enemies_killed: string[];
  loot_taken: string[];

  // Combat (party-level)
  combat_active: boolean;
  initiative_order: Array<{ id: string; roll: number; is_enemy: boolean }>;
  initiative_idx: number;

  // Logging
  run_log: Array<{ character_id: string; action: string; narrative: string }>;
  room_log: string[];
  last_choices?: GameChoice[];

  // Rest tracking
  short_rested_rooms: string[];
  long_rested: boolean;

  // NPC state
  npc_attitudes: Record<string, NpcAttitude>; // roomId → current attitude
  npc_talked: string[]; // roomIds where player has talked

  // Trap state — rooms where the trap has already fired or been disarmed
  traps_triggered: string[]; // roomIds where trap fired
  traps_disarmed: string[]; // roomIds where trap was disarmed

  // Object interaction — keys are "roomId:objectId"
  objects_searched: string[];

  // Script engine flags
  flags: Record<string, boolean | string | number>;

  // Grid combat (campaign dungeons only)
  entities?: CombatEntity[];
  movement_used?: Record<string, number>; // entityId → feet moved this turn
  help_target_id?: string; // char id receiving Help action advantage
  surprised?: string[]; // entity ids surprised at combat start (skip first turn)
  metamagic_active?: string; // active Metamagic modifier for Sorcerer
  guided_strike_active?: boolean; // War Cleric Channel Divinity +10 attack pending
  vow_of_enmity_target?: string; // Vengeance Paladin vow target entity id
  cutting_words_penalty?: number; // Lore Bard Cutting Words penalty to apply
  round?: number; // current combat round (1-indexed)

  // Reactive spell window (PHB p.190 — reactions). When set, the engine is
  // paused mid-enemy-turn waiting for an eligible PC to decide whether to
  // spend their reaction. While set, generateChoices offers only the
  // reaction choices; the player resolves with `resolve_reaction`.
  pending_reaction?: PendingReaction;

  // Structured combat event log (circular buffer, capped at COMBAT_LOG_MAX).
  // Emitted in parallel to the narrative string for UI rendering of
  // mechanical events (hits, damage, conditions) separately from prose.
  combat_log?: CombatEvent[];

  // Campaign overlay (merged from CampaignState at session load)
  current_location_id?: string;
  current_district_id?: string;
  campaign_flags?: Record<string, boolean | string | number>;
  quest_progress?: QuestProgress[];
  faction_rep?: Record<string, number>; // factionId → numeric rep
  world_day?: number;

  // Choice-dimming memory. Each entry is a stable seenKey emitted by the
  // backend when the corresponding choice was clicked (talk_response,
  // interact_object, accept_quest, etc.). Resets only on a new adventure.
  // See generateChoices / seenKeyForAction for the key construction.
  seen_choices?: string[];
}

// ─── Script engine rules ──────────────────────────────────────────────────────

// `GameConsequence` is re-exported from ./shared-types (see src/shared/types.ts).

export interface GameRule {
  name: string;
  priority?: number; // higher = evaluated first; default 1
  conditions: object; // json-rules-engine TopLevelCondition
  consequences: GameConsequence[];
  once?: boolean; // auto-sets flags.rule_fired_<name> so it never fires again
}

// ─── Script engine facts ──────────────────────────────────────────────────────

export interface RuleFacts {
  action: string;
  room_id: string;
  prev_room_id: string;
  visited_rooms: string[];
  enemies_killed: string[];
  loot_taken: string[];
  combat_active: boolean;
  flags: Record<string, boolean | string | number>;
  active_hp: number;
  active_max_hp: number;
  active_level: number;
  active_class: string;
  active_conditions: string[];
}

// ─── Context (game theme/setting) ─────────────────────────────────────────────

export interface RoomPoolEntry {
  id: string;
  name: string;
  descs: string[];
  trap?: Trap; // optional; if present, included in the generated Room for this entry
  objects?: RoomObject[];
}

export interface CampaignData {
  world_name: string;
  intro: string;
  rooms: Room[];
  connections: Record<string, string[]>;
  enemies?: Record<string, Enemy[]>;
  loot?: Record<string, LootItem>;
  // Author-placed NPCs keyed by roomId. The engine's NPC lookup is
  // seed.npcs[roomId]; generateSeed copies this field into the seed for
  // campaign-mode runs. Roguelike NPCs are still placed by procgen.
  npcs?: Record<string, PlacedNpc>;
  startingLoot?: string[];
  locations?: Location[];
  quests?: Quest[];
  factions?: Faction[];
  // Authoring hint: the campaign is balanced for this many PCs. Enemy HP
  // already scales linearly with party size via `scaleEnemyHp`, but the
  // *quantity* of enemies per room is authored statically — so a party of 1
  // facing the throne fight (Crypt Lord + 2 minions, balanced for 3 PCs) will
  // have a hard time. Surfaced on the character creation screen.
  recommendedPartySize?: number;
  // Class ids for the campaign's ideal party composition. Length should match
  // `recommendedPartySize`. The character creation screen offers an auto-fill
  // button that builds this composition. Falls back to a generic size-based
  // template when unset.
  recommendedComposition?: string[];
}

export type TieredNarrative = string[] | Record<string, string[]>;

export interface Context {
  id: string;
  worldNoun: string;
  startRoomId: string;
  escapeRoomId: string;
  escapeTriggers: string[];
  escapeChoiceText: string;
  worldNames: string[];
  mapType: 'roguelike' | 'campaign';
  gridEnabled?: boolean; // enable grid-based combat for this context
  gridWidth?: number; // default combat grid width  (squares)
  gridHeight?: number; // default combat grid height (squares)
  campaign?: CampaignData;
  classPrimaryStats: Record<string, 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'>;
  classSkills: Record<string, string[]>;
  classHitDie: Record<string, number>;
  classArmorProficiencies?: Record<string, string[]>; // class → ['light','medium','heavy','shield']
  classWeaponProficiencies?: Record<string, string[]>; // class → ['simple','martial']
  // 5e saving throw proficiencies per class (2 abilities each)
  classSavingThrows?: Record<string, Array<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'>>;
  // Class features that activate during play (sneak_attack, extra_attack, rage, …)
  classFeatures?: Record<string, string[]>;
  // Per-class starting gear — auto-equipped at session start
  classStartingLoot?: Record<string, string[]>; // class → item IDs given at session start
  // Backgrounds — optional list; if present, player picks one at character creation
  backgrounds?: Background[];
  // Spell system — optional; only present for contexts with spellcasting classes
  spellTable?: Record<string, Spell>;
  // Feat system — optional; only present for contexts that surface feat
  // choice at character creation / level-up. Keys match `Character.feats`.
  featTable?: Record<string, Feat>;
  classSpells?: Record<string, string[]>; // class → spell IDs
  // classSpellSlots[class][level-1] → Record<spellLevel, maxSlots>
  classSpellSlots?: Record<string, Array<Record<number, number>>>;
  spellcastingAbility?: Record<string, AbilityKey>; // class → casting ability
  enemyTemplates: EnemyTemplate[];
  introTexts: string[];
  roomPool: RoomPoolEntry[];
  lootTable: LootItem[];
  rules?: GameRule[];
  npcTemplates?: NpcTemplate[];
  npcSpawnChance?: number; // 0–1 chance per room in roguelike mode (default 0)
  narratives: {
    roomArrival: Record<string, string[]>;
    genericArrival: string[];
    weaponVerbs: Record<string, string[]>;
    classStyle: Record<string, string[]>;
    enemyReactions: Record<string, string[]>;
    deathSaveStatus: Record<number, string[]>;
    combatHit: TieredNarrative;
    combatMiss: TieredNarrative;
    enemyAttacks: string[];
    killShot: string[];
    lootPickedUp: string[];
    noLoot: string[];
    alreadyLooted: string[];
    noEnemy: string[];
    alreadyDead: string[];
    sneakSuccess: string[];
    sneakFail: string[];
    deathLines: string[];
    escapeLines: string[];
    enemyDeflected: string[];
    levelUp: string[];
    noEscapeNearby: string[];
    escapeBlocked: string[];
    // Optional overrides for otherwise hard-coded engine text
    combatStart?: string[]; // prefix before "Initiative: X → Y"; {enemy} substituted
    shortRest?: string[]; // flavor before HP numbers; {name} {hpGained} {hpNow} {hpMax} substituted
    longRest?: string[]; // flavor before per-character HP summary; {party} substituted
  };
}

// ─── Grid combat ─────────────────────────────────────────────────────────────

// `GridPos` is re-exported from ./shared-types (see src/shared/types.ts).

// `CombatEntity` is re-exported from ./shared-types (see src/shared/types.ts).

// ─── Quest system ─────────────────────────────────────────────────────────────

// `QuestStatus` is re-exported from ./shared-types (see src/shared/types.ts).

// `QuestStep` is re-exported from ./shared-types (see src/shared/types.ts).

// `Quest` is re-exported from ./shared-types (see src/shared/types.ts).

// `QuestProgress` is re-exported from ./shared-types (see src/shared/types.ts).

// ─── Faction system ───────────────────────────────────────────────────────────

// `FactionThresholds` is re-exported from ./shared-types (see src/shared/types.ts).

// `Faction` is re-exported from ./shared-types (see src/shared/types.ts).

// ─── Campaign state (persists across sessions) ────────────────────────────────

// `CampaignState` is re-exported from ./shared-types (see src/shared/types.ts).

// ─── Campaign facts (evaluated against quest step conditions) ─────────────────

export interface CampaignFacts {
  action: string;
  room_id: string;
  location_id: string;
  enemies_killed: string[];
  loot_taken: string[];
  flags: Record<string, boolean | string | number>;
  campaign_flags: Record<string, boolean | string | number>;
  quest_progress: QuestProgress[];
  faction_rep: Record<string, number>;
  world_day: number;
  active_level: number;
  active_class: string;
}

// ─── Locations ────────────────────────────────────────────────────────────────

// `LocationType` is re-exported from ./shared-types (see src/shared/types.ts).

// `District` is re-exported from ./shared-types (see src/shared/types.ts).

export interface Location {
  id: string;
  name: string;
  type: LocationType;
  desc: string;
  districts?: District[];
  rooms?: Room[];
  gridWidth?: number;
  gridHeight?: number;
  connections?: string[];
  encounterTable?: string[];
  encounterChance?: number;
  // Anchor room for "you're at this location" — used to resolve
  // current_location_id from current_room when the player hasn't
  // explicitly travelled (e.g. the campaign starts the party at a
  // town's central square; without this, quest steps gated on
  // location_id never match because the engine had no way to know
  // the party was in town).
  centralRoomId?: string;
}
