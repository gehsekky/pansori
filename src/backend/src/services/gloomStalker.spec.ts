// Gloom Stalker Ranger (2024 PHB) — Dread Ambusher: first weapon
// attack of combat deals +1d8. Pansori MVP simplification — RAW
// also grants +10 ft speed + an extra attack on the first turn,
// which are deferred.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../test-fixtures.js';
import type { Seed } from '../types.js';
import { context as ctx } from '../contexts/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Gloom Stalker Test',
  ship_name: 'Gloom Stalker Test',
  intro: '',
  seed_id: 'gloom-stalker',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      {
        id: enemyId,
        name: 'Goblin',
        hp: 50,
        ac: 10,
        damage: '1d6',
        toHit: 3,
        xp: 20,
      },
    ],
  },
  loot: {},
  npcs: {},
};

function buildRanger(opts: { subclass: string }) {
  return makeChar({
    id: 'pc-1',
    character_class: 'Ranger',
    subclass: opts.subclass,
    level: 5,
    dex: 16,
    str: 14,
    hp: 30,
    max_hp: 30,
    inventory: [{ instance_id: 'sw-1', id: 'longsword', name: 'Longsword' }],
    equipped_weapon: 'sw-1',
    weapon_proficiencies: ['simple', 'martial'],
  });
}

function buildState(pc: ReturnType<typeof makeChar>) {
  // NOTE: combat_active starts FALSE so runCombatStart fires on the
  // first attack, setting the dread_ambusher_pending flag for the
  // Gloom Stalker.
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
    characters: [pc],
    active_character_id: 'pc-1',
  };
}

describe('Gloom Stalker Ranger — Dread Ambusher', () => {
  it('First attack of combat: Dread Ambusher rider fires (+1d8)', async () => {
    mockRandom(0.99); // auto-hit
    const pc = buildRanger({ subclass: 'gloom_stalker' });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Dread Ambusher: \+\d+/);
  });

  it('Hunter Ranger (control): no Dread Ambusher', async () => {
    mockRandom(0.99);
    const pc = buildRanger({ subclass: 'hunter' });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Dread Ambusher/);
  });
});
