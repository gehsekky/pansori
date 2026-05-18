import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { context as sandboxCtx } from '../contexts/sandbox.js';
import type { GameState, Character, Seed } from '../types.js';
import WorldMap from './WorldMap';

afterEach(() => vi.restoreAllMocks());

// ─── Fixtures ─────────────────────────────────────────────────────────────────
// Following the pattern established in src/backend/src/services/gameEngine.spec.ts

const mockSeed: Seed = {
  context_id: sandboxCtx.id,
  world_name: 'The Testing Grounds',
  ship_name: 'The Testing Grounds',
  intro: 'Unit test intro.',
  rooms: [
    { id: 'room-1', name: 'Start Room', desc: 'Initial room.' },
    { id: 'room-2', name: 'Hallway', desc: 'A transition.' },
  ],
  connections: {
    'room-1': ['room-2'],
    'room-2': ['room-1'],
  },
  enemies: {},
  loot: {},
};

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id: 'char-1',
    name: 'Test Hero',
    character_class: 'Soldier',
    portrait_url: null,
    hp: 10,
    max_hp: 10,
    ac: 10,
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
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
    class_resource_uses: {},
    asi_pending: false,
    exhaustion_level: 0,
    background_id: null,
    skill_proficiencies: [],
    tool_proficiencies: [],
    spell_slots_max: {},
    spell_slots_used: {},
    spells_known: [],
    armor_proficiencies: [],
    weapon_proficiencies: [],
    attuned_items: [],
    initiative_roll: null,
    ...overrides,
  };
}

function makeState(
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
    npc_attitudes: {},
    npc_talked: [],
    traps_triggered: [],
    traps_disarmed: [],
    objects_searched: [],
    flags: {},
    enemy_conditions: [],
    ...stateOverrides,
  };
}

describe('WorldMap Component', () => {
  it('renders correctly and displays the world name from the seed', () => {
    render(<WorldMap seed={mockSeed} state={makeState()} onClose={() => {}} />);
    // Verify the world name is rendered in the UI
    expect(screen.getByText(/The Testing Grounds/i)).toBeTruthy();
  });

  it('renders room names defined in the seed', () => {
    render(
      <WorldMap
        seed={mockSeed}
        state={makeState({}, { visited_rooms: ['room-1', 'room-2'] })}
        onClose={() => {}}
      />
    );
    expect(screen.getByText(/start room/i)).toBeTruthy();
    expect(screen.getByText(/hallway/i)).toBeTruthy();
  });

  it('triggers the onClose callback when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<WorldMap seed={mockSeed} state={makeState()} onClose={onClose} />);

    // Assumes the component contains a button with "Close" or an "✕" icon label
    const closeBtn = screen.getByRole('button', { name: /close|✕/i });
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders safely even with an empty room list', () => {
    const emptySeed = { ...mockSeed, rooms: [] };
    render(<WorldMap seed={emptySeed} state={makeState()} onClose={() => {}} />);
    expect(screen.getByText(/The Testing Grounds/i)).toBeTruthy();
  });
});
