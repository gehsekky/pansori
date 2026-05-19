// ─── Loot ─────────────────────────────────────────────────────────────────────

export interface LootItem {
  id: string;
  name: string;
  desc: string;
  weight: number;
  type: 'weapon' | 'armor' | 'consumable' | 'misc';
  slot: 'weapon' | 'armor' | 'shield' | null;
  damage: string | null;
  finesse?: boolean;
  range?: 'melee' | 'ranged';
  ac_bonus: number | null;
  heal: string | null;
  effect: string | null;
  aliases: string[];
  useNarrative?: string;
  armorCategory?: 'light' | 'medium' | 'heavy' | 'shield';
  weaponType?: 'simple' | 'martial';
  light?: boolean; // TWF: can be used in off-hand with another light weapon
  requiresAttunement?: boolean; // magic items requiring attunement
  armorAcBase?: number; // base AC of armor when worn (e.g. leather=11, chain mail=16)
  dexCapToAc?: number; // max DEX bonus added to AC (2=medium, 0=heavy; undefined=full DEX)
  versatileDamage?: string; // two-handed damage for versatile weapons (e.g. '1d8' for quarterstaff)
  damageType?: string; // piercing / slashing / bludgeoning / fire / etc.
  thrown?: { normalRange: number; longRange: number }; // melee weapon usable as ranged
  // SRD 5.2.1 p.90 "Loading": one shot per Action/Bonus/Reaction regardless of
  // Extra Attack. Hand/heavy crossbows, muskets, pistols, blowguns all have it.
  loading?: boolean;
  // SRD 5.2.1 p.90 "Reach": adds 5 ft to melee reach (also for opportunity
  // attacks made with this weapon). Glaive, halberd, lance, pike, whip.
  reach?: boolean;
  // SRD 5.2.1 p.90 "Heavy": disadv on attacks if STR < 13 (melee) / DEX < 13
  // (ranged). Greataxe, greatsword, maul, heavy crossbow, longbow, etc.
  heavy?: boolean;
  // 2024 PHB Weapon Mastery property. Each weapon has at most one mastery.
  // Only applies when the wielder's class grants Weapon Mastery AND they
  // have mastered this specific weapon (Character.weaponMasteries).
  mastery?: WeaponMastery;
}

export type WeaponMastery =
  | 'vex' // advantage on next attack vs target this turn/next
  | 'topple' // CON save or prone on hit
  | 'push' // push target 10 ft on hit
  | 'sap' // disadvantage on target's next attack
  | 'slow' // target's speed -10 ft until your next turn
  | 'nick' // bonus-action TWF attack folded into Attack action
  | 'cleave' // hit second target in 5 ft on a hit
  | 'graze' // missed attack still deals ability-mod damage
  | 'flex'; // versatile two-handed damage one-handed if no shield

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

export interface RoomObject {
  id: string;
  name: string;
  desc: string;
  interactText: string;
  searchable?: boolean;
  searchDC?: number;
  lootIds?: string[];
  foundText?: string;
  emptyText?: string;
}

export interface Room {
  id: string;
  name: string;
  desc: string;
  canRest?: boolean;
  trap?: Trap; // static trap defined in context; can be overridden per-room
  objects?: RoomObject[];
  difficultTerrain?: GridPos[]; // squares costing 2× movement to enter
  coverPositions?: GridPos[]; // squares granting half cover (+2 AC) to occupant
  // Ambient lighting per SRD 5.2.1 p.11 "Vision and Light". Default 'bright'
  // (the room is well-lit; tactical fog-of-war is disabled). 'dim' makes the
  // whole room Lightly Obscured (Disadvantage on sight-based Perception).
  // 'dark' makes squares outside a PC's lit radius Heavily Obscured
  // (Blinded for sight), enabling true fog-of-war on the combat grid.
  lighting?: 'bright' | 'dim' | 'dark';
}

export type ConditionName =
  | 'paralyzed'
  | 'stunned'
  | 'poisoned'
  | 'prone'
  | 'frightened'
  | 'blinded'
  | 'restrained'
  | 'incapacitated'
  | 'grappled'
  | 'invisible'
  | 'exhaustion'
  | 'charmed'
  | 'unconscious'
  | 'deafened'
  | 'petrified';

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
  // HP-threshold phase transitions for boss encounters. Order does not
  // matter — engine sorts by descending hpPct internally.
  phases?: BossPhase[];
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
  // Boss phase definitions (carried over from template). Runtime phase
  // index lives on the matching CombatEntity, not here, so phase progress
  // survives state serialization without touching the seed payload.
  phases?: BossPhase[];
  // Max hp captured at seed time so phase thresholds can be re-evaluated
  // against the *original* HP after damage reduces hp below maxHp.
  maxHp?: number;
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

export type CoverLevel = 'none' | 'half' | 'three_quarters' | 'full';

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

export type NpcAttitude = 'friendly' | 'indifferent' | 'hostile';

export interface NpcShopEntry {
  itemId: string;
  price: number;
}

export interface NpcDialogueResponse {
  label: string;
  reply?: string; // NPC's follow-up text after player picks this
  consequences?: GameConsequence[]; // applied when this response is chosen
}

export interface NpcTemplate {
  id: string;
  name: string;
  attitude: NpcAttitude;
  // Stat block — used when attitude becomes hostile or player attacks
  hp: number;
  ac: number;
  damage: string;
  toHit: number;
  xp: number;
  dex?: number;
  // Social
  greeting: string;
  responses: NpcDialogueResponse[];
  persuasionDC?: number; // CHA check DC when indifferent (default 12)
  // Trade
  shop?: NpcShopEntry[];
  // Associates the NPC's shop with a faction so price modifiers can apply
  // (campaignEngine.factionShopPrice). Optional — NPCs without a faction
  // tag charge their static shop entry price.
  factionId?: string;
}

export interface PlacedNpc extends NpcTemplate {
  roomId: string;
}

// ─── Backgrounds ──────────────────────────────────────────────────────────────

export interface Background {
  id: string;
  name: string;
  desc: string;
  skillProficiencies: string[]; // 2 skill names (e.g. 'Perception', 'Stealth')
  toolProficiency?: string; // 1 tool (e.g. "Thieves' Tools")
  feature: string; // name of the narrative feature
  featureDesc: string; // one-sentence description shown in UI
}

// ─── Spell system ─────────────────────────────────────────────────────────────

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
  narrative?: string; // override text for utility spells
  concentration?: boolean; // true = breaks if caster takes damage and fails CON save
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
  // SRD 5.2.1: spell range. 'self' = no external target; 'touch' = adjacent
  // only (≤ 5 ft / 1 grid square); 'ranged' uses rangeFt for the max distance.
  // When unspecified, the engine treats the spell as untargeted/utility.
  rangeKind?: 'self' | 'touch' | 'ranged';
  rangeFt?: number;
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

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export type StructuredAction =
  | { type: 'move'; roomId: string }
  | { type: 'attack'; targetEnemyId?: string }
  | { type: 'loot' }
  | { type: 'use'; itemId: string; targetCharId?: string }
  | { type: 'sneak' }
  | { type: 'escape' }
  | { type: 'examine' }
  | { type: 'death_save' }
  | { type: 'pass' }
  | { type: 'end_turn' }
  | { type: 'short_rest' }
  | { type: 'long_rest' }
  | { type: 'talk' }
  | { type: 'talk_response'; responseIdx: number }
  | { type: 'buy'; itemId: string; price: number }
  | { type: 'attack_npc' }
  | { type: 'use_class_feature'; featureId: string; targetEnemyId?: string }
  | { type: 'apply_asi'; stat: AbilityKey }
  | {
      type: 'cast_spell';
      spellId: string;
      slotLevel: number;
      ritual?: boolean;
      targetEnemyId?: string;
      // 2024 PHB multi-target spells (Magic Missile darts, Eldritch Blast
      // beams). One entry per dart/beam; duplicates = multiple darts on the
      // same target. When omitted, falls back to focus-fire on `targetEnemyId`.
      targetEnemyIds?: string[];
    }
  | { type: 'disarm_trap' }
  | { type: 'interact_object'; objectId: string }
  | { type: 'two_weapon_attack'; targetEnemyId?: string }
  | { type: 'attune'; instanceId: string }
  | { type: 'grapple'; targetEnemyId?: string }
  | { type: 'try_escape_grapple' }
  | { type: 'stand_up' }
  | { type: 'spend_inspiration' }
  | { type: 'shove'; targetEnemyId?: string }
  | { type: 'dodge' }
  | { type: 'disengage' }
  | { type: 'grid_move'; entityId: string; to: GridPos }
  | { type: 'travel'; locationId: string }
  | { type: 'enter_district'; districtId: string }
  | { type: 'accept_quest'; questId: string }
  | { type: 'complete_quest'; questId: string }
  | { type: 'dash' }
  | { type: 'help'; targetId: string }
  | { type: 'ready'; trigger: string; action: StructuredAction }
  | { type: 'use_reaction' }
  | { type: 'select_subclass'; subclass: string }
  | { type: 'prepare_spells'; spellIds: string[] }
  | { type: 'resolve_reaction'; accept: boolean };

export interface GameChoice {
  label: string;
  action: StructuredAction;
  requiresBonusAction?: boolean;
  // Hint for the grid renderer: when this is a cast_spell choice for an AoE
  // spell, lets the frontend tint the affected cells on hover without needing
  // the spell catalog or per-shape geometry.
  aoePreview?: {
    shape: 'sphere' | 'cone' | 'cube' | 'line';
    radiusFt: number;
    targetEnemyId?: string;
    rangeKind?: 'self' | 'touch' | 'ranged';
  };
}

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
  character_class: string;
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
  // 2024 PHB Wild Shape — id of the active BeastForm while wild_shaped.
  // Cleared on dismiss_wild_shape.
  wild_shape_form?: string;
  attuned_items: string[]; // instance_ids of attuned magic items (max 3)
  concentrating_on?: { spellId: string; condition?: string } | null;
  // Extended 5e fields
  subclass?: string; // e.g. 'battle_master', 'thief', 'evoker'
  speed?: number; // movement speed in feet; defaults to 30
  feats?: string[];
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
interface PendingReactionBase {
  attackerEnemyId: string;
  targetCharId: string;
  resumeFromInitiativeIdx: number;
  resumeFromMultiattackIdx: number; // 0-indexed; how many sub-attacks already resolved
  narrativeSoFar: string;
  eligibleCharIds: string[];
}

// Shield (PHB p.275). Triggers BEFORE damage applies — accepting negates the
// hit retroactively. pendingDamage/pendingNarrative are stashed so a decline
// can apply them as if Shield was never offered.
export interface PendingShieldReaction extends PendingReactionBase {
  kind: 'shield';
  atkTotal: number; // to-hit total that triggered the [AC, AC+4] window
  targetAcAtAttack: number;
  pendingDamage: number;
  pendingNarrative: string;
}

// Hellish Rebuke (PHB p.252). Triggers AFTER damage applies — accepting deals
// 2d10 fire damage back to the attacker (DEX save for half). No state to
// stash: the damage that triggered Rebuke is already on the books, and a
// decline just lets the loop continue.
export interface PendingHellishRebukeReaction extends PendingReactionBase {
  kind: 'hellish_rebuke';
}

// Counterspell (PHB p.234). Triggers BEFORE an enemy spell resolves — the
// engine snapshots the enemy's intent (spell id + level + intended target)
// so a Counterspell accept can nullify it, and a decline lets the spell
// fire as normal during the resume.
export interface PendingCounterspellReaction extends PendingReactionBase {
  kind: 'counterspell';
  enemySpellId: string;
  enemySpellLevel: number; // base level of the enemy's spell (slot level not modeled enemy-side)
  enemySpellName: string; // pre-fetched so generateChoices doesn't need the spellTable
  // PC the enemy spell would hit if not countered. Resolved at trigger time
  // (usually nearest PC) and stored so a decline branch can apply damage
  // without re-running target selection.
  intendedTargetPcId: string;
}

export type PendingReaction =
  | PendingShieldReaction
  | PendingHellishRebukeReaction
  | PendingCounterspellReaction;

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

export const COMBAT_LOG_MAX = 30;

export type CombatEvent =
  | {
      kind: 'attack_hit';
      attackerId: string;
      attackerName: string;
      targetId: string;
      targetName: string;
      damage: number;
      damageType: string;
      isCrit: boolean;
      toHit: number;
      targetAc: number;
      round: number;
    }
  | {
      kind: 'attack_miss';
      attackerId: string;
      attackerName: string;
      targetId: string;
      targetName: string;
      toHit: number;
      targetAc: number;
      round: number;
    }
  | {
      kind: 'kill';
      attackerId: string;
      attackerName: string;
      victimId: string;
      victimName: string;
      xp: number;
      round: number;
    }
  | {
      kind: 'condition_applied';
      targetId: string;
      targetName: string;
      condition: string;
      source: string;
      round: number;
    }
  | {
      kind: 'save';
      characterId: string;
      characterName: string;
      ability: string;
      roll: number;
      dc: number;
      success: boolean;
      vs: string;
      round: number;
    }
  | {
      kind: 'phase_transition';
      bossId: string;
      bossName: string;
      phaseName: string;
      narrative: string;
      round: number;
    };

// ─── Game state (world/party container) ──────────────────────────────────────

export interface GameState {
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
}

// ─── Script engine rules ──────────────────────────────────────────────────────

export type GameConsequence =
  | { type: 'add_narrative'; text: string }
  | { type: 'set_flag'; key: string; value: boolean | string | number }
  | { type: 'give_item'; itemId: string; characterId?: string }
  | { type: 'modify_hp'; amount: number; characterId?: string }
  | { type: 'unlock_room'; roomId: string }
  | { type: 'spawn_enemy'; roomId: string; enemyId: string }
  | { type: 'set_escape' }
  | { type: 'advance_quest'; questId: string; stepId: string }
  | { type: 'set_faction_rep'; factionId: string; delta: number }
  | { type: 'travel_to'; locationId: string }
  | { type: 'give_gold'; amount: number }
  | { type: 'set_npc_attitude'; npcId: string; attitude: NpcAttitude };

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

export interface GridPos {
  x: number;
  y: number;
}

export interface CombatEntity {
  id: string; // character.id for PCs, enemy instance id for enemies, owner.id + ':companion' for animal companions
  isEnemy: boolean;
  pos: GridPos;
  hp: number;
  maxHp: number;
  conditions: string[];
  condition_durations: Record<string, number>;
  // Beastmaster animal companion (PHB p.93) — a CR ¼ beast tied to a Ranger PC.
  // Acts on the Ranger's bonus action; targetable by enemies separately.
  isCompanion?: boolean;
  companionOwnerId?: string; // character.id of the Ranger this companion belongs to
  companionName?: string; // display name (e.g. 'Wolf')
  ac?: number; // companion AC (PCs use character.ac, enemies use Enemy.ac)
  toHit?: number; // companion attack bonus
  damage?: string; // companion damage dice expression (e.g. '2d4+2')
  // SRD 5.2.1 — when grappled, records the id of the grappler so we can end the
  // condition if the grappler dies/is incapacitated, and so the contested escape
  // check has a target's mod to roll against.
  grappled_by?: string;
  // Boss-phase tracking. Counts how many phases the boss has entered. The
  // engine re-applies effects 0..phase_index-1 on every takeAction so the
  // seed's runtime Enemy fields reflect the current phase. A 0 (or undefined)
  // means the boss is still in its base statline.
  phase_index?: number;
}

// ─── Quest system ─────────────────────────────────────────────────────────────

export type QuestStatus = 'available' | 'active' | 'completed' | 'failed';

export interface QuestStep {
  id: string;
  desc: string;
  condition: object; // json-rules-engine TopLevelCondition against CampaignFacts
}

export interface Quest {
  id: string;
  title: string;
  desc: string;
  giverNpcId?: string;
  steps: QuestStep[];
  rewards: GameConsequence[];
  factionId?: string;
  repGain?: number;
}

export interface QuestProgress {
  questId: string;
  status: QuestStatus;
  completedSteps: string[];
}

// ─── Faction system ───────────────────────────────────────────────────────────

export interface FactionThresholds {
  hostile: number;
  unfriendly: number;
  neutral: number;
  friendly: number;
  exalted: number;
}

export interface Faction {
  id: string;
  name: string;
  thresholds: FactionThresholds;
  shopPriceModifiers: Record<string, number>; // attitude tier → price multiplier
}

// ─── Campaign state (persists across sessions) ────────────────────────────────

export interface CampaignState {
  campaign_id: string;
  user_id: string;
  world_day: number;
  current_location: string;
  flags: Record<string, boolean | string | number>;
  quests: QuestProgress[];
  faction_rep: Record<string, number>;
  npc_attitudes: Record<string, NpcAttitude>;
}

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

export type LocationType = 'town' | 'dungeon' | 'wilderness';

export interface District {
  id: string;
  name: string;
  desc: string;
  roomId: string;
}

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
}
