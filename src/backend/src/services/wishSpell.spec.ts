// SRD Wish (basic use) — duplicate any spell of level 8 or lower for free (no
// slot, prep, material, or level prerequisite). Wish itself still costs its
// 9th-level slot; the duplicated spell rides on the same action.

import type { GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';
import { SRD_SPELLS } from '../campaignData/srd/spells.js';
import { context as ctx } from '../campaignData/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = 'entry_hall#0';

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Wish Test',
  ship_name: 'Wish Test',
  intro: '',
  seed_id: 'wish',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    entry_hall: [
      { id: ENEMY, name: 'Ogre', hp: 400, ac: 10, damage: '1d6', toHit: 3, xp: 50, dex: 10 },
    ],
  },
  loot: {},
  npcs: {},
};

// Wizard who knows ONLY Wish — proves a duplicate need not be known/prepared.
function wisher(): GameState {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 18,
    int: 20,
    hp: 80,
    max_hp: 80,
    gold: 0, // proves a duplicate's material component isn't charged
    spells_known: ['wish'],
    prepared_spells: ['wish'],
    spell_slots_max: { 3: 2, 9: 1 },
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

describe('Wish — catalog', () => {
  it('is a 9th-level spell', () => {
    expect(SRD_SPELLS.wish.level).toBe(9);
  });
});

describe('Wish — duplicate a spell (basic use)', () => {
  it('duplicates Fireball for free: enemy takes damage, the 9th slot is spent but the 3rd is not', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'wish',
        slotLevel: 9,
        wishSpellId: 'fireball',
        targetEnemyId: ENEMY,
      },
      history: [],
      state: wisher(),
      seed,
      context: ctx,
    });
    expect(r.newState.entities?.find((e) => e.id === ENEMY)?.hp).toBeLessThan(400); // Fireball landed
    expect(r.newState.characters[0].spell_slots_used?.[9]).toBe(1); // Wish spent its slot
    expect(r.newState.characters[0].spell_slots_used?.[3] ?? 0).toBe(0); // duplicate was free
  });

  it('can duplicate a spell the caster does not know/prepare', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'wish',
        slotLevel: 9,
        wishSpellId: 'cone_of_cold',
        targetEnemyId: ENEMY,
      },
      history: [],
      state: wisher(), // knows only Wish
      seed,
      context: ctx,
    });
    expect(r.newState.entities?.find((e) => e.id === ENEMY)?.hp).toBeLessThan(400);
  });

  it('rejects a 9th-level duplicate (only level 1-8 allowed) and falls back to narrative', async () => {
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'wish', slotLevel: 9, wishSpellId: 'meteor_swarm' },
      history: [],
      state: wisher(),
      seed,
      context: ctx,
    });
    // Meteor Swarm is 9th level → not a valid duplicate; Wish resolves as its
    // open-ended narrative use, and the enemy is untouched.
    expect(r.newState.entities?.find((e) => e.id === ENEMY)?.hp).toBe(400);
    expect(r.newState.characters[0].spell_slots_used?.[9]).toBe(1); // Wish still spent its slot
  });
});
