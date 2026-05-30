// Sandbox — 3-level map wiring smoke. Validates the migration off the roguelike
// model: the party starts on the regional grid, enters the dungeon site, and
// steps from the entry hall into the guard post via a room-exit cell. (Sandbox
// is imported by ~150 other specs purely as a Context for class/spell/narrative
// data; this is the only spec that exercises its new campaign navigation.)

import type { Character, GameState, Seed, StructuredAction } from '../types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { context as ctx } from './sandbox.js';
import { generateSeed } from '../services/procgen.js';
import { initMapState } from '../services/mapEngine.js';
import { makeChar } from '../test-fixtures.js';
import { takeAction } from '../services/gameEngine.js';

describe('Sandbox — 3-level map wiring', () => {
  let seed: Seed;
  let state: GameState;

  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    seed = generateSeed(ctx, 3);
    const party: Character[] = [makeChar({ id: 'pc-1', character_class: 'Fighter' })];
    state = {
      characters: party,
      active_character_id: 'pc-1',
      current_room: ctx.startRoomId,
      visited_rooms: [ctx.startRoomId],
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
    } as unknown as GameState;
    state = { ...state, ...initMapState(ctx.campaign, state) };
  });

  afterEach(() => vi.restoreAllMocks());

  async function act(action: StructuredAction): Promise<void> {
    const r = await takeAction({ action, history: [], state, seed, context: ctx });
    state = r.newState;
  }
  const markerMove = (x: number, y: number) => act({ type: 'marker_move', to: { x, y } });

  it('is a campaign that starts on the regional grid and enters the dungeon', () => {
    expect(ctx.mapType).toBe('campaign');
  });

  it('travels region → dungeon entry → guard post via room exits', async () => {
    expect(state.map_level).toBe('regional');
    expect(state.current_region_id).toBe('sandbox_region');
    expect(state.current_room).toBe('');

    await markerMove(3, 2); // The Dungeon site → entry hall
    expect(state.map_level).toBe('local');
    expect(state.current_room).toBe('entry_hall');

    await markerMove(7, 0); // exit cell → guard post
    expect(state.current_room).toBe('guard_post');
  });
});
