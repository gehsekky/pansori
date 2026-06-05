// SRD Magic Weapon (L2): touch a weapon for a flat +N (attack + damage),
// concentration, 1 hour. +1 base, +2 at slot 4, +3 at slot 6. Mechanized via
// Character.weapon_enhancement (toHit + resolveOneAttack), cleared on conc drop.

import type { Enemy, GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { breakConcentration, takeAction } from './gameEngine.js';
import { makeChar, makeState } from '../test-fixtures.js';
import { context as ctx } from '../campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Magic Weapon Test',
  ship_name: 'Magic Weapon Test',
  intro: '',
  seed_id: 'magic-weapon',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: ENEMY,
        name: 'Stag',
        hp: 120,
        ac: 5,
        damage: '1d6',
        toHit: 3,
        xp: 50,
      } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function casterState(enhancement?: number): GameState {
  const char = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 6,
    str: 16,
    int: 16,
    spell_slots_max: { 2: 2, 4: 1 },
    spell_slots_used: {},
    spells_known: ['magic_weapon'],
    spells_prepared: ['magic_weapon'],
    equipment: { main_hand: 'sw-1' },
    inventory: [{ instance_id: 'sw-1', id: 'shortsword', name: 'Shortsword' }],
    weapon_proficiencies: ['simple', 'martial'],
    ...(enhancement ? { weapon_enhancement: enhancement } : {}),
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [char],
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
        pos: { x: 4, y: 5 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 120,
        maxHp: 120,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

describe('Magic Weapon — cast sets the enhancement + concentration', () => {
  it('grants +1 at the base slot (self)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'magic_weapon', slotLevel: 2, targetCharId: 'pc-1' },
      history: [],
      state: casterState(),
      seed,
      context: ctx,
    });
    const c = r.newState.characters[0];
    expect(c.weapon_enhancement).toBe(1);
    expect(c.concentrating_on?.spellId).toBe('magic_weapon');
  });

  it('upcasts to +2 at slot 4', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'magic_weapon', slotLevel: 4, targetCharId: 'pc-1' },
      history: [],
      state: casterState(),
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].weapon_enhancement).toBe(2);
  });
});

describe('Magic Weapon — attack bonus', () => {
  it('adds the enhancement to the weapon hit (noted in the attack)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 → 20, hits
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: casterState(2),
      seed,
      context: ctx,
    });
    expect(r.narrative).toMatch(/\+2 \(Magic Weapon\)/);
  });
});

describe('Magic Weapon — concentration', () => {
  it('breaking concentration clears the enhancement', () => {
    const char = makeChar({
      character_class: 'Wizard',
      level: 6,
      weapon_enhancement: 2,
      concentrating_on: { spellId: 'magic_weapon', rounds_left: 600 },
    });
    const state = makeState({}, { characters: [char] });
    const { char: after } = breakConcentration(char, state, ctx);
    expect(after.weapon_enhancement).toBeUndefined();
    expect(after.concentrating_on).toBeNull();
  });
});
