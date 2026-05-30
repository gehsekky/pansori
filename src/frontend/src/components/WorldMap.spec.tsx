import type { Character, GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import WorldMap from './WorldMap';
import { context as sandboxCtx } from '../contexts/sandbox.js';

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
  connections: {},
  enemies: {},
  loot: {},
  regions: [
    {
      id: 'reg1',
      name: 'The Wilds',
      feetPerSquare: 5280,
      gridWidth: 6,
      gridHeight: 5,
      startPos: { x: 0, y: 0 },
      sites: [{ id: 's', name: 'Town', pos: { x: 3, y: 2 }, kind: 'town', townId: 't1' }],
    },
  ],
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
    ...stateOverrides,
  };
}

// On the regional grid: activeGrid resolves the region, so the map renders it.
const regionalState = () =>
  makeState(
    {},
    {
      map_level: 'regional',
      current_region_id: 'reg1',
      marker_pos: { x: 0, y: 0 },
      current_room: '',
    }
  );

describe('WorldMap Component', () => {
  it('displays the world name from the seed in the title', () => {
    render(<WorldMap seed={mockSeed} state={regionalState()} onClose={() => {}} />);
    expect(screen.getByText(/The Testing Grounds/i)).toBeTruthy();
  });

  it('renders the active grid (region name + travel points) when on a grid', () => {
    render(<WorldMap seed={mockSeed} state={regionalState()} onClose={() => {}} />);
    // GridMapView header shows the level + current grid name.
    expect(screen.getByText(/REGION · The Wilds/i)).toBeTruthy();
    // The town site is a labelled travel point on the grid.
    expect(screen.getByTitle('Town')).toBeTruthy();
  });

  it('triggers the onClose callback when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<WorldMap seed={mockSeed} state={regionalState()} onClose={onClose} />);
    const closeBtn = screen.getByRole('button', { name: /close|✕/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a fallback note when there is no resolvable grid (e.g. in combat)', () => {
    // Default state has no map_level → activeGrid returns null.
    render(<WorldMap seed={mockSeed} state={makeState()} onClose={() => {}} />);
    expect(screen.getByText(/No map to show here/i)).toBeTruthy();
  });
});
