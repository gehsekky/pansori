// Cross-cutting types shared between the backend (`src/backend/src/`) and
// the frontend (`src/frontend/src/`). This is the single source of truth.
//
// A small sync script (`scripts/sync-shared-types.ts`) copies this file
// into each workspace as `shared-types.ts`, prefixed with an "AUTO-
// GENERATED — do not edit" header. Both `src/backend/src/types.ts` and
// `src/frontend/src/types.ts` re-export from their local copy.
//
// Why not a workspaces package? Each Docker dev container bind-mounts
// only its own workspace; adding a shared package would require
// rewiring Dockerfile build contexts and reworking the npm-install
// flow. The sync-script approach is one file, no Docker changes, and
// has a `--check` mode for CI to catch drift.
//
// What's NOT in here (phase 3, deferred):
//   - `Character`, `GameState` — BE has rich runtime fields; FE has slim
//     subsets. Unifying needs case-by-case decisions on whether to expand
//     FE or slim BE.
//   - `Seed`, `Location`, `Trap`, `Room` — depend on BE-only types
//     (`Enemy`, `BossPhase`, `OnHitEffect`) that would cascade-share.
//   - `Context` vs `FrontendContext` — intentionally separate (BE has
//     `lootTable` / `spellTable` / etc.; FE has `theme` / `art` / etc.).
//   - `EnemyTemplate`, `Enemy`, `Spell`, `BeastForm`, `GameRule`,
//     `RuleFacts`, `CampaignFacts` — BE-only game-engine internals.

// ─── Atoms ───────────────────────────────────────────────────────────

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

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

export type NpcAttitude = 'friendly' | 'indifferent' | 'hostile';

export type CoverLevel = 'none' | 'half' | 'three_quarters' | 'full';

export type LocationType = 'town' | 'dungeon' | 'wilderness';

export type QuestStatus = 'available' | 'active' | 'completed' | 'failed';

// ─── Grid + combat entity ────────────────────────────────────────────

export interface GridPos {
  x: number;
  y: number;
}

export interface CombatEntity {
  id: string; // character.id for PCs, enemy instance id for enemies, owner.id + ':companion' for animal companions
  isEnemy: boolean;
  pos: GridPos;
  /**
   * Current HP.
   * - **Enemies (`isEnemy: true`):** authoritative; the engine mutates
   *   this directly when an enemy takes damage.
   * - **PCs (`isEnemy: false`):** mirror of `characters[].hp`. Writes
   *   MUST route through `commitCharacter(st, char)` (BE) so the
   *   characters[] entry and this mirror stay in sync. Reads from this
   *   field are safe; if you suspect drift, prefer reading
   *   `characters[].hp` by id.
   */
  hp: number;
  maxHp: number;
  /**
   * Active conditions. Same mirror policy as `hp` — for PCs, source
   * of truth is `characters[].conditions`; route writes through
   * `commitCharacter`.
   */
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

// ─── Structured actions ──────────────────────────────────────────────

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
      // Take a feat. When the feat is a half-feat with `choices`,
      // `abilityChoice` records the player's pick. When the feat has
      // a `save-proficiency` effect with empty abilities, the chosen
      // abilities are recorded on Character.feat_choices. For Magic
      // Initiate (`extra-cantrips-and-l1`), the player picks 2 cantrip
      // ids + 1 L1 spell id from the matching list; the engine adds
      // them to `spells_known` and tracks the L1 free-cast token on
      // `class_resource_uses.magic_initiate_l1_used`.
      type: 'take_feat';
      featId: string;
      abilityChoice?: AbilityKey;
      saveProficiencyChoices?: AbilityKey[];
      cantripChoices?: string[];
      l1Choice?: string;
    }
  | { type: 'de_attune'; instanceId: string }
  | {
      // 2024 PHB Influence action — distinct from `talk` (free narrative
      // dialogue). Triggers a CHA-based skill check to change an NPC's
      // mind or coerce an enemy mid-combat. In combat: consumes the
      // Action (no attack that turn). Out of combat: no action cost
      // (the narrative time investment is the cost). DC = max(15, target's
      // INT score). Exactly one of `targetNpcRoomId` / `targetEnemyId` is
      // expected.
      type: 'influence';
      skill: 'persuasion' | 'deception' | 'intimidation';
      targetNpcRoomId?: string;
      targetEnemyId?: string;
    }
  | {
      // 2024 PHB Study action — INT-based mental deduction. Distinct
      // from the legacy `examine` action (which never had formal
      // combat-action status). Lets a player roll INT + skill prof
      // to identify a creature's vulnerabilities / immunities,
      // analyze an object's mechanism, or recall lore. In combat:
      // costs the Action (no attack on a Study turn). Out of combat:
      // no action cost. DC: 15 base for general lore; tuned to CR
      // for creature analysis.
      type: 'study';
      skill: 'arcana' | 'history' | 'investigation' | 'nature' | 'religion';
      targetEnemyId?: string;
      // Free-form lore prompt; reserved for future loremaster flows.
      // The current handler covers creature-analysis only; lore +
      // object branches are TODO.
      loreTopic?: string;
    }
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
  // Lucky feat (2024 PHB Chapter 5). Spend 1 luck point to queue
  // advantage on the next d20 test (mirror of `spend_inspiration`).
  // Requires the Lucky feat + remaining `feat_lucky_uses`. Free of
  // action-economy cost; refills on a long rest.
  | { type: 'use_luck' }
  // Sharpshooter feat (2024 PHB) — toggle the -5 to-hit / +10 damage
  // tradeoff for ranged-weapon attacks this turn. Also suppresses
  // half- and three-quarters-cover AC bonuses on those attacks. Free
  // of action-economy cost; auto-clears on turn end. Toggles state
  // (calling again turns it off).
  | { type: 'toggle_sharpshooter' }
  // Manual level-up into a specific class (2024 PHB multiclassing).
  // Bumps `char.level` + `class_levels[className]` together. Validates
  // XP threshold; for non-primary classes also validates the 2024 PHB
  // multiclass prerequisites (ability-score minimums). Surfaces as a
  // choice when XP crosses the next-level threshold. Out-of-combat
  // only (RAW: level-ups happen during downtime / long rest).
  | { type: 'level_up_class'; className: string }
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
  | { type: 'resolve_reaction'; accept: boolean }
  // Out-of-combat only: switch which PC is the "lead" / active character
  // for subsequent narrative attribution + skill checks. RAW has no
  // notion of initiative outside combat — the party operates as a unit
  // — so the player picks whose voice drives the next interaction.
  // No-op in combat: initiative is driven by the initiative_order.
  | { type: 'set_active_character'; characterId: string };

// ─── Choice metadata (drives FE rendering) ───────────────────────────

// Compass direction tag for grid movement choices — drives the 3x3 D-pad
// on the frontend so it can place each arrow in the right cell.
export type ChoiceDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

// Semantic kind hint for the frontend. Optional: untagged choices fall back
// to the plain text-button rendering. The frontend uses `kind` to route
// choices to specialised renderers (D-pad for grid_move, icon row for the
// default-action universals). New kinds can be added incrementally.
export type ChoiceKind =
  | 'grid_move'
  | 'dash'
  | 'disengage'
  | 'dodge'
  | 'ready'
  | 'attack'
  | 'grapple'
  | 'shove'
  | 'two_weapon_attack'
  | 'cast_spell'
  | 'class_feature';

export interface GameChoice {
  label: string;
  action: StructuredAction;
  requiresBonusAction?: boolean;
  // Optional UI hint. Frontend uses `kind` to pick a renderer (e.g. D-pad
  // for grid_move) and falls back to the standard button list otherwise.
  kind?: ChoiceKind;
  // For kind === 'grid_move': the cardinal/ordinal direction of the move.
  direction?: ChoiceDirection;
  // Hint for the grid renderer: when this is a cast_spell choice for an AoE
  // spell, lets the frontend tint the affected cells on hover without needing
  // the spell catalog or per-shape geometry.
  aoePreview?: {
    shape: 'sphere' | 'cone' | 'cube' | 'line';
    radiusFt: number;
    targetEnemyId?: string;
    rangeKind?: 'self' | 'touch' | 'ranged';
  };
  // Stable key for "this choice has already been used this adventure."
  // When set and the key appears in GameState.seen_choices, the FE dims
  // the button. The backend disambiguates by room / npc / object instance
  // so e.g. two different "Inspect Dirty Chest" objects get distinct keys.
  // Absent on choices that don't benefit from dimming (movement, combat).
  seenKey?: string;
}

// ─── Combat-log events (parallel to prose narrative) ─────────────────

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

// ─── Game-engine consequence type (campaign rules + quest rewards) ───

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
  // Split `amount` XP evenly across all living party members (rounded
  // down). Used for quest completion so the engine can level up the
  // party at milestones rather than only through enemy kills.
  | { type: 'give_xp'; amount: number }
  | { type: 'set_npc_attitude'; npcId: string; attitude: NpcAttitude }
  // Remove one instance of itemId from the party's inventory (any
  // member who carries it). Used for quest turn-ins like the Guild
  // Ledger — when the player hands over a quest item, it should leave
  // their pack.
  | { type: 'consume_item'; itemId: string };

// ─── Room objects + NPCs ─────────────────────────────────────────────

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

export interface NpcShopEntry {
  itemId: string;
  price: number;
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

export interface NpcDialogueResponse {
  label: string;
  reply?: string; // NPC's follow-up text after player picks this
  consequences?: GameConsequence[]; // applied when this response is chosen
}

export interface PlacedNpc extends NpcTemplate {
  roomId: string;
}

// ─── Campaign geography ──────────────────────────────────────────────

export interface District {
  id: string;
  name: string;
  desc: string;
  roomId: string;
}

// ─── Quests + factions (skeleton) ────────────────────────────────────

export interface QuestStep {
  id: string;
  desc: string;
  condition: object; // json-rules-engine TopLevelCondition against CampaignFacts
}

export interface FactionThresholds {
  hostile: number;
  unfriendly: number;
  neutral: number;
  friendly: number;
  // SRD 5.2.1 (Allies & Organisations): the 5th tier above `friendly`.
  // Used by campaign data (grove_of_thorns) and rendered in
  // CampaignPanel; both were referencing this field while the type
  // omitted it — surfaced by the type-share move.
  exalted: number;
}

// ─── Character creation ──────────────────────────────────────────────

export interface Background {
  id: string;
  name: string;
  desc: string;
  skillProficiencies: string[]; // 2 skill names (e.g. 'Perception', 'Stealth')
  // Most backgrounds grant one tool proficiency, but several context
  // backgrounds (Outlander, Soldier, etc.) intentionally omit it.
  // Optional so contexts don't have to pass an explicit `null`.
  toolProficiency?: string | null;
  feature: string;
  featureDesc: string;
  // 2024 PHB additions. Optional so legacy context backgrounds
  // continue to work; new backgrounds should set them.
  /**
   * Origin feat granted automatically at character creation. References
   * a feat id in `Context.featTable`. The 2024 PHB lists one origin
   * feat per background (e.g. Acolyte → Magic Initiate, Farmer → Tough).
   */
  originFeat?: string;
  /**
   * Three abilities the background's +1/+1/+1 or +2/+1 ability score
   * bonus may go into. Display + validation only — players supply
   * final stats at character creation (`stats: { str, dex, ... }`),
   * and the engine doesn't re-apply this delta. Future PRs that move
   * stat-pick UX to the FE will consult this list.
   */
  abilityScoreIncreases?: AbilityKey[];
  /**
   * Item ids granted at character creation in addition to
   * `classStartingLoot`. Empty / undefined → use class-only gear.
   */
  startingEquipment?: string[];
  /**
   * Additional language granted by the background.
   */
  language?: string;
}

// ─── Feats (2024 PHB Chapter 5) ──────────────────────────────────────
//
// A feat is a chunk of mechanical effect a player chooses at
// character creation (origin feats), at ASI levels (general feats),
// at L19 (epic boon feats), or from a class feature (fighting-style
// feats). Some feats are "half-feats" that include a +1 ability
// score bump alongside their main effect.
//
// `effect` is a discriminated union so the engine dispatches feat
// behavior via the `kind` tag (see `services/feats.ts`). Adding a
// new feat is a data entry plus, if it introduces a new effect
// pattern, one new union variant + one new case in the dispatcher.
// Common patterns (passive HP, d20 reroll resource, ranged attack
// toggle, spell list extension, save proficiency) share existing
// kinds so most feats are pure data.

/**
 * Discriminated union of feat effect shapes. Each `kind` corresponds
 * to a dispatch case in `services/feats.ts`. When adding a feat that
 * doesn't fit any existing kind, add a new variant and the matching
 * dispatcher case.
 */
export type FeatEffect =
  | {
      // Passive HP grant per character level (Tough: +2 HP/level).
      kind: 'hp-per-level';
      amount: number;
    }
  | {
      // Per-long-rest resource for rerolling a d20 (Lucky).
      kind: 'd20-reroll';
      usesPerLongRest: number;
    }
  | {
      // Ranged-attack toggle: pre-attack opt-in to swap -toHit for +damage,
      // ignore cover, no long-range disadv (Sharpshooter).
      kind: 'ranged-toggle';
      toHitPenalty: number;
      bonusDamage: number;
      ignoreHalfAndThreeQuartersCover: boolean;
      longRangeNoDisadvantage: boolean;
    }
  | {
      // Extra cantrips + one L1 spell from another class's list,
      // cast 1×/long rest without slot (Magic Initiate).
      kind: 'extra-cantrips-and-l1';
      spellList: 'arcane' | 'divine' | 'primal';
      cantripCount: number;
      l1Count: number;
    }
  | {
      // Save proficiency in chosen abilities (Resilient half-feat).
      kind: 'save-proficiency';
      // Empty here means "choose at take time"; the chosen abilities
      // are recorded on the Character via `feat_choices`.
      abilities: AbilityKey[];
    }
  | {
      // Sentinel feat — protect-ally reaction (PHB 2024). Triggers
      // when an enemy hits an ally within 5 ft. The OA speed-zero
      // benefit is also part of Sentinel but isn't modeled in this
      // engine (pansori's enemy movement is one-step-per-turn so
      // "speed 0 for the rest of the turn" rarely matters).
      kind: 'sentinel-react';
    };

/**
 * Static data shape for a feat. Lives in `context.featTable` keyed by
 * `id`. Players reference feats by id on `Character.feats`.
 */
export interface Feat {
  id: string;
  name: string;
  desc: string;
  category: 'origin' | 'general' | 'fighting-style' | 'epic-boon';
  /**
   * Half-feats grant a +1 ability bump alongside their main effect.
   * - `{ fixed: 'con' }` — always +1 CON (e.g. Durable).
   * - `{ choices: ['str', 'con'] }` — player picks one at take time.
   * Absent → not a half-feat.
   */
  abilityBonus?: { fixed: AbilityKey } | { choices: AbilityKey[] };
  prerequisites?: {
    minLevel?: number;
    minAbilityScores?: Partial<Record<AbilityKey, number>>;
    classes?: string[];
    requiredFeat?: string;
    // Display-only prereq strings the engine doesn't model explicitly
    // ("Spellcasting feature", "Proficiency with martial weapons").
    other?: string[];
  };
  effect: FeatEffect;
}

// ─── Quests + factions (full bodies) ─────────────────────────────────

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

export interface Faction {
  id: string;
  name: string;
  thresholds: FactionThresholds;
  shopPriceModifiers: Record<string, number>; // attitude tier → price multiplier
}

// ─── Campaign state (persisted across sessions) ──────────────────────

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

// ─── Loot ────────────────────────────────────────────────────────────

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
  /**
   * Cursed item flag (PHB p.214). The curse reveals on attunement and
   * voluntary de-attunement is blocked — only Remove Curse / Greater
   * Restoration / equivalent magic can break the bond. Pansori doesn't
   * yet implement those spells, so cursed items are effectively
   * permanent for now; the flag is in place for when remove-curse lands.
   */
  cursed?: boolean;
  /**
   * Display text shown when the curse reveals on attunement. Empty / undefined
   * → a generic fallback narrative is used.
   */
  curseDesc?: string;
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

// ─── Reactive-spell pause shapes ─────────────────────────────────────
//
// When an enemy-on-PC attack hits a reactive-spell trigger (Shield
// before damage, Hellish Rebuke after damage, Counterspell before the
// enemy spell resolves), the engine stashes a PendingReaction with
// enough state to resume the enemy-turn loop after the player decides.

interface PendingReactionBase {
  attackerEnemyId: string;
  targetCharId: string;
  resumeFromInitiativeIdx: number;
  resumeFromMultiattackIdx: number; // 0-indexed; how many sub-attacks already resolved
  narrativeSoFar: string;
  eligibleCharIds: string[];
}

// Shield (PHB p.275). Triggers BEFORE damage applies — accepting negates the
// hit retroactively. The BE stashes a pre-computed proposed snapshot
// (fragment + char + state) so a decline commits them as-rolled and an
// accept discards them — including the concentration-save outcome that
// was rolled at attack time. Discard on accept is the RAW-correct
// behavior: one save per damage TAKEN, not per damage threatened.
//
// `pendingFragment` / `pendingProposedChar` / `pendingProposedSt` are
// typed as `unknown` here because their full shapes (EnemyAttackHitFragment,
// Character, GameState) live in BE-only modules (`services/narrative/
// fragments.ts` and the BE Character/GameState definitions); the FE
// doesn't introspect them — it just round-trips the pending_reaction
// state. BE narrows via cast.
export interface PendingShieldReaction extends PendingReactionBase {
  kind: 'shield';
  atkTotal: number; // to-hit total that triggered the [AC, AC+4] window
  targetAcAtAttack: number;
  pendingFragment: unknown;
  pendingProposedChar: unknown;
  pendingProposedSt: unknown;
}

// Hellish Rebuke (PHB p.252). Triggers AFTER damage applies — accepting deals
// 2d10 fire damage back to the attacker (DEX save for half). No state to
// stash: the damage that triggered Rebuke is already on the books, and a
// decline just lets the enemy turn continue.
export interface PendingHellishRebukeReaction extends PendingReactionBase {
  kind: 'hellish_rebuke';
}

// Uncanny Dodge (PHB Rogue L5). Triggers BEFORE damage commits when
// the Rogue can see the attacker — accepting halves the damage from
// that one attack. Pre-built proposed snapshot is stashed the same
// way as Shield: accept ⇒ halve damage in the snapshot, commit;
// decline ⇒ commit the full-damage snapshot. Same proposed-state
// `unknown` typing as Shield (BE narrows via cast).
export interface PendingUncannyDodgeReaction extends PendingReactionBase {
  kind: 'uncanny_dodge';
  atkTotal: number;
  /** Full proposed damage before halving — for narrative display. */
  proposedDamage: number;
  pendingFragment: unknown;
  pendingProposedChar: unknown;
  pendingProposedSt: unknown;
}

// Absorb Elements (PHB p.211, 1st-level abjuration). Reaction
// triggered when the caster takes acid / cold / fire / lightning /
// thunder damage. Accepting consumes a level-1+ slot, halves the
// triggering damage. (RAW also grants resistance to that type
// until the start of your next turn AND a +1d6 bonus to the
// caster's next melee attack — both deferred as follow-ups; MVP
// halves the trigger only.) Same proposed-snapshot stash pattern
// as Shield / Uncanny Dodge.
export interface PendingAbsorbElementsReaction extends PendingReactionBase {
  kind: 'absorb_elements';
  damageType: 'acid' | 'cold' | 'fire' | 'lightning' | 'thunder';
  proposedDamage: number;
  pendingFragment: unknown;
  pendingProposedChar: unknown;
  pendingProposedSt: unknown;
}

// Sentinel feat (PHB 2024) — protect-ally reaction. Triggered when
// an enemy attack hits an ally within 5 ft of a Sentinel-feat PC who
// is NOT the target. The Sentinel can use their reaction to make a
// melee weapon attack against the attacker. (The feat also grants
// an OA speed-zero benefit which is a passive modifier to OAs — not
// modeled here.) No proposed-snapshot stash: the triggering attack
// already committed; this reaction is a counter-attack, not a
// modifier.
export interface PendingSentinelReaction extends PendingReactionBase {
  kind: 'sentinel';
  /** The enemy id whose attack triggered this Sentinel window. */
  triggerAttackerEnemyId: string;
}

// Silvery Barbs (Strixhaven origin spell, 1st-level enchantment).
// Reaction triggered when a creature within 60 ft succeeds on an
// attack roll, ability check, or saving throw. Accepting consumes a
// L1+ slot and forces the triggering creature to reroll the d20,
// using the lower result. (RAW also grants advantage to one ally on
// their next d20 test within the next minute — that follow-up is
// deferred; MVP handles the reroll only.) `proposedD20` is the
// enemy's original d20 result; the resolver rolls a new d20, takes
// the lower, and re-evaluates the hit.
export interface PendingSilveryBarbsReaction extends PendingReactionBase {
  kind: 'silvery_barbs';
  atkTotal: number;
  proposedD20: number;
  proposedDamage: number;
  targetAc: number;
  pendingFragment: unknown;
  pendingProposedChar: unknown;
  pendingProposedSt: unknown;
}

// Counterspell (PHB p.228). Triggers BEFORE the enemy spell resolves —
// accepting consumes a slot on the PC and negates the enemy spell.
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
  | PendingCounterspellReaction
  | PendingUncannyDodgeReaction
  | PendingAbsorbElementsReaction
  | PendingSilveryBarbsReaction
  | PendingSentinelReaction;
