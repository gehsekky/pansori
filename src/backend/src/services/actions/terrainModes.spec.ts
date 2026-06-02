// 2024 PHB terrain modes — climb / swim cells on Room. A PC without
// the matching movement mode (climb_speed_ft / swim_speed_ft) pays
// 2× cost per cell, mirroring the existing difficult-terrain rule.
// RAW says these costs DON'T stack — a cell counted as both
// difficult AND climbable still costs 2× total. Flying bypasses
// everything.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

function seedWithTerrain(opts: {
  climb?: { x: number; y: number }[];
  swim?: { x: number; y: number }[];
  difficult?: { x: number; y: number }[];
  terrain?: Seed['rooms'][number]['terrain'];
}): Seed {
  return {
    context_id: ctx.id,
    world_name: 'Terrain Modes Test',
    ship_name: 'Terrain Modes Test',
    intro: '',
    seed_id: 'terrain-modes',
    rooms: [
      {
        id: 'entry_hall',
        name: 'Start',
        desc: '',
        climbTerrain: opts.climb,
        swimTerrain: opts.swim,
        difficultTerrain: opts.difficult,
        terrain: opts.terrain,
      },
    ],
    enemies: {},
    loot: {},
    npcs: {},
  };
}

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

describe('Climb terrain', () => {
  it('PC without climb speed pays 2× cost crossing a climbable cell', async () => {
    const seed = seedWithTerrain({ climb: [{ x: 5, y: 5 }] });
    const pc = makeChar({ id: 'pc-1', character_class: 'Fighter', level: 5, speed: 30 });
    const state = buildGridState(pc);
    // Move from (4,5) onto the climbable cell (5,5).
    const result = await takeAction({
      action: { type: 'grid_move', entityId: 'pc-1', to: { x: 5, y: 5 } },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const used = result.newState.movement_used?.['pc-1'] ?? 0;
    expect(used).toBe(10); // 2× cost
  });

  it('PC with climb speed pays normal cost crossing a climbable cell', async () => {
    const seed = seedWithTerrain({ climb: [{ x: 5, y: 5 }] });
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      speed: 30,
      climb_speed_ft: 30,
    });
    const state = buildGridState(pc);
    const result = await takeAction({
      action: { type: 'grid_move', entityId: 'pc-1', to: { x: 5, y: 5 } },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const used = result.newState.movement_used?.['pc-1'] ?? 0;
    expect(used).toBe(5); // normal cost
  });
});

describe('Swim terrain', () => {
  it('PC without swim speed pays 2× cost crossing a swimmable cell', async () => {
    const seed = seedWithTerrain({ swim: [{ x: 5, y: 5 }] });
    const pc = makeChar({ id: 'pc-1', character_class: 'Druid', level: 5, speed: 30 });
    const state = buildGridState(pc);
    const result = await takeAction({
      action: { type: 'grid_move', entityId: 'pc-1', to: { x: 5, y: 5 } },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const used = result.newState.movement_used?.['pc-1'] ?? 0;
    expect(used).toBe(10);
  });

  it('Sea Druid (swim_speed_ft set) pays normal cost in water', async () => {
    const seed = seedWithTerrain({ swim: [{ x: 5, y: 5 }] });
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Druid',
      subclass: 'sea',
      level: 5,
      speed: 30,
      swim_speed_ft: 30,
    });
    const state = buildGridState(pc);
    const result = await takeAction({
      action: { type: 'grid_move', entityId: 'pc-1', to: { x: 5, y: 5 } },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const used = result.newState.movement_used?.['pc-1'] ?? 0;
    expect(used).toBe(5);
  });
});

describe('Stacking rules', () => {
  it('Difficult + climbable cell still costs 2× (no stack)', async () => {
    const seed = seedWithTerrain({
      difficult: [{ x: 5, y: 5 }],
      climb: [{ x: 5, y: 5 }],
    });
    const pc = makeChar({ id: 'pc-1', character_class: 'Fighter', level: 5, speed: 30 });
    const state = buildGridState(pc);
    const result = await takeAction({
      action: { type: 'grid_move', entityId: 'pc-1', to: { x: 5, y: 5 } },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const used = result.newState.movement_used?.['pc-1'] ?? 0;
    expect(used).toBe(10); // 2× total, not 3×
  });

  it('Flying PC bypasses all terrain modes', async () => {
    const seed = seedWithTerrain({
      climb: [{ x: 5, y: 5 }],
      swim: [{ x: 5, y: 5 }],
      difficult: [{ x: 5, y: 5 }],
    });
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      level: 5,
      speed: 30,
      fly_speed_ft: 30,
    });
    const state = buildGridState(pc);
    const result = await takeAction({
      action: { type: 'grid_move', entityId: 'pc-1', to: { x: 5, y: 5 } },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const used = result.newState.movement_used?.['pc-1'] ?? 0;
    expect(used).toBe(5); // flying ignores all penalties
  });
});

describe('cosmetic room terrain has no mechanical effect', () => {
  it('a cell painted "swamp"/"water" (terrain only) costs normal movement', async () => {
    // The cell is painted as terrain but is NOT in difficultTerrain/swimTerrain,
    // so it must cost the normal 5 ft — terrain is purely a render hint.
    const seed = seedWithTerrain({
      terrain: [
        { pos: { x: 5, y: 5 }, type: 'swamp' },
        { pos: { x: 4, y: 5 }, type: 'water' },
      ],
    });
    const pc = makeChar({ id: 'pc-1', character_class: 'Fighter', level: 5, speed: 30 });
    const state = buildGridState(pc);
    const result = await takeAction({
      action: { type: 'grid_move', entityId: 'pc-1', to: { x: 5, y: 5 } },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.newState.movement_used?.['pc-1']).toBe(5); // no 2× penalty from paint
  });

  it('does not block movement onto a cell painted "mountain"/"water"', async () => {
    // Impassable-looking paint must NOT gate pathing — only `obstacles` does.
    const seed = seedWithTerrain({ terrain: [{ pos: { x: 5, y: 5 }, type: 'mountain' }] });
    const pc = makeChar({ id: 'pc-1', character_class: 'Fighter', level: 5, speed: 30 });
    const state = buildGridState(pc);
    const result = await takeAction({
      action: { type: 'grid_move', entityId: 'pc-1', to: { x: 5, y: 5 } },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.newState.entities?.find((e) => e.id === 'pc-1')?.pos).toEqual({ x: 5, y: 5 });
  });
});

describe('Budget-exceeded narrative', () => {
  it('mentions climbing when a climb cell pushes the move over budget', async () => {
    // One climbable cell adjacent to the PC; movement budget set low
    // so even the single-cell move overshoots. Without climb speed
    // the cell costs 10 ft, budget 5 ft → failure with climb reason.
    const seed = seedWithTerrain({ climb: [{ x: 5, y: 5 }] });
    const pc = makeChar({ id: 'pc-1', character_class: 'Fighter', level: 5, speed: 5 });
    const state = buildGridState(pc);
    const result = await takeAction({
      action: { type: 'grid_move', entityId: 'pc-1', to: { x: 5, y: 5 } },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/climbing/i);
  });
});
