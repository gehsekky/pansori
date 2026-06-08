// SRD Dragon's Breath — a bonus-action self/ally buff that grants a breath
// weapon: `granted_breath` on the target, exhaled as a 15-ft cone (DEX save for
// half) via the `use_breath` action, for the spell's concentration duration.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../src/test-fixtures.js';
import { SRD_SPELLS } from '../../src/campaignData/srd/spells.js';
import type { Seed } from '../../src/types.js';
import { breakConcentration } from '../../src/services/gameEngine.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';
import { takeAction } from '../../src/services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = 'entry_hall#0';

const seedWith = (hp: number): Seed => ({
  context_id: ctx.id,
  world_name: 'Breath Test',
  ship_name: 'Breath Test',
  intro: '',
  seed_id: 'breath',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    entry_hall: [
      { id: enemyId, name: 'Goblin', hp, ac: 12, damage: '4', toHit: 4, xp: 50, dex: 8 },
    ],
  },
  loot: {},
  npcs: {},
});

describe("Dragon's Breath — catalog", () => {
  it('is an L2 self/ally concentration buff that grants a breath', () => {
    const db = SRD_SPELLS.dragons_breath;
    expect(db.level).toBe(2);
    expect(db.grantsBreath).toBe(true);
    expect(db.targetType).toBe('self_or_ally');
    expect(db.concentration).toBe(true);
    expect(db.castTime).toBe('bonus_action');
    expect(db.damage).toBe('3d6');
  });
});

describe("Dragon's Breath — cast stamps a granted breath", () => {
  it('a self-cast records granted_breath with the chosen type + the caster as source', async () => {
    const wiz = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      int: 18,
      hp: 40,
      max_hp: 40,
      spells_known: ['dragons_breath'],
      prepared_spells: ['dragons_breath'],
      spell_slots_max: { 2: 2 },
      spell_slots_used: {},
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [wiz],
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
          pos: { x: 0, y: 0 },
          hp: 40,
          maxHp: 40,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 2, y: 0 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'dragons_breath', slotLevel: 2, breathType: 'cold' },
      history: [],
      state,
      seed: seedWith(30),
      context: ctx,
    });
    const gb = r.newState.characters[0].granted_breath;
    expect(gb?.damageType).toBe('cold');
    expect(gb?.dice).toBe('3d6'); // base slot
    expect(gb?.saveDc).toBeGreaterThan(0);
    expect(gb?.sourceCasterId).toBe('pc-1');
    // Concentration is on the caster.
    expect(r.newState.characters[0].concentrating_on?.spellId).toBe('dragons_breath');
  });

  it('upcasting at L4 bakes 5d6 into the granted breath', async () => {
    const wiz = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 9,
      int: 18,
      hp: 50,
      max_hp: 50,
      spells_known: ['dragons_breath'],
      prepared_spells: ['dragons_breath'],
      spell_slots_max: { 4: 1 },
      spell_slots_used: {},
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [wiz],
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
          pos: { x: 0, y: 0 },
          hp: 50,
          maxHp: 50,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 2, y: 0 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'dragons_breath', slotLevel: 4, breathType: 'fire' },
      history: [],
      state,
      seed: seedWith(30),
      context: ctx,
    });
    expect(r.newState.characters[0].granted_breath?.dice).toBe('5d6'); // 3d6 + 1d6 × 2
  });
});

describe("Dragon's Breath — use_breath exhales a cone", () => {
  function breathState(enemyHp: number) {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      hp: 40,
      max_hp: 40,
      granted_breath: { damageType: 'fire', dice: '3d6', saveDc: 15, sourceCasterId: 'pc-1' },
    });
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
          pos: { x: 0, y: 0 },
          hp: 40,
          maxHp: 40,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 2, y: 0 },
          hp: enemyHp,
          maxHp: enemyHp,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
  }

  it('damages an enemy caught in the cone on a failed DEX save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // DEX save fails; 3d6 = 3
    const r = await takeAction({
      action: { type: 'use_breath', targetEnemyId: enemyId },
      history: [],
      state: breathState(30),
      seed: seedWith(30),
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === enemyId && e.isEnemy);
    expect(ent?.hp).toBe(27); // 30 − 3d6(min 3)
  });

  it('rejects when the holder has no granted breath', async () => {
    const state = breathState(30);
    state.characters[0].granted_breath = undefined;
    const r = await takeAction({
      action: { type: 'use_breath', targetEnemyId: enemyId },
      history: [],
      state,
      seed: seedWith(30),
      context: ctx,
    });
    // No breath → the cone does nothing (enemy untouched).
    const ent = r.newState.entities?.find((e) => e.id === enemyId && e.isEnemy);
    expect(ent?.hp).toBe(30);
  });
});

describe("Dragon's Breath — concentration drop revokes the breath", () => {
  it('clears granted_breath from the caster when concentration breaks', () => {
    const caster = makeChar({
      id: 'pc-1',
      granted_breath: { damageType: 'fire', dice: '3d6', saveDc: 15, sourceCasterId: 'pc-1' },
      concentrating_on: { spellId: 'dragons_breath', rounds_left: 10 },
    });
    const st = {
      ...makeState({ id: 'pc-1' }, { combat_active: true }),
      characters: [caster],
    };
    const out = breakConcentration(caster, st, ctx);
    expect(out.char.granted_breath).toBeUndefined();
    expect(out.st.characters[0].granted_breath).toBeUndefined();
  });
});
