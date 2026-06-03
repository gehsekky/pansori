// SRD Arcane Hand (L5 "Bigby's Hand") — Clenched Fist modeled as a recurring
// force melee spell attack (the Spiritual Weapon / Arcane Sword machinery).
// Catalog + a cast that damages the target and records the recurring attack.

import type { Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { SRD_SPELLS } from './spells.js';
import { context as ctx } from '../sandbox.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = 'entry_hall#0';

describe('Arcane Hand — catalog', () => {
  it('is a 5th-level recurring force attack (no spell-mod rider), upcast +2d8', () => {
    const s = SRD_SPELLS.arcane_hand;
    expect(s.level).toBe(5);
    expect(s.recurringAttack).toBe(true);
    expect(s.recurringAttackCost).toBe('bonus_action');
    expect(s.recurringAddSpellMod).toBeUndefined(); // Clenched Fist adds no ability mod
    expect(s.damage).toBe('5d8');
    expect(s.damageType).toBe('force');
    expect(s.upcastBonus).toBe('2d8');
    expect(s.concentration).toBe(true);
    expect(s.spellList).toEqual(['arcane']);
  });
});

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Hand Test',
  ship_name: 'Hand Test',
  intro: '',
  seed_id: 'hand',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    entry_hall: [
      {
        id: ENEMY,
        name: 'Ogre',
        hp: 200,
        ac: 10,
        damage: '1d6',
        toHit: 3,
        xp: 50,
        dex: 8,
        con: 8,
        wis: 8,
      } as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function wizCaster(): GameState {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 18,
    int: 20,
    hp: 90,
    max_hp: 90,
    spells_known: ['arcane_hand'],
    prepared_spells: ['arcane_hand'],
    spell_slots_max: { 5: 1 },
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
    round: 1,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: 90,
        maxHp: 90,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
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

describe('Arcane Hand — recurring force fist', () => {
  it('deals force damage on cast and records the recurring bonus-action attack', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // attack roll lands
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'arcane_hand', slotLevel: 5, targetEnemyId: ENEMY },
      history: [],
      state: wizCaster(),
      seed,
      context: ctx,
    });
    const hp = r.newState.entities?.find((e) => e.id === ENEMY)?.hp ?? 200;
    expect(hp).toBeLessThan(200);
    const recurring = r.newState.characters[0].recurring_attack;
    expect(recurring?.spellId).toBe('arcane_hand');
    expect(recurring?.cost).toBe('bonus_action');
    // 5d8 force, no ability modifier baked into the expression.
    expect(recurring?.damage).toBe('5d8');
    expect(r.newState.characters[0].concentrating_on?.spellId).toBe('arcane_hand');
  });
});
