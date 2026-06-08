// SRD spell batch — Arcane Sword, Animate Objects, Find Steed, Maze,
// Befuddlement. Each maps onto an existing dispatch path:
//   - Arcane Sword  → recurring spell attack (Spiritual Weapon machinery)
//   - Animate Objects / Find Steed → summon (count-from-spell-mod + mount)
//   - Maze          → save → banished (Banishment-style removal, save-ends)
//   - Befuddlement  → save-for-half damage + a condition rider
// Tests pin catalog registration + that each resolves through the real
// cast path (damage / condition / summoned ally).

import type { Enemy, GameState, Seed } from '../../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../test-fixtures.js';
import type { ActionContext } from '../../../services/actions/types.js';
import { SRD_SPELLS } from '../../../campaignData/srd/spells.js';
import { context as ctx } from '../../fixtures/testContext.js';
import { runSummonSpell } from '../../../services/actions/castSpell/summon.js';
import { takeAction } from '../../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;

// ─── Catalog ────────────────────────────────────────────────────────────────

describe('force/maze batch — catalog', () => {
  it('Arcane Sword is a 7th-level recurring force-blade attack', () => {
    const s = SRD_SPELLS.arcane_sword;
    expect(s.level).toBe(7);
    expect(s.recurringAttack).toBe(true);
    expect(s.recurringAttackCost).toBe('bonus_action');
    expect(s.recurringAddSpellMod).toBe(true);
    expect(s.damage).toBe('4d12');
    expect(s.damageType).toBe('force');
    expect(s.concentration).toBe(true);
  });

  it('Animate Objects summons a spell-mod-scaled crew of constructs', () => {
    const s = SRD_SPELLS.animate_objects;
    expect(s.level).toBe(5);
    expect(s.outOfCombatOnly).toBe(true);
    expect(s.summon?.name).toBe('Animated Object');
    expect(s.summon?.countFromSpellMod).toBe(true);
    expect(s.summon?.countPerUpcastLevel).toBe(2);
  });

  it('Find Steed summons a rideable mount', () => {
    const s = SRD_SPELLS.find_steed;
    expect(s.level).toBe(2);
    expect(s.outOfCombatOnly).toBe(true);
    expect(s.summon?.isMount).toBe(true);
    expect(s.summon?.speed).toBe(60);
  });

  it('Maze is an 8th-level INT-save banishment with save-ends escape', () => {
    const s = SRD_SPELLS.maze;
    expect(s.level).toBe(8);
    expect(s.savingThrow).toBe('int');
    expect(s.condition).toBe('banished');
    expect(s.conditionSaveEnds).toBe(true);
    expect(s.concentration).toBe(true);
  });

  it('Befuddlement is an 8th-level INT save-for-half psychic nuke + lockout', () => {
    const s = SRD_SPELLS.befuddlement;
    expect(s.level).toBe(8);
    expect(s.savingThrow).toBe('int');
    expect(s.saveEffect).toBe('half');
    expect(s.damage).toBe('10d12');
    expect(s.damageType).toBe('psychic');
    expect(s.condition).toBe('incapacitated');
  });
});

// ─── Animate Objects — count derives from the casting modifier ───────────────

describe('Animate Objects — count = spellcasting modifier', () => {
  const baseCtx = () =>
    ({
      actor: { kind: 'pc', char: { id: 'pc-1', name: 'Wizard' }, safeIdx: 0 },
      st: { summoned_allies: [] },
      narrative: '',
    }) as unknown as ActionContext;

  it('raises (spell mod) objects at the base slot', () => {
    const c = baseCtx();
    // INT 18 → +4 modifier → four animated objects.
    const handled = runSummonSpell(c, SRD_SPELLS.animate_objects, '', 5, undefined, 18);
    expect(handled).toBe(true);
    expect(c.st.summoned_allies).toHaveLength(4);
    expect(c.st.summoned_allies?.[0]).toMatchObject({ name: 'Animated Object', ac: 15, maxHp: 10 });
  });

  it('adds two per slot level above 5th on top of the modifier count', () => {
    const c = baseCtx();
    // INT 18 (+4) + 2 per level above 5th, cast at 7th → 4 + 2×2 = 8.
    runSummonSpell(c, SRD_SPELLS.animate_objects, '', 7, undefined, 18);
    expect(c.st.summoned_allies).toHaveLength(8);
  });

  it('floors at one object for a non-positive modifier', () => {
    const c = baseCtx();
    runSummonSpell(c, SRD_SPELLS.animate_objects, '', 5, undefined, 8); // INT 8 → −1
    expect(c.st.summoned_allies).toHaveLength(1);
  });
});

// ─── Find Steed — out-of-combat cast adds a rideable mount ───────────────────

const summonSeed: Seed = {
  context_id: ctx.id,
  world_name: 'Force/Maze Batch Test',
  ship_name: 'Force/Maze Batch Test',
  intro: '',
  seed_id: 'force-maze',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

describe('Find Steed — summon a mount', () => {
  it('casting out of combat adds a rideable Otherworldly Steed', async () => {
    const paladin = makeChar({
      id: 'pc-1',
      character_class: 'Paladin',
      level: 5,
      cha: 16,
      spell_slots_max: { 2: 2 },
      spells_known: ['find_steed'],
      prepared_spells: ['find_steed'],
    });
    const state: GameState = {
      ...makeState({ id: 'pc-1' }),
      characters: [paladin],
      active_character_id: 'pc-1',
      current_room: 'entry_hall',
      combat_active: false,
    };
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'find_steed', slotLevel: 2 },
      history: [],
      state,
      seed: summonSeed,
      context: ctx,
    });
    const steeds = (r.newState.summoned_allies ?? []).filter((s) => s.isMount);
    expect(steeds).toHaveLength(1);
    expect(steeds[0].name).toBe('Otherworldly Steed');
    expect(steeds[0].speed).toBe(60);
  });
});

describe('Animate Objects — out-of-combat cast threads the casting modifier', () => {
  it('animates (INT mod) constructs through the real cast path', async () => {
    const wizard = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 9,
      int: 18, // +4
      spell_slots_max: { 5: 1 },
      spells_known: ['animate_objects'],
      prepared_spells: ['animate_objects'],
    });
    const state: GameState = {
      ...makeState({ id: 'pc-1' }),
      characters: [wizard],
      active_character_id: 'pc-1',
      current_room: 'entry_hall',
      combat_active: false,
    };
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'animate_objects', slotLevel: 5 },
      history: [],
      state,
      seed: summonSeed,
      context: ctx,
    });
    const objs = (r.newState.summoned_allies ?? []).filter((s) => s.name === 'Animated Object');
    expect(objs).toHaveLength(4);
  });
});

// ─── In-combat casts: Arcane Sword, Maze, Befuddlement ───────────────────────

function combatSeed(enemyInt: number): Seed {
  const enemy: Enemy = {
    id: ENEMY,
    name: 'Ogre',
    hp: 200,
    ac: 10,
    damage: '1d6',
    toHit: 3,
    xp: 50,
    int: enemyInt,
    dex: 8,
    con: 8,
    wis: 8,
  };
  return { ...summonSeed, enemies: { ['entry_hall']: [enemy] } };
}

function wizCaster(spellId: string): GameState {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 18,
    int: 20,
    hp: 90,
    max_hp: 90,
    spells_known: [spellId],
    prepared_spells: [spellId],
    spell_slots_max: { 7: 1, 8: 1 },
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

describe('Arcane Sword — recurring force-blade attack', () => {
  it('deals force damage on cast and records the recurring attack', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // attack roll lands the hit
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'arcane_sword', slotLevel: 7, targetEnemyId: ENEMY },
      history: [],
      state: wizCaster('arcane_sword'),
      seed: combatSeed(8),
      context: ctx,
    });
    const hp = r.newState.entities?.find((e) => e.id === ENEMY)?.hp ?? 200;
    expect(hp).toBeLessThan(200);
    const recurring = r.newState.characters[0].recurring_attack;
    expect(recurring?.spellId).toBe('arcane_sword');
    expect(recurring?.cost).toBe('bonus_action');
    // 4d12 + the +5 INT modifier baked into the damage expression.
    expect(recurring?.damage).toContain('+5');
    expect(r.newState.characters[0].concentrating_on?.spellId).toBe('arcane_sword');
  });
});

describe('Maze — banish on a failed INT save', () => {
  it('removes the target from the fight and links concentration', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // INT save rolls 1 → fails
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'maze', slotLevel: 8, targetEnemyId: ENEMY },
      history: [],
      state: wizCaster('maze'),
      seed: combatSeed(8),
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === ENEMY);
    expect(ent?.conditions).toContain('banished');
    expect(ent?.save_ends?.banished?.ability).toBe('int');
    expect(r.newState.characters[0].concentrating_on?.spellId).toBe('maze');
  });
});

describe('Befuddlement — psychic nuke + incapacitate', () => {
  it('deals full damage and incapacitates on a failed save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // INT save fails
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'befuddlement', slotLevel: 8, targetEnemyId: ENEMY },
      history: [],
      state: wizCaster('befuddlement'),
      seed: combatSeed(8),
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === ENEMY);
    expect(ent?.hp ?? 200).toBeLessThan(200);
    expect(ent?.conditions).toContain('incapacitated');
  });

  it('deals only half damage and no condition on a successful save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // INT save (high roll) succeeds
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'befuddlement', slotLevel: 8, targetEnemyId: ENEMY },
      history: [],
      state: wizCaster('befuddlement'),
      seed: combatSeed(20), // high-INT target clears the DC
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === ENEMY);
    expect(ent?.conditions ?? []).not.toContain('incapacitated');
    // Half of 10d12 still lands (≥ 5).
    expect(ent?.hp ?? 200).toBeLessThan(200);
  });
});
