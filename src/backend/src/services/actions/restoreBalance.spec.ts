// 2024 PHB Clockwork Soul Sorcerer L3 — Restore Balance.
// Triggered when an enemy attack hits a PC AND the enemy rolled
// with Advantage AND a Clockwork Soul Sorcerer with remaining uses
// is in the party. Accept spends 1 use + the reactor's reaction
// and re-rolls the enemy d20 flat (no adv/disadv). If the flat d20
// falls below AC the attack becomes a miss. Decline commits the
// full-damage proposed snapshot.
//
// Pansori MVP scope: enemy-with-advantage attacks only (most useful
// case). RAW also allows cancelling disadvantage on any d20 within
// 60 ft — those other cases are deferred follow-ups.

import type { GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Restore Balance Test',
  ship_name: 'Restore Balance Test',
  intro: '',
  seed_id: 'restore-balance',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      {
        id: enemyId,
        name: 'Goblin',
        hp: 20,
        ac: 12,
        damage: '1d6',
        toHit: 8,
        xp: 10,
      },
    ],
  },
  loot: {},
  npcs: {},
};

// Build a state where the PC starts with the `prone` condition so
// the enemy attack against them rolls with advantage.
function buildAdvState(pc: ReturnType<typeof makeChar>): GameState {
  return {
    ...makeState({ id: pc.id }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [{ ...pc, conditions: [...(pc.conditions ?? []), 'prone'] }],
    active_character_id: pc.id,
    initiative_order: [
      { id: enemyId, roll: 18, is_enemy: true },
      { id: pc.id, roll: 5, is_enemy: false },
    ],
    initiative_idx: 1, // PC just ended turn, enemy is up next
    entities: [
      {
        id: pc.id,
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: 20,
        maxHp: 20,
        conditions: ['prone'],
        condition_durations: { prone: 1 },
      },
      {
        id: enemyId,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 20,
        maxHp: 20,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

function makeClockworkSorcerer(opts: { uses?: number } = {}) {
  return makeChar({
    id: 'pc-1',
    character_class: 'Sorcerer',
    subclass: 'clockwork_soul',
    level: 5,
    cha: 16,
    ac: 14,
    class_resource_uses: { restore_balance_uses: opts.uses ?? 3 },
  });
}

describe('Restore Balance — pause + choice surfacing', () => {
  it('pauses when an enemy attack with advantage hits a Clockwork Soul Sorcerer with uses', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95); // big hit
    const pc = makeClockworkSorcerer({ uses: 3 });
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: buildAdvState(pc),
      seed,
      context: ctx,
    });
    expect(result.newState.pending_reaction?.kind).toBe('restore_balance');
  });

  it('does NOT pause when reactor has no Restore Balance uses', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95);
    const pc = makeClockworkSorcerer({ uses: 0 });
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: buildAdvState(pc),
      seed,
      context: ctx,
    });
    expect(result.newState.pending_reaction?.kind).not.toBe('restore_balance');
  });

  it('does NOT pause for a non-Clockwork-Soul Sorcerer', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Sorcerer',
      subclass: 'draconic', // not Clockwork Soul
      level: 5,
      ac: 14,
    });
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: buildAdvState(pc),
      seed,
      context: ctx,
    });
    expect(result.newState.pending_reaction?.kind).not.toBe('restore_balance');
  });

  it('does NOT pause when the enemy attack does not have advantage', async () => {
    // No prone condition → enemy attacks without advantage.
    vi.spyOn(Math, 'random').mockReturnValue(0.95);
    const pc = makeClockworkSorcerer({ uses: 3 });
    const stateNoAdv: GameState = {
      ...buildAdvState(pc),
      characters: [pc], // no prone
      entities: [
        {
          id: pc.id,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: stateNoAdv,
      seed,
      context: ctx,
    });
    expect(result.newState.pending_reaction?.kind).not.toBe('restore_balance');
  });

  it('surfaces accept/decline choices when pending_reaction is restore_balance', () => {
    const pc = makeClockworkSorcerer({ uses: 3 });
    const state = buildAdvState(pc);
    const withPending: GameState = {
      ...state,
      active_character_id: pc.id,
      pending_reaction: {
        kind: 'restore_balance',
        attackerEnemyId: enemyId,
        targetCharId: pc.id,
        atkTotal: 22,
        proposedD20: 14,
        proposedDamage: 5,
        targetAc: 14,
        resumeFromInitiativeIdx: 0,
        resumeFromMultiattackIdx: 1,
        narrativeSoFar: '',
        eligibleCharIds: [pc.id],
        pendingFragment: { kind: 'enemy_attack_hit', prose: '' } as unknown,
        pendingProposedChar: pc as unknown,
        pendingProposedSt: state as unknown,
      },
    };
    const choices = generateChoices(withPending, seed, ctx);
    expect(choices.find((c) => c.label.includes('Restore Balance'))).toBeDefined();
    expect(choices.find((c) => c.label.includes('Decline'))).toBeDefined();
  });
});

describe('Restore Balance — resolve', () => {
  it('decline: uses retained, reaction not consumed', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95);
    const pc = makeClockworkSorcerer({ uses: 3 });
    const result1 = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: buildAdvState(pc),
      seed,
      context: ctx,
    });
    expect(result1.newState.pending_reaction?.kind).toBe('restore_balance');
    const result2 = await takeAction({
      action: { type: 'resolve_reaction', accept: false },
      history: [],
      state: result1.newState,
      seed,
      context: ctx,
    });
    const after = result2.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.class_resource_uses?.restore_balance_uses).toBe(3); // retained
    expect(after?.turn_actions?.reaction_used).toBeFalsy();
    expect(result2.newState.pending_reaction).toBeUndefined();
  });

  it('accept: spends 1 use + reaction', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95);
    const pc = makeClockworkSorcerer({ uses: 3 });
    const result1 = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: buildAdvState(pc),
      seed,
      context: ctx,
    });
    expect(result1.newState.pending_reaction?.kind).toBe('restore_balance');
    const result2 = await takeAction({
      action: { type: 'resolve_reaction', accept: true },
      history: [],
      state: result1.newState,
      seed,
      context: ctx,
    });
    const after = result2.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.class_resource_uses?.restore_balance_uses).toBe(2); // spent
    expect(after?.turn_actions?.reaction_used).toBe(true);
    expect(result2.newState.pending_reaction).toBeUndefined();
  });
});

describe('Restore Balance — resource lifecycle', () => {
  it('select_subclass(clockwork_soul) initializes restore_balance_uses to CHA mod (min 1)', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Sorcerer',
      level: 3,
      cha: 16, // +3 mod
    });
    const result = await takeAction({
      action: { type: 'select_subclass', subclass: 'clockwork_soul' },
      history: [],
      state: {
        ...makeState({ id: pc.id }, { current_room: ctx.startRoomId }),
        characters: [pc],
        active_character_id: pc.id,
      },
      seed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.subclass).toBe('clockwork_soul');
    expect(after?.class_resource_uses?.restore_balance_uses).toBe(3);
  });

  it('low-CHA caster: pool floors at 1', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Sorcerer',
      level: 3,
      cha: 8, // -1 mod
    });
    const result = await takeAction({
      action: { type: 'select_subclass', subclass: 'clockwork_soul' },
      history: [],
      state: {
        ...makeState({ id: pc.id }, { current_room: ctx.startRoomId }),
        characters: [pc],
        active_character_id: pc.id,
      },
      seed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.class_resource_uses?.restore_balance_uses).toBe(1);
  });
});
