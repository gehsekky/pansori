// Direct tests for selectTarget + entitySide / hostileTargetSides — the
// side-keyed targeting introduced in RE-1 Phase 4 (generalized from the
// enemy-only selectEnemyMeleeTarget). The enemy cases double as
// regression coverage that the generalization preserved enemy targeting
// (nearest PC, skipping companions).

import type { CombatEntity, GameState } from '../types.js';
import { describe, expect, it } from 'vitest';
import { entitySide, hostileTargetSides, selectTarget } from './gameEngine.js';
import { makeChar, makeState } from '../test-fixtures.js';

const ent = (over: Partial<CombatEntity> & Pick<CombatEntity, 'id'>): CombatEntity => ({
  isEnemy: false,
  pos: { x: 0, y: 0 },
  hp: 10,
  maxHp: 10,
  conditions: [],
  condition_durations: {},
  ...over,
});

describe('entitySide', () => {
  it('derives pc / enemy / ally from isEnemy / isCompanion when side is unset', () => {
    expect(entitySide(ent({ id: 'pc' }))).toBe('pc');
    expect(entitySide(ent({ id: 'orc', isEnemy: true }))).toBe('enemy');
    expect(entitySide(ent({ id: 'wolf', isCompanion: true }))).toBe('ally');
  });

  it('honors an explicit side over the derivation', () => {
    expect(entitySide(ent({ id: 'summon', side: 'ally' }))).toBe('ally');
    expect(entitySide(ent({ id: 'odd', isEnemy: true, side: 'pc' }))).toBe('pc');
  });
});

describe('hostileTargetSides', () => {
  it('enemies target PCs only for now (companions/summons join in P4.3)', () => {
    expect(hostileTargetSides('enemy')).toEqual(['pc']);
  });

  it('PCs and allies target enemies', () => {
    expect(hostileTargetSides('pc')).toEqual(['enemy']);
    expect(hostileTargetSides('ally')).toEqual(['enemy']);
  });
});

describe('selectTarget', () => {
  it('returns -1 targetCharIdx when no entities array is present', () => {
    const st = makeState(); // no entities
    const result = selectTarget('goblin-1', st);
    expect(result.targetCharIdx).toBe(-1);
    expect(result.targetEnt).toBeUndefined();
  });

  it('picks the nearest living PC by Chebyshev distance (enemy actor)', () => {
    const st: GameState = {
      ...makeState({ id: 'pc-1' }),
      characters: [makeChar({ id: 'pc-1' }), makeChar({ id: 'pc-2' })],
      entities: [
        ent({ id: 'pc-1', pos: { x: 10, y: 10 } }),
        ent({ id: 'pc-2', pos: { x: 1, y: 1 } }),
        ent({ id: 'goblin-1', isEnemy: true, pos: { x: 0, y: 0 }, hp: 8, maxHp: 8 }),
      ],
    };
    const result = selectTarget('goblin-1', st);
    expect(result.targetEnt?.id).toBe('pc-2'); // closer to (0,0)
    expect(result.targetCharIdx).toBe(1);
  });

  it('skips dead PCs (hp <= 0) when picking a target', () => {
    const st: GameState = {
      ...makeState({ id: 'pc-1', hp: 0 }),
      characters: [makeChar({ id: 'pc-1', hp: 0 }), makeChar({ id: 'pc-2', hp: 10 })],
      entities: [
        ent({ id: 'pc-1', pos: { x: 1, y: 1 }, hp: 0 }),
        ent({ id: 'pc-2', pos: { x: 5, y: 5 } }),
        ent({ id: 'goblin-1', isEnemy: true, pos: { x: 0, y: 0 }, hp: 8, maxHp: 8 }),
      ],
    };
    const result = selectTarget('goblin-1', st);
    expect(result.targetEnt?.id).toBe('pc-2'); // downed pc-1 skipped despite being closer
  });

  it('skips ally companions (side ally) when an enemy picks a target', () => {
    const st: GameState = {
      ...makeState({ id: 'pc-1' }),
      characters: [makeChar({ id: 'pc-1' })],
      entities: [
        ent({ id: 'pc-1', pos: { x: 5, y: 5 } }),
        ent({ id: 'pc-1:companion', isCompanion: true, pos: { x: 1, y: 1 } }),
        ent({ id: 'goblin-1', isEnemy: true, pos: { x: 0, y: 0 }, hp: 8, maxHp: 8 }),
      ],
    };
    const result = selectTarget('goblin-1', st);
    expect(result.targetEnt?.id).toBe('pc-1'); // companion skipped
  });

  it('returns the actor entity for downstream positioning', () => {
    const st = {
      ...makeState(),
      entities: [ent({ id: 'goblin-1', isEnemy: true, pos: { x: 7, y: 7 }, hp: 8, maxHp: 8 })],
    };
    const result = selectTarget('goblin-1', st);
    expect(result.actorEnt?.pos).toEqual({ x: 7, y: 7 });
  });
});
