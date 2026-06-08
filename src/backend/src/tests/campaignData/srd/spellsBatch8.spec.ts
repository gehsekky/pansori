// SRD spell batch 8 — two L6 Enchantment control spells that ride existing
// charm dispatch shapes:
//   • Mass Suggestion (aoe-condition → Charmed, WIS save, no Concentration)
//   • Irresistible Dance (single-target save → Charmed, save-ends, Concentration)
// Both apply the Charmed condition; the dance/suggestion flavor riders are
// narrated. These tests confirm catalog registration + a real cast applying the
// condition on a failed save.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../test-fixtures.js';
import { SRD_SPELLS } from '../../../campaignData/srd/spells.js';
import type { Seed } from '../../../types.js';
import { context as ctx } from '../../../campaignData/sandbox.js';
import { takeAction } from '../../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;
const ENEMY2 = `entry_hall#1`;

describe('spell batch 8 — catalog', () => {
  it('Mass Suggestion is a no-Concentration aoe-condition charm (WIS save)', () => {
    const s = SRD_SPELLS.mass_suggestion;
    expect(s.level).toBe(6);
    expect(s.savingThrow).toBe('wis');
    expect(s.saveEffect).toBe('negates');
    expect(s.condition).toBe('charmed');
    expect(s.aoeCondition).toBe(true);
    expect(s.aoeShape).toBe('sphere');
    expect(s.concentration).toBeUndefined();
  });

  it('Irresistible Dance is a single-target save-ends charm under Concentration', () => {
    const s = SRD_SPELLS.irresistible_dance;
    expect(s.level).toBe(6);
    expect(s.savingThrow).toBe('wis');
    expect(s.condition).toBe('charmed');
    expect(s.conditionSaveEnds).toBe(true);
    expect(s.concentration).toBe(true);
    expect(s.aoeCondition).toBeUndefined(); // single target
  });

  it('Ice Knife is a spell attack with a secondary cold AoE burst', () => {
    const s = SRD_SPELLS.ice_knife;
    expect(s.level).toBe(1);
    expect(s.attackRoll).toBe(true);
    expect(s.damageType).toBe('piercing');
    expect(s.secondaryAoe).toMatchObject({
      damageType: 'cold',
      savingThrow: 'dex',
      saveEffect: 'negates',
      blastRadius: 5,
    });
  });

  it('Enlarge/Reduce is a Concentration target-determined buff/debuff', () => {
    const s = SRD_SPELLS.enlarge_reduce;
    expect(s.level).toBe(2);
    expect(s.enlargeReduce).toBe(true);
    expect(s.concentration).toBe(true);
  });
});

const BATCH = ['mass_suggestion', 'irresistible_dance', 'ice_knife', 'enlarge_reduce'];

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Batch 8 Test',
  ship_name: 'Batch 8 Test',
  intro: '',
  seed_id: 'batch8',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      { id: ENEMY, name: 'Cultist', hp: 80, ac: 10, damage: '1d6', toHit: 3, xp: 25, wis: 8 },
      { id: ENEMY2, name: 'Acolyte', hp: 80, ac: 10, damage: '1d6', toHit: 3, xp: 25, wis: 8 },
    ],
  },
  loot: {},
  npcs: {},
};

function casterState() {
  const bard = makeChar({
    id: 'pc-1',
    character_class: 'Bard',
    level: 13,
    cha: 18,
    wis: 14,
    hp: 60,
    max_hp: 60,
    spells_known: BATCH,
    prepared_spells: BATCH,
    spell_slots_max: { 1: 4, 2: 3, 6: 1 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [bard],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: ENEMY, roll: 5, is_enemy: true },
      { id: ENEMY2, roll: 4, is_enemy: true },
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
        id: ENEMY,
        isEnemy: true,
        pos: { x: 2, y: 1 },
        hp: 80,
        maxHp: 80,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY2,
        isEnemy: true,
        pos: { x: 2, y: 2 },
        hp: 80,
        maxHp: 80,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Mass Suggestion — charms every hostile that fails the save', () => {
  it('applies Charmed to enemies in the sphere on a failed save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // saves roll 1 → fail
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'mass_suggestion',
        slotLevel: 6,
        targetEnemyId: ENEMY,
      },
      history: [],
      state: casterState(),
      seed,
      context: ctx,
    });
    const e1 = r.newState.entities?.find((e) => e.id === ENEMY && e.isEnemy);
    const e2 = r.newState.entities?.find((e) => e.id === ENEMY2 && e.isEnemy);
    expect(e1?.conditions).toContain('charmed');
    expect(e2?.conditions).toContain('charmed'); // both in the sphere
  });
});

describe('Irresistible Dance — charms one target on a failed save', () => {
  it('applies Charmed to the target on a failed save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // save rolls 1 → fail
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'irresistible_dance',
        slotLevel: 6,
        targetEnemyId: ENEMY,
      },
      history: [],
      state: casterState(),
      seed,
      context: ctx,
    });
    const e1 = r.newState.entities?.find((e) => e.id === ENEMY && e.isEnemy);
    expect(e1?.conditions).toContain('charmed');
  });

  it('does not charm on a successful save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // save rolls 20 → succeeds
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'irresistible_dance',
        slotLevel: 6,
        targetEnemyId: ENEMY,
      },
      history: [],
      state: casterState(),
      seed,
      context: ctx,
    });
    const e1 = r.newState.entities?.find((e) => e.id === ENEMY && e.isEnemy);
    expect(e1?.conditions ?? []).not.toContain('charmed');
  });
});

describe('Ice Knife — spell attack + secondary cold burst', () => {
  it('on a hit: target takes piercing + cold, an adjacent enemy takes the cold burst', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // attack hits; enemy DEX saves fail
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'ice_knife', slotLevel: 1, targetEnemyId: ENEMY },
      history: [],
      state: casterState(),
      seed,
      context: ctx,
    });
    const e1 = r.newState.entities?.find((e) => e.id === ENEMY && e.isEnemy);
    const e2 = r.newState.entities?.find((e) => e.id === ENEMY2 && e.isEnemy);
    expect(e1!.hp).toBeLessThan(80); // piercing + cold
    expect(e2!.hp).toBeLessThan(80); // cold burst (within 5 ft of the target)
    expect(e1!.hp).toBeLessThan(e2!.hp); // target took more (it ate the piercing too)
  });

  it('the cold burst still fires on a miss (natural 1)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // attack natural 1 → miss; saves fail
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'ice_knife', slotLevel: 1, targetEnemyId: ENEMY },
      history: [],
      state: casterState(),
      seed,
      context: ctx,
    });
    const e1 = r.newState.entities?.find((e) => e.id === ENEMY && e.isEnemy);
    expect(e1!.hp).toBeLessThan(80); // burst landed despite the missed attack
  });
});

describe('Enlarge/Reduce — target-determined buff/debuff', () => {
  it('targeting an enemy applies Reduced + the caster concentrates on it', async () => {
    // High rolls so the caster's Concentration holds against the enemies'
    // counterattacks in the epilogue (a failed save would correctly end the
    // spell and strip the condition).
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'enlarge_reduce', slotLevel: 2, targetEnemyId: ENEMY },
      history: [],
      state: casterState(),
      seed,
      context: ctx,
    });
    const e1 = r.newState.entities?.find((e) => e.id === ENEMY && e.isEnemy);
    expect(e1?.conditions).toContain('reduced');
    expect(r.newState.characters[0].concentrating_on).toMatchObject({
      spellId: 'enlarge_reduce',
      condition: 'reduced',
    });
    expect(r.narrative).toContain('Reduced');
  });

  it('targeting self applies Enlarged to the caster', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // Concentration holds in the epilogue
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'enlarge_reduce', slotLevel: 2, targetCharId: 'pc-1' },
      history: [],
      state: casterState(),
      seed,
      context: ctx,
    });
    const caster = r.newState.characters[0];
    expect(caster.conditions).toContain('enlarged');
    expect(caster.concentrating_on).toMatchObject({
      spellId: 'enlarge_reduce',
      condition: 'enlarged',
    });
  });

  it('an Enlarged attacker adds +1d4 to a weapon hit (the damage hook fires)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // deterministic hit + rolls
    const fighter = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      str: 18,
      hp: 50,
      max_hp: 50,
      conditions: ['enlarged'],
      condition_durations: { enlarged: 100 },
      inventory: [{ instance_id: 'sw-1', id: 'longsword', name: 'Longsword' }],
      equipment: { main_hand: 'sw-1' },
      weapon_proficiencies: ['simple', 'martial'],
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [fighter],
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
          pos: { x: 1, y: 1 },
          hp: 50,
          maxHp: 50,
          conditions: ['enlarged'],
          condition_durations: {},
        },
        {
          id: ENEMY,
          isEnemy: true,
          pos: { x: 2, y: 1 },
          hp: 80,
          maxHp: 80,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(r.narrative).toContain('Enlarged'); // the +1d4 note surfaced on the hit
  });
});
