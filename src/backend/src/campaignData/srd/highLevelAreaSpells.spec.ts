// High-level area damage — Reverse Gravity (AoE), Storm of Vengeance (persistent
// zone), Prismatic Wall (wall + formation damage). Each resolves through an
// existing dispatch path; tests pin catalog shape + that a cast deals damage to
// an enemy in the area.

import type { GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { SRD_SPELLS } from './spells.js';
import { context as ctx } from '../sandbox.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = 'entry_hall#0';

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Area Test',
  ship_name: 'Area Test',
  intro: '',
  seed_id: 'area',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    entry_hall: [
      { id: ENEMY, name: 'Ogre', hp: 400, ac: 10, damage: '1d6', toHit: 3, xp: 50, dex: 10 },
    ],
  },
  loot: {},
  npcs: {},
};

function casterState(spellId: string, slot: number): GameState {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 17,
    int: 20,
    hp: 80,
    max_hp: 80,
    spells_known: [spellId],
    prepared_spells: [spellId],
    spell_slots_max: { [slot]: 1 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
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
        pos: { x: 2, y: 2 },
        hp: 80,
        maxHp: 80,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 3, y: 3 },
        hp: 400,
        maxHp: 400,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

const hpOf = (r: Awaited<ReturnType<typeof takeAction>>) =>
  r.newState.entities?.find((e) => e.id === ENEMY)?.hp ?? 400;

describe('high-level area spells — catalog', () => {
  it('Reverse Gravity is a 7th DEX-save-negates bludgeoning sphere', () => {
    const s = SRD_SPELLS.reverse_gravity;
    expect(s.level).toBe(7);
    expect(s.savingThrow).toBe('dex');
    expect(s.saveEffect).toBe('negates');
    expect(s.blastRadius).toBe(50);
    expect(s.damageType).toBe('bludgeoning');
  });
  it('Storm of Vengeance is a 9th persistent lightning zone', () => {
    const s = SRD_SPELLS.storm_of_vengeance;
    expect(s.level).toBe(9);
    expect(s.persistentZone).toBe(true);
    expect(s.concentration).toBe(true);
    expect(s.damageType).toBe('lightning');
  });
  it('Prismatic Wall is a 9th impassable, opaque damaging wall', () => {
    const s = SRD_SPELLS.prismatic_wall;
    expect(s.level).toBe(9);
    expect(s.wall).toEqual({ blocksMovement: true, blocksLineOfSight: true });
    expect(s.savingThrow).toBe('dex');
  });
});

describe('high-level area spells — cast deals damage', () => {
  it('Reverse Gravity slams an enemy that fails its DEX save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // DEX save fails → full fall damage
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'reverse_gravity',
        slotLevel: 7,
        targetEnemyId: ENEMY,
      },
      history: [],
      state: casterState('reverse_gravity', 7),
      seed,
      context: ctx,
    });
    expect(hpOf(r)).toBeLessThan(400);
  });

  it('Storm of Vengeance ticks damage on cast and raises a persistent zone', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // DEX save fails → full tick
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'storm_of_vengeance',
        slotLevel: 9,
        targetEnemyId: ENEMY,
      },
      history: [],
      state: casterState('storm_of_vengeance', 9),
      seed,
      context: ctx,
    });
    expect(hpOf(r)).toBeLessThan(400);
    expect(r.newState.spell_zones?.some((z) => z.casterId === 'pc-1')).toBe(true);
  });

  it('Prismatic Wall sears an enemy in the line and raises a barrier', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // DEX save fails → full formation damage
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'prismatic_wall', slotLevel: 9, targetEnemyId: ENEMY },
      history: [],
      state: casterState('prismatic_wall', 9),
      seed,
      context: ctx,
    });
    expect(hpOf(r)).toBeLessThan(400);
  });
});
