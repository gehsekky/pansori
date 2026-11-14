// SRD 5.2.1 — Advantage / Disadvantage on attack rolls, shared by weapon and
// spell attacks (services/attackEdges.ts):
// - the attacker's conditions (Poisoned, Blinded, ...) impose Disadvantage;
// - Ranged Attacks in Close Combat: Disadvantage within 5 ft of an enemy;
// - target conditions: Paralyzed / Stunned / Restrained / Unconscious /
//   Petrified grant Advantage; Prone grants it within 5 ft, else Disadvantage;
// - Paralyzed / Unconscious: a hit from within 5 ft is a Critical Hit;
// - Exhaustion's −2 per level applies to spell attack rolls too;
// - one-shot grants (Help) are spent by a spell attack as well.

import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../fixtures/testContext.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = 'entry_hall#0';

// Sorcerer 3, CHA 16: spell attack +5. The enemy has AC 12, so a d20 of 3
// (Math.random 0.1) misses and 19 (0.9) hits.
const sorcerer = (over: Partial<Character> = {}) =>
  makeChar({
    id: 'pc-1',
    character_class: 'Sorcerer',
    level: 3,
    class_levels: { sorcerer: 3 },
    cha: 16,
    spells_known: ['fire_bolt', 'shocking_grasp'],
    spell_slots_max: { 1: 4 },
    spell_slots_used: {},
    ...over,
  });

const seed = (): Seed =>
  ({
    context_id: ctx.id,
    world_name: 'AE',
    ship_name: 'AE',
    intro: '',
    seed_id: 'ae',
    rooms: [{ id: 'entry_hall', name: 'S', desc: '' }],
    enemies: {
      entry_hall: [
        {
          id: ENEMY,
          name: 'Brute',
          hp: 200,
          ac: 12,
          damage: '1d4',
          toHit: 3,
          xp: 50,
        } as unknown as Enemy,
      ],
    },
    loot: {},
    npcs: {},
  }) as Seed;

function combat(
  char: Character,
  enemyX: number,
  enemyConds: string[] = [],
  over: Partial<GameState> = {}
): GameState {
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [char],
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
        pos: { x: 1, y: 4 },
        hp: 30,
        maxHp: 30,
        conditions: char.conditions,
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: enemyX, y: 4 },
        hp: 200,
        maxHp: 200,
        conditions: enemyConds,
        condition_durations: {},
      },
    ],
    ...over,
  } as unknown as GameState;
}

const cast = (st: GameState, spellId = 'fire_bolt') =>
  takeAction({
    action: { type: 'cast_spell', spellId, slotLevel: 0, targetEnemyId: ENEMY } as never,
    history: [],
    state: st,
    seed: seed(),
    context: ctx,
  });

const enemyHp = (st: GameState) => st.entities?.find((e) => e.id === ENEMY)?.hp;

// d20 rolls: first 19 then 3, then mid rolls for everything after.
const highThenLow = () =>
  vi.spyOn(Math, 'random').mockReturnValueOnce(0.9).mockReturnValueOnce(0.1).mockReturnValue(0.5);
const lowThenHigh = () =>
  vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.9).mockReturnValue(0.5);

describe('spell attack rolls honor conditions', () => {
  it('control: an unhindered Fire Bolt at 15 ft takes its one d20 (19 hits)', async () => {
    highThenLow();
    const r = await cast(combat(sorcerer(), 4));
    expect(enemyHp(r.newState)).toBeLessThan(200);
  });

  it('a Poisoned caster rolls with Disadvantage (19 and 3 → 3 misses)', async () => {
    highThenLow();
    const r = await cast(combat(sorcerer({ conditions: ['poisoned'] }), 4));
    expect(enemyHp(r.newState)).toBe(200);
    expect(r.narrative).toMatch(/disadvantage — poisoned/);
  });

  it('a ranged spell attack within 5 ft of an enemy has Disadvantage', async () => {
    highThenLow();
    const r = await cast(combat(sorcerer(), 2));
    expect(enemyHp(r.newState)).toBe(200);
    expect(r.narrative).toMatch(/ranged in melee/);
  });

  it('a touch spell (melee spell attack) has no close-combat Disadvantage', async () => {
    highThenLow();
    const r = await cast(combat(sorcerer(), 2), 'shocking_grasp');
    expect(enemyHp(r.newState)).toBeLessThan(200);
  });

  for (const cond of ['paralyzed', 'stunned', 'restrained', 'unconscious', 'petrified']) {
    it(`attacks against a ${cond} target have Advantage (3 and 19 → 19 hits)`, async () => {
      lowThenHigh();
      const r = await cast(combat(sorcerer(), 4, [cond]));
      expect(enemyHp(r.newState)).toBeLessThan(200);
      expect(r.narrative).toMatch(new RegExp(`advantage — target ${cond}`));
    });
  }

  it('a Prone target: Advantage within 5 ft, Disadvantage beyond', async () => {
    lowThenHigh();
    const near = await cast(combat(sorcerer(), 2, ['prone']), 'shocking_grasp');
    expect(enemyHp(near.newState)).toBeLessThan(200);
    vi.restoreAllMocks();
    highThenLow();
    const far = await cast(combat(sorcerer(), 4, ['prone']));
    expect(enemyHp(far.newState)).toBe(200);
    expect(far.narrative).toMatch(/target prone \(beyond 5 ft\)/);
  });

  it('a hit on a Paralyzed target from within 5 ft is a Critical Hit; from range it is not', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 11 → 16 hits AC 12
    const near = await cast(combat(sorcerer(), 2, ['paralyzed']), 'shocking_grasp');
    expect(near.narrative).toMatch(/crit/i);
    const far = await cast(combat(sorcerer(), 4, ['paralyzed']));
    expect(far.narrative).not.toMatch(/crit/i);
  });

  it("Exhaustion's −2 per level comes off the spell attack roll", async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 11
    const r = await cast(combat(sorcerer({ exhaustion_level: 2 }), 4));
    expect(r.narrative).toMatch(/spell attack 11\+1=12/);
  });

  it('a pending Help is spent on the spell attack', async () => {
    lowThenHigh();
    const r = await cast(combat(sorcerer(), 4, [], { help_target_id: 'pc-1' }));
    expect(enemyHp(r.newState)).toBeLessThan(200);
    expect(r.newState.help_target_id).toBeUndefined();
  });

  it('each Eldritch Blast beam rolls with close-combat Disadvantage', async () => {
    highThenLow();
    const warlock = makeChar({
      id: 'pc-1',
      character_class: 'Warlock',
      level: 5,
      class_levels: { warlock: 5 },
      cha: 16,
      spells_known: ['eldritch_blast'],
    });
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'eldritch_blast',
        slotLevel: 0,
        targetEnemyIds: [ENEMY, ENEMY],
      } as never,
      history: [],
      state: combat(warlock, 2),
      seed: seed(),
      context: ctx,
    });
    expect(r.narrative).toMatch(/MISS \(\d+ vs AC 12\) \(disadvantage — ranged in melee\)/);
  });
});

describe('weapon attacks: target conditions from the registry', () => {
  const fighter = () =>
    makeChar({ id: 'pc-1', character_class: 'Fighter', level: 1, class_levels: { fighter: 1 } });
  const swing = (st: GameState) =>
    takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY } as never,
      history: [],
      state: st,
      seed: seed(),
      context: ctx,
    });

  for (const cond of ['stunned', 'restrained', 'petrified', 'unconscious']) {
    it(`a ${cond} target grants Advantage`, async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const r = await swing(combat(fighter(), 2, [cond]));
      expect(r.narrative).toMatch(/\(advantage\)/);
    });
  }

  it('a hit on a Paralyzed target from within 5 ft is a Critical Hit', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await swing(combat(fighter(), 2, ['paralyzed']));
    expect(r.narrative).toMatch(/crit/i);
  });
});
