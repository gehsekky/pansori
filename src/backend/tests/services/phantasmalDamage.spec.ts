// Recurring "save-ends" damage — Phantasmal Killer (4d10) and Phantasmal Force
// (2d8). A creature afflicted with a recurring save-ends condition takes the
// illusion's psychic damage again on each FAILED end-of-turn save; a successful
// save clears the condition and ends the spell. Driven by the enemy turn loop
// reading `save_ends[cond].recurDice`. Mirrors the save-ends harness.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../src/test-fixtures.js';
import { SRD_SPELLS } from '../../src/campaignData/srd/spells.js';
import type { Seed } from '../../src/types.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';
import { takeAction } from '../../src/services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = 'entry_hall#0';

const seedWith = (hp: number): Seed => ({
  context_id: ctx.id,
  world_name: 'Phantasm Test',
  ship_name: 'Phantasm Test',
  intro: '',
  seed_id: 'phantasm',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    entry_hall: [{ id: enemyId, name: 'Ogre', hp, ac: 12, damage: '8', toHit: 5, xp: 50 }],
  },
  loot: {},
  npcs: {},
});

// One PC + one phantasm-afflicted enemy; end_turn hands off to the enemy so its
// end-of-turn re-save (and recurring damage) resolves.
function afflictedState(opts: { hp: number; dc: number; acted: boolean }) {
  const pc = makeChar({ id: 'pc-1', character_class: 'Wizard', level: 10, hp: 60, max_hp: 60 });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [pc],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: enemyId, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 1, y: 1 },
        hp: 60,
        maxHp: 60,
        conditions: [],
        condition_durations: {},
      },
      {
        id: enemyId,
        isEnemy: true,
        pos: { x: 1, y: 2 },
        hp: opts.hp,
        maxHp: opts.hp,
        conditions: ['phantasm'],
        condition_durations: {},
        save_ends: {
          phantasm: {
            ability: 'int' as const,
            dc: opts.dc,
            recurDice: '2d8',
            recurType: 'psychic',
            casterId: 'pc-1',
          },
        },
        save_ends_acted: opts.acted ? ['phantasm'] : [],
      },
    ],
  };
}

describe('recurring save-ends damage — catalog', () => {
  it('Phantasmal Killer recurs 4d10 psychic on a WIS save-ends', () => {
    const pk = SRD_SPELLS.phantasmal_killer;
    expect(pk.conditionSaveEnds).toBe(true);
    expect(pk.recurringSaveDamage).toEqual({ dice: '4d10', damageType: 'psychic' });
    expect(pk.condition).toBe('frightened');
  });

  it('Phantasmal Force is an L2 INT save-ends with a 2d8 psychic tick and no initial damage', () => {
    const pf = SRD_SPELLS.phantasmal_force;
    expect(pf.level).toBe(2);
    expect(pf.savingThrow).toBe('int');
    expect(pf.condition).toBe('phantasm');
    expect(pf.conditionSaveEnds).toBe(true);
    expect(pf.recurringSaveDamage).toEqual({ dice: '2d8', damageType: 'psychic' });
    expect(pf.damage).toBeUndefined(); // no damage on the initial save
    expect(pf.concentration).toBe(true);
  });
});

describe('Phantasmal Force — cast stamps the recurring tick', () => {
  it('a failed INT save applies the phantasm condition + a recurring save-ends entry', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0); // INT save rolls 1 → fails
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      int: 18,
      hp: 40,
      max_hp: 40,
      spells_known: ['phantasmal_force'],
      prepared_spells: ['phantasmal_force'],
      spell_slots_max: { 2: 2 },
      spell_slots_used: {},
    });
    const ally = makeChar({ id: 'pc-2', character_class: 'Fighter', level: 5, hp: 40, max_hp: 40 });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [pc, ally],
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
          pos: { x: 1, y: 1 },
          hp: 40,
          maxHp: 40,
          conditions: [],
          condition_durations: {},
        },
        {
          id: 'pc-2',
          isEnemy: false,
          pos: { x: 1, y: 3 },
          hp: 40,
          maxHp: 40,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 2, y: 2 },
          hp: 80,
          maxHp: 80,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'phantasmal_force',
        slotLevel: 2,
        targetEnemyId: enemyId,
      },
      history: [],
      state,
      seed: seedWith(80),
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === enemyId && e.isEnemy);
    expect(ent?.conditions).toContain('phantasm');
    expect(ent?.save_ends?.phantasm?.recurDice).toBe('2d8');
    expect(ent?.save_ends?.phantasm?.casterId).toBe('pc-1');
    expect(ent?.hp).toBe(80); // no initial damage
  });
});

describe('recurring damage — enemy turn loop', () => {
  it('deals no recurring damage on the first afflicted turn (no re-save yet)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: afflictedState({ hp: 80, dc: 14, acted: false }),
      seed: seedWith(80),
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === enemyId && e.isEnemy);
    expect(ent?.conditions).toContain('phantasm'); // still afflicted
    expect(ent?.save_ends_acted).toContain('phantasm');
    expect(ent?.hp).toBe(80); // no tick this turn
  });

  it('ticks psychic damage on a FAILED re-save and stays afflicted', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // INT save vs DC 25 fails; 2d8 = 2
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: afflictedState({ hp: 80, dc: 25, acted: true }),
      seed: seedWith(80),
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === enemyId && e.isEnemy);
    expect(ent?.conditions).toContain('phantasm');
    expect(ent?.hp).toBe(78); // 80 − 2d8(min 2)
  });

  it('clears the condition (no damage) on a SUCCESSFUL re-save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // INT save vs DC 5 succeeds → ends
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: afflictedState({ hp: 80, dc: 5, acted: true }),
      seed: seedWith(80),
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === enemyId && e.isEnemy);
    expect(ent?.conditions ?? []).not.toContain('phantasm');
    expect(ent?.save_ends?.phantasm).toBeUndefined();
    expect(ent?.hp).toBe(80); // saved → no tick
  });

  it('a recurring tick that drops the enemy resolves the kill + ends combat', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // fails save; 2d8 = 2 kills a 2-HP enemy
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: afflictedState({ hp: 2, dc: 25, acted: true }),
      seed: seedWith(2),
      context: ctx,
    });
    expect(r.newState.enemies_killed).toContain(enemyId);
    expect(r.newState.combat_active).toBe(false); // sole enemy down → room cleared
    expect(r.newState.characters[0].xp).toBeGreaterThan(0); // XP to the caster
  });
});
