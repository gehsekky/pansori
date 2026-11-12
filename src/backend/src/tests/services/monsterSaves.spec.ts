// SRD 5.2.1 monster save traits.
// - Magic Resistance: Advantage on saving throws against spells and other
//   magical effects.
// - Legendary Resistance (N/Day): when the creature fails a save it can choose
//   to succeed instead. Spent on saves that would impose an effect, not on
//   damage-only saves (AI policy); the uses come back on a Long Rest.

import type { Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseSandboxSeed, makeChar, makeState } from '../../test-fixtures.js';
import {
  enemySaveD20,
  legendaryResist,
  legendaryResistanceLeft,
  magicResistanceAdvantage,
} from '../../services/monsterSaves.js';
import { SRD_MONSTERS } from '../../campaignData/srd/monsters.js';
import { context as ctx } from '../fixtures/testContext.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = 'entry_hall#0';

const seed = (traits: Partial<Enemy> = {}): Seed =>
  ({
    context_id: ctx.id,
    world_name: 'MS',
    ship_name: 'MS',
    intro: '',
    seed_id: 'ms',
    rooms: [{ id: 'entry_hall', name: 'S', desc: '' }],
    enemies: {
      entry_hall: [
        {
          id: ENEMY,
          name: 'Boss',
          hp: 200,
          ac: 12,
          damage: '1d4',
          toHit: 3,
          xp: 50,
          wis: 10,
          ...traits,
        } as unknown as Enemy,
      ],
    },
    loot: {},
    npcs: {},
  }) as Seed;

function casterState(): GameState {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Sorcerer',
    level: 9,
    cha: 16,
    spell_slots_max: { 1: 4, 2: 3, 3: 3 },
    spell_slots_used: {},
    spells_known: ['hold_person', 'fire_bolt'],
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
        hp: 200,
        maxHp: 200,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

const holdPerson = (state: GameState, s: Seed) =>
  takeAction({
    action: { type: 'cast_spell', spellId: 'hold_person', slotLevel: 2, targetEnemyId: ENEMY },
    history: [],
    state,
    seed: s,
    context: ctx,
  });

const enemyConds = (st: GameState) => st.entities?.find((e) => e.id === ENEMY)?.conditions ?? [];

describe('helpers', () => {
  it('Magic Resistance grants Advantage only against magical effects', () => {
    expect(magicResistanceAdvantage({ magicResistance: true })).toBe(true);
    expect(magicResistanceAdvantage({ magicResistance: true }, false)).toBe(false);
    expect(magicResistanceAdvantage({})).toBe(false);
    expect(magicResistanceAdvantage(undefined)).toBe(false);
  });

  it('enemySaveD20 rolls twice and keeps the higher with Magic Resistance', () => {
    const dice = [3, 17];
    const roll = () => dice.shift()!;
    expect(enemySaveD20({ magicResistance: true }, true, roll)).toBe(17);
    expect(enemySaveD20({ magicResistance: true }, false, () => 3)).toBe(3);
  });

  it('Legendary Resistance flips a failure, spends a use, and stops at zero', () => {
    const st = { legendary_resistance_used: {} } as unknown as GameState;
    const boss = { id: 'b', name: 'Boss', legendaryResistance: 2 };
    const first = legendaryResist(st, boss, true);
    expect(first.failed).toBe(false);
    expect(first.note).toMatch(/Legendary Resistance/);
    expect(legendaryResist(st, boss, true).failed).toBe(false);
    expect(legendaryResistanceLeft(st, boss)).toBe(0);
    expect(legendaryResist(st, boss, true).failed).toBe(true);
  });

  it('keeps its uses on a success and on a damage-only save', () => {
    const st = {} as GameState;
    const boss = { id: 'b', legendaryResistance: 3 };
    expect(legendaryResist(st, boss, false).failed).toBe(false);
    expect(legendaryResist(st, boss, true, { damageOnly: true }).failed).toBe(true);
    expect(legendaryResistanceLeft(st, boss)).toBe(3);
  });
});

describe('spell saves', () => {
  it('Legendary Resistance shrugs off Hold Person, then the next one lands', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // every d20 is a 1: the save fails
    const s = seed({ legendaryResistance: 1 });
    const first = await holdPerson(casterState(), s);
    expect(enemyConds(first.newState)).not.toContain('paralyzed');
    expect(first.newState.legendary_resistance_used?.[ENEMY]).toBe(1);
    expect(first.narrative).toMatch(/Legendary Resistance/);

    const again = casterState();
    again.legendary_resistance_used = { [ENEMY]: 1 };
    const second = await holdPerson(again, s);
    expect(enemyConds(second.newState)).toContain('paralyzed');
  });

  it('Magic Resistance: Advantage turns a failed save into a success', async () => {
    // Dice alternate high / low, phased so the save's die is a low one. The
    // plain save takes that die (it fails); with Magic Resistance it takes the
    // better of that die and the next (high), so it succeeds.
    const alternate = () => {
      let n = 1;
      vi.spyOn(Math, 'random').mockImplementation(() => (n++ % 2 === 0 ? 0.01 : 0.99));
    };
    alternate();
    const plain = await holdPerson(casterState(), seed());
    expect(enemyConds(plain.newState)).toContain('paralyzed');

    vi.restoreAllMocks();
    alternate();
    const resistant = await holdPerson(casterState(), seed({ magicResistance: true }));
    expect(enemyConds(resistant.newState)).not.toContain('paralyzed');
  });

  it('a damage-only save spell does not spend Legendary Resistance', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const state = casterState();
    state.characters[0].spells_known = ['sacred_flame'];
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'sacred_flame', slotLevel: 0, targetEnemyId: ENEMY },
      history: [],
      state,
      seed: seed({ legendaryResistance: 3 }),
      context: ctx,
    });
    expect(r.newState.legendary_resistance_used?.[ENEMY]).toBeUndefined();
  });
});

describe('rests and data', () => {
  it('a Long Rest restores Legendary Resistance uses', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const state = makeState({ hp: 3, max_hp: 20 });
    state.legendary_resistance_used = { [ENEMY]: 3 };
    const r = await takeAction({
      action: { type: 'long_rest' },
      history: [],
      state,
      seed: baseSandboxSeed, // no living enemies, so the rest is allowed
      context: ctx,
    });
    expect(r.narrative).not.toMatch(/can't/i);
    expect(r.newState.legendary_resistance_used).toBeUndefined();
  });

  it('the bestiary carries the SRD traits (Balor, Lich, Tarrasque; 34 / 32 blocks)', () => {
    const m = SRD_MONSTERS as Record<
      string,
      { magicResistance?: boolean; legendaryResistance?: number }
    >;
    expect(m.balor.magicResistance).toBe(true);
    expect(m.balor.legendaryResistance).toBe(3);
    expect(m.tarrasque.legendaryResistance).toBe(6);
    expect(m.lich.legendaryResistance).toBeGreaterThanOrEqual(3);
    expect(Object.values(m).filter((x) => x.magicResistance)).toHaveLength(34);
    expect(Object.values(m).filter((x) => x.legendaryResistance)).toHaveLength(32);
    expect(m.goblin_warrior?.magicResistance).toBeUndefined();
  });
});
