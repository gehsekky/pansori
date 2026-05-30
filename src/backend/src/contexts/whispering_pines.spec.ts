// Whispering Pines — 3-level map wiring smoke. Validates the campaign's
// migration off the Location/District model: the party starts on the regional
// grid, visits the village's three venues, then climbs to the Iceshard Spire
// via the regional site and steps from the entrance into the Frozen Hall.
// Combat is proven by the Vale playthrough; this focuses on the migration-
// specific risk — region/town/site coordinates + room exit cells lining up.

import type { Character, GameState, Seed, StructuredAction } from '../types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { context as ctx } from './whispering_pines.js';
import { generateSeed } from '../services/procgen.js';
import { initMapState } from '../services/mapEngine.js';
import { makeChar } from '../test-fixtures.js';
import { takeAction } from '../services/gameEngine.js';

describe('Whispering Pines — 3-level map wiring', () => {
  let seed: Seed;
  let state: GameState;

  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // miss every encounter roll
    seed = generateSeed(ctx, 3);
    const party: Character[] = [
      makeChar({ id: 'pc-1', character_class: 'Fighter' }),
      makeChar({ id: 'pc-2', character_class: 'Cleric' }),
      makeChar({ id: 'pc-3', character_class: 'Wizard' }),
    ];
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

  it('travels region → village venues → spire, room exits resolving', async () => {
    expect(state.map_level).toBe('regional');
    expect(state.current_region_id).toBe('frostpass_region');
    expect(state.marker_pos).toEqual({ x: 1, y: 3 });
    expect(state.current_room).toBe('');

    // Into the village (town), then each of the three venues.
    await markerMove(2, 3);
    expect(state.map_level).toBe('town');
    expect(state.current_town_id).toBe('pines_village');

    await markerMove(1, 1); // Pine Tavern (Brann)
    expect(state.current_room).toBe('pines_tavern');
    await markerMove(3, 0);

    await markerMove(4, 1); // Trapper's Lodge (Marta)
    expect(state.current_room).toBe('pines_lodge');
    await markerMove(3, 0);

    await markerMove(1, 4); // Warden Post (Riese)
    expect(state.current_room).toBe('pines_warden');
    await markerMove(3, 0);

    // Leave town → region, then up to the Iceshard Spire site.
    await markerMove(3, 5);
    expect(state.map_level).toBe('regional');
    await markerMove(9, 4);
    expect(state.map_level).toBe('local');
    expect(state.current_room).toBe('spire_entrance');

    // Step from the entrance into the Frozen Hall via the room-exit cell.
    await markerMove(9, 0);
    expect(state.current_room).toBe('spire_frozen_hall');
  });
});
