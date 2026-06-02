// Faerie Fire advantage hook — attacks against a faerie_fired
// enemy gain advantage. Wired in toHit.ts alongside the existing
// adv sources (grappled, prone-melee, paralyzed, etc.).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#0`;

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Faerie Fire Test',
  ship_name: 'Faerie Fire Test',
  intro: '',
  seed_id: 'faerie',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: enemyId,
        name: 'Goblin',
        hp: 50,
        ac: 18, // high AC so advantage is meaningful
        damage: '1d6',
        toHit: 3,
        xp: 20,
      },
    ],
  },
  loot: {},
  npcs: {},
};

function buildState(opts: { enemyConditions?: string[] }) {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 5,
    str: 14,
    hp: 30,
    max_hp: 30,
    inventory: [{ instance_id: 'sw-1', id: 'longsword', name: 'Longsword' }],
    equipped_weapon: 'sw-1',
    weapon_proficiencies: ['simple', 'martial'],
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
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
        conditions: opts.enemyConditions ?? [],
        condition_durations: {},
      },
    ],
  };
}

describe('Attack vs faerie_fired enemy — has advantage', () => {
  it('faerie_fired enemy: attack narrative shows advantage', async () => {
    mockRandom(0.99); // ensure something hits regardless
    const state = buildState({ enemyConditions: ['faerie_fired'] });
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed,
      context: ctx,
    });
    // The to-hit context surfaces "advantage" in the inline note.
    expect(result.narrative).toMatch(/advantage/);
  });

  it('non-faerie-fired enemy: no advantage from this source', async () => {
    mockRandom(0.99);
    const state = buildState({ enemyConditions: [] });
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/advantage/);
  });
});
