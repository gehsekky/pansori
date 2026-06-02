// RE-4 — recurring spell attacks (Spiritual Weapon, Vampiric Touch). On cast
// the caster makes a spell attack and records `recurring_attack`; on later
// turns it's re-issued via the recurring_spell_attack action for the spell's
// cost (Bonus Action / Magic action). Vampiric Touch heals the caster and is
// concentration-bound; Spiritual Weapon is non-concentration and adds the
// spellcasting modifier to damage.

import type { GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { breakConcentration, takeAction } from './gameEngine.js';
import { makeChar, makeState } from '../test-fixtures.js';
import { context as ctx } from '../campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Recurring Attack Test',
  ship_name: 'Recurring Attack Test',
  intro: '',
  seed_id: 'recurring',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [{ id: ENEMY, name: 'Ogre', hp: 200, ac: 5, damage: '1d6', toHit: 3, xp: 50 }],
  },
  loot: {},
  npcs: {},
};

function casterState(
  charClass: string,
  spellId: string,
  ability: Partial<{ wis: number; int: number }>,
  hp = 40
): GameState {
  const caster = makeChar({
    id: 'pc-1',
    character_class: charClass,
    level: 5,
    hp,
    max_hp: 40,
    wis: ability.wis ?? 10,
    int: ability.int ?? 10,
    spells_known: [spellId],
    prepared_spells: [spellId],
    spell_slots_max: { 1: 4, 2: 3, 3: 2 },
    spell_slots_used: {},
  });
  return {
    // PC-only initiative so an action-cost cast's turn-advance doesn't draw a
    // concentration-breaking counterattack (keeps these tests deterministic).
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [caster],
    active_character_id: 'pc-1',
    initiative_order: [{ id: 'pc-1', roll: 18, is_enemy: false }],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 1, y: 1 },
        hp,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 2, y: 2 },
        hp: 200,
        maxHp: 200,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Spiritual Weapon — recurring force attack (Bonus Action)', () => {
  it('cast records a non-concentration recurring attack and strikes on cast', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // spell attack hits
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'spiritual_weapon',
        slotLevel: 2,
        targetEnemyId: ENEMY,
      },
      history: [],
      state: casterState('Cleric', 'spiritual_weapon', { wis: 18 }),
      seed,
      context: ctx,
    });
    const pc = r.newState.characters[0];
    expect(pc.recurring_attack?.spellId).toBe('spiritual_weapon');
    expect(pc.recurring_attack?.cost).toBe('bonus_action');
    expect(pc.recurring_attack?.concentration).toBeFalsy();
    expect(r.newState.entities?.find((e) => e.id === ENEMY)?.hp).toBeLessThan(200);
  });

  it('re-issues the attack as a bonus action on a later turn', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const st = casterState('Cleric', 'spiritual_weapon', { wis: 18 });
    st.characters[0].recurring_attack = {
      spellId: 'spiritual_weapon',
      name: 'Spiritual Weapon',
      damage: '1d8+4',
      damageType: 'force',
      castingScore: 18,
      cost: 'bonus_action',
      rounds_left: 9,
    };
    const r = await takeAction({
      action: { type: 'recurring_spell_attack', targetEnemyId: ENEMY },
      history: [],
      state: st,
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].turn_actions.bonus_action_used).toBe(true);
    expect(r.newState.entities?.find((e) => e.id === ENEMY)?.hp).toBeLessThan(200);
  });
});

describe('Vampiric Touch — recurring necrotic attack that heals (Magic action)', () => {
  it('cast deals necrotic, heals the caster, and links concentration', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // attack hits, max damage
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'vampiric_touch', slotLevel: 3, targetEnemyId: ENEMY },
      history: [],
      state: casterState('Wizard', 'vampiric_touch', { int: 18 }, 20), // wounded caster
      seed,
      context: ctx,
    });
    const pc = r.newState.characters[0];
    expect(pc.recurring_attack?.spellId).toBe('vampiric_touch');
    expect(pc.recurring_attack?.concentration).toBe(true);
    expect(pc.concentrating_on?.spellId).toBe('vampiric_touch');
    expect(r.newState.entities?.find((e) => e.id === ENEMY)?.hp).toBeLessThan(200);
    expect(pc.hp).toBeGreaterThan(20); // healed by half the damage dealt
  });

  it('breakConcentration ends the recurring attack', () => {
    const caster = makeChar({
      id: 'pc-1',
      concentrating_on: { spellId: 'vampiric_touch', rounds_left: 10 },
      recurring_attack: {
        spellId: 'vampiric_touch',
        name: 'Vampiric Touch',
        damage: '3d6',
        damageType: 'necrotic',
        castingScore: 18,
        cost: 'action',
        healFraction: 0.5,
        rounds_left: 10,
        concentration: true,
      },
    });
    const st = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall' }),
      characters: [caster],
    };
    const res = breakConcentration(caster, st, ctx);
    expect(res.char.recurring_attack).toBeNull();
  });

  it('rejects a re-issue when there is no active recurring attack', async () => {
    const r = await takeAction({
      action: { type: 'recurring_spell_attack', targetEnemyId: ENEMY },
      history: [],
      state: casterState('Wizard', 'vampiric_touch', { int: 18 }),
      seed,
      context: ctx,
    });
    expect(r.narrative).toMatch(/no active spell attack/i);
  });
});
