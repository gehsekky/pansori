// Absorb Elements reaction-resolver tests. Constructs the
// `pending_reaction: absorb_elements` directly and exercises the
// resolver branches (accept-with-slot halves, accept-no-slot
// commits full, decline commits full). Detection-in-multiattack
// integration is covered by the existing enemy-turn paths.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { GameState } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const buildPendingState = (opts: {
  proposedDamage: number;
  damageType: 'acid' | 'cold' | 'fire' | 'lightning' | 'thunder';
  charHp: number;
  slotsMax: Record<number, number>;
  slotsUsed: Record<number, number>;
}): GameState => {
  const wizard = makeChar({
    id: 'wiz-1',
    character_class: 'Wizard',
    level: 5,
    hp: opts.charHp,
    max_hp: 30,
    ac: 13,
    int: 16,
    spell_slots_max: opts.slotsMax,
    spell_slots_used: opts.slotsUsed,
    spells_known: ['absorb_elements'],
    prepared_spells: ['absorb_elements'],
  });
  const proposedChar = { ...wizard, hp: Math.max(0, wizard.hp - opts.proposedDamage) };
  return {
    ...makeState(),
    characters: [wizard],
    active_character_id: 'wiz-1',
    combat_active: true,
    initiative_order: [
      { id: 'wiz-1', roll: 18, is_enemy: false },
      { id: 'fire_elemental-1', roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'wiz-1',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: wizard.hp,
        maxHp: wizard.max_hp,
        conditions: [],
        condition_durations: {},
      },
      {
        id: 'fire_elemental-1',
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 60,
        maxHp: 60,
        conditions: [],
        condition_durations: {},
      },
    ],
    pending_reaction: {
      kind: 'absorb_elements',
      attackerEnemyId: 'fire_elemental-1',
      targetCharId: 'wiz-1',
      damageType: opts.damageType,
      proposedDamage: opts.proposedDamage,
      pendingFragment: {
        kind: 'enemy_attack_hit',
        attackerEnemyId: 'fire_elemental-1',
        attackerName: 'Fire Elemental',
        targetCharId: 'wiz-1',
        targetName: wizard.name,
        damage: opts.proposedDamage,
        damageType: opts.damageType,
        atkTotal: 17,
        targetAc: 13,
        prose: `The Fire Elemental scorches ${wizard.name} for ${opts.proposedDamage} ${opts.damageType} damage.`,
      },
      pendingProposedChar: proposedChar,
      pendingProposedSt: {
        characters: [proposedChar],
        entities: [
          {
            id: 'wiz-1',
            isEnemy: false,
            pos: { x: 4, y: 5 },
            hp: proposedChar.hp,
            maxHp: wizard.max_hp,
            conditions: [],
            condition_durations: {},
          },
          {
            id: 'fire_elemental-1',
            isEnemy: true,
            pos: { x: 5, y: 5 },
            hp: 60,
            maxHp: 60,
            conditions: [],
            condition_durations: {},
          },
        ],
        round: 1,
      } as unknown as GameState,
      resumeFromInitiativeIdx: 1,
      resumeFromMultiattackIdx: 1,
      narrativeSoFar: "[Fire Elemental's turn]",
      eligibleCharIds: ['wiz-1'],
    },
  };
};

const seed = {
  context_id: ctx.id,
  world_name: 'AE Test',
  ship_name: 'AE Test',
  intro: '',
  seed_id: 'ae-test',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: { [ctx.startRoomId]: [] },
  loot: {},
  npcs: {},
};

describe('Absorb Elements — accept with slot halves damage', () => {
  it('halves the trigger damage and consumes a level-1 slot', async () => {
    const state = buildPendingState({
      proposedDamage: 11,
      damageType: 'fire',
      charHp: 30,
      slotsMax: { 1: 2, 2: 1 },
      slotsUsed: {},
    });
    const result = await takeAction({
      action: { type: 'resolve_reaction', accept: true },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const wiz = result.newState.characters[0];
    // 11 damage → 5 halved (floor). Wiz HP 30 → 25.
    expect(wiz.hp).toBe(25);
    // Lowest slot consumed.
    expect(wiz.spell_slots_used?.[1]).toBe(1);
    expect(wiz.turn_actions.reaction_used).toBe(true);
    expect(result.narrative).toMatch(/absorbs the fire energy/);
    expect(result.narrative).toMatch(/Only 5 damage lands/);
  });

  it('falls back to full damage when no L1+ slot is available', async () => {
    const state = buildPendingState({
      proposedDamage: 8,
      damageType: 'cold',
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
    const wiz = result.newState.characters[0];
    expect(wiz.hp).toBe(22); // full 8 damage
    expect(result.narrative).toMatch(/No spell slot available/);
  });
});

describe('Absorb Elements — decline commits full damage', () => {
  it('takes the full proposed damage and consumes no slot', async () => {
    const state = buildPendingState({
      proposedDamage: 11,
      damageType: 'lightning',
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
    const wiz = result.newState.characters[0];
    expect(wiz.hp).toBe(19); // full 11 damage
    expect(wiz.spell_slots_used?.[1] ?? 0).toBe(0);
    expect(result.narrative).toMatch(/Absorb Elements declined/);
  });
});
