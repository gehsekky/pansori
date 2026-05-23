// 2024 PHB Lucky feat — Disadvantage benefit. When an enemy attack
// hits a PC with the Lucky feat and remaining points, the engine
// surfaces a reaction window. Accept spends 1 luck point and re-
// rolls the enemy attack with Disadvantage (2 fresh d20s, take the
// lower). If the lower d20 drops the total below AC, the attack
// becomes a miss; otherwise the proposed hit stands. Decline
// commits the full-damage proposed snapshot.
//
// Pansori divergence from RAW: spend window is post-roll (player
// sees the hit first) where RAW is pre-roll. Documented in
// PendingLuckyDisadvReaction.

import type { GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Lucky Disadv Test',
  ship_name: 'Lucky Disadv Test',
  intro: '',
  seed_id: 'lucky-disadv',
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
        toHit: 8, // hits AC 14 on a d20 of 6+ — easy hit
        xp: 10,
      },
    ],
  },
  loot: {},
  npcs: {},
};

function buildState(pc: ReturnType<typeof makeChar>): GameState {
  return {
    ...makeState({ id: pc.id }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [pc],
    active_character_id: pc.id,
    initiative_order: [
      // Enemy goes first so it attacks the PC on enemy turn
      { id: enemyId, roll: 18, is_enemy: true },
      { id: pc.id, roll: 5, is_enemy: false },
    ],
    initiative_idx: 1, // PC just ended their turn, enemy is up next
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
}

function makeLuckyFighter(opts: { points?: number; luckPending?: boolean } = {}) {
  return makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 5,
    str: 14,
    ac: 14,
    feats: ['lucky'],
    class_resource_uses: { feat_lucky_uses: opts.points ?? 2 },
    turn_actions: opts.luckPending
      ? {
          action_used: false,
          bonus_action_used: false,
          reaction_used: false,
          free_interaction_used: false,
          luck_pending: true,
        }
      : undefined,
  });
}

describe('Lucky Disadvantage — pause + choice surfacing', () => {
  it('pauses when an enemy attack hits a Lucky PC with points remaining', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95); // d20 high → hit
    const pc = makeLuckyFighter({ points: 2 });
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: buildState(pc),
      seed,
      context: ctx,
    });
    expect(result.newState.pending_reaction?.kind).toBe('lucky_disadv');
  });

  it('does NOT pause when PC has no Lucky feat', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      ac: 14,
      // no feats: ['lucky']
    });
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: buildState(pc),
      seed,
      context: ctx,
    });
    // No pending_reaction = pansori applied the hit normally.
    expect(result.newState.pending_reaction?.kind).not.toBe('lucky_disadv');
  });

  it('does NOT pause when feat_lucky_uses is 0', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95);
    const pc = makeLuckyFighter({ points: 0 });
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: buildState(pc),
      seed,
      context: ctx,
    });
    expect(result.newState.pending_reaction?.kind).not.toBe('lucky_disadv');
  });

  it('does NOT pause when luck_pending is already armed (avoid double-spend)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95);
    const pc = makeLuckyFighter({ points: 1, luckPending: true });
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: buildState(pc),
      seed,
      context: ctx,
    });
    expect(result.newState.pending_reaction?.kind).not.toBe('lucky_disadv');
  });

  it('surfaces accept/decline choices when pending_reaction is lucky_disadv', () => {
    const pc = makeLuckyFighter({ points: 2 });
    const state = buildState(pc);
    const withPending: GameState = {
      ...state,
      active_character_id: pc.id,
      pending_reaction: {
        kind: 'lucky_disadv',
        attackerEnemyId: enemyId,
        targetCharId: pc.id,
        atkTotal: 20,
        proposedD20: 12,
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
    expect(choices.find((c) => c.label.includes('Spend 1 Luck Point'))).toBeDefined();
    expect(choices.find((c) => c.label.includes('Decline'))).toBeDefined();
  });
});

describe('Lucky Disadvantage — resolve via real flow', () => {
  it('decline: luck points retained (point not spent)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95); // big hit
    const pc = makeLuckyFighter({ points: 2 });
    const result1 = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: buildState(pc),
      seed,
      context: ctx,
    });
    expect(result1.newState.pending_reaction?.kind).toBe('lucky_disadv');
    const result2 = await takeAction({
      action: { type: 'resolve_reaction', accept: false },
      history: [],
      state: result1.newState,
      seed,
      context: ctx,
    });
    const after = result2.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.class_resource_uses?.feat_lucky_uses).toBe(2); // retained
    expect(result2.newState.pending_reaction).toBeUndefined();
  });

  it('accept: luck point spent (regardless of reroll outcome)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95);
    const pc = makeLuckyFighter({ points: 2 });
    const result1 = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: buildState(pc),
      seed,
      context: ctx,
    });
    expect(result1.newState.pending_reaction?.kind).toBe('lucky_disadv');
    const result2 = await takeAction({
      action: { type: 'resolve_reaction', accept: true },
      history: [],
      state: result1.newState,
      seed,
      context: ctx,
    });
    const after = result2.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.class_resource_uses?.feat_lucky_uses).toBe(1); // spent
    expect(result2.newState.pending_reaction).toBeUndefined();
  });
});
