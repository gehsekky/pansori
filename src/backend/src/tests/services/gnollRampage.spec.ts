// SRD Gnoll Rampage (1/Day) — "Immediately after dealing damage to a creature
// that is already Bloodied, the gnoll moves up to half its Speed, and it makes
// one Rend attack." Modeled in runEnemyMultiattackLoop: when a swing damages a
// target whose HP was ≤ half its max BEFORE the hit, the gnoll appends one extra
// attack, once per encounter (tracked on the entity as `rampage_used`).
//
// The Gnoll's base Multiattack is 1 Rend, so Rampage makes a Bloodied target
// take a SECOND Rend the same turn. Setup: PC AC 10 so the Gnoll (toHit +4)
// lands with a pinned d20; Rend 1d6+2 = 5 at Math.random 0.5.

import type { Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { SRD_MONSTERS } from '../../campaignData/srd/monsters.js';
import { context as ctx } from '../fixtures/testContext.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const GNOLL_ID = `entry_hall#0`;

describe('Gnoll catalog — Rampage', () => {
  it('the template carries the rampage flag', () => {
    expect(SRD_MONSTERS.gnoll.rampage).toBe(true);
  });
});

function gnollSeed(enemy: Partial<Enemy> = {}): Seed {
  return {
    context_id: ctx.id,
    world_name: 'Rampage Test',
    ship_name: 'Rampage Test',
    intro: '',
    seed_id: 'rampage',
    rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
    enemies: {
      ['entry_hall']: [
        {
          id: GNOLL_ID,
          name: 'Gnoll',
          hp: 27,
          ac: 15,
          damage: '1d6+2',
          toHit: 4,
          xp: 100,
          str: 14,
          dex: 12,
          con: 11,
          damageType: 'piercing',
          rampage: true,
          ...enemy,
        } as Enemy,
      ],
    },
    loot: {},
    npcs: {},
  };
}

// PC (AC 10 so the Gnoll reliably hits) adjacent to the Gnoll. `pcHp`/`pcMax`
// set the Bloodied state; `rampageUsed` pre-stamps the entity's spent 1/day use.
function turnState(pcHp: number, pcMax: number, rampageUsed = false): GameState {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 3,
    ac: 10,
    hp: pcHp,
    max_hp: pcMax,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [{ ...pc, hp: pcHp, max_hp: pcMax }],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: GNOLL_ID, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    round: 1,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: pcHp,
        maxHp: pcMax,
        conditions: [],
        condition_durations: {},
      },
      {
        id: GNOLL_ID,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 27,
        maxHp: 27,
        conditions: [],
        condition_durations: {},
        rampage_used: rampageUsed,
      },
    ],
  } as unknown as GameState;
}

async function gnollTurn(state: GameState, seed: Seed) {
  // PC ends its turn → the Gnoll acts → the round wraps.
  return takeAction({ action: { type: 'end_turn' }, history: [], state, seed, context: ctx });
}

describe('Gnoll Rampage — extra attack vs an already-Bloodied target', () => {
  it('makes a second Rend after damaging a target that was already Bloodied', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 11 + 4 = 15 hits AC 10; Rend 6
    // PC starts Bloodied (18 / 40, ≤ 20). 1st Rend → 12, 2nd (Rampage) Rend → 6.
    const r = await gnollTurn(turnState(18, 40), gnollSeed());
    const pc = r.newState.characters[0];
    const gnoll = r.newState.entities?.find((e) => e.id === GNOLL_ID);
    expect(r.narrative).toMatch(/Rampage/);
    expect(gnoll?.rampage_used).toBe(true);
    expect(pc.hp).toBe(6); // two Rends of 6 from 18
  });

  it('does NOT rampage when the target was not Bloodied before the hit', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // Full HP (40 / 40): the single Rend (→ 34) leaves it above half — no trigger.
    const r = await gnollTurn(turnState(40, 40), gnollSeed());
    const pc = r.newState.characters[0];
    const gnoll = r.newState.entities?.find((e) => e.id === GNOLL_ID);
    expect(r.narrative).not.toMatch(/Rampage/);
    expect(gnoll?.rampage_used).toBeFalsy();
    expect(pc.hp).toBe(34); // one Rend only
  });

  it('cannot rampage when the 1/day use is already spent', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await gnollTurn(turnState(18, 40, true), gnollSeed());
    const pc = r.newState.characters[0];
    expect(r.narrative).not.toMatch(/Rampage/);
    expect(pc.hp).toBe(12); // one Rend only — no bonus attack
  });

  it('is a no-op for a Gnoll without the rampage flag', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await gnollTurn(turnState(18, 40), gnollSeed({ rampage: false }));
    const pc = r.newState.characters[0];
    expect(r.narrative).not.toMatch(/Rampage/);
    expect(pc.hp).toBe(12); // one Rend only
  });
});
