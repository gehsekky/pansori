// Per-attack weapon riders: Divine Favor + the smites (Searing / Shining /
// Ensnaring Strike).
//
// Divine Favor sets a persistent `weapon_rider` (every weapon hit gains +1d4
// radiant). The smites arm `pending_smite` on the next melee hit: bonus damage
// plus an on-hit effect — Shining Smite's Faerie-Fire-style Advantage, or
// Ensnaring Strike's STR-save-or-Restrained (save-ends). Both teardown via
// breakConcentration (concentration smites) and at combat end.

import type { GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { breakConcentration, takeAction } from './gameEngine.js';
import { makeChar, makeState } from '../test-fixtures.js';
import { SRD_SPELLS } from '../campaignData/srd/spells.js';
import { context as ctx } from '../campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#0`;

describe('weapon-rider spells — catalog', () => {
  it('Divine Favor is a persistent +1d4 radiant rider', () => {
    expect(SRD_SPELLS.divine_favor.weaponRider).toEqual({
      dice: '1d4',
      damageType: 'radiant',
      persistent: true,
    });
    expect(SRD_SPELLS.divine_favor.concentration).toBeUndefined();
  });
  it('Searing Smite arms +1d6 fire (non-concentration)', () => {
    expect(SRD_SPELLS.searing_smite.weaponRider).toEqual({ dice: '1d6', damageType: 'fire' });
    expect(SRD_SPELLS.searing_smite.concentration).toBeUndefined();
  });
  it('Shining Smite arms +2d6 radiant + Faerie-Fire (concentration)', () => {
    expect(SRD_SPELLS.shining_smite.weaponRider).toMatchObject({
      dice: '2d6',
      damageType: 'radiant',
      appliesFaerieFire: true,
    });
    expect(SRD_SPELLS.shining_smite.concentration).toBe(true);
  });
  it('Ensnaring Strike arms a STR-save Restrain (concentration)', () => {
    expect(SRD_SPELLS.ensnaring_strike.weaponRider).toMatchObject({
      appliesCondition: 'restrained',
      conditionSave: 'str',
    });
    expect(SRD_SPELLS.ensnaring_strike.spellList).toEqual(['primal']);
  });
});

const noEnemySeed: Seed = {
  context_id: ctx.id,
  world_name: 'Rider Test',
  ship_name: 'Rider Test',
  intro: '',
  seed_id: 'rider',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function casterState(spellId: string, slot: number) {
  const pal = makeChar({
    id: 'pc-1',
    character_class: 'Paladin',
    level: 5,
    cha: 16,
    hp: 44,
    max_hp: 44,
    spells_known: [spellId],
    prepared_spells: [spellId],
    spell_slots_max: { [slot]: 2 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall' }),
    characters: [pal],
    active_character_id: 'pc-1',
  };
}

describe('weapon-rider spells — cast arms the rider', () => {
  it('Divine Favor sets a persistent weapon_rider', async () => {
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'divine_favor', slotLevel: 1 },
      history: [],
      state: casterState('divine_favor', 1),
      seed: noEnemySeed,
      context: ctx,
    });
    expect(r.newState.characters[0].weapon_rider).toMatchObject({
      dice: '1d4',
      damageType: 'radiant',
      spellId: 'divine_favor',
    });
  });

  it('Shining Smite arms pending_smite + starts concentration', async () => {
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'shining_smite', slotLevel: 2 },
      history: [],
      state: casterState('shining_smite', 2),
      seed: noEnemySeed,
      context: ctx,
    });
    const pc = r.newState.characters[0];
    expect(pc.pending_smite).toMatchObject({ spellId: 'shining_smite', appliesFaerieFire: true });
    expect(pc.concentrating_on?.spellId).toBe('shining_smite');
  });

  it('Ensnaring Strike arms a restrain smite', async () => {
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'ensnaring_strike', slotLevel: 1 },
      history: [],
      state: casterState('ensnaring_strike', 1),
      seed: noEnemySeed,
      context: ctx,
    });
    expect(r.newState.characters[0].pending_smite).toMatchObject({
      appliesCondition: 'restrained',
      conditionSave: 'str',
    });
  });
});

// ── Rider effects on a hit ────────────────────────────────────────────────────
// High-CHA L17 Paladin (spell save DC 19) vs an enemy with STR 6 (−2): even a
// nat 20 save (18) fails, so Ensnaring's Restrain is deterministic. A second PC
// sits next in initiative so the attack hands off to them (no enemy turn / wrap)
// and the on-hit effect is read intact.
const combatSeed: Seed = {
  context_id: ctx.id,
  world_name: 'Rider Combat',
  ship_name: 'Rider Combat',
  intro: '',
  seed_id: 'rider-combat',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      { id: enemyId, name: 'Ogre', hp: 200, ac: 5, damage: '1d6', toHit: 3, xp: 50, str: 6 },
    ],
  },
  loot: {},
  npcs: {},
};

function attackState(rider: Partial<ReturnType<typeof makeChar>>) {
  const pal = makeChar({
    id: 'pc-1',
    character_class: 'Paladin',
    level: 17,
    cha: 20,
    str: 18,
    hp: 80,
    max_hp: 80,
    inventory: [{ instance_id: 'sw-1', id: 'longsword', name: 'Longsword' }],
    equipment: { main_hand: 'sw-1' },
    weapon_proficiencies: ['simple', 'martial'],
    ...rider,
  });
  const ally = makeChar({ id: 'pc-2', character_class: 'Fighter', level: 10, hp: 50, max_hp: 50 });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [pal, ally],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: 'pc-2', roll: 12, is_enemy: false },
      { id: enemyId, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
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
        id: 'pc-2',
        isEnemy: false,
        pos: { x: 4, y: 7 },
        hp: 50,
        maxHp: 50,
        conditions: [],
        condition_durations: {},
      },
      {
        id: enemyId,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 200,
        maxHp: 200,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('weapon-rider spells — on-hit effects', () => {
  it('Divine Favor adds radiant damage on a weapon hit', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // hit
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: attackState({
        weapon_rider: { dice: '1d4', damageType: 'radiant', spellId: 'divine_favor' },
      }),
      seed: combatSeed,
      context: ctx,
    });
    expect(r.narrative).toMatch(/Divine Favor/);
  });

  it('Shining Smite wreathes the target (faerie_fired) and consumes the smite', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // hit
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: attackState({
        pending_smite: {
          spellId: 'shining_smite',
          dice: '2d6',
          damageType: 'radiant',
          appliesFaerieFire: true,
        },
      }),
      seed: combatSeed,
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === enemyId && e.isEnemy);
    expect(ent?.conditions).toContain('faerie_fired');
    expect(ent?.condition_durations.faerie_fired).toBe(10);
    expect(r.newState.characters[0].pending_smite).toBeUndefined();
  });

  it('Ensnaring Strike restrains the target on a failed STR save (save-ends)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // hit; STR save (max 18) still fails vs DC 19
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: attackState({
        pending_smite: {
          spellId: 'ensnaring_strike',
          appliesCondition: 'restrained',
          conditionSave: 'str',
        },
      }),
      seed: combatSeed,
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === enemyId && e.isEnemy);
    expect(ent?.conditions).toContain('restrained');
    expect(ent?.save_ends?.restrained?.ability).toBe('str');
  });
});

describe('weapon-rider spells — teardown', () => {
  it('breakConcentration clears a concentration smite', () => {
    const char = makeChar({
      id: 'pc-1',
      pending_smite: { spellId: 'shining_smite', dice: '2d6', appliesFaerieFire: true },
      concentrating_on: { spellId: 'shining_smite', rounds_left: 10 },
    });
    const st = { characters: [char] } as unknown as GameState;
    const { char: after } = breakConcentration(char, st, ctx);
    expect(after.pending_smite).toBeUndefined();
  });
});
