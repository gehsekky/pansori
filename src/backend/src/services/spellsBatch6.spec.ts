// Spell batch: two wall AoEs (Blade Barrier, Wind Wall — save-for-half), a
// poison ray (Ray of Sickness — attack roll + on-hit Poisoned), an energy ward
// (Protection from Energy — resistance buff with an element picker), and a
// corpse ritual (Gentle Repose — narrative-only).

import type { Enemy, GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from './gameEngine.js';
import { makeChar, makeState } from '../test-fixtures.js';
import { SRD_SPELLS } from '../campaignData/srd/spells.js';
import { context as ctx } from '../campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#0`;

describe('spell batch 6 — catalog', () => {
  it('Blade Barrier + Wind Wall are save-for-half wall AoEs', () => {
    expect(SRD_SPELLS.blade_barrier).toMatchObject({
      level: 6,
      damageType: 'force',
      savingThrow: 'dex',
      saveEffect: 'half',
      aoeShape: 'line',
      concentration: true,
    });
    expect(SRD_SPELLS.wind_wall).toMatchObject({
      level: 3,
      damageType: 'bludgeoning',
      savingThrow: 'str',
      saveEffect: 'half',
      aoeShape: 'line',
      concentration: true,
    });
  });

  it('Ray of Sickness is an attack-roll poison spell that imposes Poisoned', () => {
    expect(SRD_SPELLS.ray_of_sickness).toMatchObject({
      level: 1,
      attackRoll: true,
      damageType: 'poison',
      condition: 'poisoned',
      upcastBonus: '1d8',
    });
  });

  it('Protection from Energy is a resistance buff; Gentle Repose is a ritual', () => {
    expect(SRD_SPELLS.protection_from_energy).toMatchObject({
      level: 3,
      targetType: 'self_or_ally',
      concentration: true,
    });
    expect(SRD_SPELLS.protection_from_energy.grantResistances).toEqual(['fire']);
    expect(SRD_SPELLS.gentle_repose).toMatchObject({ level: 2, ritualCasting: true });
  });
});

// ── Wall AoEs — save-for-half damage on a failed save ─────────────────────────
const dmgSeed: Seed = {
  context_id: ctx.id,
  world_name: 'Wall Test',
  ship_name: 'Wall Test',
  intro: '',
  seed_id: 'wall',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: enemyId,
        name: 'Ogre',
        hp: 300,
        ac: 8,
        damage: '1d6',
        toHit: 3,
        xp: 50,
        con: 8,
        dex: 8,
        str: 8,
      } as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function dmgCasterState(spellId: string, slot: number): GameState {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 17,
    int: 18,
    hp: 60,
    max_hp: 60,
    spells_known: [spellId],
    prepared_spells: [spellId],
    spell_slots_max: { [slot]: 1 },
    spell_slots_used: {},
  });
  return {
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
        pos: { x: 1, y: 1 },
        hp: 60,
        maxHp: 60,
        conditions: [],
        condition_durations: {},
      },
      {
        id: enemyId,
        isEnemy: true,
        pos: { x: 2, y: 1 },
        hp: 300,
        maxHp: 300,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Wall AoEs — Blade Barrier + Wind Wall', () => {
  for (const [id, slot] of [
    ['blade_barrier', 6],
    ['wind_wall', 3],
  ] as const) {
    it(`${id} damages a target that fails its save`, async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01); // save fails → full damage
      const r = await takeAction({
        action: { type: 'cast_spell', spellId: id, slotLevel: slot, targetEnemyId: enemyId },
        history: [],
        state: dmgCasterState(id, slot),
        seed: dmgSeed,
        context: ctx,
      });
      const hp = r.newState.entities?.find((e) => e.id === enemyId)?.hp ?? 300;
      expect(hp, `${id} should have dealt damage`).toBeLessThan(300);
    });
  }
});

// ── Ray of Sickness — attack roll, poison damage + Poisoned on a hit ──────────
function rayCasterState(): GameState {
  const sorc = makeChar({
    id: 'pc-1',
    character_class: 'Sorcerer',
    level: 5,
    cha: 18,
    hp: 30,
    max_hp: 30,
    spells_known: ['ray_of_sickness'],
    prepared_spells: ['ray_of_sickness'],
    spell_slots_max: { 1: 2 },
    spell_slots_used: {},
  });
  // A second PC sits next in initiative so the cast advances to a PC's turn,
  // not the enemy's — otherwise the auto-run enemy turn would tick the 1-round
  // Poisoned off before we can read it.
  const ally = makeChar({ id: 'pc-2', character_class: 'Fighter', level: 5, hp: 40, max_hp: 40 });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [sorc, ally],
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
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: 'pc-2',
        isEnemy: false,
        pos: { x: 1, y: 2 },
        hp: 40,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      },
      {
        id: enemyId,
        isEnemy: true,
        pos: { x: 2, y: 1 },
        hp: 300,
        maxHp: 300,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

function raySeed(enemyImmune: boolean): Seed {
  return {
    ...dmgSeed,
    seed_id: 'ray',
    enemies: {
      ['entry_hall']: [
        {
          id: enemyId,
          name: 'Ogre',
          hp: 300,
          ac: 5, // low AC so the attack lands
          damage: '1d6',
          toHit: 3,
          xp: 50,
          ...(enemyImmune ? { condition_immunities: ['poisoned'] } : {}),
        } as Enemy,
      ],
    },
  };
}

describe('Ray of Sickness — attack + Poisoned', () => {
  it('a hit deals poison damage and Poisons the target', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95); // high d20 → the attack hits
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'ray_of_sickness',
        slotLevel: 1,
        targetEnemyId: enemyId,
      },
      history: [],
      state: rayCasterState(),
      seed: raySeed(false),
      context: ctx,
    });
    const e = r.newState.entities?.find((x) => x.id === enemyId);
    expect(e?.hp ?? 300).toBeLessThan(300);
    expect(e?.conditions).toContain('poisoned');
  });

  it('a poison-immune target is hurt but not Poisoned', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95);
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'ray_of_sickness',
        slotLevel: 1,
        targetEnemyId: enemyId,
      },
      history: [],
      state: rayCasterState(),
      seed: raySeed(true),
      context: ctx,
    });
    const e = r.newState.entities?.find((x) => x.id === enemyId);
    expect(e?.conditions ?? []).not.toContain('poisoned');
  });
});

// ── Protection from Energy — element picker + resistance grant ────────────────
const wardSeed: Seed = {
  context_id: ctx.id,
  world_name: 'Ward Test',
  ship_name: 'Ward Test',
  intro: '',
  seed_id: 'ward',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function wardState(): GameState {
  const cleric = makeChar({
    id: 'pc-1',
    character_class: 'Cleric',
    level: 9,
    wis: 18,
    spells_known: ['protection_from_energy'],
    prepared_spells: ['protection_from_energy'],
    spell_slots_max: { 3: 2 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall' }),
    characters: [cleric],
    active_character_id: 'pc-1',
  };
}

describe('Protection from Energy — element picker', () => {
  it('grants Resistance to the chosen element and starts concentration', async () => {
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'protection_from_energy',
        slotLevel: 3,
        resistType: 'cold',
      },
      history: [],
      state: wardState(),
      seed: wardSeed,
      context: ctx,
    });
    const pc = r.newState.characters[0];
    expect(pc.spell_resistances).toContain('cold');
    expect(pc.spell_resistances).not.toContain('fire'); // not the default
    expect(pc.concentrating_on?.spellId).toBe('protection_from_energy');
  });

  it('defaults to Fire when no element is picked', async () => {
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'protection_from_energy', slotLevel: 3 },
      history: [],
      state: wardState(),
      seed: wardSeed,
      context: ctx,
    });
    expect(r.newState.characters[0].spell_resistances).toContain('fire');
  });

  it('the cast choice carries a resistType option picker with the five elements', () => {
    const choices = generateChoices(wardState(), wardSeed, ctx);
    const pfe = choices.find(
      (c) => c.action.type === 'cast_spell' && c.action.spellId === 'protection_from_energy'
    );
    expect(pfe?.pickOption?.param).toBe('resistType');
    expect(pfe?.pickOption?.options.map((o) => o.id).sort()).toEqual([
      'acid',
      'cold',
      'fire',
      'lightning',
      'thunder',
    ]);
  });
});

// ── Gentle Repose — narrative ritual, casts without error ─────────────────────
describe('Gentle Repose — corpse ritual', () => {
  it('casts and produces narrative without rejection', async () => {
    const cleric = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      level: 5,
      wis: 16,
      spells_known: ['gentle_repose'],
      prepared_spells: ['gentle_repose'],
      spell_slots_max: { 2: 2 },
      spell_slots_used: {},
    });
    const state: GameState = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall' }),
      characters: [cleric],
      active_character_id: 'pc-1',
    };
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'gentle_repose', slotLevel: 2 },
      history: [],
      state,
      seed: wardSeed,
      context: ctx,
    });
    expect(r.narrative.length).toBeGreaterThan(0);
    expect(r.narrative.toLowerCase()).not.toContain('cannot');
  });
});
