// Regression — Multiattack HP accumulation across swings.
//
// In the dispatcher-routed enemy turn, each swing of a Multiattack is resolved
// by re-reading the target from `st.characters` (by id). `runEnemyMultiattackLoop`
// must commit each swing's result back into `st.characters` before the next
// swing, or later swings recompute from the PRE-TURN HP and only the last
// swing's damage sticks — a 2-attack monster would net just one swing's HP loss
// despite the narrative printing both hits.
//
// Math.random pinned to 0.5: d20 11 + 4 = 15 hits AC 10; Rend 1d6+2 = 6. Two
// swings on a 40-HP PC must leave 28 (not 34).

import type { Enemy, GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';
import { context as ctx } from '../contexts/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const E_ID = `${ctx.startRoomId}#0`;

function twoSwingSeed(): Seed {
  return {
    context_id: ctx.id,
    world_name: 'Multiattack Test',
    ship_name: 'Multiattack Test',
    intro: '',
    seed_id: 'multi',
    rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
    connections: { [ctx.startRoomId]: [] },
    enemies: {
      [ctx.startRoomId]: [
        {
          id: E_ID,
          name: 'Brute',
          hp: 30,
          ac: 15,
          damage: '1d6+2',
          toHit: 4,
          xp: 100,
          str: 14,
          dex: 12,
          con: 11,
          multiattack: 2,
          damageType: 'piercing',
        } as Enemy,
      ],
    },
    loot: {},
    npcs: {},
  };
}

function turnState(): GameState {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 3,
    ac: 10,
    hp: 40,
    max_hp: 40,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [{ ...pc, hp: 40, max_hp: 40 }],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: E_ID, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    round: 1,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: 40,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      },
      {
        id: E_ID,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

describe('Multiattack — both swings accumulate HP loss', () => {
  it('a 2-attack monster deals two swings of damage in one turn', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // each Rend = 6
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: turnState(),
      seed: twoSwingSeed(),
      context: ctx,
    });
    const pc = r.newState.characters[0];
    expect(pc.hp).toBe(28); // 40 − 6 − 6, not 34 (one swing)
    // The committed PC entity HP mirrors the character.
    const pcEnt = r.newState.entities?.find((e) => e.id === 'pc-1');
    expect(pcEnt?.hp).toBe(28);
  });
});
