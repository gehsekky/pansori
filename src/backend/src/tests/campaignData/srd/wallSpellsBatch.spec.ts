// SRD wall spells — Wall of Force, Wall of Stone, Wall of Ice, Wall of Thorns.
// All ride the generalized SpellWall path (`spell.wall`): the barrier is anchored
// on the target, perpendicular to the caster→target approach, and bound to the
// caster's concentration. Damage walls (Ice / Thorns) deal formation damage as a
// line AoE first. Tests confirm catalog flags + a real cast.

import type { GameState, Seed } from '../../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../test-fixtures.js';
import { SRD_SPELLS } from '../../../campaignData/srd/spells.js';
import { context as ctx } from '../../../campaignData/sandbox.js';
import { takeAction } from '../../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;

describe('wall spells — catalog', () => {
  it('registers each wall with the expected barrier flags', () => {
    expect(SRD_SPELLS.wall_of_force.wall).toEqual({
      blocksMovement: true,
      blocksLineOfSight: false,
    });
    expect(SRD_SPELLS.wall_of_stone.wall).toEqual({
      blocksMovement: true,
      blocksLineOfSight: true,
    });
    expect(SRD_SPELLS.wall_of_ice).toMatchObject({
      level: 6,
      damage: '10d6',
      savingThrow: 'dex',
      wall: { blocksMovement: true, blocksLineOfSight: true },
    });
    expect(SRD_SPELLS.wall_of_thorns).toMatchObject({
      level: 6,
      damage: '7d8',
      wall: { blocksMovement: false, blocksLineOfSight: true },
    });
  });
});

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Wall Batch Test',
  ship_name: 'Wall Batch Test',
  intro: '',
  seed_id: 'wall-batch',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      { id: ENEMY, name: 'Ogre', hp: 200, ac: 10, damage: '1d6', toHit: 3, xp: 50, dex: 8 },
    ],
  },
  loot: {},
  npcs: {},
};

function casterState(): GameState {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 11,
    int: 18,
    hp: 50,
    max_hp: 50,
    spells_known: ['wall_of_force', 'wall_of_stone', 'wall_of_ice', 'wall_of_thorns'],
    prepared_spells: ['wall_of_force', 'wall_of_stone', 'wall_of_ice', 'wall_of_thorns'],
    spell_slots_max: { 5: 2, 6: 2 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [wiz],
    active_character_id: 'pc-1',
    // PC-only initiative: the cast resolves without an enemy counterattack that
    // could randomly break concentration (and tear the wall down).
    initiative_order: [{ id: 'pc-1', roll: 18, is_enemy: false }],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 1, y: 1 },
        hp: 50,
        maxHp: 50,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 1, y: 5 },
        hp: 200,
        maxHp: 200,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

async function castWall(spellId: string, slotLevel: number) {
  vi.spyOn(Math, 'random').mockReturnValue(0.01); // any save (Ice/Thorns) fails → full damage
  return takeAction({
    action: { type: 'cast_spell', spellId, slotLevel, targetEnemyId: ENEMY },
    history: [],
    state: casterState(),
    seed,
    context: ctx,
  });
}

describe('wall spells — barrier-only (Force, Stone)', () => {
  it('Wall of Force raises an impassable, transparent barrier (no damage)', async () => {
    const r = await castWall('wall_of_force', 5);
    const w = r.newState.spell_walls?.find((x) => x.spellId === 'wall_of_force');
    expect(w).toBeDefined();
    expect(w?.blocksMovement).toBe(true);
    expect(w?.blocksLineOfSight).toBe(false);
    expect(r.newState.entities?.find((e) => e.id === ENEMY)!.hp).toBe(200); // no damage
    expect(r.newState.characters[0].concentrating_on?.spellId).toBe('wall_of_force');
  });

  it('Wall of Stone raises a solid, opaque barrier (no damage)', async () => {
    const r = await castWall('wall_of_stone', 5);
    const w = r.newState.spell_walls?.find((x) => x.spellId === 'wall_of_stone');
    expect(w?.blocksMovement).toBe(true);
    expect(w?.blocksLineOfSight).toBe(true);
    expect(r.newState.entities?.find((e) => e.id === ENEMY)!.hp).toBe(200);
  });
});

describe('wall spells — damage walls (Ice, Thorns)', () => {
  it('Wall of Ice deals cold formation damage and raises an opaque barrier', async () => {
    const r = await castWall('wall_of_ice', 6);
    const w = r.newState.spell_walls?.find((x) => x.spellId === 'wall_of_ice');
    expect(w?.blocksMovement).toBe(true);
    expect(w?.blocksLineOfSight).toBe(true);
    expect(r.newState.entities?.find((e) => e.id === ENEMY)!.hp).toBeLessThan(200); // 10d6 cold
  });

  it('Wall of Thorns deals piercing damage and is a passable (sight-blocking) barrier', async () => {
    const r = await castWall('wall_of_thorns', 6);
    const w = r.newState.spell_walls?.find((x) => x.spellId === 'wall_of_thorns');
    expect(w?.blocksMovement).toBe(false); // difficult terrain, not a hard wall
    expect(w?.blocksLineOfSight).toBe(true);
    expect(r.newState.entities?.find((e) => e.id === ENEMY)!.hp).toBeLessThan(200); // 7d8 piercing
  });
});
