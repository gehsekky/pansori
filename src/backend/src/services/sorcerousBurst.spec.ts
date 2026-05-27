// SRD Sorcerous Burst (Sorcerer cantrip) — exploding d8s capped at the
// caster's spellcasting modifier, plus the attack-roll cast path.
//
// d(8) = floor(random * 8) + 1, so Math.random() pinned to 0.95 → every d8 is
// an 8 (explodes); 0.4 → every d8 is a 4 (never explodes). A d20 at 0.4 is 9
// (a hit but not a crit); at 0.95 it is 20 (a crit, doubling the dice).

import type { Enemy, GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';
import { SRD_SPELLS } from '../contexts/srd/spells.js';
import { context as ctx } from '../contexts/sandbox.js';
import { rollSorcerousBurst } from './rulesEngine.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;

describe('rollSorcerousBurst — exploding d8s, capped by the modifier', () => {
  it('no 8s → just the sum of the base dice (no explosion)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4); // every d8 = 4
    expect(rollSorcerousBurst(2, 3)).toBe(8); // 2 × 4
  });

  it('every die explodes, but only up to the cap of added dice', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95); // every d8 = 8
    // 1 base die + at most 2 extra dice = 3 × 8.
    expect(rollSorcerousBurst(1, 2)).toBe(24);
  });

  it('a modifier of 0 means no extra dice even when 8s are rolled', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95);
    expect(rollSorcerousBurst(1, 0)).toBe(8); // base die only
  });

  it('the cap bounds total extras even when several base dice roll 8', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95);
    // 3 base 8s would each want an extra, but the cap is 1 → 4 × 8.
    expect(rollSorcerousBurst(3, 1)).toBe(32);
  });
});

describe('Sorcerous Burst — catalog', () => {
  it('is a Sorcerer attack-roll cantrip that scales by 1d8', () => {
    expect(SRD_SPELLS.sorcerous_burst).toMatchObject({
      level: 0,
      attackRoll: true,
      damage: '1d8',
      upcastBonus: '1d8',
    });
    expect(SRD_SPELLS.sorcerous_burst.spellList).toContain('arcane');
  });
});

// ── Cast path ─────────────────────────────────────────────────────────────────
function burstSeed(): Seed {
  return {
    context_id: ctx.id,
    world_name: 'Sorcerous Burst Test',
    ship_name: 'Sorcerous Burst Test',
    intro: '',
    seed_id: 'sb',
    rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
    connections: { [ctx.startRoomId]: [] },
    enemies: {
      [ctx.startRoomId]: [
        { id: enemyId, name: 'Ogre', hp: 300, ac: 5, damage: '1d6', toHit: 3, xp: 50 } as Enemy,
      ],
    },
    loot: {},
    npcs: {},
  };
}

function burstState(cha: number): GameState {
  const sorc = makeChar({
    id: 'pc-1',
    character_class: 'Sorcerer',
    level: 1,
    cha,
    hp: 24,
    max_hp: 24,
    spells_known: ['sorcerous_burst'],
    prepared_spells: ['sorcerous_burst'],
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [sorc],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: enemyId, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 1, y: 1 },
        hp: 24,
        maxHp: 24,
        conditions: [],
        condition_durations: {},
      },
      {
        id: enemyId,
        isEnemy: true,
        pos: { x: 2, y: 1 },
        hp: 300,
        maxHp: 300,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Sorcerous Burst — cast', () => {
  it('a hit with CHA mod 0 deals exactly one un-exploded d8 (no extras)', async () => {
    // d20 = 9 (a hit, not a crit) and every d8 = 4; CHA 10 → cap 0, so no
    // explosion: damage is a single 1d8 = 4.
    vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'sorcerous_burst',
        slotLevel: 0,
        targetEnemyId: enemyId,
      },
      history: [],
      state: burstState(10),
      seed: burstSeed(),
      context: ctx,
    });
    const hp = r.newState.entities?.find((e) => e.id === enemyId)?.hp ?? 300;
    expect(hp).toBe(296); // 300 − 4
  });

  it('a hit with a positive CHA mod lets 8s explode for extra damage', async () => {
    // Every roll is an 8: the d20 is a 20 (crit → 2 base dice) and the d8s all
    // explode, capped by CHA 18 (+4 added dice) → far more than a flat 2d8.
    vi.spyOn(Math, 'random').mockReturnValue(0.95);
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'sorcerous_burst',
        slotLevel: 0,
        targetEnemyId: enemyId,
      },
      history: [],
      state: burstState(18),
      seed: burstSeed(),
      context: ctx,
    });
    const hp = r.newState.entities?.find((e) => e.id === enemyId)?.hp ?? 300;
    // 2 base dice (crit) + up to 4 exploded extras, all 8s = 48.
    expect(hp).toBe(252);
  });
});
