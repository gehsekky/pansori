// 2024 PHB lighting integration with the sneak action — the observer
// enemy's effective light adjusts the Stealth DC the group check
// rolls against. Dark light effectively guarantees the sneak succeeds
// (DC 0); dim light makes it 5 points easier.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

function seedWithLighting(lighting: 'bright' | 'dim' | 'dark'): Seed {
  return {
    context_id: ctx.id,
    world_name: 'Lighting Sneak Test',
    ship_name: 'Lighting Sneak Test',
    intro: '',
    seed_id: 'lighting-sneak',
    rooms: [
      { id: ctx.startRoomId, name: 'Start', desc: '', lighting },
      { id: 'next-room', name: 'Next', desc: '' },
    ],
    connections: { [ctx.startRoomId]: ['next-room'], 'next-room': [ctx.startRoomId] },
    enemies: {
      [ctx.startRoomId]: [
        {
          id: `${ctx.startRoomId}#0`,
          name: 'Goblin',
          hp: 7,
          ac: 12,
          damage: '1d6',
          toHit: 4,
          wis: 8, // -1 mod → passive Perception DC 9 in bright
          xp: 10,
        },
      ],
    },
    loot: {},
    npcs: {},
  };
}

describe('Sneak in dark light', () => {
  it('Wisdom 8 goblin in dark light: sneak auto-succeeds (DC 0)', async () => {
    // Force the d20 to roll a 1 — even with the worst possible roll,
    // dark light drops the DC to 0 so a Stealth total of (1 + 0)
    // exceeds 0 and the group passes.
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 = 1
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Rogue',
      level: 5,
      dex: 8, // -1 mod → roll +0 (no prof default)
    });
    const seed = seedWithLighting('dark');
    const state = {
      ...makeState({ id: pc.id }, { current_room: ctx.startRoomId }),
      characters: [pc],
      active_character_id: pc.id,
    };
    const result = await takeAction({
      action: { type: 'sneak' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    // Group passes → narrative mentions "passes" or matches one of the
    // sneak-success pool entries. We just check the PC moved rooms.
    expect(result.newState.current_room).toBe('next-room');
  });
});

describe('Sneak in bright light', () => {
  it('Mediocre Stealth in bright light fails against a normal goblin', async () => {
    // d20 = 1; base DC = 10 + (-1) = 9; total roll = 1 + 0 = 1 < 9
    // → fails. Party stays in the room.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      dex: 10, // +0 mod
    });
    const seed = seedWithLighting('bright');
    const state = {
      ...makeState({ id: pc.id }, { current_room: ctx.startRoomId }),
      characters: [pc],
      active_character_id: pc.id,
    };
    const result = await takeAction({
      action: { type: 'sneak' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.newState.current_room).toBe(ctx.startRoomId); // didn't move
  });
});

describe('Sneak in dim light', () => {
  it('Dim light: DC drops by 5 so a borderline roll succeeds', async () => {
    // Mock d20 = 5; goblin WIS 8 → bright DC 9 → fails (5 < 9), but
    // dim DC = 9 - 5 = 4 → passes (5 >= 4).
    // Math.random() → 0.2 yields d(20) = floor(0.2*20)+1 = 5
    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      dex: 10,
    });
    const seed = seedWithLighting('dim');
    const state = {
      ...makeState({ id: pc.id }, { current_room: ctx.startRoomId }),
      characters: [pc],
      active_character_id: pc.id,
    };
    const result = await takeAction({
      action: { type: 'sneak' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.newState.current_room).toBe('next-room');
  });
});
