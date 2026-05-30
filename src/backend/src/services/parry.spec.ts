// SRD Parry (Bandit Captain reaction) — when hit by a melee attack roll while
// holding a weapon, the captain adds 2 to its AC against that attack, possibly
// turning the hit into a miss. Modeled as an AI-spent, once-per-round reaction
// in resolveOneAttack: it fires only when the +2 would actually flip THIS hit
// to a miss (a Nat 20 can't be parried), consumes the entity's `reaction_used`,
// and refreshes on round wrap.
//
// PC: Fighter L1, STR 18 (+4), shortsword, proficient → attack bonus +6, so the
// attack total is d20 + 6. The Bandit Captain's AC is 15. With Math.random
// pinned: 0.4 → d20 9 → total 15 (a hit by 0, parryable: 15 < 15+2); 0.5 → d20
// 11 → total 17 (a hit by 2, NOT parryable: +2 AC wouldn't reach it).

import type { Enemy, GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';
import { SRD_MONSTERS } from '../contexts/srd/monsters.js';
import { context as ctx } from '../contexts/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const CAPTAIN_ID = `${ctx.startRoomId}#0`;

describe('Bandit Captain catalog — Parry', () => {
  it('the template carries the parry reaction flag', () => {
    expect(SRD_MONSTERS.bandit_captain.parry).toBe(true);
  });
});

function captainSeed(enemy: Partial<Enemy>): Seed {
  return {
    context_id: ctx.id,
    world_name: 'Parry Test',
    ship_name: 'Parry Test',
    intro: '',
    seed_id: 'parry',
    rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
    enemies: {
      [ctx.startRoomId]: [
        {
          id: CAPTAIN_ID,
          name: 'Bandit Captain',
          hp: 52,
          ac: 15,
          damage: '1d6+3',
          toHit: 5,
          xp: 450,
          str: 15,
          dex: 16,
          con: 14,
          ...enemy,
        } as Enemy,
      ],
    },
    loot: {},
    npcs: {},
  };
}

// A Fighter L1 (STR 18, low DEX so a finesse weapon still picks STR) adjacent to
// the captain. `reactionUsed` pre-stamps the captain's spent reaction.
function attackState(reactionUsed = false): GameState {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 1, // no Extra Attack — one clean swing
    str: 18, // +4
    dex: 10,
    hp: 30,
    max_hp: 30,
    inventory: [{ instance_id: 'ss-1', id: 'shortsword', name: 'Shortsword' }],
    equipped_weapon: 'ss-1',
    weapon_proficiencies: ['simple', 'martial'],
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [pc],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: CAPTAIN_ID, roll: 5, is_enemy: true },
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
        id: CAPTAIN_ID,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 52,
        maxHp: 52,
        conditions: [],
        condition_durations: {},
        reaction_used: reactionUsed,
      },
    ],
  } as unknown as GameState;
}

async function swing(seed: Seed, state: GameState) {
  return takeAction({
    action: { type: 'attack', targetEnemyId: CAPTAIN_ID },
    history: [],
    state,
    seed,
    context: ctx,
  });
}

describe('Parry — wired into the weapon-attack path', () => {
  it('deflects a hit that lands within 2 of AC (turns it into a miss)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4); // d20 9 → total 15 vs AC 15: a hit by 0
    const r = await swing(captainSeed({ parry: true }), attackState());
    const cap = r.newState.entities?.find((e) => e.id === CAPTAIN_ID);
    expect(cap?.hp).toBe(52); // no damage — the blow was parried
    expect(cap?.reaction_used).toBe(true); // the reaction was spent
    expect(r.newState.enemies_killed).not.toContain(CAPTAIN_ID);
    expect(r.narrative).toMatch(/Parry/);
  });

  it('does NOT parry a hit that beats AC by 2+ (the +2 could not save it)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 11 → total 17 vs AC 15: a hit by 2
    const r = await swing(captainSeed({ parry: true }), attackState());
    const cap = r.newState.entities?.find((e) => e.id === CAPTAIN_ID);
    expect(cap?.hp).toBeLessThan(52); // the blow landed
    expect(cap?.reaction_used).toBeFalsy(); // reaction saved for a hit it can stop
    expect(r.narrative).not.toMatch(/Parry/);
  });

  it('cannot parry when the reaction is already spent this round', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4); // would be parryable if available
    const r = await swing(captainSeed({ parry: true }), attackState(true));
    const cap = r.newState.entities?.find((e) => e.id === CAPTAIN_ID);
    expect(cap?.hp).toBeLessThan(52); // the parryable hit lands — no reaction left
    expect(r.narrative).not.toMatch(/Parry/);
  });

  it('is a no-op for a creature without the parry flag (identical hit lands)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4); // total 15 vs AC 15 — a hit
    const r = await swing(captainSeed({}), attackState());
    const cap = r.newState.entities?.find((e) => e.id === CAPTAIN_ID);
    expect(cap?.hp).toBeLessThan(52);
    expect(r.narrative).not.toMatch(/Parry/);
  });

  it('refreshes the spent reaction on round wrap', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // settle the captain's intervening attack
    // Captain enters with its reaction already spent; the PC ends its turn, the
    // captain acts, and the round wraps back to the PC — clearing reaction_used.
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: attackState(true),
      seed: captainSeed({ parry: true }),
      context: ctx,
    });
    const cap = r.newState.entities?.find((e) => e.id === CAPTAIN_ID);
    expect(r.newState.round).toBe(2); // a full round elapsed
    expect(cap?.reaction_used).toBe(false); // reaction refreshed for the new round
  });

  it('uses the creature parryBonus — a Gladiator (+3) deflects a hit a +2 could not', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.55); // d20 12 + 6 = 18 vs AC 16: a hit by 2
    // +2 would leave AC 18 (18 still hits); the Gladiator's +3 → AC 19, a miss.
    const gladiator = captainSeed({ name: 'Gladiator', ac: 16, parry: true, parryBonus: 3 });
    const r = await swing(gladiator, attackState());
    const g = r.newState.entities?.find((e) => e.id === CAPTAIN_ID);
    expect(g?.hp).toBe(52); // unchanged — deflected by the +3 AC
    expect(g?.reaction_used).toBe(true);
    expect(r.narrative).toMatch(/Parry/);
    expect(r.narrative).toMatch(/\+3 AC/);
  });
});
