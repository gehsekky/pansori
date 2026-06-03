// SRD Boon of Irresistible Offense (epic boon, L19+):
//   - Overcome Defenses — bludgeoning/piercing/slashing damage ignores
//     Resistance (Immunity and Vulnerability still apply).
//   - Overwhelming Strike — on a natural 20, extra damage of the attack's type
//     equal to the ability score the boon increased.
//
// Pure-helper units below; the two integration tests prove the wiring through
// the real attack path in resolveOneAttack.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hasIrresistibleOffense,
  overcomeDefensesApplies,
  overwhelmingStrikeDamage,
} from './feats.js';
import { makeChar, makeState, mockRandom } from '../test-fixtures.js';
import type { Seed } from '../types.js';
import { applyDamageMultiplier } from './rulesEngine.js';
import { context as ctx } from '../campaignData/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

describe('applyDamageMultiplier — ignoreResistance', () => {
  const resistant = { resistances: ['slashing'] };
  it('bypasses Resistance when the flag is set, otherwise halves', () => {
    expect(applyDamageMultiplier(10, 'slashing', resistant).damage).toBe(5);
    expect(
      applyDamageMultiplier(10, 'slashing', resistant, { ignoreResistance: true }).damage
    ).toBe(10);
  });
  it('still applies Immunity and Vulnerability with the flag set', () => {
    expect(
      applyDamageMultiplier(10, 'fire', { immunities: ['fire'] }, { ignoreResistance: true }).damage
    ).toBe(0);
    expect(
      applyDamageMultiplier(10, 'fire', { vulnerabilities: ['fire'] }, { ignoreResistance: true })
        .damage
    ).toBe(20);
  });
});

describe('Irresistible Offense — helpers', () => {
  const boonChar = makeChar({
    id: 'pc-1',
    str: 20,
    feats: ['boon_irresistible_offense'],
    feat_choices: { boon_irresistible_offense: { abilityBonus: 'str' } },
  });
  const plain = makeChar({ id: 'pc-2', str: 20 });

  it('overcomeDefensesApplies — only B/P/S, only with the boon', () => {
    expect(hasIrresistibleOffense(boonChar)).toBe(true);
    expect(overcomeDefensesApplies(boonChar, 'slashing')).toBe(true);
    expect(overcomeDefensesApplies(boonChar, 'piercing')).toBe(true);
    expect(overcomeDefensesApplies(boonChar, 'fire')).toBe(false);
    expect(overcomeDefensesApplies(plain, 'slashing')).toBe(false);
  });

  it('overwhelmingStrikeDamage — boosted score on a nat 20, else 0', () => {
    expect(overwhelmingStrikeDamage(boonChar, 20)).toBe(20);
    expect(overwhelmingStrikeDamage(boonChar, 19)).toBe(0);
    expect(overwhelmingStrikeDamage(plain, 20)).toBe(0);
  });
});

// ─── Integration through the real attack path ────────────────────────────

const slashResistSeed: Seed = {
  context_id: ctx.id,
  world_name: 'Irresistible Test',
  ship_name: 'Irresistible Test',
  intro: '',
  seed_id: 'irresistible',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: `entry_hall#0`,
        name: 'Skeleton',
        hp: 200,
        ac: 10,
        damage: '1d6',
        toHit: 3,
        xp: 20,
        resistances: ['slashing'],
      },
    ],
  },
  loot: {},
  npcs: {},
};

function boonFighterState(overrides: Partial<ReturnType<typeof makeChar>> = {}) {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 19,
    str: 20,
    hp: 60,
    max_hp: 60,
    inventory: [{ instance_id: 'ga-1', id: 'greataxe', name: 'Greataxe' }],
    equipment: { main_hand: 'ga-1' },
    weapon_proficiencies: ['simple', 'martial'],
    feats: ['boon_irresistible_offense'],
    feat_choices: { boon_irresistible_offense: { abilityBonus: 'str' } },
    ...overrides,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [pc],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: `entry_hall#0`, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
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
        id: `entry_hall#0`,
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

describe('Overcome Defenses — through the attack path', () => {
  it('ignores slashing Resistance on an ordinary hit', async () => {
    // d20 ≈ 11 (a hit, not a nat 20 → no Overwhelming Strike to muddy this).
    mockRandom(0.5);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: `entry_hall#0` },
      history: [],
      state: boonFighterState(),
      seed: slashResistSeed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Overcome Defenses: ignores slashing Resistance/);
    expect(result.narrative).not.toMatch(/resistant to slashing/);
  });
});

describe('Overwhelming Strike — through the attack path', () => {
  it('adds the boosted ability score (+20) on a natural 20', async () => {
    // d20 = 20 → crit + nat 20.
    mockRandom(0.99);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: `entry_hall#0` },
      history: [],
      state: boonFighterState(),
      seed: slashResistSeed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Overwhelming Strike \(nat 20\): \+20/);
  });
});
