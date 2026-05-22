// Crossbow Expert (2024 PHB) — no ranged-in-melee disadvantage
// when attacking with a crossbow. Two RAW benefits deferred:
// ignoring Loading (pansori doesn't enforce Loading), and the
// bonus-action hand-crossbow shot (needs new action shape).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyFeatTake, getFeat } from '../feats.js';
import { makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;

const seedWithGoblin: Seed = {
  context_id: ctx.id,
  world_name: 'Crossbow Expert Test',
  ship_name: 'Crossbow Expert Test',
  intro: '',
  seed_id: 'cbex-test',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      {
        id: enemyId,
        name: 'Goblin',
        hp: 50,
        ac: 12,
        damage: '1d6',
        toHit: 3,
        xp: 20,
      },
    ],
  },
  loot: {},
  npcs: {},
};

function buildState(pcFeats: string[], weaponId: string) {
  // Ammo: 'bolts' for crossbows, 'arrows' for bows. The ammo check
  // looks for `i.id.includes('bolt')` or 'arrow' based on weapon id.
  const ammo = weaponId.includes('crossbow')
    ? { instance_id: 'ammo-1', id: 'bolts', name: 'Bolts', count: 20 }
    : { instance_id: 'ammo-1', id: 'arrows', name: 'Arrows', count: 20 };
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 5,
    dex: 16,
    hp: 30,
    max_hp: 30,
    feats: pcFeats,
    inventory: [{ instance_id: 'w-1', id: weaponId, name: weaponId }, ammo],
    equipped_weapon: 'w-1',
    weapon_proficiencies: ['simple', 'martial'],
  });
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
      // Goblin adjacent → triggers ranged-in-melee disadv normally.
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

describe('Crossbow Expert — no ranged-in-melee disadv with crossbows', () => {
  it('hand crossbow + adjacent goblin + Crossbow Expert → no disadvantage', async () => {
    mockRandom(0.5);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildState(['crossbow_expert'], 'hand_crossbow'),
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/ranged in melee/);
    expect(result.narrative).not.toMatch(/disadvantage/);
  });

  it('hand crossbow + adjacent goblin + NO feat → disadvantage applies (control)', async () => {
    mockRandom(0.5);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildState([], 'hand_crossbow'),
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).toMatch(/ranged in melee/);
  });

  it('longbow + Crossbow Expert + adjacent goblin → disadvantage still applies (not a crossbow)', async () => {
    mockRandom(0.5);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildState(['crossbow_expert'], 'longbow'),
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).toMatch(/ranged in melee/);
  });

  it('take-time records the feat + narrative', () => {
    const char = makeChar({ id: 'pc-1', feats: [] });
    const feat = getFeat('crossbow_expert', ctx);
    if (!feat) throw new Error('crossbow_expert missing');
    const { newChar, narrative } = applyFeatTake(char, feat);
    expect(newChar.feats).toContain('crossbow_expert');
    expect(narrative).toMatch(/No disadvantage on crossbow shots/);
  });
});
