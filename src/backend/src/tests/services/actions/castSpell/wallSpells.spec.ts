// RE-4 — wall/terrain spells as transient grid blockers. Wall of Fire raises
// an opaque (line-of-sight-blocking) wall on cast, tied to the caster's
// concentration; the wall feeds the obstacle set used by LoS and is removed
// when concentration ends.

import type { GameState, Seed, SpellWall } from '../../../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { breakConcentration, wallObstacleCells } from '../../../../services/gameEngine.js';
import { makeChar, makeState, mockRandom } from '../../../../test-fixtures.js';
import { context as ctx } from '../../../fixtures/testContext.js';
import { takeAction } from '../../../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;
const ROOM = 'entry_hall';

const wall = (over: Partial<SpellWall> = {}): SpellWall => ({
  id: 'w1',
  casterId: 'pc-1',
  spellId: 'wall_of_fire',
  name: 'Wall of Fire',
  roomId: ROOM,
  cells: [
    { x: 0, y: 5 },
    { x: 1, y: 5 },
    { x: 2, y: 5 },
  ],
  blocksMovement: false,
  blocksLineOfSight: true,
  ...over,
});

describe('wallObstacleCells', () => {
  const st = { current_room: ROOM, spell_walls: [wall()] } as unknown as GameState;
  it('returns LoS-blocking cells but not movement cells for an opaque wall', () => {
    expect(wallObstacleCells(st, ROOM, 'los')).toHaveLength(3);
    expect(wallObstacleCells(st, ROOM, 'movement')).toHaveLength(0);
  });
  it('returns nothing for a different room', () => {
    expect(wallObstacleCells(st, 'elsewhere', 'los')).toHaveLength(0);
  });
});

describe('breakConcentration — removes the caster wall', () => {
  it('drops walls owned by the caster whose concentration ended', () => {
    const char = makeChar({
      id: 'pc-1',
      concentrating_on: { spellId: 'wall_of_fire', rounds_left: 5 },
    });
    const st = {
      spell_walls: [wall(), wall({ id: 'w2', casterId: 'pc-2' })],
    } as unknown as GameState;
    const { st: after } = breakConcentration(char, st);
    expect(after.spell_walls?.map((w) => w.id)).toEqual(['w2']); // pc-1's wall gone, pc-2's kept
  });
});

// ── Integration: cast Wall of Fire, then a wall-blocked shot ─────────────

const noEnemyBeyondSeed: Seed = {
  context_id: ctx.id,
  world_name: 'Wall Test',
  ship_name: 'Wall Test',
  intro: '',
  seed_id: 'wall',
  rooms: [{ id: ROOM, name: 'Start', desc: '' }],
  enemies: {
    [ROOM]: [{ id: ENEMY, name: 'Goblin', hp: 60, ac: 10, damage: '1d6', toHit: 3, xp: 20 }],
  },
  loot: {},
  npcs: {},
};

function casterState() {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 7,
    int: 18,
    hp: 40,
    max_hp: 40,
    spells_known: ['wall_of_fire'],
    prepared_spells: ['wall_of_fire'],
    spell_slots_max: { 4: 1 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ROOM, combat_active: true }),
    characters: [wiz],
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
        pos: { x: 1, y: 1 },
        hp: 40,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 1, y: 5 },
        hp: 60,
        maxHp: 60,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Wall of Fire — raises a concentration-bound opaque wall', () => {
  it('creates a sight-blocking wall and starts concentration on cast', async () => {
    // Constant high rolls: the caster keeps concentration through the ensuing
    // enemy turn (a failed CON save would otherwise tear the wall down).
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'wall_of_fire', slotLevel: 4, targetEnemyId: ENEMY },
      history: [],
      state: casterState(),
      seed: noEnemyBeyondSeed,
      context: ctx,
    });
    const walls = result.newState.spell_walls ?? [];
    expect(walls).toHaveLength(1);
    expect(walls[0].blocksLineOfSight).toBe(true);
    expect(walls[0].casterId).toBe('pc-1');
    // Centred on the target (1,5), perpendicular to the vertical approach →
    // a horizontal wall spanning row y=5.
    expect(walls[0].cells.some((c) => c.x === 1 && c.y === 5)).toBe(true);
    expect(result.newState.characters[0].concentrating_on?.spellId).toBe('wall_of_fire');
  });
});

describe('a standing wall blocks a ranged attack through it', () => {
  it('rejects a shot whose sightline crosses the wall', async () => {
    mockRandom(0.99);
    const state = {
      ...casterState(),
      // Re-arm the caster as an archer firing past the wall at a far enemy.
      characters: [
        makeChar({
          id: 'pc-1',
          character_class: 'Fighter',
          level: 5,
          dex: 16,
          hp: 40,
          max_hp: 40,
          inventory: [
            { instance_id: 'bow-1', id: 'shortbow', name: 'Shortbow' },
            { instance_id: 'arr-1', id: 'arrows', name: 'Arrows', quantity: 20 },
          ],
          equipment: { main_hand: 'bow-1' },
          weapon_proficiencies: ['simple', 'martial'],
        }),
      ],
      // Enemy beyond the wall row (y=5): at (1,7).
      entities: [
        {
          id: 'pc-1',
          isEnemy: false,
          pos: { x: 1, y: 1 },
          hp: 40,
          maxHp: 40,
          conditions: [],
          condition_durations: {},
        },
        {
          id: ENEMY,
          isEnemy: true,
          pos: { x: 1, y: 7 },
          hp: 60,
          maxHp: 60,
          conditions: [],
          condition_durations: {},
        },
      ],
      spell_walls: [
        wall({
          cells: [
            { x: 0, y: 5 },
            { x: 1, y: 5 },
            { x: 2, y: 5 },
          ],
        }),
      ],
    };
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state,
      seed: noEnemyBeyondSeed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/No line of sight/);
  });
});
