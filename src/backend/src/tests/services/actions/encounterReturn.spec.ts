// Wilderness-ambush return bug: when an encounter interrupts travel ONTO a site
// cell (a town / POI), resolveMarkerMove skips the destination transition, so
// after combat the party is parked on the site cell with no room entered — and
// can't re-enter it ("already there"). `continue` (the post-combat gate) should
// descend into that pending transition so the player lands where they were
// heading.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '../../../types.js';
import { context as ctx } from '../../../campaignData/sandbox.js';
import { generateSeed } from '../../../services/procgen.js';
import { makeChar } from '../../../test-fixtures.js';
import { takeAction } from '../../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

describe('continue after a wilderness ambush', () => {
  it('descends into the destination site instead of parking on the cell', async () => {
    const pc = makeChar({ id: 'pc-1' });
    // sandbox_region's site_dungeon sits at (3,2) and opens into entry_hall.
    // Simulate the post-ambush return: back on the regional grid, marker on the
    // site cell, no room entered, the combat-over gate up.
    const state = {
      characters: [pc],
      active_character_id: 'pc-1',
      map_level: 'regional',
      current_region_id: 'sandbox_region',
      current_room: '',
      marker_pos: { x: 3, y: 2 },
      combat_over_pending: true,
      combat_active: false,
      visited_rooms: [],
      enemies_killed: [],
      loot_taken: [],
      run_log: [],
      room_log: [],
    } as unknown as GameState;
    const seed = generateSeed(ctx, 1);

    const result = await takeAction({
      action: { type: 'continue' },
      history: [],
      state,
      seed,
      context: ctx,
    });

    expect(result.newState.combat_over_pending).toBe(false);
    // Descended into the dungeon site rather than left on the region cell.
    expect(result.newState.map_level).toBe('local');
    expect(result.newState.current_room).toBe('entry_hall');
  });

  it('a plain (non-site) ambush cell just clears the gate, no descent', async () => {
    const pc = makeChar({ id: 'pc-1' });
    const state = {
      characters: [pc],
      active_character_id: 'pc-1',
      map_level: 'regional',
      current_region_id: 'sandbox_region',
      current_room: '',
      marker_pos: { x: 0, y: 0 }, // an empty plains cell, no site
      combat_over_pending: true,
      combat_active: false,
      visited_rooms: [],
      enemies_killed: [],
      loot_taken: [],
      run_log: [],
      room_log: [],
    } as unknown as GameState;
    const seed = generateSeed(ctx, 1);

    const result = await takeAction({
      action: { type: 'continue' },
      history: [],
      state,
      seed,
      context: ctx,
    });

    expect(result.newState.combat_over_pending).toBe(false);
    expect(result.newState.map_level).toBe('regional'); // stayed on the map
    expect(result.newState.current_room).toBe('');
  });
});
