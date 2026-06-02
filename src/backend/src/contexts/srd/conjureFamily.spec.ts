// 2024 SRD conjure-summon family — Conjure Animals, Minor Elementals, Woodland
// Beings, Elemental, Fey, Celestial. These are concentration effects (damage
// zones / a caster aura / a recurring strike / a weapon rider), NOT stat-block
// summons, so they ride the shipped zone / recurring-attack / weapon-rider
// paths. Tests confirm catalog shape + a real cast resolving its core effect.

import type { GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { SRD_SPELLS } from './spells.js';
import { context as ctx } from '../sandbox.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;

describe('conjure family — catalog', () => {
  it('registers each conjure spell on the expected path', () => {
    expect(SRD_SPELLS.conjure_animals).toMatchObject({
      level: 3,
      persistentZone: true,
      savingThrow: 'dex',
      zoneMoveFt: 30,
    });
    expect(SRD_SPELLS.conjure_minor_elementals).toMatchObject({ level: 4, targetType: 'self' });
    expect(SRD_SPELLS.conjure_minor_elementals.weaponRider?.dice).toBe('2d8');
    expect(SRD_SPELLS.conjure_woodland_beings).toMatchObject({
      level: 4,
      persistentZone: true,
      savingThrow: 'wis',
      rangeKind: 'self', // → caster-following aura
    });
    expect(SRD_SPELLS.conjure_elemental).toMatchObject({
      level: 5,
      persistentZone: true,
      damage: '8d8',
    });
    expect(SRD_SPELLS.conjure_fey).toMatchObject({
      level: 6,
      recurringAttack: true,
      damageType: 'psychic',
    });
    expect(SRD_SPELLS.conjure_celestial).toMatchObject({
      level: 7,
      persistentZone: true,
      damageType: 'radiant',
      zoneMoveFt: 30,
    });
    // All are concentration.
    for (const id of [
      'conjure_animals',
      'conjure_minor_elementals',
      'conjure_woodland_beings',
      'conjure_elemental',
      'conjure_fey',
      'conjure_celestial',
    ] as const) {
      expect(SRD_SPELLS[id].concentration, id).toBe(true);
    }
  });
});

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Conjure Test',
  ship_name: 'Conjure Test',
  intro: '',
  seed_id: 'conjure',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      { id: ENEMY, name: 'Ogre', hp: 300, ac: 10, damage: '1d6', toHit: 3, xp: 50, dex: 8, wis: 8 },
    ],
  },
  loot: {},
  npcs: {},
};

function druidState(): GameState {
  const druid = makeChar({
    id: 'pc-1',
    character_class: 'Druid',
    level: 20,
    wis: 18,
    hp: 80,
    max_hp: 80,
    spells_known: [
      'conjure_animals',
      'conjure_minor_elementals',
      'conjure_woodland_beings',
      'conjure_elemental',
      'conjure_fey',
      'conjure_celestial',
    ],
    prepared_spells: [
      'conjure_animals',
      'conjure_minor_elementals',
      'conjure_woodland_beings',
      'conjure_elemental',
      'conjure_fey',
      'conjure_celestial',
    ],
    spell_slots_max: { 3: 2, 4: 2, 5: 2, 6: 1, 7: 1 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [druid],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: ENEMY, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    round: 1,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: 80,
        maxHp: 80,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 300,
        maxHp: 300,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

async function cast(spellId: string, slotLevel: number, random: number) {
  vi.spyOn(Math, 'random').mockReturnValue(random);
  return takeAction({
    action: { type: 'cast_spell', spellId, slotLevel, targetEnemyId: ENEMY },
    history: [],
    state: druidState(),
    seed,
    context: ctx,
  });
}

describe('conjure family — casts resolve', () => {
  it('Conjure Animals places a DEX-save zone and damages the enemy on cast', async () => {
    const r = await cast('conjure_animals', 3, 0.01); // enemy fails the DEX save
    expect(r.newState.spell_zones?.some((z) => z.spellId === 'conjure_animals')).toBe(true);
    expect(r.newState.entities?.find((e) => e.id === ENEMY)!.hp).toBeLessThan(300);
    expect(r.newState.characters[0].concentrating_on?.spellId).toBe('conjure_animals');
  });

  it('Conjure Woodland Beings is a caster-following aura that hits an adjacent enemy', async () => {
    const r = await cast('conjure_woodland_beings', 4, 0.01); // WIS save fails
    const z = r.newState.spell_zones?.find((x) => x.spellId === 'conjure_woodland_beings');
    expect(z?.followsCaster).toBe(true);
    expect(r.newState.entities?.find((e) => e.id === ENEMY)!.hp).toBeLessThan(300);
  });

  it('Conjure Elemental places an 8d8 DEX-save zone', async () => {
    const r = await cast('conjure_elemental', 5, 0.01);
    expect(r.newState.spell_zones?.some((z) => z.spellId === 'conjure_elemental')).toBe(true);
    expect(r.newState.entities?.find((e) => e.id === ENEMY)!.hp).toBeLessThan(300);
  });

  it('Conjure Fey strikes on cast and arms the recurring attack', async () => {
    const r = await cast('conjure_fey', 6, 0.99); // attack roll hits
    expect(r.newState.entities?.find((e) => e.id === ENEMY)!.hp).toBeLessThan(300);
    expect(r.newState.characters[0].recurring_attack).toBeTruthy();
  });

  it('Conjure Celestial places a radiant DEX-save zone', async () => {
    const r = await cast('conjure_celestial', 7, 0.01);
    expect(r.newState.spell_zones?.some((z) => z.spellId === 'conjure_celestial')).toBe(true);
    expect(r.newState.entities?.find((e) => e.id === ENEMY)!.hp).toBeLessThan(300);
  });

  it('Conjure Minor Elementals arms a persistent weapon rider', async () => {
    const r = await cast('conjure_minor_elementals', 4, 0.5);
    expect(r.newState.characters[0].weapon_rider?.dice).toBe('2d8');
    expect(r.newState.characters[0].concentrating_on?.spellId).toBe('conjure_minor_elementals');
  });
});
