// SRD recharge Breath Weapon — the shared AoE-save-vs-party infra (a dragon's
// Fire Breath, the Giant Ape's Boulder Toss). Covers the catalog wiring, the
// reusable party-AoE helper, the recharge state machine, and one integration
// proving the breath fires on the creature's turn through `takeAction`.

import type { Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyAoeSaveToParty,
  maybeFireBreathWeapon,
  takeAction,
} from '../../services/gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { SRD_ITEMS } from '../../campaignData/srd/items.js';
import { SRD_MONSTERS } from '../../campaignData/srd/monsters.js';
import { context as ctx } from '../fixtures/testContext.js';

afterEach(() => vi.restoreAllMocks());

// ─── Catalog ──────────────────────────────────────────────────────────────

describe('breath weapon — catalog', () => {
  it('Young Red Dragon has Fire Breath (16d6 fire, DEX DC 17, Recharge 5–6)', () => {
    expect(SRD_MONSTERS.young_red_dragon.breathWeapon).toEqual({
      name: 'Fire Breath',
      dice: '16d6',
      damageType: 'fire',
      savingThrow: 'dex',
      saveDC: 17,
      rechargeMin: 5,
    });
  });

  it('Giant Ape has Boulder Toss (7d6 bludgeoning, DEX DC 17, Recharge 6)', () => {
    expect(SRD_MONSTERS.giant_ape.breathWeapon).toMatchObject({
      name: 'Boulder Toss',
      dice: '7d6',
      damageType: 'bludgeoning',
      savingThrow: 'dex',
      rechargeMin: 6,
    });
  });
});

// ─── applyAoeSaveToParty ────────────────────────────────────────────────────

function twoPcState(): GameState {
  const a = makeChar({ id: 'pc-1', dex: 10, hp: 60, max_hp: 60 });
  const b = makeChar({ id: 'pc-2', dex: 10, hp: 60, max_hp: 60 });
  return { ...makeState({ id: 'pc-1' }), characters: [a, b] };
}

describe('applyAoeSaveToParty', () => {
  it('deals full damage to every PC on a failed save', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // d20 saves roll 1 → fail
    const r = applyAoeSaveToParty(twoPcState(), ctx, {
      dice: '8d1', // deterministic: 8 damage
      damageType: 'fire',
      savingThrow: 'dex',
      saveDC: 14,
    });
    expect(r.st.characters[0].hp).toBe(52); // 60 − 8
    expect(r.st.characters[1].hp).toBe(52);
    expect(r.narrative).toContain('fails');
  });

  it('deals half damage on a successful save', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 saves roll 20 → succeed
    const r = applyAoeSaveToParty(twoPcState(), ctx, {
      dice: '8d1', // 8 → half = 4
      damageType: 'fire',
      savingThrow: 'dex',
      saveDC: 14,
    });
    expect(r.st.characters[0].hp).toBe(56); // 60 − 4
    expect(r.st.characters[1].hp).toBe(56);
    expect(r.narrative).toContain('succeeds (half)');
  });

  it("a Cloak of Protection's +1 save halves an enemy-AoE hit a bare PC takes in full", () => {
    // d20 = 13 (rnd 0.6). At dex 10 (+0), DC 14: bare 13 < 14 → fail (full 8);
    // the cloak drops the effective DC to 13 → 13 ≥ 13 → made (half 4).
    vi.spyOn(Math, 'random').mockReturnValue(0.6);
    const cloaked = makeChar({
      id: 'pc-1',
      dex: 10,
      hp: 60,
      max_hp: 60,
      inventory: [{ instance_id: 'cl', id: 'cloak_of_protection', name: 'Cloak of Protection' }],
      equipment: { cloak: 'cl' },
      attuned_items: ['cl'],
    });
    const bare = makeChar({ id: 'pc-2', dex: 10, hp: 60, max_hp: 60 });
    const st = { ...makeState({ id: 'pc-1' }), characters: [cloaked, bare] };
    const cloakCtx = { ...ctx, lootTable: [...ctx.lootTable, SRD_ITEMS.cloak_of_protection] };
    const r = applyAoeSaveToParty(st, cloakCtx, {
      dice: '8d1',
      damageType: 'fire',
      savingThrow: 'dex',
      saveDC: 14,
    });
    expect(r.st.characters[0].hp).toBe(56); // cloaked: made the save → half (4)
    expect(r.st.characters[1].hp).toBe(52); // bare: failed the same roll → full (8)
  });
});

// ─── maybeFireBreathWeapon — recharge state machine ─────────────────────────

function breathEnemy(overrides: Partial<Enemy> = {}): Enemy {
  return {
    id: 'drake',
    name: 'Test Drake',
    hp: 100,
    ac: 14,
    damage: '1d6',
    toHit: 5,
    breathWeapon: {
      name: 'Searing Breath',
      dice: '8d1',
      damageType: 'fire',
      savingThrow: 'dex',
      saveDC: 14,
      rechargeMin: 5,
    },
    ...overrides,
  } as Enemy;
}

function breathState(breathCharged?: boolean): GameState {
  const st = twoPcState();
  return {
    ...st,
    entities: [
      {
        id: 'drake',
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 100,
        maxHp: 100,
        conditions: [],
        condition_durations: {},
        ...(breathCharged !== undefined ? { breath_charged: breathCharged } : {}),
      },
    ],
  };
}

describe('maybeFireBreathWeapon', () => {
  it('fires when charged (fresh combat), damages the party, and marks it spent', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // saves fail → full 8
    const r = maybeFireBreathWeapon({
      enemy: breathEnemy(),
      enemyId: 'drake',
      st: breathState(undefined),
      context: ctx,
      narrative: '',
    });
    expect(r.fired).toBe(true);
    expect(r.st.entities?.[0].breath_charged).toBe(false);
    expect(r.st.characters[0].hp).toBe(52);
    expect(r.narrative).toContain('Searing Breath');
  });

  it('is a no-op for an enemy without a breath weapon', () => {
    const r = maybeFireBreathWeapon({
      enemy: breathEnemy({ breathWeapon: undefined }),
      enemyId: 'drake',
      st: breathState(undefined),
      context: ctx,
      narrative: '',
    });
    expect(r.fired).toBe(false);
    expect(r.st.characters[0].hp).toBe(60); // untouched
  });

  it('does not fire when spent and the recharge roll fails', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // d6 → 1, below rechargeMin 5
    const r = maybeFireBreathWeapon({
      enemy: breathEnemy(),
      enemyId: 'drake',
      st: breathState(false),
      context: ctx,
      narrative: '',
    });
    expect(r.fired).toBe(false);
    expect(r.st.characters[0].hp).toBe(60); // no AoE rolled
  });

  it('recharges and fires when spent and the d6 clears rechargeMin', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d6 → 6, recharges; saves succeed → half 4
    const r = maybeFireBreathWeapon({
      enemy: breathEnemy(),
      enemyId: 'drake',
      st: breathState(false),
      context: ctx,
      narrative: '',
    });
    expect(r.fired).toBe(true);
    expect(r.narrative).toContain('recharges');
    expect(r.st.entities?.[0].breath_charged).toBe(false);
    expect(r.st.characters[0].hp).toBe(56); // 60 − 4
  });
});

// ─── Integration — the dragon breathes on its turn via takeAction ───────────

describe('Breath weapon — fires on the enemy turn (integration)', () => {
  it('a Young Red Dragon unleashes Fire Breath after a PC acts', async () => {
    const dragon: Enemy = { ...SRD_MONSTERS.young_red_dragon, id: 'wyrm#0' };
    const seed: Seed = {
      context_id: ctx.id,
      world_name: 'Breath Test',
      ship_name: 'Breath Test',
      intro: '',
      seed_id: 'breath',
      rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
      enemies: { ['entry_hall']: [dragon] },
      loot: {},
      npcs: {},
    };
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 12,
      hp: 110,
      max_hp: 110,
      str: 18,
    });
    const state: GameState = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [pc],
      active_character_id: 'pc-1',
      initiative_order: [
        { id: 'pc-1', roll: 18, is_enemy: false },
        { id: 'wyrm#0', roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      round: 1,
      entities: [
        {
          id: 'pc-1',
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 110,
          maxHp: 110,
          conditions: [],
          condition_durations: {},
        },
        {
          id: 'wyrm#0',
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 178,
          maxHp: 178,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    // The dragon's turn ran after the PC ended theirs and it breathed fire.
    expect(r.narrative).toMatch(/Fire Breath/);
    const wyrm = r.newState.entities?.find((e) => e.id === 'wyrm#0');
    expect(wyrm?.breath_charged).toBe(false); // spent after firing
    // The PC was caught in the blast (16d6 fire, even halved, lands).
    expect(r.newState.characters[0].hp).toBeLessThan(110);
  });
});
