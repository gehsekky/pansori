// RE-2 — Sorcerer Metamagic subsystem (Commit A): the per-cast pipeline
// (capture + clear `metamagic_active` in runPrecast) plus the clean single-hook
// options: Distant (range), Subtle (components), Extended (duration),
// Heightened (target save disadvantage). Empowered/Twinned (fix) + Transmuted/
// Careful/Seeking land in follow-up commits.

import type { Enemy, GameState, Seed, Spell } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { ActionContext } from '../../services/actions/types.js';
import { context as ctx } from '../../campaignData/sandbox.js';
import { isSpellOutOfRange } from '../../services/actions/castSpell/precast.js';
import { pcActor } from '../../services/actions/actor.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;
const seed = (hp = 60, ac = 12): Seed =>
  ({
    context_id: ctx.id,
    world_name: 'MM',
    ship_name: 'MM',
    intro: '',
    seed_id: 'mm',
    rooms: [{ id: 'entry_hall', name: 'S', desc: '' }],
    enemies: {
      ['entry_hall']: [
        {
          id: ENEMY,
          name: 'Dummy',
          hp,
          ac,
          damage: '1d4',
          toHit: 3,
          xp: 50,
          wis: 8,
        } as unknown as Enemy,
      ],
    },
    loot: {},
    npcs: {},
  }) as Seed;

function sorcCombat(over: Partial<ReturnType<typeof makeChar>> = {}, enemyHp = 60): GameState {
  const sorc = makeChar({
    id: 'pc-1',
    character_class: 'Sorcerer',
    level: 9,
    cha: 16,
    spell_slots_max: { 1: 4, 2: 3, 9: 1 },
    spell_slots_used: {},
    spells_known: ['fire_bolt', 'hold_person', 'power_word_kill', 'shield_of_faith'],
    ...over,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [sorc],
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
        pos: { x: 4, y: 5 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: enemyHp,
        maxHp: enemyHp,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

describe('Metamagic foundation — applies once then clears', () => {
  it('metamagic_active is cleared after the next cast', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const state = sorcCombat();
    state.metamagic_active = ['empowered'];
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'fire_bolt', slotLevel: 0, targetEnemyId: ENEMY },
      history: [],
      state,
      seed: seed(),
      context: ctx,
    });
    expect(r.newState.metamagic_active).toBeUndefined();
  });
});

describe('Distant Spell — double range', () => {
  const fireBolt = {
    name: 'Fire Bolt',
    level: 0,
    rangeKind: 'ranged',
    rangeFt: 120,
  } as unknown as Spell;
  const rangeCtx = (metamagic: string[] = []): ActionContext =>
    ({
      actor: pcActor(makeChar({ id: 'pc-1', spell_slots_used: {} }), 0),
      metamagic,
      narrative: '',
      st: {
        entities: [
          {
            id: 'pc-1',
            isEnemy: false,
            pos: { x: 1, y: 1 },
            hp: 10,
            maxHp: 10,
            conditions: [],
            condition_durations: {},
          },
          {
            id: ENEMY,
            isEnemy: true,
            pos: { x: 1, y: 31 },
            hp: 10,
            maxHp: 10,
            conditions: [],
            condition_durations: {},
          }, // 150 ft
        ],
      },
    }) as unknown as ActionContext;

  it('a target at 150 ft is out of base 120 ft range', () => {
    expect(isSpellOutOfRange(rangeCtx(), fireBolt, ENEMY, 'Dummy', 0, false)).toBe(true);
  });
  it('Distant Spell brings it into the doubled 240 ft range', () => {
    expect(isSpellOutOfRange(rangeCtx(['distant']), fireBolt, ENEMY, 'Dummy', 0, false)).toBe(
      false
    );
  });
});

describe('Subtle Spell — no components (bypasses Deafened)', () => {
  it('a deafened Sorcerer can cast a verbal spell with Subtle, but not without', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // power_word_kill is verbal; deafened normally blocks it.
    const withSubtle = sorcCombat({ conditions: ['deafened'] }, 50);
    withSubtle.metamagic_active = ['subtle'];
    const r1 = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'power_word_kill',
        slotLevel: 9,
        targetEnemyId: ENEMY,
      },
      history: [],
      state: withSubtle,
      seed: seed(50),
      context: ctx,
    });
    expect(r1.newState.enemies_killed).toContain(ENEMY); // cast resolved (≤100 HP dies)

    const noSubtle = sorcCombat({ conditions: ['deafened'] }, 50);
    const r2 = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'power_word_kill',
        slotLevel: 9,
        targetEnemyId: ENEMY,
      },
      history: [],
      state: noSubtle,
      seed: seed(50),
      context: ctx,
    });
    expect(r2.narrative).toMatch(/deafened/i); // blocked
    expect(r2.newState.enemies_killed).not.toContain(ENEMY);
  });
});

describe('Extended Spell — double concentration duration', () => {
  it('doubles rounds_left on a concentration buff', async () => {
    const base = makeState(
      {
        id: 'pc-1',
        character_class: 'Sorcerer',
        level: 9,
        cha: 16,
        spell_slots_max: { 1: 4 },
        spell_slots_used: {},
        spells_known: ['shield_of_faith'],
      },
      { combat_active: false }
    );
    base.metamagic_active = ['extended'];
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'shield_of_faith', slotLevel: 1 },
      history: [],
      state: base,
      seed: seed(),
      context: ctx,
    });
    expect(r.newState.characters[0].concentrating_on?.rounds_left).toBe(20); // base 10 → 20
  });
});

describe('Heightened Spell — target save Disadvantage', () => {
  it('forces the target to roll its save with Disadvantage (it fails where it would succeed)', async () => {
    // Save rolls: with Heightened (disadvantage) → 2d20 take the low (2) → fail;
    // without → single high (20) → succeed.
    const heightened = sorcCombat({}, 60);
    heightened.metamagic_active = ['heightened'];
    vi.spyOn(Math, 'random').mockReturnValue(0.05); // every d20 low; disadvantage min is low → fail
    const r1 = await takeAction({
      action: { type: 'cast_spell', spellId: 'hold_person', slotLevel: 2, targetEnemyId: ENEMY },
      history: [],
      state: heightened,
      seed: seed(),
      context: ctx,
    });
    expect(r1.newState.entities?.find((e) => e.id === ENEMY)?.conditions).toContain('paralyzed');

    vi.restoreAllMocks();
    vi.spyOn(Math, 'random').mockReturnValue(0.95); // single d20 = 20 → save succeeds
    const r2 = await takeAction({
      action: { type: 'cast_spell', spellId: 'hold_person', slotLevel: 2, targetEnemyId: ENEMY },
      history: [],
      state: sorcCombat({}, 60),
      seed: seed(),
      context: ctx,
    });
    expect(r2.newState.entities?.find((e) => e.id === ENEMY)?.conditions ?? []).not.toContain(
      'paralyzed'
    );
  });
});

// Level-1 sorcerer → Fire Bolt is a clean 1d10 (single die). Spell attack
// bonus = prof(2) + CHA mod(3) = +5 vs the Dummy's AC 12.
const lowSorc = () => sorcCombat({ level: 1 });

describe('Empowered Spell — reroll low damage dice', () => {
  it('rerolls a low die into a high one (10 dmg, not 1)', async () => {
    // d20 0.7 → 15 (hit, no crit); 1d10 0.0 → 1; reroll 0.99 → 10.
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.7)
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.99)
      .mockReturnValue(0.5);
    const state = lowSorc();
    state.metamagic_active = ['empowered'];
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'fire_bolt', slotLevel: 0, targetEnemyId: ENEMY },
      history: [],
      state,
      seed: seed(),
      context: ctx,
    });
    expect(r.newState.entities?.find((e) => e.id === ENEMY)?.hp).toBe(50); // 60 - 10
  });

  it('control: the low die stands without Empowered (1 dmg)', async () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.7).mockReturnValueOnce(0.0).mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'fire_bolt', slotLevel: 0, targetEnemyId: ENEMY },
      history: [],
      state: lowSorc(),
      seed: seed(),
      context: ctx,
    });
    expect(r.newState.entities?.find((e) => e.id === ENEMY)?.hp).toBe(59); // 60 - 1
  });
});

describe('Seeking Spell — reroll a missed spell attack', () => {
  it('a missed attack is rerolled into a hit', async () => {
    // d20 0.1 → 3 (miss); reroll 0.9 → 19 (hit); then damage.
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.9).mockReturnValue(0.5);
    const state = lowSorc();
    state.metamagic_active = ['seeking'];
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'fire_bolt', slotLevel: 0, targetEnemyId: ENEMY },
      history: [],
      state,
      seed: seed(),
      context: ctx,
    });
    expect(r.newState.entities?.find((e) => e.id === ENEMY)!.hp).toBeLessThan(60); // reroll landed
  });

  it('control: a miss stays a miss without Seeking', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // d20 = 3 → miss, no reroll
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'fire_bolt', slotLevel: 0, targetEnemyId: ENEMY },
      history: [],
      state: lowSorc(),
      seed: seed(),
      context: ctx,
    });
    expect(r.newState.entities?.find((e) => e.id === ENEMY)!.hp).toBe(60); // untouched
  });
});

// Fireball (20-ft sphere, DEX save, half-on-save) with an ally PC standing in
// the blast next to the target enemy.
function carefulState(): GameState {
  const sorc = makeChar({
    id: 'pc-1',
    character_class: 'Sorcerer',
    level: 5,
    cha: 16,
    spell_slots_max: { 3: 2 },
    spell_slots_used: {},
    spells_known: ['fireball'],
  });
  const ally = makeChar({
    id: 'pc-2',
    character_class: 'Fighter',
    level: 5,
    hp: 40,
    max_hp: 40,
    dex: 10,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [sorc, ally],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: 'pc-2', roll: 12, is_enemy: false },
      { id: ENEMY, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 1, y: 1 },
        hp: 25,
        maxHp: 25,
        conditions: [],
        condition_durations: {},
      },
      {
        id: 'pc-2',
        isEnemy: false,
        pos: { x: 10, y: 11 },
        hp: 40,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      }, // in the blast
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 10, y: 10 },
        hp: 80,
        maxHp: 80,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

describe('Careful Spell — allies in the area auto-succeed and take no damage', () => {
  it('an ally in the Fireball blast takes no damage with Careful', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = carefulState();
    state.metamagic_active = ['careful'];
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'fireball', slotLevel: 3, targetEnemyId: ENEMY },
      history: [],
      state,
      seed: seed(80),
      context: ctx,
    });
    expect(r.newState.characters.find((c) => c.id === 'pc-2')!.hp).toBe(40); // untouched
    expect(r.narrative).toMatch(/Careful Spell/);
  });

  it('control: the ally takes (at least half) damage without Careful', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'fireball', slotLevel: 3, targetEnemyId: ENEMY },
      history: [],
      state: carefulState(),
      seed: seed(80),
      context: ctx,
    });
    expect(r.newState.characters.find((c) => c.id === 'pc-2')!.hp).toBeLessThan(40); // caught in the blast
  });
});

// A fire-resistant enemy: Fire Bolt (fire) is halved normally, but Transmuted
// can change the type to one it doesn't resist.
const fireResistSeed: Seed = {
  ...seed(),
  enemies: {
    ['entry_hall']: [
      {
        id: ENEMY,
        name: 'Salamander',
        hp: 60,
        ac: 12,
        damage: '1d4',
        toHit: 3,
        xp: 50,
        resistances: ['fire'],
      } as unknown as Enemy,
    ],
  },
};

describe('Transmuted Spell — change damage type to dodge resistance', () => {
  it('a fire-resistant enemy takes FULL damage when Fire Bolt is transmuted', async () => {
    // d20 0.7 → 15 (hit); 1d10 0.5 → 6. Transmuted → acid (not resisted) → 6.
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.7).mockReturnValueOnce(0.5).mockReturnValue(0.5);
    const state = lowSorc();
    state.metamagic_active = ['transmuted'];
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'fire_bolt', slotLevel: 0, targetEnemyId: ENEMY },
      history: [],
      state,
      seed: fireResistSeed,
      context: ctx,
    });
    expect(r.newState.entities?.find((e) => e.id === ENEMY)!.hp).toBe(54); // 60 - 6 full
  });

  it('control: fire damage is halved by the resistance without Transmuted', async () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.7).mockReturnValueOnce(0.5).mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'fire_bolt', slotLevel: 0, targetEnemyId: ENEMY },
      history: [],
      state: lowSorc(),
      seed: fireResistSeed,
      context: ctx,
    });
    expect(r.newState.entities?.find((e) => e.id === ENEMY)!.hp).toBe(57); // 60 - 3 (fire halved)
  });
});

const E2 = `entry_hall#1`;
const twinSeed: Seed = {
  ...seed(),
  enemies: {
    ['entry_hall']: [
      { id: ENEMY, name: 'A', hp: 60, ac: 12, damage: '1d4', toHit: 3, xp: 50 } as unknown as Enemy,
      { id: E2, name: 'B', hp: 60, ac: 12, damage: '1d4', toHit: 3, xp: 50 } as unknown as Enemy,
    ],
  },
};
function twinState(): GameState {
  const s = lowSorc();
  s.entities = [
    ...(s.entities ?? []),
    {
      id: E2,
      isEnemy: true,
      pos: { x: 6, y: 5 },
      hp: 60,
      maxHp: 60,
      conditions: [],
      condition_durations: {},
    },
  ];
  s.initiative_order = [...s.initiative_order, { id: E2, roll: 4, is_enemy: true }];
  return s;
}

describe('Twinned Spell — strike a second creature', () => {
  it('a single-target spell also hits a 2nd enemy', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.7); // d20 15 (hit), 1d10 → 8
    const state = twinState();
    state.metamagic_active = ['twinned'];
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'fire_bolt', slotLevel: 0, targetEnemyId: ENEMY },
      history: [],
      state,
      seed: twinSeed,
      context: ctx,
    });
    expect(r.newState.entities?.find((e) => e.id === ENEMY)!.hp).toBeLessThan(60);
    expect(r.newState.entities?.find((e) => e.id === E2)!.hp).toBeLessThan(60);
    expect(r.narrative).toMatch(/Twinned Spell/);
  });

  it('control: without Twinned only the primary is hit', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.7);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'fire_bolt', slotLevel: 0, targetEnemyId: ENEMY },
      history: [],
      state: twinState(),
      seed: twinSeed,
      context: ctx,
    });
    expect(r.newState.entities?.find((e) => e.id === ENEMY)!.hp).toBeLessThan(60);
    expect(r.newState.entities?.find((e) => e.id === E2)!.hp).toBe(60); // untouched
  });
});
