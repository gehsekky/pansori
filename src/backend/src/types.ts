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
}

// ─── Seed (procedurally generated world state) ────────────────────────────────

export interface Room {
  id:      string;
  name:    string;
  desc:    string;
  canRest?: boolean;
}

export type ConditionName =
  | 'paralyzed' | 'stunned' | 'poisoned' | 'prone' | 'frightened'
  | 'blinded' | 'restrained' | 'incapacitated' | 'grappled' | 'invisible' | 'exhaustion';

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
  dex?:        number;
  wis?:        number;
  onHitEffect?: OnHitEffect;
}

export interface Enemy {
  name:        string;
  hp:          number;
  ac:          number;
  damage:      string;
  toHit:       number;
  xp:          number;
  dex?:        number;
  wis?:        number;
  onHitEffect?: OnHitEffect;
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

export interface TurnActions {
  action_used:           boolean;
  bonus_action_used:     boolean;
  reaction_used:         boolean;
  free_interaction_used: boolean;
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
  | { type: 'apply_asi';         stat: AbilityKey };

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

  // Script engine flags
  flags: Record<string, boolean | string | number>;
}

// ─── Script engine rules ──────────────────────────────────────────────────────

export type GameConsequence =
  | { type: 'add_narrative'; text: string }
  | { type: 'set_flag';      key: string; value: boolean | string | number }
  | { type: 'give_item';     itemId: string; characterId?: string }
  | { type: 'modify_hp';     amount: number; characterId?: string }
  | { type: 'unlock_room';   roomId: string }
  | { type: 'spawn_enemy';   roomId: string; enemyId: string }
  | { type: 'set_escape' };

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
  id:    string;
  name:  string;
  descs: string[];
}

export interface CampaignData {
  world_name:    string;
  intro:         string;
  rooms:         Room[];
  connections:   Record<string, string[]>;
  enemies?:      Record<string, Enemy>;
  loot?:         Record<string, LootItem>;
  startingLoot?: string[];
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
  campaign?:          CampaignData;
  classPrimaryStats:  Record<string, 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'>;
  classSkills:        Record<string, string[]>;
  classHitDie:        Record<string, number>;
  // 5e saving throw proficiencies per class (2 abilities each)
  classSavingThrows?: Record<string, Array<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'>>;
  // Class features that activate during play (sneak_attack, extra_attack, rage, …)
  classFeatures?:     Record<string, string[]>;
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
    levelUp:         string;
    noEscapeNearby:  string;
    escapeBlocked:   string;
  };
}
