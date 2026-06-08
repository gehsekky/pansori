// SRD charm rider — a Charmed creature's charm ends when it takes damage. The
// post-action sweep (breakCharmOnDamage) clears `charmed` from any creature
// whose HP dropped this action, covering every damage path.

import type { Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../fixtures/testContext.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = 'entry_hall#0';
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Charm Test',
  ship_name: 'Charm Test',
  intro: '',
  seed_id: 'charm',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    entry_hall: [
      {
        id: ENEMY,
        name: 'Bandit',
        hp: 40,
        ac: 5,
        damage: '1d6',
        toHit: 3,
        xp: 20,
      } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function fightState(enemyConditions: string[]): GameState {
  const char = makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 5,
    str: 16,
    equipment: { main_hand: 'sw-1' },
    inventory: [{ instance_id: 'sw-1', id: 'shortsword', name: 'Shortsword' }],
    weapon_proficiencies: ['simple', 'martial'],
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [char],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: ENEMY, roll: 5, is_enemy: true },
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
        id: ENEMY,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 40,
        maxHp: 40,
        conditions: enemyConditions,
        condition_durations: {},
        charmer_id: 'pc-1',
      },
    ],
  } as unknown as GameState;
}

const enemyOf = (r: Awaited<ReturnType<typeof takeAction>>) =>
  r.newState.entities?.find((e) => e.id === ENEMY)!;

describe('Charm breaks on damage', () => {
  it('a charmed enemy that takes damage loses the Charmed condition', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // hit
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: fightState(['charmed']),
      seed,
      context: ctx,
    });
    const e = enemyOf(r);
    expect(e.hp).toBeLessThan(40); // took damage
    expect(e.conditions).not.toContain('charmed');
    expect(e.charmer_id).toBeUndefined();
  });

  it('leaves Charmed intact when the action deals no damage (a miss)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // d20 → 1, miss (AC 5 still missed on nat-1-ish)
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: fightState(['charmed']),
      seed,
      context: ctx,
    });
    const e = enemyOf(r);
    expect(e.hp).toBe(40); // no damage
    expect(e.conditions).toContain('charmed'); // still charmed
  });
});
