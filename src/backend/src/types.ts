// ─── Loot ─────────────────────────────────────────────────────────────────────

export interface LootItem {
  id:           string;
  name:         string;
  desc:         string;
  weight:       number;
  type:         'weapon' | 'armor' | 'consumable' | 'misc';
  slot:         'weapon' | 'armor' | 'shield' | null;
  damage:       string | null;
  finesse?:     boolean;
  range?:       'melee' | 'ranged';
  ac_bonus:     number | null;
  heal:         string | null;
  effect:       string | null;
  aliases:      string[];
  useNarrative?: string;
  armorCategory?: 'light' | 'medium' | 'heavy' | 'shield';
  weaponType?:    'simple' | 'martial';
  light?:              boolean;    // TWF: can be used in off-hand with another light weapon
  requiresAttunement?: boolean;   // magic items requiring attunement
  armorAcBase?:     number;       // base AC of armor when worn (e.g. leather=11, chain mail=16)
  dexCapToAc?:      number;       // max DEX bonus added to AC (2=medium, 0=heavy; undefined=full DEX)
  versatileDamage?: string;       // two-handed damage for versatile weapons (e.g. '1d8' for quarterstaff)
  damageType?:      string;       // piercing / slashing / bludgeoning / fire / etc.
  thrown?:          { normalRange: number; longRange: number };  // melee weapon usable as ranged
}

// ─── Seed (procedurally generated world state) ────────────────────────────────

export interface Trap {
  id:           string;
  name:         string;
  desc:         string;            // flavour description shown when detected
  dc:           number;            // Perception DC to detect; Dexterity DC to disarm
  damage:       string;            // dice expr on trigger (e.g. '2d6')
  damageType:   string;
  condition?:   ConditionName;     // optional condition applied on trigger
  conditionDuration?: number;      // rounds; undefined = until cleared
  triggerNarrative:  string;       // text when trap fires (use {name}, {dmg})
  detectNarrative:   string;       // text when party spots the trap
  disarmSuccess:     string;       // text on successful disarm
  disarmFail:        string;       // text on failed disarm (trap fires)
}

export interface RoomObject {
  id:           string;
  name:         string;
  desc:         string;
  interactText: string;
  searchable?:  boolean;
  searchDC?:    number;
  lootIds?:     string[];
  foundText?:   string;
  emptyText?:   string;
}

export interface Room {
  id:       string;
  name:     string;
  desc:     string;
  canRest?: boolean;
  trap?:    Trap;                  // static trap defined in context; can be overridden per-room
  objects?: RoomObject[];
  difficultTerrain?: GridPos[];   // squares costing 2× movement to enter
  coverPositions?:   GridPos[];   // squares granting half cover (+2 AC) to occupant
}

export type ConditionName =
  | 'paralyzed' | 'stunned' | 'poisoned' | 'prone' | 'frightened'
  | 'blinded' | 'restrained' | 'incapacitated' | 'grappled' | 'invisible' | 'exhaustion'
  | 'charmed' | 'unconscious' | 'deafened' | 'petrified';

export interface OnHitEffect {
  condition: ConditionName;
  ability:   'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  dc:        number;
}

export interface EnemyTemplate {
  name:        string;
  cr:          number;
  hp:          number;
  ac:          number;
  damage:      string;
  toHit:       number;
  xp:          number;
  str?:        number;
  dex?:        number;
  con?:        number;
  int?:        number;
  wis?:        number;
  cha?:        number;
  onHitEffect?: OnHitEffect;
  multiattack?:         number;    // number of attacks per turn (default 1)
  resistances?:         string[];  // damage types dealt at half damage
  vulnerabilities?:     string[];  // damage types dealt at double damage
  immunities?:          string[];  // damage types that deal no damage
  condition_immunities?: string[]; // conditions that cannot be applied
  damageType?:          string;    // primary damage type for this enemy's attack
}

export interface Enemy {
  name:        string;
  hp:          number;
  ac:          number;
  damage:      string;
  toHit:       number;
  xp:          number;
  str?:        number;
  dex?:        number;
  con?:        number;
  int?:        number;
  wis?:        number;
  cha?:        number;
  onHitEffect?: OnHitEffect;
  multiattack?:         number;
  resistances?:         string[];
  vulnerabilities?:     string[];
  immunities?:          string[];
  condition_immunities?: string[];
}

export interface Seed {
  context_id:  string;
  world_name:  string;
  ship_name:   string;
  intro:       string;
  rooms:       Room[];
  connections: Record<string, string[]>;
  enemies:     Record<string, Enemy>;
  loot:        Record<string, LootItem>;
  npcs:        Record<string, PlacedNpc>;
  seed_id:     string;
}

// ─── Game state ───────────────────────────────────────────────────────────────

export type CoverLevel = 'none' | 'half' | 'three_quarters' | 'full';

export interface TurnActions {
  action_used:           boolean;
  bonus_action_used:     boolean;
  reaction_used:         boolean;
  free_interaction_used: boolean;
  dodging?:              boolean;   // Dodge action: enemy attacks have disadvantage until next turn
  disengaged?:           boolean;   // Disengage action: no opportunity attacks this turn
  movement_budget_remaining?: number;  // feet remaining this turn; initialized to speed at turn start
  readied_action?: {
    trigger: string;
    action:  StructuredAction;
  };
}

export interface DeathSaves {
  successes: number;
  failures:  number;
}

// ─── NPC system ───────────────────────────────────────────────────────────────

export type NpcAttitude = 'friendly' | 'indifferent' | 'hostile';

export interface NpcShopEntry {
  itemId: string;
  price:  number;
}

export interface NpcDialogueResponse {
  label:        string;
  reply?:       string;           // NPC's follow-up text after player picks this
  consequences?: GameConsequence[]; // applied when this response is chosen
}

export interface NpcTemplate {
  id:            string;
  name:          string;
  attitude:      NpcAttitude;
  // Stat block — used when attitude becomes hostile or player attacks
  hp:            number;
  ac:            number;
  damage:        string;
  toHit:         number;
  xp:            number;
  dex?:          number;
  // Social
  greeting:      string;
  responses:     NpcDialogueResponse[];
  persuasionDC?: number;          // CHA check DC when indifferent (default 12)
  // Trade
  shop?:         NpcShopEntry[];
}

export interface PlacedNpc extends NpcTemplate {
  roomId: string;
}

// ─── Backgrounds ──────────────────────────────────────────────────────────────

export interface Background {
  id:               string;
  name:             string;
  desc:             string;
  skillProficiencies:   string[];          // 2 skill names (e.g. 'Perception', 'Stealth')
  toolProficiency?:     string;            // 1 tool (e.g. "Thieves' Tools")
  feature:              string;            // name of the narrative feature
  featureDesc:          string;            // one-sentence description shown in UI
}

// ─── Spell system ─────────────────────────────────────────────────────────────

export interface Spell {
  id:                  string;
  name:                string;
  desc:                string;
  level:               number;          // 0 = cantrip
  castTime:            'action' | 'bonus_action';
  damage?:             string;          // dice expr, e.g. '8d6'
  damageType?:         string;
  savingThrow?:        AbilityKey;
  saveEffect?:         'half' | 'negates';
  attackRoll?:         boolean;         // true = uses spell attack roll vs enemy AC
  heal?:               string;          // dice expr for healing
  condition?:          ConditionName;
  conditionDuration?:  number;          // rounds; undefined = permanent until cleared
  narrative?:          string;          // override text for utility spells
  concentration?:      boolean;         // true = breaks if caster takes damage and fails CON save
  upcastBonus?:        string;          // extra dice per slot above base level, e.g. '1d6'
  blastRadius?:        number;          // AOE radius in feet; undefined = single target
  ritualCasting?:      boolean;         // castable as ritual (no slot cost, only out of combat)
  verbal?:             boolean;         // has verbal component (blocked when deafened)
}

// ─── Structured actions ───────────────────────────────────────────────────────

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export type StructuredAction =
  | { type: 'move';              roomId: string }
  | { type: 'attack' }
  | { type: 'loot' }
  | { type: 'use';               itemId: string; targetCharId?: string }
  | { type: 'sneak' }
  | { type: 'escape' }
  | { type: 'examine' }
  | { type: 'death_save' }
  | { type: 'pass' }
  | { type: 'end_turn' }
  | { type: 'short_rest' }
  | { type: 'long_rest' }
  | { type: 'talk' }
  | { type: 'talk_response';     responseIdx: number }
  | { type: 'buy';               itemId: string; price: number }
  | { type: 'attack_npc' }
  | { type: 'use_class_feature'; featureId: string }
  | { type: 'apply_asi';         stat: AbilityKey }
  | { type: 'cast_spell';        spellId: string; slotLevel: number; ritual?: boolean }
  | { type: 'disarm_trap' }
  | { type: 'interact_object';   objectId: string }
  | { type: 'two_weapon_attack' }
  | { type: 'attune';            instanceId: string }
  | { type: 'grapple' }
  | { type: 'shove' }
  | { type: 'dodge' }
  | { type: 'disengage' }
  | { type: 'grid_move';        entityId: string; to: GridPos }
  | { type: 'travel';           locationId: string }
  | { type: 'enter_district';   districtId: string }
  | { type: 'accept_quest';     questId: string }
  | { type: 'complete_quest';   questId: string }
  | { type: 'dash' }
  | { type: 'help';             targetId: string }
  | { type: 'ready';            trigger: string; action: StructuredAction }
  | { type: 'use_reaction' }
  | { type: 'select_subclass';  subclass: string }
  | { type: 'prepare_spells';   spellIds: string[] };

export interface GameChoice {
  label:              string;
  action:             StructuredAction;
  requiresBonusAction?: boolean;
}

export interface InventoryItem {
  instance_id: string;
  id:          string;
  name:        string;
  [key: string]: unknown;
}

// ─── Character (per-character state) ─────────────────────────────────────────

export interface Character {
  id:              string;
  name:            string;
  character_class: string;
  portrait_url:    string | null;
  hp:              number;
  max_hp:          number;
  ac:              number;
  str:             number;
  dex:             number;
  con:             number;
  int:             number;
  wis:             number;
  cha:             number;
  xp:              number;
  level:           number;
  gold:            number;
  inventory:       InventoryItem[];
  equipped_weapon: string | null;
  equipped_armor:  string | null;
  equipped_shield: string | null;
  conditions:          string[];
  condition_durations: Record<string, number>;
  death_saves:         DeathSaves;
  stable:              boolean;
  dead:                boolean;
  turn_actions:        TurnActions;
  initiative_roll:     number | null;
  hit_die:             number;
  hit_dice_remaining:  number;
  // Per-rest class resource pools (e.g. rage_uses, action_surge)
  class_resource_uses: Record<string, number>;
  // True when the character has levelled up to an ASI level and hasn't chosen their improvement yet
  asi_pending:         boolean;
  // 0 = none; 1–6 = exhaustion level per 5e PHB (cumulative penalties)
  exhaustion_level:    number;
  // Background
  background_id:       string | null;
  skill_proficiencies: string[];   // from background + class (e.g. ['Perception', 'Stealth'])
  tool_proficiencies:  string[];   // from background (e.g. ["Thieves' Tools"])
  // Spell system — slots keyed by spell level (1 = 1st-level, etc.)
  spell_slots_max:     Record<number, number>;
  spell_slots_used:    Record<number, number>;
  spells_known:        string[];   // spell IDs from context.spellTable
  // 5e proficiencies (populated at session creation from context tables)
  armor_proficiencies:  string[];  // e.g. ['light', 'medium', 'shield']
  weapon_proficiencies: string[];  // e.g. ['simple', 'martial']
  attuned_items: string[];  // instance_ids of attuned magic items (max 3)
  concentrating_on?: { spellId: string; condition?: string } | null;
  // Extended 5e fields
  subclass?:         string;        // e.g. 'battle_master', 'thief', 'evoker'
  speed?:            number;        // movement speed in feet; defaults to 30
  feats?:            string[];
  expertise_skills?: string[];      // skills with double proficiency bonus (Rogue/Bard)
  prepared_spells?:  string[];      // spell ids currently prepared (Cleric/Paladin/Druid)
  charmer_id?:       string;        // entity id of the charmer when charmed
}

// ─── Game state (world/party container) ──────────────────────────────────────

export interface GameState {
  // Party
  characters:          Character[];
  active_character_id: string;

  // World
  current_room:   string;
  visited_rooms:  string[];
  enemies_killed: string[];
  loot_taken:     string[];
  enemy_hp:       Record<string, number>;

  // Combat (party-level)
  combat_active:    boolean;
  initiative_order: Array<{ id: string; roll: number; is_enemy: boolean }>;
  initiative_idx:   number;

  // Logging
  run_log:       Array<{ character_id: string; action: string; narrative: string }>;
  room_log:      string[];
  last_choices?: GameChoice[];

  // Rest tracking
  short_rested_rooms: string[];
  long_rested:        boolean;

  // NPC state
  npc_attitudes: Record<string, NpcAttitude>;  // roomId → current attitude
  npc_talked:    string[];                      // roomIds where player has talked

  // Trap state — rooms where the trap has already fired or been disarmed
  traps_triggered: string[];   // roomIds where trap fired
  traps_disarmed:  string[];   // roomIds where trap was disarmed

  // Object interaction — keys are "roomId:objectId"
  objects_searched: string[];

  // Script engine flags
  flags: Record<string, boolean | string | number>;

  // Enemy conditions for current room (cleared on room change or enemy death)
  enemy_conditions: string[];

  // Grid combat (campaign dungeons only)
  entities?:       CombatEntity[];
  movement_used?:  Record<string, number>;  // entityId → feet moved this turn
  help_target_id?: string;                  // char id receiving Help action advantage
  surprised?:      string[];                // entity ids surprised at combat start (skip first turn)

  // Campaign overlay (merged from CampaignState at session load)
  current_location_id?: string;
  current_district_id?: string;
  campaign_flags?:      Record<string, boolean | string | number>;
  quest_progress?:      QuestProgress[];
  faction_rep?:         Record<string, number>;   // factionId → numeric rep
  world_day?:           number;
}

// ─── Script engine rules ──────────────────────────────────────────────────────

export type GameConsequence =
  | { type: 'add_narrative'; text: string }
  | { type: 'set_flag';      key: string; value: boolean | string | number }
  | { type: 'give_item';     itemId: string; characterId?: string }
  | { type: 'modify_hp';     amount: number; characterId?: string }
  | { type: 'unlock_room';   roomId: string }
  | { type: 'spawn_enemy';   roomId: string; enemyId: string }
  | { type: 'set_escape' }
  | { type: 'advance_quest';    questId: string; stepId: string }
  | { type: 'set_faction_rep';  factionId: string; delta: number }
  | { type: 'travel_to';        locationId: string }
  | { type: 'give_gold';        amount: number }
  | { type: 'set_npc_attitude'; npcId: string; attitude: NpcAttitude };

export interface GameRule {
  name:         string;
  priority?:    number;      // higher = evaluated first; default 1
  conditions:   object;      // json-rules-engine TopLevelCondition
  consequences: GameConsequence[];
  once?:        boolean;     // auto-sets flags.rule_fired_<name> so it never fires again
}

// ─── Script engine facts ──────────────────────────────────────────────────────

export interface RuleFacts {
  action:            string;
  room_id:           string;
  prev_room_id:      string;
  visited_rooms:     string[];
  enemies_killed:    string[];
  loot_taken:        string[];
  combat_active:     boolean;
  flags:             Record<string, boolean | string | number>;
  active_hp:         number;
  active_max_hp:     number;
  active_level:      number;
  active_class:      string;
  active_conditions: string[];
}

// ─── Context (game theme/setting) ─────────────────────────────────────────────

export interface RoomPoolEntry {
  id:      string;
  name:    string;
  descs:   string[];
  trap?:   Trap;        // optional; if present, included in the generated Room for this entry
  objects?: RoomObject[];
}

export interface CampaignData {
  world_name:    string;
  intro:         string;
  rooms:         Room[];
  connections:   Record<string, string[]>;
  enemies?:      Record<string, Enemy>;
  loot?:         Record<string, LootItem>;
  startingLoot?: string[];
  locations?:    Location[];
  quests?:       Quest[];
  factions?:     Faction[];
}

export type TieredNarrative = string[] | Record<string, string[]>;

export interface Context {
  id:               string;
  worldNoun:        string;
  startRoomId:      string;
  escapeRoomId:     string;
  escapeTriggers:   string[];
  escapeChoiceText: string;
  worldNames:       string[];
  mapType:            'roguelike' | 'campaign';
  gridEnabled?:       boolean;     // enable grid-based combat for this context
  gridWidth?:         number;      // default combat grid width  (squares)
  gridHeight?:        number;      // default combat grid height (squares)
  campaign?:          CampaignData;
  classPrimaryStats:        Record<string, 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'>;
  classSkills:              Record<string, string[]>;
  classHitDie:              Record<string, number>;
  classArmorProficiencies?: Record<string, string[]>;  // class → ['light','medium','heavy','shield']
  classWeaponProficiencies?: Record<string, string[]>; // class → ['simple','martial']
  // 5e saving throw proficiencies per class (2 abilities each)
  classSavingThrows?: Record<string, Array<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'>>;
  // Class features that activate during play (sneak_attack, extra_attack, rage, …)
  classFeatures?:     Record<string, string[]>;
  // Per-class starting gear — auto-equipped at session start
  classStartingLoot?: Record<string, string[]>;  // class → item IDs given at session start
  // Backgrounds — optional list; if present, player picks one at character creation
  backgrounds?:         Background[];
  // Spell system — optional; only present for contexts with spellcasting classes
  spellTable?:          Record<string, Spell>;
  classSpells?:         Record<string, string[]>;        // class → spell IDs
  // classSpellSlots[class][level-1] → Record<spellLevel, maxSlots>
  classSpellSlots?:     Record<string, Array<Record<number, number>>>;
  spellcastingAbility?: Record<string, AbilityKey>;      // class → casting ability
  enemyTemplates:   EnemyTemplate[];
  introTexts:       string[];
  roomPool:         RoomPoolEntry[];
  lootTable:        LootItem[];
  rules?:           GameRule[];
  npcTemplates?:    NpcTemplate[];
  npcSpawnChance?:  number;        // 0–1 chance per room in roguelike mode (default 0)
  narratives: {
    roomArrival:     Record<string, string[]>;
    genericArrival:  string[];
    weaponVerbs:     Record<string, string[]>;
    classStyle:      Record<string, string[]>;
    enemyReactions:  Record<string, string[]>;
    deathSaveStatus: Record<number, string[]>;
    combatHit:       TieredNarrative;
    combatMiss:      TieredNarrative;
    enemyAttacks:    string[];
    killShot:        string[];
    lootPickedUp:    string[];
    noLoot:          string[];
    alreadyLooted:   string[];
    noEnemy:         string[];
    alreadyDead:     string[];
    sneakSuccess:    string[];
    sneakFail:       string[];
    deathLines:      string[];
    escapeLines:     string[];
    enemyDeflected:  string[];
    levelUp:         string[];
    noEscapeNearby:  string[];
    escapeBlocked:   string[];
    // Optional overrides for otherwise hard-coded engine text
    combatStart?:    string[];   // prefix before "Initiative: X → Y"; {enemy} substituted
    shortRest?:      string[];   // flavor before HP numbers; {name} {hpGained} {hpNow} {hpMax} substituted
    longRest?:       string[];   // flavor before per-character HP summary; {party} substituted
  };
}

// ─── Grid combat ─────────────────────────────────────────────────────────────

export interface GridPos { x: number; y: number; }

export interface CombatEntity {
  id:                  string;           // character.id for PCs, roomId for enemies
  isEnemy:             boolean;
  pos:                 GridPos;
  hp:                  number;
  maxHp:               number;
  conditions:          string[];
  condition_durations: Record<string, number>;
}

// ─── Quest system ─────────────────────────────────────────────────────────────

export type QuestStatus = 'available' | 'active' | 'completed' | 'failed';

export interface QuestStep {
  id:        string;
  desc:      string;
  condition: object;   // json-rules-engine TopLevelCondition against CampaignFacts
}

export interface Quest {
  id:          string;
  title:       string;
  desc:        string;
  giverNpcId?: string;
  steps:       QuestStep[];
  rewards:     GameConsequence[];
  factionId?:  string;
  repGain?:    number;
}

export interface QuestProgress {
  questId:        string;
  status:         QuestStatus;
  completedSteps: string[];
}

// ─── Faction system ───────────────────────────────────────────────────────────

export interface FactionThresholds {
  hostile:    number;
  unfriendly: number;
  neutral:    number;
  friendly:   number;
  exalted:    number;
}

export interface Faction {
  id:                 string;
  name:               string;
  thresholds:         FactionThresholds;
  shopPriceModifiers: Record<string, number>;  // attitude tier → price multiplier
}

// ─── Campaign state (persists across sessions) ────────────────────────────────

export interface CampaignState {
  campaign_id:      string;
  user_id:          string;
  world_day:        number;
  current_location: string;
  flags:            Record<string, boolean | string | number>;
  quests:           QuestProgress[];
  faction_rep:      Record<string, number>;
  npc_attitudes:    Record<string, NpcAttitude>;
}

// ─── Campaign facts (evaluated against quest step conditions) ─────────────────

export interface CampaignFacts {
  action:          string;
  room_id:         string;
  location_id:     string;
  enemies_killed:  string[];
  loot_taken:      string[];
  flags:           Record<string, boolean | string | number>;
  campaign_flags:  Record<string, boolean | string | number>;
  quest_progress:  QuestProgress[];
  faction_rep:     Record<string, number>;
  world_day:       number;
  active_level:    number;
  active_class:    string;
}

// ─── Locations ────────────────────────────────────────────────────────────────

export type LocationType = 'town' | 'dungeon' | 'wilderness';

export interface District {
  id:     string;
  name:   string;
  desc:   string;
  roomId: string;
}

export interface Location {
  id:               string;
  name:             string;
  type:             LocationType;
  desc:             string;
  districts?:       District[];
  rooms?:           Room[];
  gridWidth?:       number;
  gridHeight?:      number;
  connections?:     string[];
  encounterTable?:  string[];
  encounterChance?: number;
}
