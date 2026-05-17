import type { Character, FrontendContext, GameState, Seed } from '../types.js';

export function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id: 'char-1',
    name: 'Test Hero',
    character_class: 'Soldier',
    portrait_url: null,
    hp: 10,
    max_hp: 10,
    ac: 10,
    str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
    gold: 5,
    xp: 0,
    level: 1,
    inventory: [],
    equipped_weapon: null,
    equipped_armor: null,
    equipped_shield: null,
    conditions: [],
    condition_durations: {},
    death_saves: { successes: 0, failures: 0 },
    stable: false,
    dead: false,
    turn_actions: {
      action_used: false,
      bonus_action_used: false,
      reaction_used: false,
      free_interaction_used: false,
    },
    hit_die: 8,
    hit_dice_remaining: 1,
    initiative_roll: null,
    ...overrides,
  };
}

export function makeState(
  charOverrides: Partial<Character> = {},
  stateOverrides: Partial<GameState> = {}
): GameState {
  const char = makeChar(charOverrides);
  return {
    characters: [char],
    active_character_id: char.id,
    current_room: 'room-1',
    visited_rooms: ['room-1'],
    enemies_killed: [],
    loot_taken: [],
    enemy_hp: {},
    combat_active: false,
    initiative_order: [],
    initiative_idx: 0,
    run_log: [],
    room_log: [],
    last_choices: [],
    short_rested_rooms: [],
    long_rested: false,
    flags: {},
    ...stateOverrides,
  };
}

export const mockSeed: Seed = {
  context_id: 'scifi-terror',
  world_name: 'USCSS Testing Ground',
  ship_name: 'USCSS Testing Ground',
  intro: 'Unit test intro.',
  rooms: [
    { id: 'room-1', name: 'Start Room', desc: 'Initial room.' },
    { id: 'room-2', name: 'Hallway', desc: 'A transition.' },
  ],
  connections: { 'room-1': ['room-2'], 'room-2': ['room-1'] },
  enemies: {},
  loot: {},
};

export const mockCtx: FrontendContext = {
  id: 'scifi-terror',
  displayName: 'Sci-Fi Terror',
  tagline: 'Survive the horror.',
  previewArt: '',
  classes: [],
  theme: {
    pageBg: '#000',
    cardBg: '#111',
    font: 'monospace',
    primary: '#0f0',
    mid: '#888',
    dim: '#555',
    dimDark: '#222',
    border: '#444',
    separator: '#333',
    itemColor: '#aaa',
    hpHigh: '#0f0',
    hpMid: '#ff0',
    hpLow: '#f00',
    title: 'Test',
    worldLabel: 'SHIP',
  },
  itemIcons: {},
  itemDescs: {},
  art: {},
  classPrimaryStats: {},
  classSkills: {},
};
