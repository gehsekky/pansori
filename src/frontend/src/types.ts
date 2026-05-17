import type { ReactNode } from 'react';

// ─── Structured actions ───────────────────────────────────────────────────────

export type StructuredAction =
  | { type: 'move';      roomId: string }
  | { type: 'attack' }
  | { type: 'loot' }
  | { type: 'use';       itemId: string }
  | { type: 'sneak' }
  | { type: 'escape' }
  | { type: 'examine' }
  | { type: 'death_save' };

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

export interface GameState {
  hp:              number;
  max_hp:          number;
  ac:              number;
  str:             number;
  dex:             number;
  con:             number;
  int:             number;
  wis:             number;
  cha:             number;
  gold:            number;
  xp:              number;
  level:           number;
  character_class: string;
  inventory:       Array<{ instance_id: string; id: string; name: string; desc?: string; [key: string]: unknown }>;
  equipped_weapon: string | null;
  equipped_armor:  string | null;
  equipped_shield: string | null;
  current_room:    string;
  visited_rooms:   string[];
  enemies_killed:  string[];
  loot_taken:      string[];
  enemy_hp:        Record<string, number>;
  run_log:         Array<{ action: string; narrative: string }>;
  room_log:        string[];
  last_choices?:   GameChoice[];
  conditions:      string[];
  flags:           Record<string, boolean | string | number>;
  combat_active:   boolean;
  dead:            boolean;
  stable:          boolean;
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
