// Grove of Thorns — 3-level map wiring smoke. Validates the campaign's
// migration off the old connections/move model: the party starts on the
// regional grid, travels into Pinegate (town) and its venues, grabs Mareth's
// charm, then crosses into the grove via the regional site. Combat is proven
// by the Vale playthrough; this focuses on the migration-specific risk —
// region/town/site coordinates + room exit cells lining up.

import type { Character, GameState, Seed, StructuredAction } from '../types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { context as ctx } from './grove_of_thorns.js';
import { generateSeed } from '../services/procgen.js';
import { initMapState } from '../services/mapEngine.js';
import { makeChar } from '../test-fixtures.js';
import { takeAction } from '../services/gameEngine.js';

describe('Grove of Thorns — 3-level map wiring', () => {
  let seed: Seed;
  let state: GameState;

  beforeEach(() => {
    // Misses every random encounter roll so travel is deterministic.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    seed = generateSeed(ctx, 3);
    const party: Character[] = [
      makeChar({ id: 'pc-1', character_class: 'Druid' }),
      makeChar({ id: 'pc-2', character_class: 'Cleric' }),
      makeChar({ id: 'pc-3', character_class: 'Fighter' }),
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

  it('starts on the regional grid and travels region → town → venues → grove', async () => {
    expect(state.map_level).toBe('regional');
    expect(state.current_region_id).toBe('verdant_reach');
    expect(state.marker_pos).toEqual({ x: 1, y: 3 });
    expect(state.current_room).toBe('');

    // Into Pinegate (town), then the Village Square venue (Old Elise).
    await markerMove(2, 3);
    expect(state.map_level).toBe('town');
    expect(state.current_town_id).toBe('pinegate_town');
    await markerMove(1, 2);
    expect(state.current_room).toBe('pinegate_square');
    await markerMove(3, 0); // ascend back to the town grid
    expect(state.map_level).toBe('town');

    // The Burnt Stump venue — grab Mareth's charm.
    await markerMove(4, 2);
    expect(state.current_room).toBe('pinegate_lodge');
    await act({ type: 'loot' });
    expect(state.characters.flatMap((c) => c.inventory).some((i) => i.id === 'circle_charm')).toBe(
      true
    );
    await markerMove(3, 0);

    // Leave town through the village edge → back to the region.
    await markerMove(3, 5);
    expect(state.map_level).toBe('regional');

    // Cross into the grove (a regional local site): bridge → entrance.
    await markerMove(7, 2);
    expect(state.map_level).toBe('local');
    expect(state.current_room).toBe('thornwater_bridge');
    await markerMove(7, 3);
    expect(state.current_room).toBe('grove_entrance');
  });
});
