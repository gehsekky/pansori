// SRD dual-damage AoE spells (Flame Strike = fire + radiant, Ice Storm =
// bludgeoning + cold) and Phantasmal Killer (single-target psychic + a
// Frightened rider). Verifies catalog shape and that BOTH damage components
// land through the real AoE path (deterministic maxed-dice deltas).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { SRD_SPELLS } from './spells.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../sandbox.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `${ctx.startRoomId}#0`;

describe('dual-damage spells — catalog', () => {
  it('Flame Strike and Ice Storm carry both damage components', () => {
    expect(SRD_SPELLS.flame_strike.damage).toBe('5d6');
    expect(SRD_SPELLS.flame_strike.damageType).toBe('fire');
    expect(SRD_SPELLS.flame_strike.damage2).toBe('5d6');
    expect(SRD_SPELLS.flame_strike.damageType2).toBe('radiant');
    expect(SRD_SPELLS.ice_storm.damage2).toBe('4d6');
    expect(SRD_SPELLS.ice_storm.damageType2).toBe('cold');
  });
  it('Phantasmal Killer is a concentration save spell with a Frightened rider', () => {
    expect(SRD_SPELLS.phantasmal_killer.condition).toBe('frightened');
    expect(SRD_SPELLS.phantasmal_killer.concentration).toBe(true);
    expect(SRD_SPELLS.phantasmal_killer.savingThrow).toBe('wis');
  });
});

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Dual Damage Test',
  ship_name: 'Dual Damage Test',
  intro: '',
  seed_id: 'dual-dmg',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      {
        id: ENEMY,
        name: 'Ogre',
        hp: 400,
        ac: 10,
        damage: '1d6',
        toHit: 3,
        xp: 50,
        dex: 10,
        wis: 10,
      },
    ],
  },
  loot: {},
  npcs: {},
};

// Cleric (not an Evoker, so no Empowered Evocation bonus) who happens to know
// all three — the engine doesn't gate casting by class list, so this isolates
// the damage math.
function casterState() {
  const cleric = makeChar({
    id: 'pc-1',
    character_class: 'Cleric',
    level: 13,
    wis: 18,
    hp: 60,
    max_hp: 60,
    spells_known: ['flame_strike', 'ice_storm', 'phantasmal_killer'],
    prepared_spells: ['flame_strike', 'ice_storm', 'phantasmal_killer'],
    spell_slots_max: { 4: 2, 5: 1 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [cleric],
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
        hp: 60,
        maxHp: 60,
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

describe('dual-damage spells — both components land', () => {
  it('Flame Strike: maxed dice, save succeeds → (5d6 + 5d6)/2 = 30', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // every die maxed; DEX save rolls 20 → succeeds (half)
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'flame_strike', slotLevel: 5, targetEnemyId: ENEMY },
      history: [],
      state: casterState(),
      seed,
      context: ctx,
    });
    expect(400 - hpOf(r)).toBe(30); // primary-only would be 15
  });

  it('Ice Storm: maxed dice, save succeeds → (2d10 + 4d6)/2 = 22', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'ice_storm', slotLevel: 4, targetEnemyId: ENEMY },
      history: [],
      state: casterState(),
      seed,
      context: ctx,
    });
    expect(400 - hpOf(r)).toBe(22); // primary-only would be 10
  });
});

describe('Phantasmal Killer — Frightened on a failed save', () => {
  it('applies Frightened and deals psychic damage when the save fails', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0); // WIS save rolls 1 → fails
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'phantasmal_killer',
        slotLevel: 4,
        targetEnemyId: ENEMY,
      },
      history: [],
      state: casterState(),
      seed,
      context: ctx,
    });
    expect(r.newState.entities?.find((e) => e.id === ENEMY)?.conditions).toContain('frightened');
    expect(hpOf(r)).toBeLessThan(400);
  });
});
