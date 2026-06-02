// Non-concentration persistent-zone teardown (Guardian of Faith). Concentration
// zones are torn down by breakConcentration; non-concentration zones instead
// carry their own lifetime: a `rounds_left` budget (decremented each round wrap)
// and/or a `damageCap` (cumulative damage), and any leftover zone is cleared at
// combat end. Covers fireSpellZones expiry, endCombatState, and the spell.

import type { GameState, Seed, SpellZone } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { endCombatState, fireSpellZones, takeAction } from './gameEngine.js';
import { makeChar, makeState } from '../test-fixtures.js';
import { SRD_SPELLS } from '../campaignData/srd/spells.js';
import { context as ctx } from '../campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Zone Teardown Test',
  ship_name: 'Zone Teardown Test',
  intro: '',
  seed_id: 'zone-teardown',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      { id: ENEMY, name: 'Ogre', hp: 500, ac: 10, damage: '1d6', toHit: 3, xp: 50, con: 8, dex: 8 },
    ],
  },
  loot: {},
  npcs: {},
};

function stateWithZone(over: Partial<SpellZone> = {}): GameState {
  const cleric = makeChar({
    id: 'pc-1',
    character_class: 'Cleric',
    level: 9,
    wis: 18,
    spells_known: ['guardian_of_faith'],
    prepared_spells: ['guardian_of_faith'],
    spell_slots_max: { 4: 2 },
    spell_slots_used: {},
  });
  const zone: SpellZone = {
    id: 'z1',
    casterId: 'pc-1',
    spellId: 'guardian_of_faith',
    name: 'Guardian of Faith',
    roomId: 'entry_hall',
    cells: [{ x: 5, y: 5 }],
    damage: '20',
    damageType: 'radiant',
    savingThrow: 'dex',
    saveEffect: 'half',
    saveDC: 99, // unbeatable → save always fails → full 20 per tick
    damageDealt: 0,
    ...over,
  };
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [cleric],
    active_character_id: 'pc-1',
    initiative_order: [{ id: 'pc-1', roll: 18, is_enemy: false }],
    initiative_idx: 0,
    spell_zones: [zone],
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
        pos: { x: 5, y: 5 },
        hp: 500,
        maxHp: 500,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as GameState;
}

describe('Guardian of Faith — catalog', () => {
  it('is a non-concentration persistent zone with a 60-damage cap', () => {
    const g = SRD_SPELLS.guardian_of_faith;
    expect(g).toMatchObject({
      level: 4,
      persistentZone: true,
      zoneDamageCap: 60,
      savingThrow: 'dex',
      saveEffect: 'half',
      damageType: 'radiant',
    });
    expect(g.concentration).toBeFalsy();
  });
});

describe('fireSpellZones — round-budget expiry', () => {
  it('decrements rounds_left and removes the zone at 0', () => {
    const st = stateWithZone({ rounds_left: 2, damage: '1' });
    const r1 = fireSpellZones(st, seed, ctx);
    expect(r1.st.spell_zones?.[0]?.rounds_left).toBe(1); // survived one wrap
    const r2 = fireSpellZones(r1.st, seed, ctx);
    expect(r2.st.spell_zones?.length).toBe(0); // expired
    expect(r2.narrative).toMatch(/fades/);
  });

  it('leaves a concentration-style zone (no rounds_left/cap) in place', () => {
    const st = stateWithZone({ rounds_left: undefined, damageCap: undefined, damage: '1' });
    const r = fireSpellZones(st, seed, ctx);
    expect(r.st.spell_zones?.length).toBe(1);
    expect(r.st.spell_zones?.[0]?.rounds_left).toBeUndefined();
  });
});

describe('fireSpellZones — damage cap', () => {
  it('accumulates damage and removes the zone once the cap is met', () => {
    // 20 radiant/tick vs an unbeatable DC; cap 60 → removed on the 3rd tick.
    const st = stateWithZone({ damageCap: 60 });
    const r1 = fireSpellZones(st, seed, ctx);
    expect(r1.st.spell_zones?.[0]?.damageDealt).toBe(20);
    const r2 = fireSpellZones(r1.st, seed, ctx);
    expect(r2.st.spell_zones?.[0]?.damageDealt).toBe(40);
    const r3 = fireSpellZones(r2.st, seed, ctx);
    expect(r3.st.spell_zones?.length).toBe(0); // 60 dealt → fades
  });
});

describe('endCombatState — clears lingering zones', () => {
  it('wipes spell_zones when combat ends', () => {
    const st = stateWithZone();
    expect(st.spell_zones?.length).toBe(1);
    const ended = endCombatState(st);
    expect(ended.spell_zones).toEqual([]);
  });
});

describe('Guardian of Faith — cast', () => {
  it('places a non-concentration zone and damages an enemy in the area on cast', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // enemy DEX save → 1 → fails
    const st = stateWithZone();
    st.spell_zones = []; // cast fresh (no pre-placed zone)
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'guardian_of_faith',
        slotLevel: 4,
        targetEnemyId: ENEMY,
      },
      history: [],
      state: st,
      seed,
      context: ctx,
    });
    const z = r.newState.spell_zones?.find((x) => x.spellId === 'guardian_of_faith');
    expect(z).toBeDefined();
    expect(z?.damageCap).toBe(60);
    expect(r.newState.characters[0].concentrating_on).toBeFalsy(); // NOT concentration
    const e = r.newState.entities?.find((x) => x.id === ENEMY);
    expect(e!.hp).toBeLessThan(500); // took radiant on cast
  });
});
