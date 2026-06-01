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
  Faction,
  FactionThresholds,
  GameChoice,
  GridPos,
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
  TerrainCell,
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

// Slim spell shape the FE needs for the Magic Initiate spell picker
// and (eventually) the spell prep / scroll-write UX. Mirrors the BE
// Spell type but drops the runtime-execution fields (resolveOnHit,
// resolveOnSave, etc.) the FE never reads. Carries the `spellList`
// tag so the picker can filter by 'arcane' / 'divine' / 'primal'.
export interface SpellSummary {
  id: string;
  name: string;
  level: number;
  desc: string;
  spellList: Array<'arcane' | 'divine' | 'primal'>;
}

// Slim feat shape the FE needs to know which origin feats require a
// chooser at character creation. Mirrors the BE Feat type but drops
// take-time handlers. The `effect` discriminator is kept so the FE
// can dispatch (today only `extra-cantrips-and-l1` routes to a UI).
export interface FeatSummary {
  id: string;
  name: string;
  desc: string;
  effect: { kind: string; [k: string]: unknown };
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
  died_at_round?: number;
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
  // Multiplayer ownership: the userId of the human controlling this PC.
  // Mirror of the backend Character.owner_user_id — see BE types for the
  // long explanation.
  owner_user_id?: string;
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
  // When set, a fight just resolved — the FE shows a "Continue" gate instead of
  // auto-switching back to exploration. Cleared by the `continue` action.
  combat_over_pending?: boolean;
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
  cutting_words_penalty?: number;
  round?: number;

  // Reactive spell window — see backend PendingReaction.
  pending_reaction?: PendingReaction;

  // Active NPC conversation — see backend GameState. When set (out of combat,
  // in the NPC's room), the dedicated ConversationPanel renders `prompt` + the
  // `kind:'conversation'` choices. `path` indexes the nested response tree.
  active_conversation?: { roomId: string; path: number[]; prompt: string };

  // Structured combat event log — see backend CombatEvent. Mirror of state.
  combat_log?: CombatEvent[];

  // Campaign overlay
  current_location_id?: string;
  current_district_id?: string;
  campaign_flags?: Record<string, boolean | string | number>;
  quest_progress?: QuestProgress[];
  faction_rep?: Record<string, number>;
  world_day?: number;
  world_hour?: number;

  // 3-level grid map (regional → town → local). `map_level` is which grid the
  // party is on; `marker_pos` is the single party-marker cell. Mirror of the BE
  // GameState fields; the FE resolves the active grid from the seed + these.
  map_level?: MapLevel;
  current_region_id?: string;
  current_town_id?: string;
  marker_pos?: GridPos;

  // Choice-dimming memory — keys of choices already clicked this
  // adventure. Mirror of the backend field.
  seen_choices?: string[];
}

// `RoomObject` is re-exported from ./shared-types (see src/shared/types.ts).

// ─── 3-level grid map (regional → town → local) ────────────────────────────────
// Mirror of the backend map types (src/backend/src/types.ts). The FE only
// receives the seed (not the campaign), so the seed carries the grid
// definitions and the FE resolves the active grid client-side (lib/activeGrid).

export type MapLevel = 'regional' | 'town' | 'local';

// A per-cell room connection on a local grid.
export interface RoomExit {
  pos: GridPos;
  toRoomId?: string; // omitted when `ascends`
  entrancePos?: GridPos; // arrival cell in `toRoomId`
  label?: string;
  ascends?: boolean; // leave the site → back to town / region
}

// A transition cell on the regional grid.
export interface MapSite {
  id: string;
  name: string;
  pos: GridPos;
  kind: 'town' | 'local';
  townId?: string;
  entryRoomId?: string;
  desc?: string;
}

export interface Region {
  id: string;
  name: string;
  desc?: string;
  feetPerSquare: number;
  gridWidth: number;
  gridHeight: number;
  terrain?: TerrainCell[];
  obstacles?: GridPos[];
  difficultTerrain?: GridPos[];
  startPos: GridPos;
  sites: MapSite[];
  encounterTable?: string[];
  encounterChance?: number;
}

// A transition cell on a town grid.
export interface MapVenue {
  id: string;
  name: string;
  pos: GridPos;
  kind: 'interior' | 'gate';
  entryRoomId?: string;
  desc?: string;
}

export interface Town {
  id: string;
  name: string;
  desc?: string;
  feetPerSquare: number;
  gridWidth: number;
  gridHeight: number;
  terrain?: TerrainCell[];
  obstacles?: GridPos[];
  startPos: GridPos;
  venues: MapVenue[];
}

// The normalized grid the party marker is on (mirror of mapEngine.ActiveGrid),
// computed by lib/activeGrid from the seed + state.
export interface MapTransition {
  pos: GridPos;
  kind: 'site' | 'venue' | 'room_exit' | 'ascend';
  label: string;
  toTownId?: string;
  toRoomId?: string;
  entrancePos?: GridPos;
  ascendTo?: 'town' | 'region';
}

export interface ActiveGrid {
  level: MapLevel;
  id: string;
  name: string;
  width: number;
  height: number;
  feetPerSquare: number;
  // Typed terrain for the current grid (empty for grids that don't author it,
  // e.g. local rooms). Impassable terrain is also folded into `obstacles`.
  terrain: TerrainCell[];
  obstacles: GridPos[];
  transitions: MapTransition[];
  startPos: GridPos;
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
    lighting?: 'bright' | 'dim' | 'dark' | 'sunlight';
    // Static obstacles (columns, walls, debris) — render-only on the FE,
    // the engine reads these from the matching BE Room for cover and to
    // block movement through these cells.
    obstacles?: GridPos[];
    difficultTerrain?: GridPos[];
    // Local-room grid fields (3-level map). Mirror of the BE Room grid fields.
    gridWidth?: number;
    gridHeight?: number;
    feetPerSquare?: number;
    entryPos?: GridPos;
    exits?: RoomExit[];
  }>;
  enemies?: Record<string, Array<{ id: string; name: string; hp: number; ac: number }>>;
  loot?: Record<string, unknown>;
  npcs?: Record<string, PlacedNpc>;
  // 3-level grid map definitions (copied from the campaign at seed time).
  regions?: Region[];
  towns?: Town[];
}

export interface Session {
  id: string;
  character_name: string;
  character_class: string;
  status: string;
  portrait_url: string | null;
  seed: Seed;
  state: GameState;
  // Multiplayer (PR 4): the userId of the original creator (the host).
  // Stays populated as the single point of authority for delete + token
  // rotation + assign-character. Non-host participants see this to know
  // whose session they're in.
  user_id?: string;
  // Multiplayer (PR 4): shareable token. URL form: ?join=<token>.
  // Host can rotate via api.rotateInvite. NULL on pre-MP sessions
  // until the host opens the invite dialog and triggers a rotate.
  invite_token?: string | null;
  // Multiplayer race detection: monotonically increasing per session.
  // Bumped on every successful takeAction. The client sends its
  // last-known value with each action; the server returns 409 on
  // mismatch (stale state). Optional for pre-MP sessions that load
  // before the migration runs.
  turn_seq?: number;
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

// ─── Campaign metadata (delivered alongside session payload) ─────────────────

export interface CampaignMeta {
  quests: Quest[];
  factions: Faction[];
}
