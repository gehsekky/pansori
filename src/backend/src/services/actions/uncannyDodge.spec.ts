// Uncanny Dodge resolution tests — covers accept (halve damage),
// decline (full damage), and reaction-slot consumption. The
// detection-in-multiattack-loop path is covered by integration via
// runEnemyTurns, but mocking that is heavyweight; the spec below
// constructs a `pending_reaction: uncanny_dodge` directly and
// resolves via `resolve_reaction` — mirroring how the Shield spec
// is structured (gameEngine.spec.ts).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { GameState } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const buildPendingState = (opts: {
  accept: boolean;
  proposedDamage: number;
  charHp: number;
}): GameState => {
  const rogue = makeChar({
    id: 'rogue-1',
    character_class: 'Rogue',
    level: 5,
    hp: opts.charHp,
    max_hp: 30,
    ac: 14,
  });
  const proposedChar = { ...rogue, hp: Math.max(0, rogue.hp - opts.proposedDamage) };
  return {
    ...makeState(),
    characters: [rogue],
    active_character_id: 'rogue-1',
    combat_active: true,
    initiative_order: [
      { id: 'rogue-1', roll: 18, is_enemy: false },
      { id: 'goblin-1', roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'rogue-1',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: rogue.hp,
        maxHp: rogue.max_hp,
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
      kind: 'uncanny_dodge',
      attackerEnemyId: 'goblin-1',
      targetCharId: 'rogue-1',
      atkTotal: 17,
      proposedDamage: opts.proposedDamage,
      pendingFragment: {
        kind: 'enemy_attack_hit',
        attackerEnemyId: 'goblin-1',
        attackerName: 'Goblin',
        targetCharId: 'rogue-1',
        targetName: rogue.name,
        damage: opts.proposedDamage,
        damageType: 'physical',
        atkTotal: 17,
        targetAc: 14,
        prose: `The Goblin strikes ${rogue.name} for ${opts.proposedDamage} damage.`,
      },
      pendingProposedChar: proposedChar,
      pendingProposedSt: {
        characters: [proposedChar],
        entities: [
          {
            id: 'rogue-1',
            isEnemy: false,
            pos: { x: 4, y: 5 },
            hp: proposedChar.hp,
            maxHp: rogue.max_hp,
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
      eligibleCharIds: ['rogue-1'],
    },
  };
};

describe('Uncanny Dodge — accept halves damage', () => {
  it('takes half damage (rounded down) and consumes the reaction', async () => {
    const state = buildPendingState({ accept: true, proposedDamage: 9, charHp: 30 });
    const result = await takeAction({
      action: { type: 'resolve_reaction', accept: true },
      history: [],
      state,
      seed: {
        context_id: ctx.id,
        world_name: 'Uncanny Test',
        ship_name: 'Uncanny Test',
        intro: '',
        seed_id: 'uncanny-test',
        rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
        enemies: { [ctx.startRoomId]: [] },
        loot: {},
        npcs: {},
      },
      context: ctx,
    });
    const rogueAfter = result.newState.characters[0];
    // 9 damage → 4 halved (floor). Rogue HP 30 → 26.
    expect(rogueAfter.hp).toBe(26);
    expect(rogueAfter.turn_actions.reaction_used).toBe(true);
    expect(result.narrative).toMatch(/Uncanny Dodge/);
    expect(result.narrative).toMatch(/saved 5/);
    expect(result.newState.pending_reaction).toBeUndefined();
  });
});

describe('Uncanny Dodge — decline takes full damage', () => {
  it('commits the full-damage proposed snapshot', async () => {
    const state = buildPendingState({ accept: false, proposedDamage: 9, charHp: 30 });
    const result = await takeAction({
      action: { type: 'resolve_reaction', accept: false },
      history: [],
      state,
      seed: {
        context_id: ctx.id,
        world_name: 'Uncanny Test',
        ship_name: 'Uncanny Test',
        intro: '',
        seed_id: 'uncanny-test',
        rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
        enemies: { [ctx.startRoomId]: [] },
        loot: {},
        npcs: {},
      },
      context: ctx,
    });
    const rogueAfter = result.newState.characters[0];
    // Full damage applies: 30 - 9 = 21.
    expect(rogueAfter.hp).toBe(21);
    expect(result.narrative).toMatch(/Uncanny Dodge declined/);
    expect(result.newState.pending_reaction).toBeUndefined();
  });
});

describe('Uncanny Dodge — generateChoices surfaces the reaction window', () => {
  it('offers only accept (halve) / decline while the window is open', () => {
    const state = buildPendingState({ accept: true, proposedDamage: 9, charHp: 30 });
    const seed = {
      context_id: ctx.id,
      world_name: 'Uncanny Test',
      ship_name: 'Uncanny Test',
      intro: '',
      seed_id: 'uncanny-choices',
      rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
      enemies: { [ctx.startRoomId]: [] },
      loot: {},
      npcs: {},
    } as unknown as Parameters<typeof generateChoices>[1];
    const choices = generateChoices(state, seed, ctx);
    // Exactly the two resolution choices — not the normal combat list (the bug
    // was that uncanny_dodge had no generateChoices branch, so it leaked the
    // normal choices and the player couldn't trigger the dodge).
    expect(choices).toHaveLength(2);
    expect(choices.every((c) => c.action.type === 'resolve_reaction')).toBe(true);
    expect(choices.some((c) => c.action.type === 'resolve_reaction' && c.action.accept)).toBe(true);
    expect(choices.some((c) => c.action.type === 'resolve_reaction' && !c.action.accept)).toBe(
      true
    );
    expect(choices[0].label).toMatch(/Uncanny Dodge/);
  });
});
