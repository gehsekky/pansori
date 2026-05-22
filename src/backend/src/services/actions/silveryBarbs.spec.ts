// Silvery Barbs reaction-resolver tests. Constructs the
// `pending_reaction: silvery_barbs` directly and exercises both
// reroll outcomes (new d20 lower → potential miss, new d20 higher
// → hit stands) plus the no-slot fallback and decline path.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import type { GameState } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const buildPendingState = (opts: {
  proposedD20: number;
  atkTotal: number;
  targetAc: number;
  proposedDamage: number;
  charHp: number;
  slotsMax: Record<number, number>;
  slotsUsed: Record<number, number>;
}): GameState => {
  const sorc = makeChar({
    id: 'sorc-1',
    character_class: 'Sorcerer',
    level: 5,
    hp: opts.charHp,
    max_hp: 30,
    ac: opts.targetAc,
    cha: 16,
    spell_slots_max: opts.slotsMax,
    spell_slots_used: opts.slotsUsed,
    spells_known: ['silvery_barbs'],
  });
  const proposedChar = { ...sorc, hp: Math.max(0, sorc.hp - opts.proposedDamage) };
  return {
    ...makeState(),
    characters: [sorc],
    active_character_id: 'sorc-1',
    combat_active: true,
    initiative_order: [
      { id: 'sorc-1', roll: 18, is_enemy: false },
      { id: 'goblin-1', roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'sorc-1',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: sorc.hp,
        maxHp: sorc.max_hp,
        conditions: [],
        condition_durations: {},
      },
      {
        id: 'goblin-1',
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 10,
        maxHp: 10,
        conditions: [],
        condition_durations: {},
      },
    ],
    pending_reaction: {
      kind: 'silvery_barbs',
      attackerEnemyId: 'goblin-1',
      targetCharId: 'sorc-1',
      atkTotal: opts.atkTotal,
      proposedD20: opts.proposedD20,
      proposedDamage: opts.proposedDamage,
      targetAc: opts.targetAc,
      pendingFragment: {
        kind: 'enemy_attack_hit',
        attackerEnemyId: 'goblin-1',
        attackerName: 'Goblin',
        targetCharId: 'sorc-1',
        targetName: sorc.name,
        damage: opts.proposedDamage,
        damageType: 'physical',
        atkTotal: opts.atkTotal,
        targetAc: opts.targetAc,
        prose: `The Goblin strikes ${sorc.name} for ${opts.proposedDamage} damage.`,
      },
      pendingProposedChar: proposedChar,
      pendingProposedSt: {
        characters: [proposedChar],
        entities: [
          {
            id: 'sorc-1',
            isEnemy: false,
            pos: { x: 4, y: 5 },
            hp: proposedChar.hp,
            maxHp: sorc.max_hp,
            conditions: [],
            condition_durations: {},
          },
          {
            id: 'goblin-1',
            isEnemy: true,
            pos: { x: 5, y: 5 },
            hp: 10,
            maxHp: 10,
            conditions: [],
            condition_durations: {},
          },
        ],
        round: 1,
      } as unknown as GameState,
      resumeFromInitiativeIdx: 1,
      resumeFromMultiattackIdx: 1,
      narrativeSoFar: "[Goblin's turn]",
      eligibleCharIds: ['sorc-1'],
    },
  };
};

const seed = {
  context_id: ctx.id,
  world_name: 'SB Test',
  ship_name: 'SB Test',
  intro: '',
  seed_id: 'sb-test',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: { [ctx.startRoomId]: [] },
  loot: {},
  npcs: {},
};

describe('Silvery Barbs — accept with slot, new d20 lower causes miss', () => {
  it('rerolls the d20, takes lower, attack falls below AC → miss + no damage', async () => {
    // Original d20 = 14, mods = 3 (atkTotal 17), targetAc = 15.
    // Reroll: d20 → 1 (mockRandom(0)). min(14, 1) = 1. New total = 4 vs AC 15 → miss.
    mockRandom(0);
    const state = buildPendingState({
      proposedD20: 14,
      atkTotal: 17,
      targetAc: 15,
      proposedDamage: 8,
      charHp: 30,
      slotsMax: { 1: 2 },
      slotsUsed: {},
    });
    const result = await takeAction({
      action: { type: 'resolve_reaction', accept: true },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const sorc = result.newState.characters[0];
    // No damage — sorcerer stays at full HP.
    expect(sorc.hp).toBe(30);
    expect(sorc.spell_slots_used?.[1]).toBe(1);
    expect(sorc.turn_actions.reaction_used).toBe(true);
    expect(result.narrative).toMatch(/Silvery Barbs/);
    expect(result.narrative).toMatch(/the strike misses/);
  });
});

describe('Silvery Barbs — accept with slot, new d20 higher → hit stands', () => {
  it('consumes slot + reaction but the damage commits anyway', async () => {
    // Original d20 = 5, mods = 12 (atkTotal 17 vs AC 15 — just barely hits).
    // Reroll: d20 → 20 (mockRandom(0.99)). min(5, 20) = 5. New total = 17 vs AC 15 → still hits.
    mockRandom(0.99);
    const state = buildPendingState({
      proposedD20: 5,
      atkTotal: 17,
      targetAc: 15,
      proposedDamage: 8,
      charHp: 30,
      slotsMax: { 1: 2 },
      slotsUsed: {},
    });
    const result = await takeAction({
      action: { type: 'resolve_reaction', accept: true },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const sorc = result.newState.characters[0];
    // Damage applies — sorcerer takes the 8.
    expect(sorc.hp).toBe(22);
    // Slot + reaction still consumed (committed effort).
    expect(sorc.spell_slots_used?.[1]).toBe(1);
    expect(sorc.turn_actions.reaction_used).toBe(true);
    expect(result.narrative).toMatch(/still hits/);
  });
});

describe('Silvery Barbs — no slot available', () => {
  it('falls through to full damage when no L1+ slot', async () => {
    const state = buildPendingState({
      proposedD20: 14,
      atkTotal: 17,
      targetAc: 15,
      proposedDamage: 8,
      charHp: 30,
      slotsMax: { 1: 1 },
      slotsUsed: { 1: 1 }, // exhausted
    });
    const result = await takeAction({
      action: { type: 'resolve_reaction', accept: true },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const sorc = result.newState.characters[0];
    expect(sorc.hp).toBe(22); // full 8 damage
    expect(result.narrative).toMatch(/No spell slot available/);
  });
});

describe('Silvery Barbs — decline', () => {
  it('commits the full-damage snapshot with no slot consumed', async () => {
    const state = buildPendingState({
      proposedD20: 14,
      atkTotal: 17,
      targetAc: 15,
      proposedDamage: 8,
      charHp: 30,
      slotsMax: { 1: 2 },
      slotsUsed: {},
    });
    const result = await takeAction({
      action: { type: 'resolve_reaction', accept: false },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const sorc = result.newState.characters[0];
    expect(sorc.hp).toBe(22);
    expect(sorc.spell_slots_used?.[1] ?? 0).toBe(0);
    expect(result.narrative).toMatch(/Silvery Barbs declined/);
  });
});
