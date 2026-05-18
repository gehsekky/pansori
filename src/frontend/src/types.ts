import type { ReactNode } from 'react';

// ─── Structured actions ───────────────────────────────────────────────────────

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export type StructuredAction =
  | { type: 'move'; roomId: string }
  | { type: 'attack' }
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
  | { type: 'use_class_feature'; featureId: string }
  | { type: 'apply_asi'; stat: AbilityKey }
  | { type: 'cast_spell'; spellId: string; slotLevel: number; ritual?: boolean }
  | { type: 'disarm_trap' }
  | { type: 'interact_object'; objectId: string }
  | { type: 'two_weapon_attack' }
  | { type: 'attune'; instanceId: string }
  | { type: 'grapple' }
  | { type: 'try_escape_grapple' }
  | { type: 'stand_up' }
  | { type: 'shove' }
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
  | { type: 'prepare_spells'; spellIds: string[] };

export interface GameChoice {
  label: string;
  action: StructuredAction;
  requiresBonusAction?: boolean;
}

export interface Theme {
  pageBg: string;
  cardBg: string;
  font: string;
  primary: string;
  mid: string;
  dim: string;
  dimDark: string;
  border: string;
  separator: string;
  itemColor: string;
  hpHigh: string;
  hpMid: string;
  hpLow: string;
  title: string;
  worldLabel: string;
}

export interface CharClass {
  id: string;
  desc: string;
}

export interface Background {
  id: string;
  name: string;
  desc: string;
  skillProficiencies: string[];
  toolProficiency: string | null;
  feature: string;
  featureDesc: string;
}

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
  armorCategory?: 'light' | 'medium' | 'heavy' | 'shield';
  weaponType?: 'simple' | 'martial';
  light?: boolean;
  requiresAttunement?: boolean;
  armorAcBase?: number;
  dexCapToAc?: number;
  versatileDamage?: string;
  damageType?: string;
  thrown?: { normalRange: number; longRange: number };
}

export interface FrontendContext {
  id: string;
  displayName: string;
  tagline: string;
  previewArt: string;
  classes: CharClass[];
  theme: Theme;
  itemIcons: Record<string, ReactNode>;
  itemDescs: Record<string, string>;
  art: Record<string, string>;
  classPrimaryStats: Record<string, string>;
  classSkills: Record<string, string[]>;
  classFeatures?: Record<string, string[]>;
  backgrounds?: Background[];
  // Authoring hint mirrored from the backend context. Shown on the character
  // creation screen so players know what the encounters are tuned for.
  recommendedPartySize?: number;
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
  inventory: Array<{
    instance_id: string;
    id: string;
    name: string;
    desc?: string;
    [key: string]: unknown;
  }>;
  equipped_weapon: string | null;
  equipped_armor: string | null;
  equipped_shield: string | null;
  conditions: string[];
  condition_durations: Record<string, number>;
  death_saves: { successes: number; failures: number };
  stable: boolean;
  dead: boolean;
  turn_actions: {
    action_used: boolean;
    bonus_action_used: boolean;
    reaction_used: boolean;
    free_interaction_used: boolean;
    dodging?: boolean;
    disengaged?: boolean;
    reckless?: boolean;
    leveled_spell_cast?: boolean;
    quickened_used?: boolean;
    movement_budget_remaining?: number;
    readied_action?: { trigger: string; action: StructuredAction };
  };
  initiative_roll: number | null;
  hit_die: number;
  hit_dice_remaining: number;
  class_resource_uses: Record<string, number>;
  asi_pending: boolean;
  exhaustion_level: number;
  background_id: string | null;
  skill_proficiencies: string[];
  tool_proficiencies: string[];
  spell_slots_max: Record<number, number>;
  spell_slots_used: Record<number, number>;
  spells_known: string[];
  armor_proficiencies: string[];
  weapon_proficiencies: string[];
  attuned_items: string[]; // instance_ids of attuned magic items (max 3)
  concentrating_on?: { spellId: string; condition?: string } | null;
  subclass?: string;
  speed?: number;
  feats?: string[];
  expertise_skills?: string[];
  prepared_spells?: string[];
  charmer_id?: string;
  darkvision_ft?: number;
  temp_hp?: number;
}

// ─── NPC system ───────────────────────────────────────────────────────────────

export type NpcAttitude = 'friendly' | 'indifferent' | 'hostile';

export interface NpcShopEntry {
  itemId: string;
  price: number;
}

export interface NpcDialogueResponse {
  label: string;
  reply?: string;
}

export interface NpcTemplate {
  id: string;
  name: string;
  attitude: NpcAttitude;
  hp: number;
  ac: number;
  damage: string;
  toHit: number;
  xp: number;
  dex?: number;
  greeting: string;
  responses: NpcDialogueResponse[];
  persuasionDC?: number;
  shop?: NpcShopEntry[];
}

export interface PlacedNpc extends NpcTemplate {
  roomId: string;
}

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
  npc_attitudes: Record<string, NpcAttitude>;
  npc_talked: string[];

  // Trap state
  traps_triggered: string[];
  traps_disarmed: string[];

  // Object interaction — keys are "roomId:objectId"
  objects_searched: string[];

  // Script engine flags
  flags: Record<string, boolean | string | number>;

  // Grid combat (campaign dungeons only)
  entities?: CombatEntity[];
  movement_used?: Record<string, number>;
  help_target_id?: string;
  surprised?: string[];
  metamagic_active?: string;
  guided_strike_active?: boolean;
  vow_of_enmity_target?: string;
  cutting_words_penalty?: number;
  round?: number;

  // Campaign overlay
  current_location_id?: string;
  current_district_id?: string;
  campaign_flags?: Record<string, boolean | string | number>;
  quest_progress?: QuestProgress[];
  faction_rep?: Record<string, number>;
  world_day?: number;
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

export interface Seed {
  context_id: string;
  world_name: string;
  ship_name: string;
  intro: string;
  rooms: Array<{
    id: string;
    name: string;
    desc: string;
    objects?: RoomObject[];
    lighting?: 'bright' | 'dim' | 'dark';
  }>;
  connections: Record<string, string[]>;
  enemies?: Record<string, Array<{ id: string; name: string; hp: number; ac: number }>>;
  loot?: Record<string, unknown>;
  npcs?: Record<string, PlacedNpc>;
}

export interface Session {
  id: string;
  character_name: string;
  character_class: string;
  status: string;
  portrait_url: string | null;
  seed: Seed;
  state: GameState;
}

export interface SessionSummary {
  id: string;
  character_name: string;
  character_class: string;
  status: string;
  portrait_url: string | null;
  context_id: string;
  created_at: string;
  updated_at: string;
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

export type CoverLevel = 'none' | 'half' | 'three_quarters' | 'full';

// ─── Grid combat ─────────────────────────────────────────────────────────────

export interface GridPos {
  x: number;
  y: number;
}

export interface CombatEntity {
  id: string;
  isEnemy: boolean;
  pos: GridPos;
  hp: number;
  maxHp: number;
  conditions: string[];
  condition_durations: Record<string, number>;
  isCompanion?: boolean;
  companionOwnerId?: string;
  companionName?: string;
  ac?: number;
  toHit?: number;
  damage?: string;
  grappled_by?: string;
}

// ─── Quest system ─────────────────────────────────────────────────────────────

export type QuestStatus = 'available' | 'active' | 'completed' | 'failed';

export interface QuestStep {
  id: string;
  desc: string;
  condition: object;
}

export interface Quest {
  id: string;
  title: string;
  desc: string;
  giverNpcId?: string;
  steps: QuestStep[];
  rewards: unknown[]; // GameConsequence union (mirrored from backend)
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
  shopPriceModifiers: Record<string, number>;
}

// ─── Campaign state ───────────────────────────────────────────────────────────

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
  gridWidth?: number;
  gridHeight?: number;
  connections?: string[];
}

// ─── Campaign metadata (delivered alongside session payload) ─────────────────

export interface CampaignMeta {
  quests: Quest[];
  factions: Faction[];
  locations: Location[];
}
