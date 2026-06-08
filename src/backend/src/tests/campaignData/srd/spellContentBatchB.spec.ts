// SRD spell content batch B (RE-6) — Tsunami, Flesh to Stone, Ray of
// Enfeeblement, Black Tentacles, Enhance Ability. Each rides a shipped path
// (AoE save-for-half damage / single-target save→condition with save-ends /
// AoE-condition / concentration buff). Confirms catalog registration + a real
// cast resolving through the engine.

import type { GameState, Seed } from '../../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../test-fixtures.js';
import { DISADV_CONDITIONS } from '../../../services/conditions/registry.js';
import { SRD_SPELLS } from '../../../campaignData/srd/spells.js';
import { context as ctx } from '../../../campaignData/sandbox.js';
import { takeAction } from '../../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;
const ENEMY2 = `entry_hall#1`;

describe('spell content batch B — catalog', () => {
  it('registers each spell with the expected shape', () => {
    expect(SRD_SPELLS.tsunami).toMatchObject({ level: 8, savingThrow: 'str', saveEffect: 'half' });
    expect(SRD_SPELLS.flesh_to_stone).toMatchObject({
      level: 6,
      condition: 'restrained',
      conditionSaveEnds: true,
    });
    expect(SRD_SPELLS.ray_of_enfeeblement).toMatchObject({
      level: 2,
      condition: 'enfeebled',
      conditionSaveEnds: true,
    });
    expect(SRD_SPELLS.black_tentacles).toMatchObject({
      level: 4,
      condition: 'restrained',
      aoeCondition: true,
    });
    expect(SRD_SPELLS.enhance_ability).toMatchObject({ level: 2, targetType: 'self_or_ally' });
  });

  it('the new `enfeebled` condition imposes Disadvantage on the afflicted attacks', () => {
    expect(DISADV_CONDITIONS.has('enfeebled')).toBe(true);
  });
});

const foe = (id: string, name: string) => ({
  id,
  name,
  hp: 200,
  ac: 10,
  damage: '1d6',
  toHit: 3,
  xp: 50,
  str: 10,
  con: 10,
  dex: 10,
});

function seedWith(enemies: Array<Record<string, unknown>>): Seed {
  return {
    context_id: ctx.id,
    world_name: 'Batch B Test',
    ship_name: 'Batch B Test',
    intro: '',
    seed_id: 'batchB',
    rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
    enemies: { ['entry_hall']: enemies as unknown as NonNullable<Seed['enemies']>[string] },
    loot: {},
    npcs: {},
  };
}

function cleric() {
  return makeChar({
    id: 'pc-1',
    character_class: 'Cleric',
    level: 20,
    wis: 18,
    hp: 60,
    max_hp: 60,
    spells_known: [
      'tsunami',
      'flesh_to_stone',
      'ray_of_enfeeblement',
      'black_tentacles',
      'enhance_ability',
    ],
    prepared_spells: [
      'tsunami',
      'flesh_to_stone',
      'ray_of_enfeeblement',
      'black_tentacles',
      'enhance_ability',
    ],
    spell_slots_max: { 2: 3, 4: 2, 6: 1, 8: 1 },
    spell_slots_used: {},
  });
}

function state(extraEnemyEnts: Array<Record<string, unknown>> = []): GameState {
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [cleric()],
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
        hp: 60,
        maxHp: 60,
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
      ...extraEnemyEnts,
    ],
  } as unknown as GameState;
}

describe('Tsunami — AoE STR save, save-for-half', () => {
  it('deals bludgeoning damage on a failed save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // enemy STR save → 1 → fails
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'tsunami', slotLevel: 8, targetEnemyId: ENEMY },
      history: [],
      state: state(),
      seed: seedWith([foe(ENEMY, 'Ogre')]),
      context: ctx,
    });
    const e = r.newState.entities?.find((x) => x.id === ENEMY);
    expect(e!.hp).toBeLessThan(200);
  });
});

describe('Flesh to Stone — CON save → Restrained (save-ends)', () => {
  it('restrains the target on a failed save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'flesh_to_stone', slotLevel: 6, targetEnemyId: ENEMY },
      history: [],
      state: state(),
      seed: seedWith([foe(ENEMY, 'Ogre')]),
      context: ctx,
    });
    const e = r.newState.entities?.find((x) => x.id === ENEMY);
    expect(e!.conditions).toContain('restrained');
  });
});

describe('Ray of Enfeeblement — CON save → Enfeebled (save-ends)', () => {
  it('enfeebles the target on a failed save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'ray_of_enfeeblement',
        slotLevel: 2,
        targetEnemyId: ENEMY,
      },
      history: [],
      state: state(),
      seed: seedWith([foe(ENEMY, 'Ogre')]),
      context: ctx,
    });
    const e = r.newState.entities?.find((x) => x.id === ENEMY);
    expect(e!.conditions).toContain('enfeebled');
  });

  it('does nothing on a successful save (negates)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'ray_of_enfeeblement',
        slotLevel: 2,
        targetEnemyId: ENEMY,
      },
      history: [],
      state: state(),
      seed: seedWith([foe(ENEMY, 'Ogre')]),
      context: ctx,
    });
    const e = r.newState.entities?.find((x) => x.id === ENEMY);
    expect(e!.conditions).not.toContain('enfeebled');
  });
});

describe('Black Tentacles — AoE STR save → Restrained', () => {
  it('restrains every enemy that fails the save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'black_tentacles',
        slotLevel: 4,
        targetEnemyId: ENEMY,
      },
      history: [],
      state: state([
        {
          id: ENEMY2,
          isEnemy: true,
          pos: { x: 6, y: 5 },
          hp: 200,
          maxHp: 200,
          conditions: [],
          condition_durations: {},
        },
      ]),
      seed: seedWith([foe(ENEMY, 'Ogre'), foe(ENEMY2, 'Brute')]),
      context: ctx,
    });
    const e1 = r.newState.entities?.find((x) => x.id === ENEMY);
    const e2 = r.newState.entities?.find((x) => x.id === ENEMY2);
    expect(e1!.conditions).toContain('restrained');
    expect(e2!.conditions).toContain('restrained');
  });
});

describe('Enhance Ability — concentration buff', () => {
  it('sets the caster concentrating on the buff', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'enhance_ability', slotLevel: 2 },
      history: [],
      state: state(),
      seed: seedWith([foe(ENEMY, 'Ogre')]),
      context: ctx,
    });
    expect(r.newState.characters[0].concentrating_on?.spellId).toBe('enhance_ability');
  });
});
