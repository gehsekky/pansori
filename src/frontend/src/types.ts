import type { ReactNode } from 'react';

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
  id:          string;
  displayName: string;
  tagline:     string;
  previewArt:  string;
  classes:     CharClass[];
  theme:       Theme;
  itemIcons:   Record<string, ReactNode>;
  itemDescs:   Record<string, string>;
  weaponNames: Record<string, string>;
  armorNames:  Record<string, string>;
  art:         Record<string, string>;
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
  inventory:       Array<{ id: string; name: string; desc?: string; [key: string]: unknown }>;
  equipped_weapon: string | null;
  equipped_armor:  string | null;
  current_room:    string;
  visited_rooms:   string[];
  enemies_killed:  string[];
  loot_taken:      string[];
  enemy_hp:        Record<string, number>;
  run_log:         Array<{ action: string; narrative: string }>;
  last_choices?:   string[];
  combat_active:   boolean;
  dead:            boolean;
  stable:          boolean;
}

export interface Seed {
  context_id: string;
  world_name: string;
  ship_name:  string;
  intro:      string;
  rooms:      Array<{ id: string; name: string; desc: string }>;
}

export interface Session {
  id:              string;
  character_name:  string;
  character_class: string;
  status:          string;
  seed:            Seed;
  state:           GameState;
}
