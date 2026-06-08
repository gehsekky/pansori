// SRD Regeneration (Troll, Vampire Spawn, Hydra) — the creature regains HP
// at the start of each of its turns unless it took a blocking damage type
// (acid/fire by default) since its last turn. Two halves:
//   - enemyHpAfterDamage (the central damage floor) flags `regen_blocked`
//     in place on the seed Enemy when a blocking type lands — lethal or not;
//   - the enemy turn loop consumes the flag (skip + clear) or heals the
//     grid entity up to maxHp.
// Kills are final — a creature at 0 HP does not regenerate back up (the
// RAW "dies only if it can't regenerate at 0" window is simplified away).

import type { Enemy, GameState, Seed } from '../../src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../src/test-fixtures.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';
import { enemyHpAfterDamage } from '../../src/services/enemyDamage.js';
import { takeAction } from '../../src/services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

describe('enemyHpAfterDamage — the regen-block flag', () => {
  it('flags regen_blocked on a default blocking type (fire), even on chip damage', () => {
    const troll = { regeneration: 15, name: 'Troll' } as Enemy;
    enemyHpAfterDamage(troll, 94, 3, { damageType: 'fire' });
    expect(troll.regen_blocked).toBe(true);
  });

  it('acid blocks too; slashing does not; zero damage does not', () => {
    const troll = { regeneration: 15 } as Enemy;
    enemyHpAfterDamage(troll, 94, 10, { damageType: 'slashing' });
    expect(troll.regen_blocked).toBeUndefined();
    enemyHpAfterDamage(troll, 94, 0, { damageType: 'acid' });
    expect(troll.regen_blocked).toBeUndefined();
    enemyHpAfterDamage(troll, 94, 10, { damageType: 'acid' });
    expect(troll.regen_blocked).toBe(true);
  });

  it('respects a custom regenBlockedBy list (Vampire Spawn: radiant)', () => {
    const spawn = { regeneration: 10, regenBlockedBy: ['radiant'] } as Enemy;
    enemyHpAfterDamage(spawn, 90, 8, { damageType: 'fire' });
    expect(spawn.regen_blocked).toBeUndefined(); // fire doesn't block this one
    enemyHpAfterDamage(spawn, 90, 8, { damageType: 'radiant' });
    expect(spawn.regen_blocked).toBe(true);
  });

  it('is a no-op for creatures without regeneration', () => {
    const orc = { name: 'Orc' } as Enemy;
    enemyHpAfterDamage(orc, 15, 10, { damageType: 'fire' });
    expect(orc.regen_blocked).toBeUndefined();
  });
});

// ─── The turn-start heal, through a real enemy turn ──────────────────────────

const TROLL_ID = 'entry_hall#0';

function trollSeed(enemy: Partial<Enemy> = {}): Seed {
  return {
    context_id: ctx.id,
    world_name: 'Regen Test',
    ship_name: 'Regen Test',
    intro: '',
    seed_id: 'regen',
    rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
    enemies: {
      ['entry_hall']: [
        {
          id: TROLL_ID,
          name: 'Troll',
          hp: 94,
          maxHp: 94,
          ac: 15,
          damage: '2d6+4',
          toHit: 7,
          xp: 1800,
          str: 18,
          dex: 13,
          con: 20,
          damageType: 'slashing',
          regeneration: 15,
          ...enemy,
        } as Enemy,
      ],
    },
    loot: {},
    npcs: {},
  };
}

function turnState(trollHp: number): GameState {
  const pc = makeChar({ id: 'pc-1', character_class: 'Fighter', level: 5, ac: 25, hp: 50 });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [{ ...pc, hp: 50, max_hp: 50 }],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: TROLL_ID, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    round: 1,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: 50,
        maxHp: 50,
        conditions: [],
        condition_durations: {},
      },
      {
        id: TROLL_ID,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: trollHp,
        maxHp: 94,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

const trollTurn = (state: GameState, seed: Seed) =>
  takeAction({ action: { type: 'end_turn' }, history: [], state, seed, context: ctx });

describe('Regeneration — the turn-start heal', () => {
  it('a wounded troll regains 15 HP at the start of its turn (capped at max)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await trollTurn(turnState(50), trollSeed());
    const troll = r.newState.entities?.find((e) => e.id === TROLL_ID);
    expect(troll?.hp).toBe(65);
    expect(r.narrative).toMatch(/regenerates 15 HP \(65\/94\)/);
    // Capped: 90 → 94, not 105.
    const r2 = await trollTurn(turnState(90), trollSeed());
    expect(r2.newState.entities?.find((e) => e.id === TROLL_ID)?.hp).toBe(94);
    expect(r2.narrative).toMatch(/regenerates 4 HP/);
  });

  it('an unhurt troll gets no heal note; a flagged troll skips one tick and clears', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const full = await trollTurn(turnState(94), trollSeed());
    expect(full.narrative).not.toMatch(/regenerates/);
    // Pre-flagged (the party burned it since its last turn): the tick is
    // skipped, the flag clears on the seed enemy.
    const seed = trollSeed({ regen_blocked: true });
    const r = await trollTurn(turnState(50), seed);
    expect(r.newState.entities?.find((e) => e.id === TROLL_ID)?.hp).toBe(50);
    expect(r.narrative).toMatch(/no regeneration this turn/);
    expect(seed.enemies['entry_hall'][0].regen_blocked).toBe(false);
  });

  it('a dead troll stays down — no regeneration from 0', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const st = turnState(0);
    st.enemies_killed = [TROLL_ID];
    const r = await trollTurn(st, trollSeed());
    expect(r.newState.entities?.find((e) => e.id === TROLL_ID)?.hp).toBe(0);
    expect(r.narrative).not.toMatch(/regenerates/);
  });
});
