// ─── Loot ─────────────────────────────────────────────────────────────────────

export interface LootItem {
  id:           string;
  name:         string;
  desc:         string;
  weight:       number;
  type:         'weapon' | 'armor' | 'consumable' | 'misc';
  slot:         'weapon' | 'armor' | null;
  damage:       string | null;
  ac_bonus:     number | null;
  heal:         string | null;
  effect:       string | null;
  aliases:      string[];
  useNarrative?: string;
}

// ─── Seed (procedurally generated world state) ────────────────────────────────

export interface Room {
  id:   string;
  name: string;
  desc: string;
}

export interface EnemyTemplate {
  name:   string;
  cr:     number;
  hp:     number;
  ac:     number;
  damage: string;
  toHit:  number;
  xp:     number;
  dex?:   number;
}

export interface Enemy {
  name:   string;
  hp:     number;
  ac:     number;
  damage: string;
  toHit:  number;
  xp:     number;
  dex?:   number;
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

export interface InventoryItem {
  id:   string;
  name: string;
  [key: string]: unknown;
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
  inventory:       InventoryItem[];
  equipped_weapon: string | null;
  equipped_armor:  string | null;
  current_room:    string;
  visited_rooms:   string[];
  enemies_killed:  string[];
  loot_taken:      string[];
  enemy_hp:        Record<string, number>;
  run_log:         Array<{ action: string; narrative: string }>;
  last_choices?:   string[];
  flags:           Record<string, boolean | string | number>;
  combat_active:   boolean;
  initiative:      { player: number; enemy: number } | null;
  player_first:    boolean;
  turn_actions:    TurnActions;
  death_saves:     DeathSaves;
  stable:          boolean;
  dead:            boolean;
}

// ─── Context (game theme/setting) ─────────────────────────────────────────────

export interface RoomPoolEntry {
  id:    string;
  name:  string;
  descs: string[];
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
  enemyTemplates:   EnemyTemplate[];
  introTexts:       string[];
  roomPool:         RoomPoolEntry[];
  lootTable:        LootItem[];
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
    examineTemplates:string[];
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
