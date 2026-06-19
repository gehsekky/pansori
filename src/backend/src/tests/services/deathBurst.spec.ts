// SRD Death Burst (Magmin + the elemental Mephits) — a creature that drops to 0
// HP explodes, forcing an AoE save on the party (reusing `applyAoeSaveToParty`,
// the same whole-party machinery breath weapons use). Covers the catalog wiring,
// the `applyDeathBursts` sweep (fires once per creature; keyed on real death, not
// on a parley/banish removal), and an integration proving a kill resolved through
// `takeAction` lands the blast.

import type { Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyDeathBursts, takeAction } from '../../services/gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { CombatEntity } from '../../shared-types.js';
import { SRD_MONSTERS } from '../../campaignData/srd/monsters.js';
import { context as ctx } from '../fixtures/testContext.js';

afterEach(() => vi.restoreAllMocks());

// ─── Catalog ────────────────────────────────────────────────────────────────

describe('death burst — catalog', () => {
  it('Magmin has a 10-ft 2d6 fire burst (DEX DC 11)', () => {
    expect(SRD_MONSTERS.magmin.deathBurst).toEqual({
      name: 'Death Burst',
      dice: '2d6',
      damageType: 'fire',
      savingThrow: 'dex',
      saveDC: 11,
      radiusFt: 10,
    });
  });

  it('Magma Mephit has a 5-ft 2d6 fire burst (DEX DC 11)', () => {
    expect(SRD_MONSTERS.magma_mephit.deathBurst).toMatchObject({
      dice: '2d6',
      damageType: 'fire',
      savingThrow: 'dex',
      saveDC: 11,
    });
  });

  it('Steam Mephit has a 5-ft 2d4 fire burst (DEX DC 10)', () => {
    expect(SRD_MONSTERS.steam_mephit.deathBurst).toMatchObject({
      dice: '2d4',
      damageType: 'fire',
      savingThrow: 'dex',
      saveDC: 10,
    });
  });

  it('Dust Mephit has a 5-ft 2d4 bludgeoning burst (DEX DC 10)', () => {
    expect(SRD_MONSTERS.dust_mephit.deathBurst).toMatchObject({
      dice: '2d4',
      damageType: 'bludgeoning',
      savingThrow: 'dex',
      saveDC: 10,
    });
  });
});

// ─── applyDeathBursts ───────────────────────────────────────────────────────

function burstSeed(enemy: Enemy): Seed {
  return {
    context_id: ctx.id,
    world_name: 'Burst Test',
    ship_name: 'Burst Test',
    intro: '',
    seed_id: 'burst',
    rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
    enemies: { ['entry_hall']: [enemy] },
    loot: {},
    npcs: {},
  };
}

// A down (hp 0) mephit entity, as the kill sites leave it just before the sweep.
function downedEntity(overrides: Partial<CombatEntity> = {}) {
  return {
    id: 'mephit#0',
    isEnemy: true,
    pos: { x: 5, y: 5 },
    hp: 0,
    maxHp: 18,
    conditions: [],
    condition_durations: {},
    ...overrides,
  };
}

function twoPcState(entities: CombatEntity[]): GameState {
  const a = makeChar({ id: 'pc-1', dex: 10, hp: 60, max_hp: 60 });
  const b = makeChar({ id: 'pc-2', dex: 10, hp: 60, max_hp: 60 });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall' }),
    characters: [a, b],
    entities,
  };
}

describe('applyDeathBursts', () => {
  const mephit: Enemy = {
    ...SRD_MONSTERS.magma_mephit,
    id: 'mephit#0',
    // deterministic 2-die expr so the math is exact (2d6 → here forced low/high by the roll mock)
    deathBurst: {
      name: 'Death Burst',
      dice: '8d1',
      damageType: 'fire',
      savingThrow: 'dex',
      saveDC: 14,
    },
  };

  it('explodes a downed creature, damaging every PC, and latches once', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // d20 saves roll 1 → fail → full 8
    const st = twoPcState([downedEntity()]);
    const r = applyDeathBursts(st, burstSeed(mephit), ctx);
    expect(r.st.characters[0].hp).toBe(52); // 60 − 8
    expect(r.st.characters[1].hp).toBe(52);
    expect(r.st.entities?.[0].death_burst_fired).toBe(true);
    expect(r.narrative).toContain('explodes');
  });

  it('does not fire a second time once latched (idempotent re-sweep)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const st = twoPcState([downedEntity({ death_burst_fired: true })]);
    const r = applyDeathBursts(st, burstSeed(mephit), ctx);
    expect(r.st.characters[0].hp).toBe(60); // untouched
    expect(r.narrative).toBe('');
  });

  it('does not explode a creature still standing (hp > 0 — parley / banish removal)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const st = twoPcState([downedEntity({ hp: 12 })]);
    const r = applyDeathBursts(st, burstSeed(mephit), ctx);
    expect(r.st.characters[0].hp).toBe(60);
    expect(r.narrative).toBe('');
  });

  it('is a no-op for a downed creature without a death burst', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const plain: Enemy = { ...SRD_MONSTERS.magma_mephit, id: 'mephit#0', deathBurst: undefined };
    const st = twoPcState([downedEntity()]);
    const r = applyDeathBursts(st, burstSeed(plain), ctx);
    expect(r.st.characters[0].hp).toBe(60);
    expect(r.narrative).toBe('');
  });
});

// ─── Integration — a kill resolved through takeAction lands the blast ─────────

describe('Death Burst — fires through takeAction after a kill (integration)', () => {
  it('a Magma Mephit felled this action explodes on the party', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // saves succeed → half of a high 2d6
    const mephit: Enemy = { ...SRD_MONSTERS.magma_mephit, id: 'mephit#0' };
    const seed = burstSeed(mephit);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      hp: 44,
      max_hp: 44,
      dex: 10,
    });
    const state: GameState = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [pc],
      active_character_id: 'pc-1',
      // The mephit was dropped to 0 by the PC's attack earlier this action; the
      // kill site stamped enemies_killed and zeroed its HP. The post-action sweep
      // is what makes it explode.
      enemies_killed: ['mephit#0'],
      initiative_order: [
        { id: 'pc-1', roll: 18, is_enemy: false },
        { id: 'mephit#0', roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      round: 1,
      entities: [
        {
          id: 'pc-1',
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 44,
          maxHp: 44,
          conditions: [],
          condition_durations: {},
        },
        {
          id: 'mephit#0',
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 0,
          maxHp: 18,
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
    expect(r.narrative).toMatch(/explodes/);
    expect(r.newState.characters[0].hp).toBeLessThan(44); // caught in the blast
    const ent = r.newState.entities?.find((e) => e.id === 'mephit#0');
    expect(ent?.death_burst_fired).toBe(true);
  });
});
