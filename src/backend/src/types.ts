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
  CampaignTheme,
  CombatEntity,
  CombatEvent,
  ConditionName,
  EquipSlot,
  Faction,
  Feat,
  FloorType,
  GameChoice,
  GameConsequence,
  GridPos,
  LootItem,
  NpcAttitude,
  PendingReaction,
  PlacedLoot,
  PlacedNpc,
  Quest,
  QuestProgress,
  RoomObject,
  StructuredAction,
  TerrainArtMap,
  TerrainCell,
} from './shared-types.js';

// `LootItem` is re-exported from ./shared-types (see src/shared/types.ts).

// `WeaponMastery` is re-exported from ./shared-types (see src/shared/types.ts).

// ─── Seed (procedurally generated world state) ────────────────────────────────

export interface Trap {
  id: string;
  name: string;
  dc: number; // Perception DC to detect; Dexterity DC to disarm
  damage: string; // dice expr on trigger (e.g. '2d6')
  damageType: string;
  condition?: ConditionName; // optional condition applied on trigger
  conditionDuration?: number; // rounds; undefined = until cleared
  // Narrative hooks — each a VARIANT POOL (engine picks one via pickHookText;
  // multi-paragraph via newlines). Persisted as campaign_narratives rows
  // (owner_kind 'roomTrap'); {name}/{dmg} substituted after the pick.
  desc: string | string[]; // flavour shown when detected
  triggerNarrative: string | string[]; // text when the trap fires
  detectNarrative: string | string[]; // text when the party spots it
  disarmSuccess: string | string[]; // text on successful disarm
  disarmFail: string | string[]; // text on failed disarm (trap fires)
}

// `RoomObject` is re-exported from ./shared-types (see src/shared/types.ts).

// 3-level grid map model (regional → town → local). A `RoomExit` is a transition
// cell on a local room grid: stepping onto `pos` moves the party to `toRoomId`,
// arriving at that room's `entrancePos`; multiple exits make a room branch. An
// `ascends` exit leaves the site back up to the town / region. (Replaces the
// abstract `connections` room-adjacency graph.)
export interface RoomExit {
  pos: GridPos;
  toRoomId?: string; // omitted when `ascends`
  entrancePos?: GridPos; // arrival cell in `toRoomId` (defaults to that room's entryPos)
  label?: string;
  ascends?: boolean; // exit the site → return to the town grid / regional grid
}

export interface Room extends LevelNarrationHooks {
  id: string;
  name: string;
  desc: string;
  // Local rooms are self-contained grids, LOCKED to the SRD tactical scale
  // (5 ft per square — gridEngine.SQUARE_SIZE; combat math assumes it).
  // `entryPos` is where the party marker arrives when entering this room
  // from a site/venue (or an exit with no explicit entrancePos); defaults
  // to the grid centre. `exits` are the per-cell room connections (see RoomExit).
  gridWidth?: number;
  gridHeight?: number;
  entryPos?: GridPos;
  exits?: RoomExit[];
  canRest?: boolean;
  trap?: Trap; // static trap defined in context; can be overridden per-room
  objects?: RoomObject[];
  difficultTerrain?: GridPos[]; // squares costing 2× movement to enter
  // SRD terrain modes — squares that require a matching movement
  // mode to traverse at full speed:
  //   `climbTerrain` (walls / cliffs / ladders): costs 2× movement to
  //     enter without a climb speed; full cost with `climb_speed_ft > 0`.
  //   `swimTerrain` (water / submerged): same shape with `swim_speed_ft`.
  // RAW says these costs don't stack with difficult terrain — a cell
  // counted as both still only costs 2×. gridMove implements the
  // max-not-stack rule.
  climbTerrain?: GridPos[];
  swimTerrain?: GridPos[];
  coverPositions?: GridPos[]; // squares granting half cover (+2 AC) to occupant
  // Static obstacles (columns, walls, debris) — fully block movement and
  // count as cover for ranged attacks behind them. Seeded by procgen for
  // combat rooms, can also be authored in roomPool entries.
  obstacles?: GridPos[];
  // PURELY COSMETIC. A visual paint layer for the combat grid (grass / stone /
  // water / etc.) so a room reads as a place, not a bare grid. It carries NO
  // rules: movement cost, cover, swim/climb, and passability stay entirely on
  // the mechanical arrays above (difficultTerrain / climbTerrain / swimTerrain /
  // coverPositions / obstacles). Nothing in the engine reads `terrain`.
  terrain?: TerrainCell[];
  // Ambient lighting per SRD 5.2.1 "Vision and Light". Default 'bright'
  // (the room is well-lit; tactical fog-of-war is disabled). 'dim' makes the
  // whole room Lightly Obscured (Disadvantage on sight-based Perception).
  // 'dark' makes squares outside a PC's lit radius Heavily Obscured
  // (Blinded for sight), enabling true fog-of-war on the combat grid.
  // 'sunlight' is Bright Light that also counts as *sunlight* — combat
  // visibility behaves like 'bright', but creatures with Sunlight
  // Sensitivity attack at Disadvantage there (an outdoor / daylit room).
  lighting?: 'bright' | 'dim' | 'dark' | 'sunlight';
  // PURELY COSMETIC ground texture for the local-room exploration floor — a
  // seamless top-down tile (grass / dirt / cobblestone / sand) painted under
  // every walkable cell so a room reads as a place. No mechanics; defaults to
  // 'cobblestone' (worked-stone interiors) when unset. Only the local map level
  // renders it.
  floor?: FloorType;
}

// `FloorType` is re-exported from ./shared-types (see src/shared/types.ts) —
// the terrain-art skin remaps + tints floors campaign-wide.

// `ConditionName` is re-exported from ./shared-types (see src/shared/types.ts).

export interface OnHitEffect {
  condition: ConditionName;
  // Save to avoid the condition. Omit BOTH `ability` and `dc` for an automatic
  // on-hit application that allows no save (e.g. the Griffon's Rend grapple,
  // which lands on any hit). When present, the struck PC rolls this save to
  // negate the condition.
  ability?: AbilityKey;
  dc?: number;
  // SRD monster grapples specify a fixed escape DC rather than a contested
  // check. With `condition: 'grappled'`, this DC is stamped onto the struck
  // PC's grid entity as `grapple_escape_dc`; `try_escape_grapple` then rolls a
  // STR(Athletics)/DEX(Acrobatics) check against it. (SRD: Griffon — escape
  // DC 14 from both front claws.)
  escapeDc?: number;
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

// Legendary actions (SRD). Fire AFTER another creature's turn ends —
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

// Lair actions (SRD). Fire on initiative count 20 (round-start in
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
  // Optional rider condition applied to a PC who fails the save (e.g. a lair
  // that Frightens). Stamped with `conditionDuration` rounds (default 1).
  condition?: ConditionName;
  conditionDuration?: number;
  narrative: string; // pre-effect description (e.g. "The walls shake...")
};

/**
 * SRD monster aura / emanation (Ghast Stench, etc.) — a recurring effect on
 * every creature that starts its turn within `radiusFt` of the source. On a
 * failed save (or with no save), the creature takes `damage` and/or gains
 * `condition`. Applied to PCs at their turn start (see `applyMonsterAuras`).
 */
export interface MonsterAura {
  radiusFt: number;
  // Optional saving throw; on a success the creature is unaffected this turn.
  save?: { ability: AbilityKey; dc: number };
  // Condition inflicted on a failed save (e.g. Stench → poisoned).
  condition?: ConditionName;
  conditionDuration?: number; // rounds; default 1
  // Optional recurring damage (dice expr) for damaging auras.
  damage?: string;
  damageType?: string;
  // Display label for the narrative (e.g. 'Stench').
  name?: string;
}

// SRD recharge AoE attack (a dragon's Fire Breath, the Giant Ape's Boulder
// Toss). On the creature's turn, when charged, it REPLACES the normal
// attack/multiattack: every living PC makes `savingThrow` vs `saveDC`, taking
// `dice` `damageType` damage (half on a success). It's then spent until it
// recharges — at the start of each of the creature's turns, if spent, the
// engine rolls a d6 and recharges on a roll ≥ `rechargeMin` (default 5 →
// "Recharge 5–6"; set 6 for "Recharge 6"). Charge is tracked per-entity via
// `CombatEntity.breath_charged`. The cone/line geometry is abstracted to "all
// PCs in the room" (the lair-action AoE convention); precise positioning + any
// rider condition (e.g. Boulder Toss's Prone) are deferred.
export interface BreathWeapon {
  name: string;
  dice: string; // damage dice expr, e.g. '16d6'
  damageType: string;
  savingThrow: AbilityKey;
  saveDC: number;
  rechargeMin?: number; // recharge on a d6 ≥ this (default 5)
  // Optional rider condition applied to a PC who fails the save (a breath that
  // also Blinds / Poisons). Stamped with `conditionDuration` rounds (default 1).
  condition?: ConditionName;
  conditionDuration?: number;
}

export interface EnemyTemplate {
  name: string;
  cr: number;
  hp: number;
  ac: number;
  damage: string;
  toHit: number;
  xp: number;
  // SRD creature type, when it matters mechanically (e.g. Holy Water damages
  // only Fiends/Undead; future Turn Undead, etc.). Omitted ⇒ unspecified.
  // Carried through place() + procgen onto the Enemy.
  creatureType?: 'undead' | 'fiend' | 'beast' | 'humanoid' | 'construct' | 'dragon';
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
  // SRD Pack Tactics — Advantage on attack rolls when an ally is within 5 ft of
  // the target. Read in `computeEnemyAttack` (gated by Rogue Elusive like other
  // advantage sources).
  packTactics?: boolean;
  // SRD Bloodied Frenzy / "while Bloodied" traits — Advantage on attack rolls
  // while this creature is at ≤ half its max HP. (The save-advantage half is a
  // follow-up.)
  bloodiedFrenzy?: boolean;
  // A secondary damage rider on each hit (Ghast's bite +2d8 Necrotic, Wight's
  // sword +1d8 Necrotic). Rolled and added after the primary hit's B/P/S-
  // specific reductions; halved only if the target resists `bonusDamageType`.
  bonusDamage?: string; // dice expr, e.g. '2d8'
  bonusDamageType?: string;
  // SRD Undead Fortitude (Zombie) — when damage would drop this creature to
  // 0 HP, it makes a CON save (DC 5 + the damage taken) and drops to 1 HP on a
  // success, UNLESS the damage is Radiant or from a Critical Hit. Routed
  // through the central `enemyHpAfterDamage` floor.
  undeadFortitude?: boolean;
  // SRD Life Drain (Specter, Wight) — on a hit, the Necrotic damage dealt also
  // reduces the target's Hit Point maximum by that amount (Specter: the whole
  // attack; Wight: the necrotic `bonusDamage` rider). Read in
  // `computeEnemyAttack`.
  lifeDrain?: boolean;
  // SRD Regeneration (Troll, Vampire Spawn, Hydra) — the creature regains
  // this many HP at the start of each of its turns, unless it took a
  // `regenBlockedBy` damage type since its last turn (the central
  // `enemyHpAfterDamage` floor flags the block; the enemy turn loop
  // consumes it). A creature at 0 HP stays down — RAW "dies only if it
  // starts its turn at 0 and doesn't regenerate" is simplified to kills
  // being final.
  regeneration?: number;
  // Damage types that suppress the next regeneration tick. Defaults to
  // ['acid', 'fire'] (the Troll's); Vampire Spawn uses ['radiant'].
  regenBlockedBy?: string[];
  // SRD Parry (Bandit Captain reaction) — when hit by a melee attack roll while
  // holding a weapon, the creature adds 2 to its AC against that attack,
  // possibly turning the hit into a miss. Once per round; the engine spends it
  // only when the +2 would actually flip a hit to a miss (a Nat 20 can't be
  // parried). Read in `resolveOneAttack`; the reaction refreshes on round wrap.
  parry?: boolean;
  // The AC bonus Parry grants — equals the creature's proficiency bonus in the
  // SRD (Bandit Captain +2, Gladiator +3). Defaults to 2 when `parry` is set.
  parryBonus?: number;
  // SRD Gnoll Rampage (1/Day) — immediately after one of the creature's swings
  // deals damage to an already-Bloodied target (its HP was ≤ half its max BEFORE
  // the hit), it moves up to half its Speed and makes one extra attack. Once per
  // encounter; tracked on the entity as `rampage_used`. Handled in
  // `runEnemyMultiattackLoop`.
  rampage?: boolean;
  // SRD aura / emanation (Ghast Stench) — recurring effect on creatures that
  // start their turn within range. Applied to PCs in `applyMonsterAuras`.
  aura?: MonsterAura;
  // SRD recharge AoE (Fire Breath, Boulder Toss) — fires as the whole turn when
  // charged; see `BreathWeapon`.
  breathWeapon?: BreathWeapon;
  // Spell-casting (see Enemy.spells for runtime behaviour).
  spells?: string[];
  castChance?: number;
  spellSaveDC?: number;
  spellAttackBonus?: number;
  // Tactical movement (SRD 5.2.1). Engine-level defaults: 5 ft melee
  // reach, 30 ft walking speed. Override for reach weapons (10 ft) or
  // larger/faster monsters.
  attackReachFt?: number;
  speedFt?: number;
  // SRD 5.2.1 Vision & Light — darkvision range in feet. Drives combat
  // visibility in a Heavily Obscured (dark) room: a creature that can't see
  // (darkvision 0 and no blindsight) attacks at Disadvantage and is attacked at
  // Advantage. **Undefined defaults to 60** (the SRD norm for dungeon monsters);
  // set 0 explicitly for sightless-in-dark creatures (most Humanoids, a few
  // beasts/giants). Read in `computeEnemyAttack` / `computeToHitContext`.
  darkvision_ft?: number;
  // SRD Sunlight Sensitivity (Kobold, Specter, Wight, Wraith) — while in
  // sunlight the creature has Disadvantage on attack rolls (and sight-based
  // Perception). "In sunlight" = a 'sunlight' room or within a Daylight
  // emanation's bright radius. Read in `computeEnemyAttack`.
  sunlightSensitivity?: boolean;
  // HP-threshold phase transitions for boss encounters. Order does not
  // matter — engine sorts by descending hpPct internally.
  phases?: BossPhase[];
  // Boss-only systems (SRD). Bosses with `legendary_actions` get
  // `legendary_pool` points per round to spend on post-PC-turn actions;
  // bosses with `lair_actions` fire one environment effect on round wrap.
  legendary_actions?: LegendaryAction[];
  legendary_pool?: number; // points per round; default 3 if legendary_actions set
  lair_actions?: LairAction[];
  // Loot dropped to the killer on death: `drops` are item ids (resolved from
  // the campaign's lootTable, added to the slayer's inventory) and `goldDrop`
  // is coins added to their purse. Both optional; enemies with neither drop
  // nothing (XP only, as before).
  drops?: string[];
  goldDrop?: number;
}

export interface Enemy {
  id: string; // stable per-instance id (distinct from roomId; multiple enemies share a room)
  name: string;
  // Treat `name` as a proper noun in prose (no definite article): "Captain
  // Riese reels", not "the Captain Riese reels". Omitted ⇒ inferred from the
  // name's shape (see narrative/enemyName.ts). Set explicitly for single-word
  // proper names a heuristic can't catch (e.g. "Dusk").
  proper_noun?: boolean;
  // SRD creature type (see EnemyTemplate.creatureType) — drives Fiend/Undead
  // interactions like Holy Water. Carried from the template via place()/procgen.
  creatureType?: 'undead' | 'fiend' | 'beast' | 'humanoid' | 'construct' | 'dragon';
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
  // SRD Pack Tactics / Bloodied Frenzy / bonus on-hit damage. Mirror the
  // EnemyTemplate fields; read in `computeEnemyAttack`. (See EnemyTemplate.)
  packTactics?: boolean;
  bloodiedFrenzy?: boolean;
  bonusDamage?: string;
  bonusDamageType?: string;
  undeadFortitude?: boolean;
  lifeDrain?: boolean;
  // SRD Regeneration — see EnemyTemplate.regeneration. `regen_blocked` is
  // RUNTIME state set in-place by `enemyHpAfterDamage` when a blocking
  // damage type lands (the same in-place seed-enemy mutation pattern boss
  // phases use), consumed + cleared at this creature's next turn start.
  regeneration?: number;
  regenBlockedBy?: string[];
  regen_blocked?: boolean;
  // SRD Parry reaction — see EnemyTemplate.parry. Mirrored here + carried
  // through procgen; read in `resolveOneAttack`.
  parry?: boolean;
  parryBonus?: number;
  // SRD Gnoll Rampage (1/Day) — see EnemyTemplate.rampage. Read in
  // `runEnemyMultiattackLoop`.
  rampage?: boolean;
  // SRD recharge AoE (Fire Breath, Boulder Toss) — see EnemyTemplate.breathWeapon.
  // Mirrored here + carried through procgen; fired in `runEnemyTurns`.
  breathWeapon?: BreathWeapon;
  // SRD darkvision range (ft) — see EnemyTemplate.darkvision_ft. Undefined
  // defaults to 60 in the combat-visibility check; carried through procgen.
  darkvision_ft?: number;
  // SRD Sunlight Sensitivity — see EnemyTemplate.sunlightSensitivity. Mirrored
  // here + carried through procgen; read in `computeEnemyAttack`.
  sunlightSensitivity?: boolean;
  aura?: MonsterAura;
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
  // Tactical movement (SRD 5.2.1). Mirrors EnemyTemplate fields and is
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
  // Boss-only systems (SRD). Mirrors EnemyTemplate fields and is
  // carried through procgen. `legendary_action_points` is the current
  // pool; refreshes on this enemy's own turn start.
  legendary_actions?: LegendaryAction[];
  legendary_pool?: number;
  legendary_action_points?: number;
  lair_actions?: LairAction[];
  // Loot dropped to the killer on death (item ids + gold). Mirrors
  // EnemyTemplate; carried through procgen / seed placement.
  drops?: string[];
  goldDrop?: number;
}

export interface Seed {
  context_id: string;
  world_name: string;
  ship_name: string;
  intro: string;
  rooms: Room[];
  enemies: Record<string, Enemy[]>;
  // Loot placed in each room, keyed by room id. Each room holds a list of
  // positioned items (PlacedLoot). Legacy seed snapshots may carry a single
  // LootItem here instead of an array — read via `placedLootIn()`, which
  // normalizes both shapes.
  loot: Record<string, PlacedLoot[]>;
  npcs: Record<string, PlacedNpc>;
  seed_id: string;
  // 3-level grid map definitions (copied from the campaign at seed time so the
  // frontend — which only receives the seed, not the campaign — can resolve the
  // active grid client-side). Absent for roguelike / non-map campaigns.
  regions?: Region[];
  towns?: Town[];
  // Campaign terrain-art overrides (Context.terrainArt), snapshotted at seed
  // time like the maps above — the FE skins its tiles from this.
  terrain_art?: TerrainArtMap;
  // Campaign visual theme (partial; FE merges over the base theme).
  theme?: CampaignTheme;
}

// ─── Game state ───────────────────────────────────────────────────────────────

// `CoverLevel` is re-exported from ./shared-types (see src/shared/types.ts).

export interface TurnActions {
  action_used: boolean;
  bonus_action_used: boolean;
  reaction_used: boolean;
  free_interaction_used: boolean;
  // SRD 5.2.1 Haste — "It gains an additional action on each of its
  // turns. That action can be used only to take the Attack (one weapon
  // attack only), Dash, Disengage, Hide, or Utilize action." Pansori
  // wires this via the `haste_extra_action` wrapper handler. Set true
  // once the extra action is consumed; auto-clears at turn start via
  // FRESH_TURN reset. RAW one-attack cap on the Attack variant is
  // deferred (Extra Attack still fires on the wrapped attack today).
  haste_extra_action_used?: boolean;
  dodging?: boolean; // Dodge action: enemy attacks have disadvantage until next turn
  disengaged?: boolean; // Disengage action: no opportunity attacks this turn
  // Barbarian Reckless Attack (SRD): advantage on STR melee attacks this turn,
  // but enemies have advantage on attacks vs the Barbarian until their next turn.
  reckless?: boolean;
  // SRD 5.2.1 Quickened Spell metamagic: you can't use Quickened if a
  // level 1+ spell was already cast this turn, AND you can't cast a level 1+
  // spell on the same turn that you used Quickened.
  leveled_spell_cast?: boolean; // set after any non-cantrip spell resolves
  quickened_used?: boolean; // set when Quickened Spell metamagic is consumed
  // Heroic Inspiration pending — when set, the next attack roll gets
  // advantage and both this flag + char.inspiration are cleared (one-shot).
  inspiration_pending?: boolean;
  // Lucky feat (SRD) — when set, the next PC attack roll gets
  // advantage. Decoupled from inspiration_pending so a PC can stack
  // sources or use Lucky without burning their Heroic Inspiration.
  // Set by `use_luck`, cleared on consumption (one-shot).
  luck_pending?: boolean;
  // Rogue Steady Aim (L3) — bonus action that grants advantage on the
  // next attack roll this turn. Set by the `steady_aim` class feature
  // (which also zeroes remaining movement), cleared on the next attack
  // (one-shot) or at end of turn via FRESH_TURN.
  steady_aim_pending?: boolean;
  // Barbarian Brutal Strike (L9) — pre-committed rider for the next STR
  // melee attack while Reckless: forgoes the Reckless advantage and, on a
  // hit, deals +1d10 and applies the chosen effect. Consumed on the next
  // qualifying attack; cleared at end of turn via FRESH_TURN otherwise.
  brutal_strike_pending?: 'forceful' | 'hamstring';
  // Savage Attacker feat (SRD origin) — once per turn, on a
  // weapon-damage hit, reroll damage and take the higher. This flag
  // marks the reroll as already spent this turn so multi-hit turns
  // (Extra Attack, two-weapon) only benefit once.
  savage_attacker_used?: boolean;
  // SRD Boon of Combat Prowess (epic) — Peerless Aim turns a miss into a hit
  // once per turn. This flag marks it spent until the start of the next turn
  // (reset via FRESH_TURN like the other per-turn riders).
  peerless_aim_used?: boolean;
  // Sneak Attack (Rogue) — once per turn. Without this gate, a
  // multiclass Rogue with Extra Attack (Fighter/Ranger/Paladin/
  // Barbarian/Monk multiclass) or any Rogue using Two-Weapon
  // Fighting could trigger SA on every hit. RAW: only on the
  // first qualifying hit. Cleared by FRESH_TURN at turn start.
  sneak_attack_used?: boolean;
  // SRD Rogue Cunning Strike (L5+) — when set, the next Sneak Attack
  // spends 1 die for the chosen effect (trip, poison, withdraw, disarm)
  // and one SA die is removed from the damage roll. Cleared after applied.
  cunning_strike_pending?:
    | 'trip'
    | 'poison'
    | 'withdraw'
    | 'disarm'
    | 'daze'
    | 'knock_out'
    | 'obscure'
    | 'stealth_attack';
  movement_budget_remaining?: number; // feet remaining this turn; initialized to speed at turn start
  readied_action?: {
    trigger: string;
    action: StructuredAction;
  };
  // SRD Monk — Patient Defense and Step of the Wind can each be used
  // once per turn without spending Discipline Points; spending 1 DP grants
  // both effects. This flag marks the free monk bonus action as consumed
  // this turn.
  monk_free_used?: boolean;
  // SRD Monk L5 — Stunning Strike is once per turn (was per-hit in
  // 2014). Set when the monk has already taken their stun shot this turn.
  monk_stunning_strike_used?: boolean;
  // SRD Open Hand Monk L11 — Fleet Step grants a free Step of the Wind after
  // another bonus action; this marks that extra use as spent this turn.
  fleet_step_used?: boolean;
  // SRD Fiend Warlock L14 — Hurl Through Hell is usable once per turn on a hit;
  // this marks it spent for the current turn.
  hurl_through_hell_used?: boolean;
  // SRD Fighter L9 — Tactical Master. When attacking with any weapon
  // whose mastery you've trained, the Fighter may swap in Push, Sap, or
  // Slow for that attack. Cleared when the attack resolves.
  tactical_master_mastery?: 'push' | 'sap' | 'slow';
  // SRD Fighter L17 — Action Surge can be used twice per rest, but
  // still only ONCE per turn. This flag marks the per-turn use; the
  // per-rest cap is tracked on class_resource_uses.action_surge.
  action_surge_used?: boolean;
  // SRD Ranger Superior Hunter's Prey (L11) — once per turn, when you deal
  // Hunter's Mark damage to the marked target you also deal that extra damage
  // to a second creature within 30 ft. This marks the per-turn use.
  superior_hunters_prey_used?: boolean;
  // SRD Sorcerer Arcane Apotheosis (L20) — one Metamagic option per turn is free
  // while Innate Sorcery is active. Marks that the free use is spent this turn.
  metamagic_free_used?: boolean;
  // SRD Cleric Divine Strike (Blessed Strikes) — the extra radiant/necrotic
  // damage applies once per turn. Marks that this turn's strike is spent.
  divine_strike_used?: boolean;
  // SRD Ranger Horde Breaker (Hunter's Prey option) — once per turn, an extra
  // weapon attack vs a different creature within 5 ft of the original target.
  // This marks the per-turn use.
  horde_breaker_used?: boolean;
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
  // SRD Heat Metal — the damage is dealt in full regardless of the save; only
  // the rider `condition` is gated by it. When true, `runSaveSpell` applies the
  // full rolled damage on a success too (overriding `saveEffect`).
  damageIgnoresSave?: boolean;
  attackRoll?: boolean; // true = uses spell attack roll vs enemy AC
  heal?: string; // dice expr for healing
  condition?: ConditionName;
  // A SECOND condition co-applied with `condition` on the same failed save, no
  // separate roll (SRD Tasha's Hideous Laughter: Prone + Incapacitated). Shares
  // the spell's duration / concentration; breakConcentration clears both.
  conditionAlso?: ConditionName;
  // Player-chosen condition for a spell that offers a choice (SRD
  // Blindness/Deafness: Blinded OR Deafened). When the cast supplies a
  // `conditionChoice` from this list, it overrides `condition`.
  conditionChoices?: ConditionName[];
  conditionDuration?: number; // rounds; undefined = permanent until cleared
  // SRD "save ends" conditions (Slow's slowed, Power Word Stun's stunned): the
  // afflicted creature repeats the save (`savingThrow`) at the end of each of
  // its turns, ending the condition on a success. When set, the cast paths stamp
  // `CombatEntity.save_ends[condition] = { ability: savingThrow, dc }` onto the
  // enemy and the enemy turn loop runs the recurring save. Independent of
  // `conditionDuration` (a save-ends condition has no fixed timer) and of
  // concentration (which, when present, also clears the condition on break).
  conditionSaveEnds?: boolean;
  // SRD recurring "save-ends" damage (Phantasmal Killer 4d10, Phantasmal Force
  // 2d8): while the `conditionSaveEnds` condition persists, the target takes
  // this damage again on each FAILED end-of-turn save (the enemy turn loop ticks
  // it). Stamped into `CombatEntity.save_ends[condition]` as recurDice/recurType
  // at cast. Independent of the spell's initial `damage` — Phantasmal Force deals
  // no damage on the initial save, only the recurring tick.
  recurringSaveDamage?: { dice: string; damageType: string };
  // SRD per-attack weapon riders (Divine Favor, Searing/Shining/Ensnaring
  // Strike). A self-cast buff that augments the caster's weapon hits:
  //   - `persistent: true` (Divine Favor) → every weapon hit for the duration
  //     adds `dice` damage of `damageType` (set on `Character.weapon_rider`).
  //   - otherwise (the smites) → arms the NEXT melee-weapon hit
  //     (`Character.pending_smite`): adds `dice`/`damageType` damage (optional)
  //     plus an on-hit effect — `appliesFaerieFire` (Shining Smite: attacks vs
  //     the target gain Advantage) or `appliesCondition` + `conditionSave`
  //     (Ensnaring Strike: STR save or Restrained, save-ends).
  // The buff cast path reads this; concentration governs the duration.
  weaponRider?: {
    dice?: string;
    damageType?: string;
    persistent?: boolean;
    appliesFaerieFire?: boolean;
    appliesCondition?: ConditionName;
    conditionSave?: AbilityKey;
  };
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
  // Dual-damage spells (Flame Strike = fire + radiant, Ice Storm = bludgeoning
  // + cold). The second component is rolled and saved-for-half exactly like the
  // primary, with resistance applied per its own type. Currently honored by the
  // AoE save path (every SRD dual-damage spell is an AoE). `upcastBonus2` scales
  // it on a higher slot (Flame Strike's radiant +1d6/level); omit when only the
  // primary scales (Ice Storm's cold doesn't).
  damage2?: string;
  damageType2?: string;
  upcastBonus2?: string;
  blastRadius?: number; // AOE radius in feet; undefined = single target
  // SRD 5.2.1 — Areas of Effect. Default is 'sphere' (radius from a point).
  //   sphere: blastRadius = radius
  //   cone:   blastRadius = length of the cone, originating from caster
  //   cube:   blastRadius = side length of cube emanating from caster
  //   line:   blastRadius = length (5 ft wide), from caster outward
  aoeShape?: 'sphere' | 'cone' | 'cube' | 'line';
  // SRD Ice Knife — an attack-roll spell that ALSO bursts in a small sphere
  // centered on the target, hit or miss. After the primary spell attack
  // resolves, this secondary save-for-half/negates AoE is applied to every
  // hostile within `blastRadius` of the target (reusing the AoE path). Only
  // meaningful alongside `attackRoll`.
  secondaryAoe?: {
    damage: string;
    damageType: string;
    savingThrow: AbilityKey;
    saveEffect: 'half' | 'negates';
    blastRadius: number;
    upcastBonus?: string; // extra dice per slot level above the spell's base level
  };
  // SRD Enlarge/Reduce — a concentration buff/debuff whose effect is chosen by
  // target: a party member (or self) is Enlarged (+1d4 weapon damage), an enemy
  // is Reduced (-1d4 weapon damage). Dispatched by a dedicated branch.
  enlargeReduce?: boolean;
  // RE-4 — persistent damage zone (Cloud of Daggers, Moonbeam, …). On cast the
  // spell stamps a `SpellZone` onto `GameState.spell_zones` (footprint sized by
  // `blastRadius`, centered on the target), ticks once immediately, then deals
  // `damage` (save-for-half if `savingThrow` is set) to hostiles standing in it
  // on each round wrap, until the caster's concentration ends.
  persistentZone?: boolean;
  // SRD non-concentration zone (Guardian of Faith) — the persistent zone
  // vanishes after dealing this much total damage. Stamped onto
  // `SpellZone.damageCap`; only meaningful when the zone isn't concentration-
  // bound. The zone's round budget comes from `durationRounds` (→
  // `SpellZone.rounds_left`) and combat-end clears any leftover.
  zoneDamageCap?: number;
  // SRD wall/terrain spells — raise a transient `SpellWall` (a barrier of grid
  // cells) anchored on the target, perpendicular to the caster→target approach.
  // `blocksMovement` walls (Force / Stone) halt pathing; `blocksLineOfSight`
  // walls (Fire / Stone / Ice / Thorns) feed the LoS obstacle set. A wall spell
  // that also carries `damage` + `savingThrow` deals its formation damage as a
  // line AoE first (Wall of Fire / Ice / Thorns). Concentration-bound; removed
  // by `breakConcentration`. Routed through `runWallSpell`.
  wall?: { blocksMovement: boolean; blocksLineOfSight: boolean };
  // RE-4 — a placed zone the caster can reposition (Flaming Sphere rolls 30 ft
  // as a Bonus Action; Moonbeam / Call Lightning re-aim as a Magic action).
  // `zoneMoveFt` is the max reposition distance; `zoneMoveCost` is the action
  // economy it costs. Omitted ⇒ the zone is stationary (Spike Growth).
  zoneMoveFt?: number;
  zoneMoveCost?: 'action' | 'bonus_action';
  // RE-4 — recurring spell attack (Spiritual Weapon, Vampiric Touch): on cast,
  // make a spell attack and set up `Character.recurring_attack` so the caster
  // can re-issue it each turn (cost = `recurringAttackCost`).
  // `recurringAddSpellMod` adds the spellcasting modifier to the damage
  // (Spiritual Weapon); `recurringHealFraction` heals the caster that fraction
  // of the damage dealt (Vampiric Touch).
  recurringAttack?: boolean;
  recurringAttackCost?: 'action' | 'bonus_action';
  recurringAddSpellMod?: boolean;
  recurringHealFraction?: number;
  // RE-4 — apply `condition` to EVERY hostile in the AoE that fails the save
  // (not just the primary target). Opt-in so existing AoE-condition spells
  // (Hypnotic Pattern, Web) keep their primary-target-only behavior until
  // migrated. Confusion uses this for its 10-ft `confused` sphere; the
  // enemy turn loop then runs Confusion's 1d10 behavior table per creature.
  aoeCondition?: boolean;
  // RE-4 — the target rolls its save with Advantage (Dominate Beast/Person/
  // Monster: "Advantage on the save if you or your allies are fighting it" —
  // true in combat, where pansori spells are cast). Threaded into the
  // single-target save roll. Cancels with Heightened-Spell disadvantage.
  saveAdvantage?: boolean;
  // RE-4 — forced displacement. On a failed save, each affected creature in the
  // AoE is pushed this many feet directly away from the caster (Thunderwave 10,
  // Gust of Wind 15), stopping at grid edges / blockers. Resolved after damage.
  pushFt?: number;
  ritualCasting?: boolean; // castable as ritual (no slot cost, only out of combat)
  verbal?: boolean; // has verbal component (blocked when deafened)
  // SRD Slow — "When the creature attempts to cast a spell with a
  // Somatic component, roll a d20. On an 11 or higher, the spell
  // functions normally; otherwise, the spell fails and the action,
  // bonus action, or reaction used to cast the spell is wasted."
  // Defaults to `true` if unspecified — virtually every SRD spell
  // has S (only Power Word Heal / Power Word Kill / a handful of
  // V-only specials lack it). Mark `somatic: false` on the
  // exceptions. The precast somatic-fail gate reads this only when
  // the caster has the 'slowed' condition.
  somatic?: boolean;
  // SRD spell-list tags. A spell can belong to multiple lists
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
  // Buff-spell target type. Defaults to 'enemy' (existing behavior — the
  // spell needs a living enemy in range). 'self' / 'ally' / 'self_or_ally'
  // route to the buff-spell branch in castSpell that targets the caster
  // or a chosen party member, applies any condition + temp HP + max HP
  // bonus + concentration without an enemy gate. Used for Greater
  // Invisibility, Heroism, Aid, etc.
  targetType?: 'enemy' | 'self' | 'ally' | 'self_or_ally';
  // Buff-spell payloads. Numeric where possible (no roll needed at cast
  // time for most buffs). Dice-expression form would land if a future buff
  // spell randomizes the grant.
  // Buff that grants the target Resistance to one or more damage types for the
  // duration (Stoneskin → bludgeoning/piercing/slashing; Protection from Energy
  // → a chosen element). Applied to `Character.spell_resistances`; halves
  // matching enemy damage in the attack-resolution chain. Cleared when the
  // caster's concentration ends.
  grantResistances?: string[];
  // Buff that grants the target Immunity to one or more conditions for the
  // duration (Freedom of Movement → Paralyzed/Restrained/Grappled; Mind Blank →
  // Charmed). Applied to `Character.condition_immunities`; the engine then
  // blocks those conditions from landing on the target AND clears any already
  // present (via `conditionImmunitiesFor`). Cleared at combat end.
  grantsConditionImmunities?: ConditionName[];
  // SRD Fire Shield — arm a melee-retaliation on the self-target (read by the
  // buff path → `Character.fire_shield`). A creature that hits the warded
  // character with a melee attack takes `dice` damage of `damageType`.
  fireShield?: { dice: string; damageType: string };
  // SRD Mirror Image — the number of duplicates to conjure (3). The buff path
  // sets `Character.mirror_images`; the enemy-attack resolver burns them down.
  mirrorImages?: number;
  // SRD Blink — a self-buff that flickers the caster into the Border Ethereal
  // about half each round. The buff path sets `Character.blinking`; the
  // enemy-attack resolver rolls a d20 (11+ ⇒ the blow finds no one) per attack.
  blink?: boolean;
  // SRD Prismatic Spray — eight rays in a cone. Each creature makes ONE DEX save,
  // then a 1d8 picks its ray: 1–5 are 12d6 of fire/acid/lightning/poison/cold
  // (save-for-half), 6 (indigo) Restrains (CON save-ends), 7 (violet) Blinds
  // (WIS save-ends), 8 strikes with two rays (reroll 8s). Routed to a dedicated
  // dispatch branch (`runPrismaticSpray`). `blastRadius` is the cone length.
  prismaticRays?: boolean;
  // SRD Divine Word — each enemy within `rangeFt` makes a CHA save; on a failure
  // a target with ≤50 HP suffers an effect by its CURRENT HP (≤20 dies; 21–30
  // Blinded+Deafened+Stunned; 31–40 Blinded+Deafened; 41–50 Deafened). Routed to
  // the dedicated `runDivineWord` dispatch. (The outsider plane-banish is
  // deferred — pansori doesn't model creature type / planes.)
  divineWord?: boolean;
  // SRD Holy Aura — a self-cast concentration aura. The buff path applies the
  // party-wide `holy_warded` condition (attackers roll Disadvantage vs warded
  // allies; warded allies have Advantage on ALL saves). Cleared when the caster's
  // concentration ends. (The fiend/undead-hit-blinds-attacker rider is deferred.)
  holyAura?: boolean;
  // SRD Sanctuary — ward the self/ally target; attackers must save vs the
  // caster's DC. The buff path stamps `Character.sanctuary_dc`.
  sanctuary?: boolean;
  tempHpGrant?: number; // Heroism gives mod-equal temp HP each turn; MVP grants once on cast.
  maxHpBonus?: number; // Aid bumps target's max HP (and current HP).
  upcastMaxHpBonus?: number; // extra max HP per slot above base (Aid: +5 per slot).
  // SRD — some spells require a costly material component that's
  // consumed on cast (Identify's 100 gp pearl, Revivify's 300 gp diamond,
  // Resurrection's 1000 gp diamond, etc.). Engine deducts from char.gold
  // on cast and blocks the cast if the caster can't afford it. Free
  // material components (just listed in the description) don't set this.
  materialCost?: number;
  // SRD — some healing spells also strip conditions from the
  // target on cast (Heal: Blinded / Deafened / Poisoned; Greater
  // Restoration: Charmed / Petrified / Stunned + Exhaustion; etc.).
  // The heal branch in castSpell reads this and removes each entry
  // from `char.conditions` after the HP restore. Single-target only
  // — mass-heal path doesn't apply per-target condition strips today.
  removeConditions?: string[];
  // SRD Power Word Heal — restores ALL of the target's Hit Points (no
  // dice). When set, the heal branch fills the target to max HP instead
  // of rolling `heal`. Combine with `removeConditions` for the cleanse.
  healFull?: boolean;
  // Bring-from-dead. When set, the spell targets a *dead* PC (not a
  // living enemy/ally) and routes through the revive branch in
  // castSpell. `hpRestored` is the HP value the target wakes up at:
  // a number (Revivify: 1) or 'full' (Resurrection / True Resurrection
  // restore to max). `windowRounds` is how many combat rounds may
  // have elapsed since `Character.died_at_round` — beyond that, the
  // cast fails (Revivify's 1 minute = 10 rounds). Long-window spells
  // (Raise Dead's 10 days, Resurrection's 100 years) use a sentinel
  // large number — pansori only tracks round-grained windows today;
  // the engine treats anything >= 10000 as "no in-combat limit".
  // `materialCost` is duplicated here from the outer field for
  // discoverability, but the actual deduction reads the outer
  // `materialCost` — keep them in sync.
  revive?: {
    hpRestored: number | 'full';
    windowRounds: number;
    materialCost: number;
  };
  // RE-1 Phase 4 — summon spell. Casting (out of combat) adds a
  // persistent ally to `state.summoned_allies` with this stat block;
  // `seedSummonedAllies` materializes it at the next combat start.
  summon?: {
    name: string;
    ac: number;
    maxHp: number;
    toHit: number;
    damage: string; // dice expression, e.g. '1d6+3'
    // Alternate stat blocks the caster chooses among at cast time (e.g.
    // Animate Dead: Skeleton [the base block above] or Zombie). The cast
    // surface offers the base plus each variant. (RE-1 Phase 4.5.)
    variants?: Array<{ name: string; ac: number; maxHp: number; toHit: number; damage: string }>;
    // Creatures raised at the spell's base level (Create Undead: 3 Ghouls).
    // Omitted ⇒ 1. Overridden by `countFromSpellMod` (Animate Objects) when set.
    baseCount?: number;
    // Extra creatures raised per slot level above the spell's base level
    // (Animate Dead: 2 — RAW "two additional Undead for each slot level
    // above 3"). Omitted / 0 ⇒ always one. (RE-1 Phase 4.5.)
    countPerUpcastLevel?: number;
    // SRD Animate Objects — the base count equals the caster's spellcasting
    // modifier (not a fixed 1). When set, `runSummonSpell` reads the passed
    // casting score and raises `max(1, abilityMod)` creatures, with
    // `countPerUpcastLevel` still adding per slot level above the base.
    countFromSpellMod?: boolean;
    // SRD Find Familiar — the summon is a non-combatant (can't take the Attack
    // action). Threaded to every raised ally + the grid entity; `runAllyTurn`
    // then takes the Help action instead of attacking.
    noAttack?: boolean;
    // SRD 5.2.1 Mounted Combat — the summon is a rideable mount (Phantom
    // Steed). Carried onto the SummonedAlly so combat start auto-mounts the
    // caster; `speed` is the mount's Speed (ft).
    isMount?: boolean;
    speed?: number;
  };
  // SRD Dragon's Breath — a self/ally buff that grants the target a breath
  // weapon: until the spell ends (concentration) the target can take an action
  // to exhale a 15-ft cone (DEX save-for-half) dealing the spell's `damage`
  // (+`upcastBonus`/level) of a type chosen at cast. The buff path stamps
  // `Character.granted_breath`; the `use_breath` action re-issues the cone.
  grantsBreath?: boolean;
  // SRD anti-magic suppression (Antimagic Field, Globe of Invulnerability). The
  // utility cast path raises a caster-following `suppressesMagic` SpellZone
  // (10-ft radius). `maxLevel` caps which spell levels it stops (Globe: 5;
  // omitted = all). `fromOutsideOnly` (Globe) blocks only inbound spells from
  // outside; otherwise (Antimagic Field) it blocks magic in or out.
  magicSuppression?: { maxLevel?: number; fromOutsideOnly: boolean };
  // SRD Time Stop — the caster takes this many extra turns in a row (dice expr,
  // '1d4+1'). The utility cast path rolls it onto `Character.time_stop_turns`.
  grantsExtraTurns?: string;
  // SRD Spare the Dying — stabilize a dying ally (sets `Character.stable`, so the
  // death-save flow stops rolling). Routed through the ally-buff path; the cast
  // surface offers one choice per downed party member.
  stabilizes?: boolean;
  // SRD shapeshift spells (Shapechange = self, Animal Shapes = the party). The
  // cast path puts the target(s) into a chosen BeastForm via the `wild_shaped`
  // machinery, concentration-bound. Beasts cap at CR 1 in pansori, so the
  // "any creature" breadth is narrowed to the beast-form catalog.
  shapeshift?: { scope: 'self' | 'allies' };
  // Long casting time (1 min+) — rejected in combat (before slot spend).
  outOfCombatOnly?: boolean;
  // Town teleportation (Teleport / Teleportation Circle): casting opens a
  // destination interstitial (GameState.pending_teleport) listing the towns
  // the party has VISITED; teleport_to relocates instantly (no travel time).
  townTeleport?: boolean;
  // Word of Recall: cast in a town to DESIGNATE it the sanctuary
  // (GameState.recall_town_id); cast anywhere else to return to it instantly.
  recall?: boolean;
  // Remove Curse: strips the 'cursed' condition and breaks the attunement
  // bond on cursed items the target has attuned (the items stay cursed).
  removesCurses?: boolean;
}

// ─── Beast Forms (SRD Wild Shape) ───────────────────────────────────────
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
  // SRD Polymorph — the beast's Hit Points. The polymorphed creature's HP
  // is replaced by this (modeled as `temp_hp`); when it depletes, the form
  // drops. Wild Shape ignores this (it derives temp HP from druid level).
  hp?: number;
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
  // Stack size for stackable items (ammunition). Undefined ⇒ a single item.
  // Ranged attacks decrement this; at 0 the item (and any quiver equip) is removed.
  count?: number;
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
   * only per SRD) and as the display label.
   *
   * For per-class level lookups, prefer `class_levels` via the
   * `getClassLevels` / `getClassLevel` helpers in `services/multiclass.ts`.
   */
  character_class: string;
  /**
   * Per-class level breakdown (multiclassing — SRD Ch. 1). Keys
   * are class names lowercased (`'fighter'`, `'wizard'`); values are
   * the level taken in that class. Sum across all keys should equal
   * `level`. Absent on legacy single-class PCs — `getClassLevels`
   * synthesizes `{[character_class]: level}` in that case.
   */
  class_levels?: Record<string, number>;
  portrait_url: string | null;
  hp: number;
  max_hp: number;
  // SRD Life Drain (Specter, Wight) — cumulative reduction to this character's
  // Hit Point maximum. `max_hp` is lowered directly (so every heal / clamp
  // honors it automatically); this field tracks how much to give back. Removed
  // by a Long Rest or Greater Restoration. The character dies if a drain brings
  // `max_hp` to 0.
  life_drain_reduction?: number;
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
  // Worn/wielded gear: each filled body slot → an inventory instance_id.
  // (Replaces the old equipped_weapon/armor/shield trio; main_hand/armor/shield
  // are the migrated equivalents.)
  equipment: Partial<Record<EquipSlot, string>>;
  conditions: string[];
  condition_durations: Record<string, number>;
  death_saves: DeathSaves;
  stable: boolean;
  dead: boolean;
  // Combat-round counter at the moment the PC died — set when
  // `dead` flips to true, used by revive spells (Revivify et al.)
  // to gate the "within N rounds of death" window. Cleared when
  // the PC is revived. Out-of-combat deaths set this to the last
  // known round counter (typically 0), meaning Revivify will fail
  // its window check; that matches RAW (Revivify needs a combat-
  // adjacent timeline). Long-window revives (Raise Dead, True
  // Resurrection) ignore this field — they have their own
  // multi-day windows that pansori doesn't track yet.
  died_at_round?: number;
  // SRD revive penalty — Raise Dead and Resurrection impose a
  // −4 penalty to D20 tests (attack rolls, saves, ability checks)
  // on the revived target. Decrements by 1 on each long rest until
  // it reaches 0. True Resurrection and Revivify do NOT impose it.
  // Reincarnate also skips per RAW (the new body emerges whole).
  // Threaded into toHit, rollConditionSave, rollDeathSave,
  // checkConcentration, and the ad-hoc skill-check sites via the
  // `d20TestPenalty(char)` helper.
  revive_d20_penalty?: number;
  turn_actions: TurnActions;
  initiative_roll: number | null;
  hit_die: number;
  hit_dice_remaining: number;
  // Per-rest class resource pools (e.g. rage_uses, action_surge)
  class_resource_uses: Record<string, number>;
  // True when the character has levelled up to an ASI level and hasn't chosen their improvement yet
  asi_pending: boolean;
  // 0 = none; 1–6 = exhaustion level per SRD (cumulative penalties)
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
  // SRD Weapon Mastery — weapon ids the PC has mastered. Class-based
  // grant: Fighter/Paladin/Ranger get 2-3 at L1, Barbarian/Rogue get 2,
  // Wizard/Druid/Bard get 0 by default. Wielding a weapon NOT in this list
  // doesn't grant its mastery property even if the weapon has one.
  weapon_masteries?: string[];
  // 2024 Weapon Mastery slot growth — set on level-up when the class's mastery
  // count increases (Fighter L4/10/16, Barbarian L4/10). The number of new
  // weapons the player must still pick; generateChoices surfaces the picks and
  // `choose_weapon_mastery` decrements it.
  weapon_mastery_pending?: number;
  // Bardic Inspiration die granted by a Bard (SRD / 2024). The
  // die is stored as a dice expression ('d6', 'd8', ...) and consumed on
  // the next d20 test (attack/save/check). SRD expands what the die
  // can apply to — Pansori applies it to attack-roll consumption today;
  // save consumption follows the Heroic Inspiration pattern.
  bardic_inspiration_die?: string;
  /**
   * SRD Divine Smite spell — bonus-action pre-buff. When the
   * Paladin casts the spell, this records the number of d8 radiant
   * dice queued for the next weapon-attack hit. Cleared when the
   * next weapon hit consumes the buff (or at the end of the next
   * turn, per RAW — duration tracking is a follow-up).
   */
  divine_smite_dice?: number;
  // SRD per-attack weapon damage rider (Divine Favor) — every weapon hit for the
  // duration deals extra `dice` damage of `damageType`. Set by the buff cast
  // path from `Spell.weaponRider` (persistent), read in resolveOneAttack, and
  // cleared when the caster's concentration ends.
  weapon_rider?: { dice: string; damageType: string; spellId: string };
  // SRD Fire Shield — while active, a creature that hits the warded character
  // with a melee attack takes `dice` damage of `damageType` (a "warm" shield
  // retaliates Fire; a "chill" shield, Cold). Set by the buff cast path, read in
  // the enemy-turn loop after the character takes melee damage. Non-concentration
  // (RAW 10 min); cleared at combat end + long rest, like the encounter buffs.
  fire_shield?: { dice: string; damageType: string };
  // SRD Mirror Image — the number of illusory duplicates still standing. When a
  // creature HITS the warded character, a d6 is rolled per remaining duplicate;
  // if any is 3+, a duplicate takes the hit (no damage) and is destroyed
  // (decrementing this). Set by the buff cast path; cleared at 0 / combat end.
  mirror_images?: number;
  // SRD Blink — while set, the character spends about half each round in the
  // Border Ethereal. The enemy-attack resolver rolls a d20 per incoming attack;
  // on 11+ the blow finds no one (auto-miss). Set by the buff cast path;
  // non-concentration (1 min ≈ encounter) — cleared at combat end.
  blinking?: boolean;
  // SRD Sanctuary — the warded creature is hard to attack: a creature that tries
  // to attack it makes a Wisdom save (vs this stored caster spell DC) or must
  // choose a new target / lose the attack. Read in `computeEnemyAttack`; cleared
  // at combat end. (RAW: the ward ends when the warded creature attacks/casts —
  // that break-on-action is deferred.)
  sanctuary_dc?: number;
  // SRD Guidance (cantrip) — a one-shot +1d4 on the target's NEXT ability
  // check. Set by the buff cast path (concentration); consumed at the next
  // `skillCheck` (via `consumeGuidanceDie`), or cleared if concentration
  // breaks first. (Simplification: RAW keys the bonus to a chosen skill;
  // pansori grants it to the next ability check of any kind.)
  guidance_die?: boolean;
  // SRD Resistance (cantrip) — while active, damage of the chosen `type` is
  // reduced by 1d4, once per turn (pansori models "per turn" as per ROUND via
  // `used_round`, mirroring Superior Hunter's Defense). Set by the buff cast
  // path (concentration, target picks the type); the reduction is applied in
  // `applyDamage` for any source that passes its damage type; cleared when
  // concentration breaks.
  resistance_reduction?: { type: string; used_round?: number };
  // SRD one-shot smite (Searing / Shining / Ensnaring Strike) — armed on cast,
  // consumed by the NEXT melee-weapon hit: adds `dice` damage (optional) and an
  // on-hit effect (Faerie-Fire-style advantage, or a saved condition that ends
  // on the target's save). Concentration governs the lingering effect; the
  // armed strike itself clears on consumption (or when concentration ends).
  pending_smite?: {
    spellId: string;
    dice?: string;
    damageType?: string;
    appliesFaerieFire?: boolean;
    appliesCondition?: ConditionName;
    conditionSave?: AbilityKey;
  };
  // SRD Wild Shape — id of the active BeastForm while wild_shaped.
  // Cleared on dismiss_wild_shape.
  wild_shape_form?: string;
  // SRD shapeshift SPELLS (Shapechange, Animal Shapes) reuse the `wild_shaped`
  // machinery but, unlike a druid's class feature, are concentration-bound. This
  // marks which spell shaped the creature so `breakConcentration` / combat-end
  // revert exactly those (and leave a druid's independent Wild Shape alone).
  shapeshift_spell?: string;
  attuned_items: string[]; // instance_ids of attuned magic items (max 3)
  // `rounds_left` ticks down on each round wrap; concentration ends
  // automatically when it reaches 0. 10 rounds = 1 minute (the most
  // common duration). Default applied on cast if the Spell entry
  // doesn't specify; longer-lasting buffs (Spirit Guardians = 100,
  // Hex = ~600) override via Spell.durationRounds.
  concentrating_on?: {
    spellId: string;
    condition?: string;
    // A second concentration-linked condition (Hideous Laughter's incapacitated
    // alongside prone); breakConcentration strips both from affected creatures.
    condition2?: string;
    rounds_left?: number;
    // The spell save DC, stamped for effects whose ongoing resolution
    // re-rolls a save away from the cast site (Confusion: each confused
    // creature re-saves against this DC on its turn to shake the effect).
    save_dc?: number;
  } | null;
  // RE-4 — a recurring spell attack the caster repeats on later turns
  // (Spiritual Weapon: a floating force re-attacked as a Bonus Action;
  // Vampiric Touch: a Magic-action melee spell attack that heals the caster).
  // Set on cast, re-issued via the `recurring_spell_attack` action, and cleared
  // when its duration ends or (for concentration spells) concentration drops.
  recurring_attack?: {
    spellId: string;
    name: string;
    damage: string; // upcast-baked dice expr (incl. +spellcasting mod where RAW)
    damageType: string;
    castingScore: number; // casting-ability score, for the spell attack bonus
    cost: 'action' | 'bonus_action'; // re-issue cost
    healFraction?: number; // Vampiric Touch heals this fraction of damage dealt
    rounds_left: number; // duration; decremented on round wrap, cleared at 0
    concentration?: boolean; // cleared by breakConcentration when set
  } | null;
  // SRD Time Stop — banked extra turns the caster takes in a row while everyone
  // else is frozen. Set by the spell (1d4+1); the turn-advance hook refreshes the
  // caster's turn instead of passing to others while this is > 0, decrementing
  // each. Cleared to 0 the moment one of those turns affects an enemy.
  time_stop_turns?: number;
  // SRD Dragon's Breath — a granted breath weapon the holder can exhale (its
  // action) as a 15-ft cone (DEX save, half) each turn for the spell's duration.
  // `dice` is the upcast-baked damage, `saveDc` the caster's spell save DC at
  // cast, `damageType` the chosen element. Cleared when the CASTER (`sourceCasterId`)
  // drops concentration. Re-issued via the `use_breath` action.
  granted_breath?: {
    damageType: string;
    dice: string;
    saveDc: number;
    sourceCasterId: string;
  };
  // SRD Ranger Hunter's Mark — the id of the currently-marked enemy entity.
  // Set when the spell is cast, cleared on breakConcentration. The caster's
  // attack rolls vs this target deal +1d6 Force (d10 at Ranger L20, Foe Slayer).
  hunters_mark_target_id?: string;
  // SRD Hex (Warlock L1) — the id of the hexed enemy entity. Like Hunter's Mark:
  // the caster's hits vs this target deal +1d6 necrotic. Set on cast, cleared on
  // breakConcentration. (The curse-an-ability-for-disadvantage rider is narrative.)
  hex_target_id?: string;
  // SRD Magic Weapon (L2) — a flat +N enhancement on the wielder's weapon
  // attacks (+1, or +2 at slot 4, +3 at slot 6). Adds to both the attack roll
  // (toHit) and weapon damage. Concentration-bound; cleared on breakConcentration.
  weapon_enhancement?: number;
  // SRD Shillelagh (Druid cantrip) — while active, a held Club or Quarterstaff
  // uses the stored spellcasting ability instead of STR for attack + damage and
  // its damage die becomes a scaling d8/d10/d12/2d6. 1 minute, NOT concentration;
  // cleared at combat end (≈ duration) and when the qualifying weapon is dropped.
  // The attack pipeline (preattack + resolveOneAttack) reads this.
  shillelagh?: { ability: AbilityKey };
  // SRD Ranger Hunter "feature option" picks (swappable on a rest):
  //   Hunter's Prey (L3): 'colossus_slayer' | 'horde_breaker' (defaults to
  //     colossus_slayer when unset, preserving the pre-picker behavior).
  //   Defensive Tactics (L7): 'escape_the_horde' | 'multiattack_defense'.
  hunters_prey?: 'colossus_slayer' | 'horde_breaker';
  defensive_tactics?: 'escape_the_horde' | 'multiattack_defense';
  // SRD Sorcerer Metamagic — the option ids the sorcerer has learned (2 at L2,
  // +2 at L10/L17). A metamagic must be known to be activated.
  metamagics_known?: string[];
  // SRD Draconic Sorcery Elemental Affinity (L6) — the chosen damage type. The
  // sorcerer resists it and adds CHA to one damage roll of that type per spell.
  elemental_affinity?: 'acid' | 'cold' | 'fire' | 'lightning' | 'poison';
  // SRD Cleric Blessed Strikes (L7) — the chosen option: Divine Strike (extra
  // radiant on a weapon hit, once/turn) or Potent Spellcasting (+WIS to cantrip
  // damage). Improves at L14.
  blessed_strikes?: 'divine_strike' | 'potent_spellcasting';
  // SRD Cleric Divine Order (L1) — the chosen sacred role. Protector grants
  // Martial weapon + Heavy armor training; Thaumaturge knows an extra Cleric
  // cantrip and adds WIS (min +1) to Intelligence (Arcana/Religion) checks.
  divine_order?: 'protector' | 'thaumaturge';
  // SRD Wizard Spell Mastery (L18) — a chosen L1 and L2 action spell that can
  // be cast at its base level without expending a slot.
  spell_mastery_l1?: string;
  spell_mastery_l2?: string;
  // SRD Wizard Signature Spells (L20) — two chosen L3 spells, each castable
  // once at level 3 without a slot (recharges on a short/long rest; the spent
  // state is tracked under class_resource_uses as `signature_used_<id>`).
  signature_spells?: string[];
  // SRD Open Hand Monk L17 — Quivering Palm: the enemy id currently carrying
  // the lethal vibrations (one creature at a time). Set when the monk spends 4
  // Focus Points on an unarmed hit; cleared when detonated.
  quivering_palm_target?: string;
  // SRD Fiend Warlock L10 — Fiendish Resilience: the chosen damage type the
  // warlock currently has Resistance to (re-chooseable on a short/long rest).
  fiendish_resilience?: string;
  // Damage types this PC currently resists from an active buff spell (Stoneskin
  // → B/P/S, Protection from Energy → an element). Granted by the buff path,
  // cleared when the granting spell's concentration ends. You can only
  // concentrate on one spell, so this safely reflects a single active buff.
  spell_resistances?: string[];
  // Conditions this PC is currently immune to from an active buff spell
  // (Freedom of Movement → Paralyzed/Restrained/Grappled; Mind Blank → Charmed).
  // Folded into `conditionImmunitiesFor` alongside paladin-aura immunities, so
  // the application guards + the per-turn clear sweep honor it. Granted by the
  // buff path; cleared at combat end (like `spell_resistances`).
  condition_immunities?: ConditionName[];
  // SRD Warlock Mystic Arcanum (L11/13/15/17) — chosen spell per arcanum tier
  // (spell level 6/7/8/9 → spell id). Each is cast once per long rest without a
  // slot (tracked as class_resource_uses.mystic_arcanum_<level>).
  mystic_arcanum?: Record<number, string>;
  // SRD Multiattack Defense bookkeeping — enemy entity id → the combat round
  // in which that enemy hit this PC. While the stamp equals the current round,
  // that enemy's further attacks vs this PC roll with Disadvantage. The round
  // stamp self-expires (no explicit clearing needed).
  multiattack_defense_marks?: Record<string, number>;
  // SRD Superior Hunter's Defense bookkeeping — the damage type currently
  // resisted and the round the reaction fired. While `round` equals the current
  // round, damage of `type` is halved (free); the round stamp self-expires.
  superior_hunters_def?: { type: string; round: number };
  // Extended 5e fields
  subclass?: string; // e.g. 'champion', 'evoker', 'thief'
  // SRD 5.2.1 Fighting Style feats chosen via class features (Fighter L1 +
  // L7, Paladin/Ranger L2). Ids: 'archery' | 'defense' | 'great_weapon' |
  // 'two_weapon'. Each id appears at most once (RAW: can't take the same
  // Fighting Style feat twice). (RE-2.)
  fighting_styles?: string[];
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
      // Magic Initiate — the chosen cantrip ids, so the combat spell list can
      // tag them as feat-granted (they're otherwise identical to class cantrips).
      magicInitiateCantrips?: string[];
    }
  >;
  expertise_skills?: string[]; // skills with double proficiency bonus (Rogue/Bard)
  prepared_spells?: string[]; // spell ids currently prepared (Cleric/Paladin/Druid)
  charmer_id?: string; // entity id of the charmer when charmed
  // SRD Mage Armor spell — when active, base AC becomes
  // 13 + DEX mod (only effective when not wearing body armor).
  // computeTotalAc reads this. Expires on long rest.
  mage_armor_active?: boolean;
  // SRD Shield of Faith spell — +2 AC for concentration
  // duration (up to 10 min). computeTotalAc reads this. Expires
  // when the caster's concentration drops.
  shield_of_faith_active?: boolean;
  // SRD Barkskin (L2) — the target's AC can't be less than 17. A persistent
  // floor (1 hour, NOT concentration); computeTotalAc reads this and floors the
  // result. Modeled like mage_armor (set-and-forget; expires on long rest).
  barkskin_active?: boolean;
  // SRD See Invisibility (L2) — while set, this creature can see Invisible
  // creatures (its attacks/sight ignore the target's `invisible` condition).
  sees_invisible?: boolean;
  // SRD Longstrider (L1) — +10 ft Speed for 1 hour (NOT concentration).
  // `effectiveSpeed` reads this; persistent like Mage Armor (expires on rest).
  longstrider_active?: boolean;
  // SRD Pass without Trace (L2) — +10 to Stealth checks for the party while the
  // caster concentrates. Read by the Hide check; cleared on breakConcentration.
  pass_without_trace_active?: boolean;
  // SRD Warding Bond (L2) — the id of the warder. While set, whenever this
  // creature takes damage the warder takes the same amount (the post-action
  // sweep redirects it). The ward's resistance-to-all is the grantResistances
  // buff; this is the "you take the damage too" half. Ends if the warder drops.
  warded_by?: string;
  // SRD Protection from Evil and Good (L1) — pansori grants the most testable
  // slice: Advantage on saves vs Charmed / Frightened (the rest — attacker
  // Disadvantage from those creature types, no possession — needs type tags).
  // Read in conditionSavingThrow; cleared on breakConcentration.
  protected_from_evil?: boolean;
  // SRD Death Ward (L4 Abjuration) — one-shot rescue. While set,
  // the next time the target's HP would drop to 0, it drops to 1
  // instead and the flag clears (the spell "ends" per RAW). 8-hour
  // duration; pansori clears it defensively on long rest like the
  // other buff flags. The flag is consumed inside `applyDamage`.
  death_ward_active?: boolean;
  // SRD movement modes (separate from `speed`, which is the
  // walking speed). When non-zero, the character has the matching
  // mode; the engine reads these where the mode changes gameplay.
  // Today the only fully-wired mode is `fly_speed_ft`: gridMove
  // lets a flying character bypass obstacle cells and ignore
  // difficult-terrain cost when their flying speed equals or
  // exceeds walking speed. `swim_speed_ft` and `climb_speed_ft`
  // store data from feature grants (Athlete, Sea Druid, etc.) but
  // don't yet change engine behavior — the matching terrain-mode
  // model (climb / swim cells) is deferred to a follow-up PR.
  // Long rest clears all three defensively (most sources are
  // short-duration concentration buffs or transformations).
  fly_speed_ft?: number;
  swim_speed_ft?: number;
  climb_speed_ft?: number;
  // SRD 5.2.1: Darkvision treats Darkness as Dim Light within this radius
  // (typically 60 ft for elves/dwarves/halflings/etc.). Default 0 = no
  // darkvision (typical human).
  darkvision_ft?: number;
  // SRD: Boon of Truesight (epic boon) — Truesight range in feet (0/absent =
  // none). RAW Truesight sees in Darkness, sees Invisible creatures and
  // objects, and is immune to visual illusions; pansori records the range for
  // narration today (the see-Invisible substrate isn't modeled yet).
  truesight_ft?: number;
  // SRD 5.2.1: Temporary Hit Points. Absorb damage before HP. Don't
  // stack with themselves (replace if higher); expire on a Long Rest.
  temp_hp?: number;
  // SRD Heroic Inspiration: granted automatically on a Nat 1 d20.
  // Player can spend it on a later d20 to gain advantage (one-shot).
  inspiration?: boolean;
  // SRD 5.2.1 — Hide action stores the Stealth check total as the DC
  // for anyone trying to find you. While the `invisible` condition is set
  // and hide_dc > 0, enemies must beat hide_dc with a passive Perception
  // (or active Search) to reveal you before they can target effectively.
  // Cleared when invisible is cleared.
  hide_dc?: number;
  // SRD — some conditions track the entity that caused them. Primary
  // use: Frightened can't willingly move closer to its source. Keyed by
  // condition name; cleared whenever the condition is removed.
  condition_sources?: Record<string, string>;
  // SRD Species (formerly "race"). Determines size, speed, darkvision,
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
// and gives an eligible PC the chance to spend their reaction (SRD).
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

// Shield (SRD). Triggers BEFORE damage applies — accepting negates the
// hit retroactively. pendingDamage/pendingNarrative are stashed so a decline
// can apply them as if Shield was never offered.
// `PendingShieldReaction` is re-exported from ./shared-types (see src/shared/types.ts).

// Hellish Rebuke (SRD). Triggers AFTER damage applies — accepting deals
// 2d10 fire damage back to the attacker (DEX save for half). No state to
// stash: the damage that triggered Rebuke is already on the books, and a
// decline just lets the loop continue.
// `PendingHellishRebukeReaction` is re-exported from ./shared-types (see src/shared/types.ts).

// Counterspell (SRD). Triggers BEFORE an enemy spell resolves — the
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

/**
 * A persistent ally combatant the party owns out of combat (e.g. an
 * Animate Dead skeleton). Stored on GameState and materialized into a
 * grid `CombatEntity` (side: 'ally') + an initiative slot at combat
 * start. (RE-1 Phase 4.)
 */
export interface SummonedAlly {
  id: string;
  ownerId: string; // character.id of the caster/owner
  name: string;
  ac: number;
  maxHp: number;
  toHit: number;
  damage: string; // dice expression, e.g. '1d6+3'
  // SRD Find Familiar — a non-combatant ally (can't take the Attack action).
  // Carried onto `CombatEntity.noAttack` by `seedSummonedAllies`; `runAllyTurn`
  // takes the Help action instead of attacking.
  noAttack?: boolean;
  // SRD 5.2.1 Mounted Combat — this ally is a rideable mount (Phantom Steed).
  // `seedSummonedAllies` auto-mounts its owner at combat start; `speed` is the
  // mount's Speed (ft), carried onto the entity's `speed_ft`.
  isMount?: boolean;
  speed?: number;
}

// SRD wall/terrain spells (Wall of Fire, Wall of Force) — a transient set of
// grid cells the spell occupies while the caster concentrates. Blocks movement
// and/or line of sight; removed when the caster's concentration ends (see
// `breakConcentration`). Stored per-room on GameState.spell_walls.
export interface SpellWall {
  id: string;
  casterId: string;
  spellId: string;
  name: string;
  roomId: string;
  cells: GridPos[];
  blocksMovement: boolean;
  blocksLineOfSight: boolean;
}

// RE-4 — a persistent damage zone (Cloud of Daggers, Moonbeam, …) the caster
// concentrates on. Occupies grid cells and deals `damage` to hostile creatures
// standing in them on each round wrap (and once on cast). `savingThrow`
// undefined = automatic (no save). Removed when the caster's concentration ends
// (see `breakConcentration`). Stored per-room on GameState.spell_zones.
export interface SpellZone {
  id: string;
  casterId: string;
  spellId: string;
  name: string;
  roomId: string;
  cells: GridPos[];
  damage: string; // dice expr per tick, e.g. '4d4'
  damageType: string;
  savingThrow?: AbilityKey; // omitted = automatic damage (no save)
  saveEffect?: 'half' | 'negates';
  saveDC?: number; // the caster's spell save DC, captured at cast time
  // Caster-following aura (Spirit Guardians): the footprint is recomputed from
  // the caster's CURRENT cell on each tick using `radiusFt`, so the zone moves
  // with the caster. `cells` holds the cast-time footprint as a fallback.
  followsCaster?: boolean;
  radiusFt?: number;
  // Center cell of a PLACED zone (where it was cast / last repositioned to).
  // Used to measure reposition distance and recompute the footprint on a move.
  center?: GridPos;
  // SRD non-concentration zone teardown. Concentration zones are torn down by
  // `breakConcentration`; these fields govern the lifetime of zones that AREN'T
  // bound to concentration (Guardian of Faith):
  //   - `rounds_left`: round budget; `fireSpellZones` decrements it each round
  //     wrap and removes the zone at 0. Undefined ⇒ no round-based expiry (the
  //     zone lasts until its damage cap or combat ends).
  //   - `damageCap` / `damageDealt`: cumulative-damage limit. Each tick adds the
  //     damage dealt to `damageDealt`; the zone is removed once it reaches
  //     `damageCap` (Guardian of Faith vanishes after dealing 60). Undefined cap
  //     ⇒ no damage limit.
  // Any lingering zone is also cleared when combat ends (`endCombatState`).
  rounds_left?: number;
  damageCap?: number;
  damageDealt?: number;
  // SRD Darkness — a magical-darkness zone (no damage). Its cells are Heavily
  // Obscured: Darkvision can't see through them and nonmagical light can't
  // illuminate them, so only Blindsight / Devil's Sight pierces. `applyZoneTick`
  // skips these (no damage); `magicalDarknessCells` / `canSeeTarget` read them.
  blocksSight?: boolean;
  // SRD anti-magic suppression (Antimagic Field, Globe of Invulnerability). A
  // suppression zone deals no damage; instead `isSpellSuppressed` fizzles spells
  // that cross it. `suppressMaxLevel` is the highest spell level it stops
  // (Globe: 5; omitted = all, for Antimagic Field). `suppressFromOutsideOnly`
  // (Globe) blocks only spells cast from OUTSIDE at a target inside; otherwise
  // (Antimagic Field) any spell with the caster OR target inside is stopped.
  suppressesMagic?: boolean;
  suppressMaxLevel?: number;
  suppressFromOutsideOnly?: boolean;
  // SRD Silence — a zone of utter quiet (no damage). A creature standing in its
  // cells can't cast a spell with a Verbal component (checked in precast).
  blocksVerbal?: boolean;
}

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
  // Set by endCombatState when a fight resolves (and the party survived): the
  // FE shows a "Continue" gate instead of auto-switching back to the
  // out-of-combat view. Cleared by the `continue` action.
  combat_over_pending?: boolean;
  initiative_order: Array<{ id: string; roll: number; is_enemy: boolean }>;
  initiative_idx: number;
  // RE-1 Phase 4 — persistent ally combatants (e.g. an Animate Dead
  // skeleton) raised out of combat; seeded into `entities` +
  // `initiative_order` at combat start by `seedSummonedAllies`.
  summoned_allies?: SummonedAlly[];

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

  // One-shot dialogue options already chosen — keys are
  // "npcId:<path indices joined by '.'>" (see dialogueGating.onceKey).
  // Persists for the whole playthrough, like objects_searched.
  dialogue_chosen?: string[];

  // NPC ids whose conversation has been explicitly ended at least once —
  // drives the firstGoodbye narrative hook (the greeting-side twin is
  // npc_talked, which drives firstGreeting).
  npc_farewelled?: string[];

  // Script engine flags
  flags: Record<string, boolean | string | number>;

  // Grid combat (campaign dungeons only)
  entities?: CombatEntity[];
  movement_used?: Record<string, number>; // entityId → feet moved this turn
  spell_walls?: SpellWall[]; // transient wall/terrain-spell obstacles (Wall of Fire/Force)
  spell_zones?: SpellZone[]; // transient persistent damage zones (Cloud of Daggers, …)
  help_target_id?: string; // char id receiving Help action advantage
  // Entity ids Surprised at combat start. SRD 5.2.1: Surprise imposes
  // Disadvantage on the Initiative roll (applied in buildInitiativeOrder); this
  // list is retained only to surface the "SURPRISED" combat-start note.
  surprised?: string[];
  metamagic_active?: string[]; // active Metamagic modifier ids for the next cast (Sorcery Incarnate allows 2)
  cutting_words_penalty?: number; // Lore Bard Cutting Words penalty to apply
  round?: number; // current combat round (1-indexed)

  // Reactive spell window (SRD — reactions). When set, the engine is
  // paused mid-enemy-turn waiting for an eligible PC to decide whether to
  // spend their reaction. While set, generateChoices offers only the
  // reaction choices; the player resolves with `resolve_reaction`.
  pending_reaction?: PendingReaction;

  // Active NPC conversation. While set (out of combat, in the NPC's room),
  // generateChoices offers ONLY dialogue choices — the responses at the current
  // node, a Back when nested, and End conversation. `path` indexes the nested
  // response tree (root = []); `prompt` is the NPC's current line. Cleared by
  // `end_conversation` or on leaving the room.
  active_conversation?: { npcId: string; roomId: string; path: number[]; prompt: string };

  // Vendor pane — a sub-state nested under `active_conversation`. While set (out
  // of combat, in the NPC's room), generateChoices offers ONLY the NPC's wares
  // (buy choices) + a Back control that returns to the conversation. Opened by
  // `enter_shop`, cleared by `exit_shop` or `end_conversation`.
  active_shop?: { npcId: string; roomId: string };

  // Vendor economy session state — remaining stock for FINITE shop entries
  // ('npcId:itemId' → count left) and current wallet for FINITE vendors
  // (npcId → gold). Cleared wholesale at the start of each in-game day
  // (shop_restock_day) — every vendor restocks daily.
  shop_stock?: Record<string, number>;
  shop_gold?: Record<string, number>;
  shop_restock_day?: number;

  // Leveling pane — player-driven level-up for one party member. While set (out
  // of combat), generateChoices offers ONLY that member's level-up cascade
  // (class pick → ASI/feat → weapon mastery) + a Back control. Opened by
  // `enter_leveling` (which also makes the member the active character so the
  // existing level handlers act on them); cleared by `exit_leveling` or
  // automatically when the member has no level-up work left.
  active_leveling?: { characterId: string };

  // Structured combat event log (circular buffer, capped at COMBAT_LOG_MAX).
  // Emitted in parallel to the narrative string for UI rendering of
  // mechanical events (hits, damage, conditions) separately from prose.
  combat_log?: CombatEvent[];

  // Campaign overlay (merged from CampaignState at session load)
  current_location_id?: string;
  current_district_id?: string;
  // 3-level grid map position (regional → town → local). `map_level` is which
  // grid the party is on; `marker_pos` is the single party-marker cell on the
  // regional / town grid (and while exploring a local room out of combat).
  // `current_room` (above) is the active local room. `current_region_id` /
  // `current_town_id` scope the regional / town grids.
  map_level?: MapLevel;
  current_region_id?: string;
  current_town_id?: string;
  marker_pos?: GridPos;
  // Level-scope visit/exit tracking for the FIRST-variant narration hooks
  // (visited_rooms above doubles as the rooms' enter tracker). Seeded with
  // the starting region at init; future region-to-region travel appends.
  visited_regions?: string[];
  visited_towns?: string[];
  exited_rooms?: string[];
  exited_towns?: string[];
  exited_regions?: string[];
  // Fog of war — permanently-revealed cells per grid, keyed by grid id (the
  // region id for the overland map; towns/local rooms may use it later). Each
  // value is a set of "x,y" cell keys discovered within the party's sight radius.
  // The party can only travel to revealed cells. Currently regional-only.
  revealed_cells?: Record<string, string[]>;
  // Return-cell bookmarks for ascending: the party's last cell on the regional
  // grid (restored when leaving a town/site back to the region) and on the town
  // grid (restored when leaving a venue interior back to the town). Set on
  // descend, read on ascend.
  region_marker_pos?: GridPos;
  town_marker_pos?: GridPos;
  // A wilderness random encounter dropped the party off the map into a transient
  // local combat. Bookmarks where to march back to once the fight collapses
  // (`endCombatState`): the grid level + region/town id + marker cell the party
  // was travelling on. Cleared on return.
  encounter_return?: {
    level: MapLevel;
    region_id?: string;
    town_id?: string;
    pos: GridPos;
  };
  campaign_flags?: Record<string, boolean | string | number>;
  quest_progress?: QuestProgress[];
  faction_rep?: Record<string, number>; // factionId → numeric rep
  // The single in-game clock: total elapsed in-world minutes since campaign
  // start. Day 1 08:00 == 480. Everything time-like derives from this (see
  // services/gameClock.ts): travel adds minutes (mapEngine), rests add
  // 60 (short) / 480 (long). Day = floor(world_minute/1440)+1.
  world_minute?: number;
  // The world_minute at which the last long rest completed; gates SRD's "one
  // long rest per 24 hours" (a second is blocked until 1440 min have passed).
  last_long_rest_minute?: number;
  // Teleportation interstitial — set when a town-teleport spell is cast
  // (the spell id); generateChoices then offers ONLY the visited-town
  // destinations + cancel until teleport_to / cancel_teleport clears it.
  pending_teleport?: string;
  // Word of Recall's designated sanctuary town (cast in a town to set it).
  recall_town_id?: string;
  // SRD Travel Pace — the party's overland stance (default 'normal'). Drives
  // miles-per-hour on the regional map and the pace check effects (Fast:
  // Disadvantage on Wisdom (Perception) → passive −5; Slow: Advantage → +5),
  // surfaced through passive trap/ambush detection.
  travel_pace?: 'fast' | 'normal' | 'slow';
  // SRD 5.2.1 Extended Travel ("forced march") — minutes of overland travel
  // accrued since the last long rest. Beyond 8 hours (480), each further full
  // hour forces a CON save (DC 10 + hours past 8) or a level of Exhaustion
  // (see applyForcedMarch). Reset to 0 by a long rest.
  travel_minutes_today?: number;

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

export interface CampaignData {
  world_name: string;
  intro: string;
  rooms: Room[];
  enemies?: Record<string, Enemy[]>;
  loot?: Record<string, PlacedLoot[]>;
  // Author-placed NPCs keyed by roomId. The engine's NPC lookup is
  // seed.npcs[roomId]; generateSeed copies this field into the seed for
  // campaign-mode runs. Roguelike NPCs are still placed by procgen.
  npcs?: Record<string, PlacedNpc>;
  // Per-campaign fallback starting gear (item ids) when a class has no
  // `classStartingLoot` / `classStartingEquipment` entry.
  defaultStartingLoot?: string[];
  // 3-level grid map model (regional → town → local): the overworld is one or
  // more `regions` (grids of sites),
  // `towns` are settlement grids of venues, and local rooms live in `rooms`
  // (reached via a site/venue `entryRoomId` and navigated by room `exits`).
  regions?: Region[];
  towns?: Town[];
  quests?: Quest[];
  factions?: Faction[];
  // Authoring hint: the campaign is balanced for this many PCs — and it's the
  // baseline for encounter scaling. A room's authored enemy COUNT is the right
  // fight at this size; `scaleRoomEnemiesByCount` grows/shrinks the count for
  // other party sizes (partySize / recommendedSize, floored), leaving stat
  // blocks bestiary-exact (the SRD way). Count-1 placements (bosses, quest
  // targets) are never cloned, so an under-sized party still faces the boss —
  // just with fewer minions. Surfaced on the character creation screen.
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
  // Single-word label for this context, shown on the character-creation screen
  // (e.g. "vale", "dungeon"). UI flavor only. (Legacy: no longer an editable
  // section — the picker shows campaigns.name; this remains the registry-down
  // fallback only.)
  displayNoun: string;
  // Picker presentation (DB-editable sections; code campaigns carry theirs
  // in the FE context instead): a one-line pitch + an ASCII preview panel.
  tagline?: string;
  previewArt?: string;
  // Campaign-scoped terrain art: terrain type → tile id from the shared
  // TERRAIN_TILES catalog. Unmapped types render their default tile. Editable
  // section ('terrainArt'); copied into the seed so the FE map can skin itself.
  terrainArt?: TerrainArtMap;
  // Campaign-scoped visual theme (PARTIAL — the FE merges it over the base
  // theme). Editable section ('theme'); rides into the seed like terrainArt.
  theme?: CampaignTheme;
  gridWidth?: number; // default combat grid width  (squares)
  gridHeight?: number; // default combat grid height (squares)
  campaign?: CampaignData;
  classPrimaryStats: Record<string, 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'>;
  // The curated default skill picks per class (also the fallback when no valid
  // player choice is supplied).
  classSkills: Record<string, string[]>;
  // 2024 SRD "choose N from options" class skill proficiencies. The creation
  // flow offers these; `classSkills` is the default selection.
  classSkillChoices?: Record<string, { count: number; options: string[] }>;
  classHitDie: Record<string, number>;
  classArmorProficiencies?: Record<string, string[]>; // class → ['light','medium','heavy','shield']
  classWeaponProficiencies?: Record<string, string[]>; // class → ['simple','martial']
  // 5e saving throw proficiencies per class (2 abilities each)
  classSavingThrows?: Record<string, Array<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'>>;
  // Class features that activate during play (sneak_attack, extra_attack, rage, …)
  classFeatures?: Record<string, string[]>;
  // Per-class starting gear — auto-equipped at session start
  classStartingLoot?: Record<string, string[]>; // class → item IDs given at session start
  // 2024 SRD "Choose A/B/C" starting equipment packages per class (items + GP).
  // The creation flow offers these; falls back to `classStartingLoot` when unset.
  classStartingEquipment?: Record<
    string,
    { id: string; label: string; items: string[]; gold: number }[]
  >;
  // Backgrounds — optional list; if present, player picks one at character creation
  backgrounds?: Background[];
  // Spell system — optional; only present for contexts with spellcasting classes
  spellTable?: Record<string, Spell>;
  // Feat system — optional; only present for contexts that surface feat
  // choice at character creation / level-up. Keys match `Character.feats`.
  featTable?: Record<string, Feat>;
  classSpells?: Record<string, string[]>; // class → spell IDs
  // (Spell-slot progression is owned by the engine — `spellSlotsForChar` /
  // `spellSlotsForClassLevel` in rulesEngine — not declared per context.)
  spellcastingAbility?: Record<string, AbilityKey>; // class → casting ability
  enemyTemplates: EnemyTemplate[];
  lootTable: LootItem[];
  rules?: GameRule[];
  narratives: {
    // Per-room arrival flavor moved onto each room's `onEnter` pool (a room's
    // arrival narrative is authored on the room now). `genericArrival` stays the
    // campaign-wide fallback for rooms with no `onEnter`.
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
    deathLines: string[];
    enemyDeflected: string[];
    levelUp: string[];
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
  // The NPC mid-conversation ('' otherwise) — lets a "talk to THIS npc"
  // quest step complete directly, without the set_flag indirection.
  // Optional so condition-less fixtures stay terse; both fact builders
  // (the action route + dialogueFacts) always supply it.
  npc_id?: string;
  // The town the party is currently in (GameState.current_town_id), '' when not
  // in one. Quest steps key on it for "reach <town>" objectives (e.g. the
  // opening arrival quest completing on entering Pinegate).
  current_town_id: string;
  location_id: string;
  enemies_killed: string[];
  loot_taken: string[];
  // Room ids the party has entered (GameState.visited_rooms). Quest steps key on
  // it for "reach <room>" objectives (e.g. the Silent Grove's `step_reach_oak`).
  visited_rooms: string[];
  flags: Record<string, boolean | string | number>;
  campaign_flags: Record<string, boolean | string | number>;
  quest_progress: QuestProgress[];
  faction_rep: Record<string, number>;
  // Derived progress facts — flattened from quest_progress / faction_rep so
  // conditions (quest steps AND dialogue gates) can key on them without
  // fighting the QuestProgress[] array shape:
  //   quests_active / quests_completed — quest ids by status
  //   steps_done — 'questId:stepId' for every completed step
  //   faction_tier — factionId → named tier (factionAttitude over thresholds),
  //     so authors write "millers is friendly" instead of raw rep numbers.
  // Optional in the type (legacy fixtures predate them) but ALWAYS populated
  // by the real builders (the action route + dialogueFacts) via
  // derivedProgressFacts.
  quests_active?: string[];
  quests_completed?: string[];
  steps_done?: string[];
  faction_tier?: Record<string, string>;
  // Party inventory item ids (every member's pack pooled) — dialogue gates key
  // on it for "show him the ledger"-style options. Same always-populated deal.
  party_items?: string[];
  // In-game clock facts. `world_minute` is canonical; `world_day` is derived
  // (floor(world_minute/1440)+1) and kept so quests can key on the day directly.
  world_minute: number;
  world_day: number;
  active_level: number;
  active_class: string;
}

// ─── Locations ────────────────────────────────────────────────────────────────

// `LocationType` is re-exported from ./shared-types (see src/shared/types.ts).

// `District` is re-exported from ./shared-types (see src/shared/types.ts).

// ─── 3-level grid map model (regional → town → local) ────────────────────────
// Every level is a tile grid carrying a `feetPerSquare` scale, grounded in the
// SRD: regional = 5280 (1 square = 1 mile, the Travel-Pace scale), town = 25,
// local rooms = 5 (the tactical combat grid). The party is a SINGLE marker on
// the regional + town grids and while exploring a local room; local combat
// deploys the full party into PC tokens, then collapses back to the marker.
// Each grid has "transition cells": regional `sites`, town `venues`, and a
// room's `exits` — stepping onto one descends / ascends / moves rooms.

export type MapLevel = 'regional' | 'town' | 'local';

// A transition cell on the REGIONAL grid the party can enter.
export interface MapSite {
  id: string;
  name: string;
  pos: GridPos;
  kind: 'town' | 'local' | 'region';
  townId?: string; // kind 'town' → the Town grid to open
  entryRoomId?: string; // kind 'local' → the local room to drop into
  // kind 'region' → a GATE to another region (mountain pass, ferry, the
  // road out). Crossing fires the full region hook matrix; arrival is at
  // `entryPos` when authored, else the target region's startPos.
  regionId?: string;
  entryPos?: GridPos;
  desc?: string;
  // Narration hook — authored flavor appended to the "You enter X." line every
  // time the party lands on this site's square. A variant pool (pick one);
  // persisted as `campaign_narratives` rows (owner_kind 'regionSite').
  onEnter?: string | string[];
  // Overland map glyph for a `local` site (dungeon): a game-icons.net icon name
  // (e.g. 'tombstone', 'ice-iris'). Omitted ⇒ a default dungeon icon. Towns use
  // the village glyph regardless.
  icon?: string;
}

// Narration hooks shared by the three map LEVELS (regions / towns /
// rooms — sites/venues/exits keep their own per-landing onEnter). Enter
// and exit are SCOPE transitions: descending from a town into one of its
// rooms does not exit the town (only the gate does), and entering a town
// does not exit the region. The FIRST variant overrides the plain one on
// the first occurrence; the plain one fires every other time.
export interface LevelNarrationHooks {
  // Each hook is a variant pool — the engine picks ONE at random via
  // `pickHookText` (mapEngine), which accepts a string or string[]. Multi-
  // paragraph narrative lives as newlines inside a variant. Persisted as rows in
  // the `campaign_narratives` table (one row per variant).
  onEnter?: string | string[];
  onFirstEnter?: string | string[];
  onExit?: string | string[];
  onFirstExit?: string | string[];
}

export interface Region extends LevelNarrationHooks {
  id: string;
  name: string;
  desc?: string;
  // (Region first-enter falls back to `desc` when no enter hook is set —
  // game start counts as entering the starting region. Exit hooks fire on
  // crossing a region GATE site to another region.)
  feetPerSquare: number; // 5280 (1 mile per square — SRD Travel Pace scale)
  gridWidth: number;
  gridHeight: number;
  // SRD typed overland terrain (the unified model): passability, travel cost,
  // and encounter rate are derived from each cell's type (see `TERRAIN`).
  // Unlisted cells default to `plains`. Preferred over `obstacles` /
  // `difficultTerrain`, which remain honored for legacy/back-compat.
  terrain?: TerrainCell[];
  obstacles?: GridPos[]; // (legacy) impassable terrain — superseded by `terrain`
  difficultTerrain?: GridPos[]; // (legacy) 2× travel cost — superseded by `terrain`
  startPos: GridPos; // where the party marker begins
  sites: MapSite[];
  // Random travel encounters live ENTIRELY in encounter zones — the region
  // itself carries no encounter chance or table. A square rolls an encounter
  // only if it's painted into a zone whose creature list is non-empty; squares
  // outside every zone never roll. Zones never overlap (one `ez` tag per grid
  // cell — see CampaignRegionCell); `cells` is materialized from those tags by
  // dbRegionsToEngine.
  encounterZones?: EncounterZone[];
}

// A painted intra-region encounter zone — an arbitrary set of squares (`cells`)
// that share a self-contained wilderness encounter pool: a difficulty `tier`
// (which scopes CR-appropriate creatures), a per-square roll `encounterChance`,
// and the `encounterTable` creatures. The sole source of random encounters.
export interface EncounterZone {
  id: string;
  name?: string;
  tier: number; // 1–4 (SRD tiers of play) — gates which CRs the table may hold
  encounterChance: number; // 0–1 per square crossed
  encounterTable?: string[]; // creature names; empty / absent ⇒ the zone never rolls
  cells: GridPos[]; // squares painted into this zone (materialized from grid `ez`)
  // Battleground rooms to fight a rolled encounter in, keyed by the terrain type
  // of the square the ambush triggers on (e.g. 'forest', 'hills'). When the
  // triggering square's terrain has a non-empty list, a room id is picked at
  // random and its tactical/cosmetic layout (floor, obstacles, terrain, cover,
  // lighting) becomes the encounter battleground. No entry, or an empty list,
  // for the terrain ⇒ the default bare arena. The rooms are borrowed as a
  // battleground only — their own enemies/loot/NPCs/exits don't come along.
  arenaRooms?: Record<string, string[]>;
}

// A transition cell on a TOWN grid.
export interface MapVenue {
  id: string;
  name: string;
  pos: GridPos;
  kind: 'interior' | 'gate'; // interior → local entry room; gate → back to the region
  entryRoomId?: string; // kind 'interior'
  desc?: string;
}

export interface Town extends LevelNarrationHooks {
  id: string;
  name: string;
  desc?: string;
  feetPerSquare: number; // 25 (settlement scale)
  gridWidth: number;
  gridHeight: number;
  // Typed terrain (see Region.terrain). Cells default to `plains`; `obstacles`
  // stays honored for legacy maps.
  terrain?: TerrainCell[];
  obstacles?: GridPos[];
  startPos: GridPos;
  venues: MapVenue[];
  // Cosmetic ground texture for the town's bare cells (see Room.floor). Painted
  // cobblestone/garden cells override per-cell; defaults to 'dirt' (packed earth
  // between the cobbled streets) when unset.
  floor?: FloorType;
}
