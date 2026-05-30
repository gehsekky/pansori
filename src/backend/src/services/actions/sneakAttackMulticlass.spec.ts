// Regression test for Sneak Attack on multiclass Rogues.
//
// **Pre-existing bug:** the attack handler checked
// `features.includes('sneak_attack')` against the PC's PRIMARY
// class only (`context.classFeatures[char.character_class]`). A
// Fighter 5 / Rogue 2 PC never got Sneak Attack even though
// they had a level in Rogue. And when Sneak Attack DID fire
// (pure-class Rogue), the dice scaled off total character
// level (`sneakAttackDice(ctx.char.level)`) instead of rogue
// level — wrong for any multiclass.
//
// Fixed by gating on `hasClass(char, 'rogue')` for availability
// and `getClassLevel(char, 'rogue')` for the dice expression.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;

const seedWithGoblin: Seed = {
  context_id: ctx.id,
  world_name: 'Sneak MC Test',
  ship_name: 'Sneak MC Test',
  intro: '',
  seed_id: 'sneak-mc',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  enemies: {
    [ctx.startRoomId]: [
      {
        id: enemyId,
        name: 'Goblin',
        hp: 100,
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

function buildState(pc: ReturnType<typeof makeChar>, allyPos?: { x: number; y: number }) {
  const allies = allyPos
    ? [makeChar({ id: 'ally', name: 'Ally', character_class: 'Fighter' })]
    : [];
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [pc, ...allies],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      ...(allies.length ? [{ id: 'ally', roll: 17, is_enemy: false }] : []),
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
      ...(allyPos
        ? [
            {
              id: 'ally',
              isEnemy: false as const,
              pos: allyPos,
              hp: 30,
              maxHp: 30,
              conditions: [],
              condition_durations: {},
            },
          ]
        : []),
      {
        id: enemyId,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 100,
        maxHp: 100,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Sneak Attack — multiclass availability + per-class dice', () => {
  it('Fighter 5 / Rogue 2 multiclass: Sneak Attack fires (gated on hasClass not primary)', async () => {
    // Adjacent ally at (5, 6) triggers Sneak Attack qualifier
    // (ally within 5 ft of target). Force d20=20 for guaranteed hit
    // + crit. mockRandom: d20=20, weapon damage, sneak attack dice.
    mockRandom(0.99, 0.99, 0.99, 0.99, 0.99, 0.99);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 7,
      dex: 16,
      class_levels: { fighter: 5, rogue: 2 },
      inventory: [{ instance_id: 'd-1', id: 'dagger', name: 'Dagger' }],
      equipped_weapon: 'd-1',
      weapon_proficiencies: ['simple', 'martial'],
    });
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildState(pc, { x: 6, y: 5 }),
      seed: seedWithGoblin,
      context: ctx,
    });
    // Sneak Attack 1d6 at rogue level 2 → ⌈2/2⌉ = 1d6 base.
    // d20=20 → crit → doubled to "Sneak Attack 2d6 (crit)".
    // Pre-fix would have been ⌈7/2⌉ = 4d6 → 8d6 crit.
    expect(result.narrative).toMatch(/Sneak Attack 2d6/);
    expect(result.narrative).not.toMatch(/8d6/);
  });

  it('Pure Rogue 5: Sneak Attack scales on rogue level (3d6, not total level)', async () => {
    // Pure rogue L5 → ⌈5/2⌉ = 3d6.
    mockRandom(0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Rogue',
      level: 5,
      dex: 16,
      inventory: [{ instance_id: 'd-1', id: 'dagger', name: 'Dagger' }],
      equipped_weapon: 'd-1',
      weapon_proficiencies: ['simple'],
    });
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildState(pc, { x: 6, y: 5 }),
      seed: seedWithGoblin,
      context: ctx,
    });
    // Pure rogue L5 → ⌈5/2⌉ = 3d6 base → 6d6 on crit.
    expect(result.narrative).toMatch(/Sneak Attack 6d6/);
  });

  it('Rogue 4 / Wizard 3 multiclass: Sneak Attack scales on rogue level (2d6 base, not total 4d6)', async () => {
    // Pre-fix: ⌈7/2⌉ = 4d6 base (total level). Post-fix: ⌈4/2⌉ = 2d6 base.
    mockRandom(0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Rogue',
      level: 7,
      dex: 16,
      class_levels: { rogue: 4, wizard: 3 },
      inventory: [{ instance_id: 'd-1', id: 'dagger', name: 'Dagger' }],
      equipped_weapon: 'd-1',
      weapon_proficiencies: ['simple'],
    });
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildState(pc, { x: 6, y: 5 }),
      seed: seedWithGoblin,
      context: ctx,
    });
    // 2d6 base → 4d6 on crit. Pre-fix was 4d6 base → 8d6 crit.
    expect(result.narrative).toMatch(/Sneak Attack 4d6/);
    expect(result.narrative).not.toMatch(/8d6/);
  });

  it('Pure Fighter (no rogue levels): Sneak Attack does NOT fire', async () => {
    mockRandom(0.99, 0.99, 0.5);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      str: 16,
      inventory: [{ instance_id: 'd-1', id: 'dagger', name: 'Dagger' }],
      equipped_weapon: 'd-1',
      weapon_proficiencies: ['simple', 'martial'],
    });
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildState(pc, { x: 6, y: 5 }),
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Sneak Attack/);
  });
});
