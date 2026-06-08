// SRD spell content batch (RE-6) — Regenerate, Mass Heal, Contagion, Flame
// Blade, Earthquake. Each rides a shipped dispatch path (single heal / mass heal
// / single-target save+condition+save-ends / recurring spell attack / AoE
// condition). These tests confirm catalog registration + that a real cast
// resolves through the engine with the expected effect.

import type { GameState, Seed } from '../../../src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../src/test-fixtures.js';
import { SRD_SPELLS } from '../../../src/campaignData/srd/spells.js';
import { context as ctx } from '../../../src/campaignData/sandbox.js';
import { takeAction } from '../../../src/services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;
const ENEMY2 = `entry_hall#1`;

describe('spell content batch — catalog', () => {
  it('registers each spell with the expected shape', () => {
    expect(SRD_SPELLS.regenerate).toMatchObject({ level: 7, heal: '4d8+15' });
    expect(SRD_SPELLS.mass_heal).toMatchObject({ level: 9, healFull: true });
    expect(SRD_SPELLS.mass_heal.removeConditions).toEqual(['blinded', 'deafened', 'poisoned']);
    expect(SRD_SPELLS.contagion).toMatchObject({
      level: 5,
      savingThrow: 'con',
      condition: 'poisoned',
      conditionSaveEnds: true,
    });
    expect(SRD_SPELLS.flame_blade).toMatchObject({
      level: 2,
      recurringAttack: true,
      damageType: 'fire',
    });
    expect(SRD_SPELLS.earthquake).toMatchObject({
      level: 8,
      savingThrow: 'dex',
      condition: 'prone',
      aoeCondition: true,
    });
  });
});

function seedWith(enemies: Array<Record<string, unknown>>): Seed {
  return {
    context_id: ctx.id,
    world_name: 'Batch Test',
    ship_name: 'Batch Test',
    intro: '',
    seed_id: 'batch',
    rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
    enemies: { ['entry_hall']: enemies as unknown as NonNullable<Seed['enemies']>[string] },
    loot: {},
    npcs: {},
  };
}

const ogre = {
  id: ENEMY,
  name: 'Ogre',
  hp: 200,
  ac: 10,
  damage: '1d6',
  toHit: 3,
  xp: 50,
  con: 10,
  dex: 10,
};
const ogre2 = {
  id: ENEMY2,
  name: 'Brute',
  hp: 200,
  ac: 10,
  damage: '1d6',
  toHit: 3,
  xp: 50,
  con: 10,
  dex: 10,
};

// A high-level Cleric with every batch spell prepared + broad slots.
function cleric(overrides: Record<string, unknown> = {}) {
  return makeChar({
    id: 'pc-1',
    character_class: 'Cleric',
    level: 20,
    wis: 18,
    hp: 60,
    max_hp: 60,
    spells_known: ['regenerate', 'mass_heal', 'contagion', 'flame_blade', 'earthquake'],
    prepared_spells: ['regenerate', 'mass_heal', 'contagion', 'flame_blade', 'earthquake'],
    spell_slots_max: { 2: 2, 5: 2, 7: 1, 8: 1, 9: 1 },
    spell_slots_used: {},
    ...overrides,
  });
}

function combatState(
  chars: ReturnType<typeof makeChar>[],
  extraEnemyEnts: Array<Record<string, unknown>> = []
): GameState {
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: chars,
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

describe('Regenerate — single-target heal', () => {
  it('heals a wounded caster (4d8+15)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const wounded = cleric({ hp: 10 });
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'regenerate', slotLevel: 7 },
      history: [],
      state: combatState([wounded]),
      seed: seedWith([ogre]),
      context: ctx,
    });
    expect(r.newState.characters[0].hp).toBeGreaterThan(10);
  });
});

describe('Mass Heal — full heal + condition strip', () => {
  it('restores all allies to full and clears Blinded/Deafened/Poisoned', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const caster = cleric({ hp: 20 });
    const ally = makeChar({
      id: 'pc-2',
      character_class: 'Fighter',
      level: 5,
      hp: 5,
      max_hp: 44,
      conditions: ['poisoned', 'blinded'],
    });
    const state = combatState([caster, ally]);
    state.entities = [
      ...(state.entities ?? []),
      {
        id: 'pc-2',
        isEnemy: false,
        pos: { x: 3, y: 5 },
        hp: 5,
        maxHp: 44,
        conditions: ['poisoned', 'blinded'],
        condition_durations: {},
      } as never,
    ];
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'mass_heal', slotLevel: 9 },
      history: [],
      state,
      seed: seedWith([ogre]),
      context: ctx,
    });
    const caster2 = r.newState.characters.find((c) => c.id === 'pc-1')!;
    const ally2 = r.newState.characters.find((c) => c.id === 'pc-2')!;
    expect(caster2.hp).toBe(caster2.max_hp);
    expect(ally2.hp).toBe(ally2.max_hp); // 44
    expect(ally2.conditions).not.toContain('poisoned');
    expect(ally2.conditions).not.toContain('blinded');
    expect(r.narrative).toMatch(/full HP/);
  });
});

describe('Contagion — CON save, necrotic + Poisoned (save-ends)', () => {
  it('on a failed save: deals damage and applies Poisoned', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // enemy save d20 → 1 → fails
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'contagion', slotLevel: 5, targetEnemyId: ENEMY },
      history: [],
      state: combatState([cleric()]),
      seed: seedWith([ogre]),
      context: ctx,
    });
    const e = r.newState.entities?.find((x) => x.id === ENEMY);
    expect(e!.hp).toBeLessThan(200);
    expect(e!.conditions).toContain('poisoned');
  });

  it('on a successful save: no damage (negates)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // enemy save d20 → 20 → passes DC
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'contagion', slotLevel: 5, targetEnemyId: ENEMY },
      history: [],
      state: combatState([cleric()]),
      seed: seedWith([ogre]),
      context: ctx,
    });
    const e = r.newState.entities?.find((x) => x.id === ENEMY);
    expect(e!.hp).toBe(200);
    expect(e!.conditions).not.toContain('poisoned');
  });
});

describe('Flame Blade — recurring spell attack', () => {
  it('strikes on cast and arms the recurring attack', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // attack d20 → 20 (hit)
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'flame_blade', slotLevel: 2, targetEnemyId: ENEMY },
      history: [],
      state: combatState([cleric()]),
      seed: seedWith([ogre]),
      context: ctx,
    });
    const e = r.newState.entities?.find((x) => x.id === ENEMY);
    expect(e!.hp).toBeLessThan(200); // the on-cast fiery strike connected
    expect(r.newState.characters[0].recurring_attack).toBeTruthy();
  });
});

describe('Earthquake — AoE DEX save, knocks Prone', () => {
  it('topples every enemy that fails the save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // enemy DEX saves → 1 → fail
    const state = combatState(
      [cleric()],
      [
        {
          id: ENEMY2,
          isEnemy: true,
          pos: { x: 6, y: 5 },
          hp: 200,
          maxHp: 200,
          conditions: [],
          condition_durations: {},
        } as never,
      ]
    );
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'earthquake', slotLevel: 8, targetEnemyId: ENEMY },
      history: [],
      state,
      seed: seedWith([ogre, ogre2]),
      context: ctx,
    });
    const e1 = r.newState.entities?.find((x) => x.id === ENEMY);
    const e2 = r.newState.entities?.find((x) => x.id === ENEMY2);
    expect(e1!.conditions).toContain('prone');
    expect(e2!.conditions).toContain('prone');
  });
});
