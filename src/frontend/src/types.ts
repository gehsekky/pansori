import type { ReactNode } from 'react';

// ─── Structured actions ───────────────────────────────────────────────────────

export type StructuredAction =
  | { type: 'move';       roomId: string }
  | { type: 'attack' }
  | { type: 'loot' }
  | { type: 'use';        itemId: string; targetCharId?: string }
  | { type: 'sneak' }
  | { type: 'escape' }
  | { type: 'examine' }
  | { type: 'death_save' }
  | { type: 'pass' }
  | { type: 'short_rest' }
  | { type: 'long_rest' };

export interface GameChoice {
  label:  string;
  action: StructuredAction;
}

export interface Theme {
  pageBg:     string;
  cardBg:     string;
  font:       string;
  primary:    string;
  mid:        string;
  dim:        string;
  dimDark:    string;
  border:     string;
  separator:  string;
  itemColor:  string;
  hpHigh:     string;
  hpMid:      string;
  hpLow:      string;
  title:      string;
  worldLabel: string;
}

export interface CharClass {
  id:   string;
  desc: string;
}

export interface FrontendContext {
  id:               string;
  displayName:      string;
  tagline:          string;
  previewArt:       string;
  classes:          CharClass[];
  theme:            Theme;
  itemIcons:        Record<string, ReactNode>;
  itemDescs:        Record<string, string>;
  art:              Record<string, string>;
  classPrimaryStats: Record<string, string>;
  classSkills:      Record<string, string[]>;
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
  inventory:       Array<{ instance_id: string; id: string; name: string; desc?: string; [key: string]: unknown }>;
  equipped_weapon: string | null;
  equipped_armor:  string | null;
  equipped_shield: string | null;
  conditions:          string[];
  condition_durations: Record<string, number>;
  death_saves:         { successes: number; failures: number };
  stable:              boolean;
  dead:                boolean;
  turn_actions:        { action_used: boolean; bonus_action_used: boolean; reaction_used: boolean; free_interaction_used: boolean };
  initiative_roll:     number | null;
  hit_die:             number;
  hit_dice_remaining:  number;
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

  // Script engine flags
  flags: Record<string, boolean | string | number>;
}

export interface Seed {
  context_id:  string;
  world_name:  string;
  ship_name:   string;
  intro:       string;
  rooms:       Array<{ id: string; name: string; desc: string }>;
  connections: Record<string, string[]>;
  enemies?:    Record<string, unknown>;
  loot?:       Record<string, unknown>;
}

export interface Session {
  id:              string;
  character_name:  string;
  character_class: string;
  status:          string;
  portrait_url:    string | null;
  seed:            Seed;
  state:           GameState;
}

export interface SessionSummary {
  id:              string;
  character_name:  string;
  character_class: string;
  status:          string;
  portrait_url:    string | null;
  context_id:      string;
  created_at:      string;
  updated_at:      string;
}
