// Cross-cutting types live in src/shared/types.ts (single source of
// truth) and are synced into this workspace by `npm run sync-types`.
// Re-export here so external importers can keep using these names from
// `./types`; the internal `import type { ... }` line below also brings
// them into this file's own scope so the workspace-only interfaces
// can reference them.
export * from './shared-types.js';
import type {
  AbilityKey,
  Background,
  CampaignState,
  ChoiceDirection,
  ChoiceKind,
  CombatEntity,
  CombatEvent,
  ConditionName,
  CoverLevel,
  District,
  Faction,
  FactionThresholds,
  GameChoice,
  GridPos,
  LocationType,
  NpcAttitude,
  NpcTemplate,
  PendingReaction,
  PlacedNpc,
  Quest,
  QuestProgress,
  QuestStatus,
  QuestStep,
  RoomObject,
  StructuredAction,
  WeaponMastery,
} from './shared-types.js';
import type { ReactNode } from 'react';

// ─── Structured actions ───────────────────────────────────────────────────────

// `AbilityKey` is re-exported from ./shared-types (see src/shared/types.ts).

// `StructuredAction` is re-exported from ./shared-types (see src/shared/types.ts).

// `ChoiceDirection` is re-exported from ./shared-types (see src/shared/types.ts).
// `ChoiceKind` is re-exported from ./shared-types (see src/shared/types.ts).

// `GameChoice` is re-exported from ./shared-types (see src/shared/types.ts).

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

// `Background` is re-exported from ./shared-types (see src/shared/types.ts).

// `LootItem` is re-exported from ./shared-types (see src/shared/types.ts).

// `WeaponMastery` is re-exported from ./shared-types (see src/shared/types.ts).

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
  // Per-campaign class composition the auto-fill button uses. Falls back to a
  // generic size-based template when unset (Fighter/Cleric/Rogue for 3, etc.).
  recommendedComposition?: string[];
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
    inspiration_pending?: boolean;
    cunning_strike_pending?: 'trip' | 'poison' | 'withdraw' | 'disarm';
    movement_budget_remaining?: number;
    readied_action?: { trigger: string; action: StructuredAction };
    monk_free_used?: boolean;
    monk_stunning_strike_used?: boolean;
    tactical_master_mastery?: 'push' | 'sap' | 'slow';
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
  weapon_masteries?: string[];
  bardic_inspiration_die?: string;
  wild_shape_form?: string;
  attuned_items: string[]; // instance_ids of attuned magic items (max 3)
  concentrating_on?: {
    spellId: string;
    condition?: string;
    // Round budget for the active concentration spell — ticks down each
    // round wrap and the spell ends when it hits 0. Mirrors the backend
    // Character.concentrating_on shape (src/backend/src/types.ts:468).
    rounds_left?: number;
  } | null;
  subclass?: string;
  speed?: number;
  feats?: string[];
  expertise_skills?: string[];
  prepared_spells?: string[];
  charmer_id?: string;
  darkvision_ft?: number;
  temp_hp?: number;
  inspiration?: boolean;
  hide_dc?: number;
  condition_sources?: Record<string, string>;
  species?: string;
}

// ─── NPC system ───────────────────────────────────────────────────────────────

// `NpcAttitude` is re-exported from ./shared-types (see src/shared/types.ts).

// `NpcShopEntry` is re-exported from ./shared-types (see src/shared/types.ts).

// `NpcDialogueResponse` is re-exported from ./shared-types (see src/shared/types.ts).

// `NpcTemplate` is re-exported from ./shared-types (see src/shared/types.ts).

// `PlacedNpc` is re-exported from ./shared-types (see src/shared/types.ts).

// ─── Game state (world/party container) ──────────────────────────────────────


// `PendingShieldReaction` is re-exported from ./shared-types (see src/shared/types.ts).

// `PendingHellishRebukeReaction` is re-exported from ./shared-types (see src/shared/types.ts).

// `PendingCounterspellReaction` is re-exported from ./shared-types (see src/shared/types.ts).

// `PendingReaction` is re-exported from ./shared-types (see src/shared/types.ts).

// Structured combat events — see backend/types.ts for the canonical
// definition + narrative-vs-mechanics rationale.
// `CombatEvent` is re-exported from ./shared-types (see src/shared/types.ts).

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

  // Reactive spell window — see backend PendingReaction.
  pending_reaction?: PendingReaction;

  // Structured combat event log — see backend CombatEvent. Mirror of state.
  combat_log?: CombatEvent[];

  // Campaign overlay
  current_location_id?: string;
  current_district_id?: string;
  campaign_flags?: Record<string, boolean | string | number>;
  quest_progress?: QuestProgress[];
  faction_rep?: Record<string, number>;
  world_day?: number;
}

// `RoomObject` is re-exported from ./shared-types (see src/shared/types.ts).

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
  // Leader display fields derived from `state.characters[0]` on the server.
  // Stay populated for backward compat with the session-list rendering.
  character_name: string;
  character_class: string;
  portrait_url: string | null;
  // Total party size (1-4). Used to render "& N companions" when > 1.
  party_size: number;
  status: string;
  context_id: string;
  created_at: string;
  updated_at: string;
}

// `ConditionName` is re-exported from ./shared-types (see src/shared/types.ts).

// `CoverLevel` is re-exported from ./shared-types (see src/shared/types.ts).

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

// ─── Campaign state ───────────────────────────────────────────────────────────

// `CampaignState` is re-exported from ./shared-types (see src/shared/types.ts).

// ─── Locations ────────────────────────────────────────────────────────────────

// `LocationType` is re-exported from ./shared-types (see src/shared/types.ts).

// `District` is re-exported from ./shared-types (see src/shared/types.ts).

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
