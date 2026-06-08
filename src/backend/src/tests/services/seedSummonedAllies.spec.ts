// RE-1 Phase 4 — combat-start bridge for persistent summons. At combat
// start, `seedSummonedAllies` turns each `state.summoned_allies` record
// (e.g. an Animate Dead skeleton) into a side:'ally' grid entity + an
// initiative slot right after its owner, so the ally-turn path drives it.

import type { CombatEntity, GameState } from '../../types.js';
import { describe, expect, it } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { seedSummonedAllies } from '../../services/gameEngine.js';

const skeleton = {
  id: 'skel-1',
  ownerId: 'pc-1',
  name: 'Skeleton',
  ac: 14,
  maxHp: 13,
  toHit: 5,
  damage: '1d6+3',
};

const pcEnt = (id: string, x: number, y: number): CombatEntity => ({
  id,
  isEnemy: false,
  pos: { x, y },
  hp: 10,
  maxHp: 10,
  conditions: [],
  condition_durations: {},
});

const baseState = (over: Partial<GameState> = {}): GameState => ({
  ...makeState({ id: 'pc-1' }),
  characters: [makeChar({ id: 'pc-1' })],
  entities: [pcEnt('pc-1', 1, 1)],
  initiative_order: [
    { id: 'pc-1', roll: 15, is_enemy: false },
    { id: 'goblin-1', roll: 8, is_enemy: true },
  ],
  summoned_allies: [skeleton],
  ...over,
});

describe('seedSummonedAllies', () => {
  it('materializes a summon as an ally entity behind its owner + an initiative slot after it', () => {
    const r = seedSummonedAllies(baseState());
    const skel = r.entities?.find((e) => e.id === 'skel-1');
    expect(skel).toMatchObject({
      side: 'ally',
      hp: 13,
      maxHp: 13,
      ac: 14,
      toHit: 5,
      damage: '1d6+3',
      companionName: 'Skeleton',
      summoned_by: 'pc-1',
      summon_concentration: false,
    });
    expect(skel?.pos).toEqual({ x: 1, y: 2 }); // just behind the owner at (1,1)
    expect(r.initiative_order.map((e) => e.id)).toEqual(['pc-1', 'skel-1', 'goblin-1']);
  });

  it('skips a summon whose owner is dead or absent', () => {
    const r = seedSummonedAllies(baseState({ characters: [makeChar({ id: 'pc-1', dead: true })] }));
    expect(r.entities?.some((e) => e.id === 'skel-1')).toBe(false);
    expect(r.initiative_order.map((e) => e.id)).not.toContain('skel-1');
  });

  it('is idempotent — does not duplicate an already-seeded ally', () => {
    const twice = seedSummonedAllies(seedSummonedAllies(baseState()));
    expect(twice.entities?.filter((e) => e.id === 'skel-1').length).toBe(1);
    expect(twice.initiative_order.filter((e) => e.id === 'skel-1').length).toBe(1);
  });
});
