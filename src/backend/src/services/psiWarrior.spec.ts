// Psi Warrior Fighter (2024 PHB) — Psionic Strike auto-applied
// damage rider on weapon hits.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../test-fixtures.js';
import type { Seed } from '../types.js';
import { context as ctx } from '../contexts/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Psi Warrior Test',
  ship_name: 'Psi Warrior Test',
  intro: '',
  seed_id: 'psi-warrior',
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

function buildFighter(opts: { subclass: string; level?: number; psiUsed?: number }) {
  return makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    subclass: opts.subclass,
    level: opts.level ?? 5,
    str: 16,
    int: 14,
    hp: 30,
    max_hp: 30,
    inventory: [{ instance_id: 'sw-1', id: 'longsword', name: 'Longsword' }],
    equipped_weapon: 'sw-1',
    weapon_proficiencies: ['simple', 'martial'],
    class_resource_uses: opts.psiUsed != null ? { psi_dice_used: opts.psiUsed } : {},
  });
}

function buildState(pc: ReturnType<typeof makeChar>) {
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [pc],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: enemyId, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: enemyId,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 50,
        maxHp: 50,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Psi Warrior — Psionic Strike', () => {
  it('Psi Warrior hit: Psionic Strike rider fires + die decremented', async () => {
    mockRandom(0.99); // auto-hit + max dmg
    const pc = buildFighter({ subclass: 'psi_warrior' });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Psionic Strike: \+\d+ force/);
    const after = result.newState.characters[0];
    expect(after.class_resource_uses?.psi_dice_used).toBe(1);
  });

  it('Champion (control): no Psionic Strike', async () => {
    mockRandom(0.99);
    const pc = buildFighter({ subclass: 'champion' });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Psionic Strike/);
  });

  it('Empty pool: rider does NOT fire', async () => {
    mockRandom(0.99);
    // Pool = 4 + 2*prof. At L5, prof = 3 → 4 + 6 = 10. Mark 10
    // as used so pool is exhausted.
    const pc = buildFighter({ subclass: 'psi_warrior', psiUsed: 10 });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Psionic Strike/);
  });
});
