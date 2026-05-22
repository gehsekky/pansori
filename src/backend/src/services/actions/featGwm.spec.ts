// Great Weapon Master feat (2024 PHB) — once per turn, on a hit
// with a Heavy weapon, the target takes extra damage equal to the
// attacker's proficiency bonus. Bonus-action attack on crit/kill
// is deferred (needs new action shape).

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
  world_name: 'GWM Test',
  ship_name: 'GWM Test',
  intro: '',
  seed_id: 'gwm',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      {
        id: enemyId,
        name: 'Goblin',
        hp: 200,
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
        hp: 200,
        maxHp: 200,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Great Weapon Master — damage rider', () => {
  it('Heavy-weapon hit adds prof bonus damage, narrative surfaces it', async () => {
    // Force d20 = 20 → crit-hit. Greataxe is Heavy. L5 Fighter = +3 prof.
    mockRandom(0.99);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      str: 18,
      feats: ['great_weapon_master'],
      inventory: [{ instance_id: 'ga-1', id: 'greataxe', name: 'Greataxe' }],
      equipped_weapon: 'ga-1',
      weapon_proficiencies: ['simple', 'martial'],
    });
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildState(pc),
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Great Weapon Master: \+3/);
    expect(result.newState.characters[0].turn_actions.gwm_used).toBe(true);
  });

  it('NON-heavy weapon hit does NOT trigger GWM', async () => {
    mockRandom(0.99);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      str: 16,
      feats: ['great_weapon_master'],
      inventory: [{ instance_id: 'sw-1', id: 'longsword', name: 'Longsword' }],
      equipped_weapon: 'sw-1',
      weapon_proficiencies: ['simple', 'martial'],
    });
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildState(pc),
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Great Weapon Master/);
  });

  it('Extra Attack does NOT re-trigger GWM (once-per-turn gate)', async () => {
    // Fighter L5 with Greataxe + GWM gets Extra Attack. Both hits
    // should fire — but GWM should appear EXACTLY ONCE.
    mockRandom(0.99);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      str: 18,
      feats: ['great_weapon_master'],
      inventory: [{ instance_id: 'ga-1', id: 'greataxe', name: 'Greataxe' }],
      equipped_weapon: 'ga-1',
      weapon_proficiencies: ['simple', 'martial'],
    });
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildState(pc),
      seed: seedWithGoblin,
      context: ctx,
    });
    const matches = result.narrative.match(/Great Weapon Master/g);
    expect(matches).toHaveLength(1);
  });

  it('Without the feat: no GWM damage even with heavy weapon', async () => {
    mockRandom(0.99);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      str: 18,
      feats: [],
      inventory: [{ instance_id: 'ga-1', id: 'greataxe', name: 'Greataxe' }],
      equipped_weapon: 'ga-1',
      weapon_proficiencies: ['simple', 'martial'],
    });
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildState(pc),
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Great Weapon Master/);
  });

  it('take-time records the feat + surfaces the narrative', () => {
    const char = makeChar({ id: 'pc-1', feats: [] });
    const feat = getFeat('great_weapon_master', ctx);
    if (!feat) throw new Error('great_weapon_master missing');
    const { newChar, narrative } = applyFeatTake(char, feat);
    expect(newChar.feats).toContain('great_weapon_master');
    expect(narrative).toMatch(/Heavy-weapon hits deal \+prof bonus damage/);
  });
});
