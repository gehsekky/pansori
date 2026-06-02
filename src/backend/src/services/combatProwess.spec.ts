// SRD Boon of Combat Prowess (epic boon, L19+) — Peerless Aim: once per turn,
// when you miss with an attack roll you can hit instead. Auto-succeeds (no
// roll), a hit not a crit, and refreshes at the start of your next turn.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../test-fixtures.js';
import { FRESH_TURN } from './rulesEngine.js';
import type { Seed } from '../types.js';
import { context as ctx } from '../campaignData/sandbox.js';
import { peerlessAimAvailable } from './feats.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

describe('peerlessAimAvailable', () => {
  it('is available with the boon and an unspent turn, gated otherwise', () => {
    const fresh = makeChar({ id: 'pc-1', feats: ['boon_combat_prowess'] });
    expect(peerlessAimAvailable(fresh)).toBe(true);
    const spent = makeChar({
      id: 'pc-1',
      feats: ['boon_combat_prowess'],
      turn_actions: { ...FRESH_TURN, peerless_aim_used: true },
    });
    expect(peerlessAimAvailable(spent)).toBe(false);
    expect(peerlessAimAvailable(makeChar({ id: 'pc-2' }))).toBe(false);
  });
});

// Enemy with AC 25 — a low d20 misses outright, leaving Peerless Aim as the
// only thing that can land the swing.
const highAcSeed: Seed = {
  context_id: ctx.id,
  world_name: 'Peerless Aim Test',
  ship_name: 'Peerless Aim Test',
  intro: '',
  seed_id: 'peerless-aim',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: `entry_hall#0`,
        name: 'Iron Golem',
        hp: 200,
        ac: 25,
        damage: '1d6',
        toHit: 3,
        xp: 20,
      },
    ],
  },
  loot: {},
  npcs: {},
};

function prowessState(turnActions?: Record<string, unknown>) {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 19,
    str: 20,
    hp: 60,
    max_hp: 60,
    inventory: [{ instance_id: 'ga-1', id: 'greataxe', name: 'Greataxe' }],
    equipped_weapon: 'ga-1',
    weapon_proficiencies: ['simple', 'martial'],
    feats: ['boon_combat_prowess'],
    ...(turnActions ? { turn_actions: { ...FRESH_TURN, ...turnActions } } : {}),
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [pc],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: `entry_hall#0`, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: 60,
        maxHp: 60,
        conditions: [],
        condition_durations: {},
      },
      {
        id: `entry_hall#0`,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 200,
        maxHp: 200,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Peerless Aim — through the attack path', () => {
  it('turns a missed attack into a hit', async () => {
    // d20 = 2 (a miss vs AC 25, not a fumble).
    mockRandom(0.05);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: `entry_hall#0` },
      history: [],
      state: prowessState(),
      seed: highAcSeed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Peerless Aim — a miss becomes a hit!/);
    expect(result.newState.characters[0].turn_actions.peerless_aim_used).toBe(true);
  });

  it('does not rescue when already spent this turn', async () => {
    mockRandom(0.05);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: `entry_hall#0` },
      history: [],
      state: prowessState({ peerless_aim_used: true }),
      seed: highAcSeed,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Peerless Aim/);
  });
});
