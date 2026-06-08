// SRD / SRD 5.2.1 movement modes — per-mode speed fields
// (fly / swim / climb) on Character + the engine effects:
//   - gridMove lets a flying PC bypass obstacles + ignore difficult-
//     terrain cost.
//   - Long rest defensively clears fly_speed_ft (it's typically
//     short-duration: Fly spell, Levitate). climb_speed_ft and
//     swim_speed_ft persist (they come from species traits or
//     subclass features that survive long rest).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../test-fixtures.js';
import type { Seed } from '../../../types.js';
import { context as ctx } from '../../../campaignData/sandbox.js';
import { takeAction } from '../../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Movement Modes Test',
  ship_name: 'Movement Modes Test',
  intro: '',
  seed_id: 'movement-modes',
  rooms: [
    {
      id: 'entry_hall',
      name: 'Start',
      desc: '',
      // One obstacle at (5, 5) blocks the line between PC at (4,5)
      // and any cell beyond.
      obstacles: [{ x: 5, y: 5 }],
      difficultTerrain: [{ x: 4, y: 6 }],
    },
  ],
  enemies: {},
  loot: {},
  npcs: {},
};

function buildGridState(pc: ReturnType<typeof makeChar>) {
  return {
    ...makeState({ id: pc.id }, { current_room: 'entry_hall', combat_active: true }),
    characters: [pc],
    active_character_id: pc.id,
    initiative_order: [{ id: pc.id, roll: 18, is_enemy: false }],
    initiative_idx: 0,
    entities: [
      {
        id: pc.id,
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: pc.hp,
        maxHp: pc.max_hp,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('gridMove — flying bypass', () => {
  it('flying PC can move to a cell behind an obstacle', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      level: 5,
      species: 'human',
      speed: 30,
      fly_speed_ft: 30,
    });
    const state = buildGridState(pc);
    // Target (6,5) — the direct path goes through obstacle at (5,5).
    const result = await takeAction({
      action: { type: 'grid_move', entityId: 'pc-1', to: { x: 6, y: 5 } },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const ent = result.newState.entities?.find((e) => e.id === 'pc-1');
    expect(ent?.pos).toEqual({ x: 6, y: 5 });
  });

  it('non-flying PC cannot land on an obstacle cell either', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      level: 5,
      species: 'human',
      speed: 30,
    });
    const state = buildGridState(pc);
    // Target (5,5) — the obstacle. Non-flying PC simply can't path
    // there since findPath treats the obstacle as blocked.
    const result = await takeAction({
      action: { type: 'grid_move', entityId: 'pc-1', to: { x: 5, y: 5 } },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/No path/i);
    const ent = result.newState.entities?.find((e) => e.id === 'pc-1');
    // PC stays put.
    expect(ent?.pos).toEqual({ x: 4, y: 5 });
  });

  it('flying PC lands on (and only on) non-obstacle cells', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      level: 5,
      species: 'human',
      speed: 30,
      fly_speed_ft: 30,
    });
    const state = buildGridState(pc);
    // Target (5,5) — that IS the obstacle cell.
    const result = await takeAction({
      action: { type: 'grid_move', entityId: 'pc-1', to: { x: 5, y: 5 } },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/cannot land inside an obstacle/i);
  });

  it('flying PC ignores difficult-terrain cost', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      level: 5,
      species: 'human',
      speed: 30,
      fly_speed_ft: 30,
    });
    const state = buildGridState(pc);
    // Move into the difficult-terrain cell at (4,6) — one square down.
    const result = await takeAction({
      action: { type: 'grid_move', entityId: 'pc-1', to: { x: 4, y: 6 } },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const used = result.newState.movement_used?.['pc-1'] ?? 0;
    // Flying: one square = 5 ft (no 2× cost from difficult terrain).
    expect(used).toBe(5);
  });
});

describe('Persistent move-mode grants', () => {
  // climb_speed_ft / swim_speed_ft are typically granted by species
  // traits or subclass features that persist across rests. fly_speed_ft
  // is short-duration (Fly spell, Levitate, etc.) and the long-rest
  // sweep clears it.
  it('character with climb_speed_ft preserves it across non-rest actions', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      speed: 30,
      climb_speed_ft: 30,
    });
    const state = {
      ...makeState({ id: pc.id }, { current_room: 'entry_hall', combat_active: false }),
      characters: [pc],
      active_character_id: pc.id,
    };
    const result = await takeAction({
      action: { type: 'pass' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.climb_speed_ft).toBe(30);
  });

  it('long rest clears fly_speed_ft but preserves climb/swim', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Druid',
      level: 5,
      speed: 30,
      fly_speed_ft: 30,
      climb_speed_ft: 30,
      swim_speed_ft: 30,
    });
    const state = {
      ...makeState({ id: pc.id }, { current_room: 'entry_hall', combat_active: false }),
      characters: [pc],
      active_character_id: pc.id,
    };
    const result = await takeAction({
      action: { type: 'long_rest' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.fly_speed_ft).toBeUndefined();
    expect(after?.climb_speed_ft).toBe(30); // persistent
    expect(after?.swim_speed_ft).toBe(30); // persistent
  });
});
