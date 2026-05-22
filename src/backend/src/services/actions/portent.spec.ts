// Diviner Portent (2024 PHB) — first user of the generic
// `d20_interception` reaction window. Tests construct the
// pending_reaction directly (mirroring the silveryBarbs.spec
// pattern) and exercise the accept-converts-to-miss / accept-still-
// hits / decline / eligibility branches.

import type { GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Portent Test',
  ship_name: 'Portent Test',
  intro: '',
  seed_id: 'portent',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      { id: 'goblin-1', name: 'Goblin', hp: 10, ac: 12, damage: '1d6', toHit: 4, xp: 10 },
    ],
  },
  loot: {},
  npcs: {},
};

const buildPendingState = (opts: {
  proposedD20: number;
  atkTotal: number;
  targetAc: number;
  proposedDamage: number;
  charHp: number;
  portentDice: number[];
}): { state: GameState; charId: string } => {
  const div = makeChar({
    id: 'div-1',
    character_class: 'Wizard',
    subclass: 'diviner',
    level: 5,
    hp: opts.charHp,
    max_hp: 30,
    ac: opts.targetAc,
    int: 16,
    portent_dice: [...opts.portentDice],
  });
  const proposedChar = { ...div, hp: Math.max(0, div.hp - opts.proposedDamage) };
  return {
    state: {
      ...makeState({ id: div.id }, { current_room: ctx.startRoomId, combat_active: true }),
      characters: [div],
      active_character_id: 'div-1',
      initiative_order: [
        { id: 'div-1', roll: 18, is_enemy: false },
        { id: 'goblin-1', roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: 'div-1',
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: div.hp,
          maxHp: div.max_hp,
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
        kind: 'd20_interception',
        source: 'portent',
        attackerEnemyId: 'goblin-1',
        targetCharId: 'div-1',
        atkTotal: opts.atkTotal,
        proposedD20: opts.proposedD20,
        proposedDamage: opts.proposedDamage,
        targetAc: opts.targetAc,
        replacementValues: [...opts.portentDice],
        pendingFragment: {
          kind: 'enemy_attack_hit',
          attackerEnemyId: 'goblin-1',
          attackerName: 'Goblin',
          targetCharId: 'div-1',
          targetName: div.name,
          damage: opts.proposedDamage,
          damageType: 'physical',
          atkTotal: opts.atkTotal,
          targetAc: opts.targetAc,
          prose: `The Goblin strikes ${div.name} for ${opts.proposedDamage} damage.`,
        },
        pendingProposedChar: proposedChar,
        pendingProposedSt: {
          characters: [proposedChar],
          entities: [
            {
              id: 'div-1',
              isEnemy: false,
              pos: { x: 4, y: 5 },
              hp: proposedChar.hp,
              maxHp: div.max_hp,
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
        },
        resumeFromInitiativeIdx: 1,
        resumeFromMultiattackIdx: 1,
        narrativeSoFar: '',
        eligibleCharIds: ['div-1'],
      },
    } as unknown as GameState,
    charId: 'div-1',
  };
};

describe('Diviner Portent — d20 interception', () => {
  it('replacing low (3) turns a hit (total 15) into a miss vs AC 12', async () => {
    const { state } = buildPendingState({
      proposedD20: 11,
      atkTotal: 15, // 11 + 4 mod
      targetAc: 12,
      proposedDamage: 6,
      charHp: 22,
      portentDice: [3, 15],
    });
    const result = await takeAction({
      action: { type: 'resolve_reaction', accept: true, replacementIndex: 0 },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'div-1');
    expect(after?.hp).toBe(22); // damage discarded
    expect(after?.portent_dice).toEqual([15]); // 3 consumed
    expect(after?.turn_actions.reaction_used).toBe(true);
    expect(result.narrative).toMatch(/misses/);
  });

  it('replacing high (15) keeps the hit (total 19) standing', async () => {
    const { state } = buildPendingState({
      proposedD20: 11,
      atkTotal: 15,
      targetAc: 12,
      proposedDamage: 6,
      charHp: 22,
      portentDice: [3, 15],
    });
    const result = await takeAction({
      action: { type: 'resolve_reaction', accept: true, replacementIndex: 1 },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'div-1');
    expect(after?.hp).toBe(16); // 22 - 6 damage committed
    expect(after?.portent_dice).toEqual([3]); // 15 consumed (high die)
    expect(after?.turn_actions.reaction_used).toBe(true);
    expect(result.narrative).toMatch(/still hits/);
  });

  it('omitting replacementIndex picks the lowest die automatically', async () => {
    const { state } = buildPendingState({
      proposedD20: 11,
      atkTotal: 15,
      targetAc: 12,
      proposedDamage: 6,
      charHp: 22,
      portentDice: [7, 3, 15], // lowest = 3 at index 1
    });
    const result = await takeAction({
      action: { type: 'resolve_reaction', accept: true },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'div-1');
    expect(after?.portent_dice).toEqual([7, 15]); // 3 popped
    expect(after?.hp).toBe(22); // miss, no damage
  });

  it('decline commits the proposed damage with no die spent', async () => {
    const { state } = buildPendingState({
      proposedD20: 11,
      atkTotal: 15,
      targetAc: 12,
      proposedDamage: 6,
      charHp: 22,
      portentDice: [3, 15],
    });
    const result = await takeAction({
      action: { type: 'resolve_reaction', accept: false },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'div-1');
    expect(after?.hp).toBe(16); // damage committed
    expect(after?.portent_dice).toEqual([3, 15]); // dice preserved
    expect(after?.turn_actions.reaction_used).toBe(false);
    expect(result.narrative).toMatch(/Portent declined/);
  });

  it('surfaces one accept choice per portent die plus a decline', () => {
    const { state } = buildPendingState({
      proposedD20: 11,
      atkTotal: 15,
      targetAc: 12,
      proposedDamage: 6,
      charHp: 22,
      portentDice: [3, 15],
    });
    const choices = generateChoices(state, seed, ctx);
    const accepts = choices.filter(
      (c) =>
        c.action.type === 'resolve_reaction' &&
        c.action.accept === true &&
        typeof c.action.replacementIndex === 'number'
    );
    expect(accepts.length).toBe(2);
    const declines = choices.filter(
      (c) => c.action.type === 'resolve_reaction' && c.action.accept === false
    );
    expect(declines.length).toBe(1);
  });

  it('out-of-bounds replacementIndex falls back to the lowest die', async () => {
    const { state } = buildPendingState({
      proposedD20: 11,
      atkTotal: 15,
      targetAc: 12,
      proposedDamage: 6,
      charHp: 22,
      portentDice: [3, 15],
    });
    const result = await takeAction({
      action: { type: 'resolve_reaction', accept: true, replacementIndex: 99 },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'div-1');
    // Out-of-bounds → server falls back to lowest (3, index 0).
    expect(after?.portent_dice).toEqual([15]);
  });
});
