// RE-4 — SRD jumping. Pure distance helpers + the `jump` grid action (Long
// Jump): leap up to STR feet (half standing), clearing obstacles / difficult
// terrain that normal movement would route around or pay 2× for.

import type { GridPos, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { highJumpDistance, longJumpDistance } from './jump.js';
import { makeChar, makeState, mockRandom } from '../test-fixtures.js';
import { context as ctx } from '../contexts/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

describe('longJumpDistance', () => {
  it('is STR feet with a run-up, half (rounded down) standing', () => {
    expect(longJumpDistance(16, true)).toBe(16);
    expect(longJumpDistance(16, false)).toBe(8);
    expect(longJumpDistance(15, false)).toBe(7);
  });
});

describe('highJumpDistance', () => {
  it('is 3 + STR mod (min 0) with a run-up, half standing', () => {
    expect(highJumpDistance(16, true)).toBe(6); // 3 + 3
    expect(highJumpDistance(16, false)).toBe(3);
    expect(highJumpDistance(6, true)).toBe(1); // 3 + (-2)
    expect(highJumpDistance(1, true)).toBe(0); // 3 + (-5) clamped to 0
  });
});

// ── Integration through the jump action ──────────────────────────────────

const ROOM = ctx.startRoomId;

function jumpState(opts: {
  str?: number;
  movementUsed?: number;
  obstacles?: GridPos[];
  difficultTerrain?: GridPos[];
  blockerAt?: GridPos;
}) {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 5,
    str: opts.str ?? 16,
    hp: 30,
    max_hp: 30,
    speed: 30,
  });
  const entities = [
    {
      id: 'pc-1',
      isEnemy: false,
      pos: { x: 1, y: 1 },
      hp: 30,
      maxHp: 30,
      conditions: [],
      condition_durations: {},
    },
  ];
  if (opts.blockerAt) {
    entities.push({
      id: 'blocker',
      isEnemy: true,
      pos: opts.blockerAt,
      hp: 10,
      maxHp: 10,
      conditions: [],
      condition_durations: {},
    });
  }
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ROOM, combat_active: true }),
    characters: [pc],
    active_character_id: 'pc-1',
    initiative_order: [{ id: 'pc-1', roll: 18, is_enemy: false }],
    initiative_idx: 0,
    entities,
    movement_used: { 'pc-1': opts.movementUsed ?? 0 } as Record<string, number>,
  };
}

function jumpSeed(obstacles: GridPos[] = [], difficultTerrain: GridPos[] = []): Seed {
  return {
    context_id: ctx.id,
    world_name: 'Jump Test',
    ship_name: 'Jump Test',
    intro: '',
    seed_id: 'jump',
    rooms: [{ id: ROOM, name: 'Start', desc: '', obstacles, difficultTerrain }],
    connections: { [ROOM]: [] },
    enemies: {},
    loot: {},
    npcs: {},
  };
}

const jump = (state: ReturnType<typeof jumpState>, to: GridPos, seed = jumpSeed()) =>
  takeAction({ action: { type: 'jump', to }, history: [], state, seed, context: ctx });

describe('jump action — distance', () => {
  it('standing jump (no run-up) covers half STR feet', async () => {
    // STR 16 standing → 8 ft = 1 square. A 2-square leap (10 ft) is too far.
    const r = await jump(jumpState({ str: 16 }), { x: 1, y: 3 });
    expect(r.narrative).toMatch(/Too far to jump.*standing/);
  });

  it('with a 10-ft run-up, covers the full STR feet', async () => {
    // STR 16 + run-up → 16 ft = up to 3 squares. (1,1)→(1,3) is 10 ft.
    const r = await jump(jumpState({ str: 16, movementUsed: 10 }), { x: 1, y: 3 });
    expect(r.narrative).toMatch(/leaps 10 ft to \(1, 3\)/);
    expect(r.newState.entities?.find((e) => e.id === 'pc-1')?.pos).toEqual({ x: 1, y: 3 });
    // 10 (run-up) + 10 (jump) ft spent.
    expect(r.newState.movement_used?.['pc-1']).toBe(20);
  });
});

describe('jump action — clears obstacles and validates landing', () => {
  it('leaps over an obstacle the path would otherwise be blocked by', async () => {
    const seed = jumpSeed([{ x: 1, y: 2 }]); // obstacle directly between
    const r = await jump(jumpState({ str: 16, movementUsed: 10 }), { x: 1, y: 3 }, seed);
    expect(r.narrative).toMatch(/leaps 10 ft/);
    expect(r.newState.entities?.find((e) => e.id === 'pc-1')?.pos).toEqual({ x: 1, y: 3 });
  });

  it('cannot land on another creature', async () => {
    const state = jumpState({ str: 16, movementUsed: 10, blockerAt: { x: 1, y: 3 } });
    const r = await jump(state, { x: 1, y: 3 });
    expect(r.narrative).toMatch(/cannot land on another creature/);
  });

  it('cannot land inside an obstacle', async () => {
    const seed = jumpSeed([{ x: 1, y: 3 }]);
    const r = await jump(jumpState({ str: 16, movementUsed: 10 }), { x: 1, y: 3 }, seed);
    expect(r.narrative).toMatch(/cannot land inside an obstacle/);
  });

  it('landing in difficult terrain forces an Acrobatics check or Prone', async () => {
    mockRandom(0.0); // d20 = 1 → fails the DC 10 Acrobatics check
    const seed = jumpSeed([], [{ x: 1, y: 3 }]);
    const r = await jump(jumpState({ str: 16, movementUsed: 10 }), { x: 1, y: 3 }, seed);
    expect(r.narrative).toMatch(/Prone/);
    expect(r.newState.characters[0].conditions).toContain('prone');
  });
});
