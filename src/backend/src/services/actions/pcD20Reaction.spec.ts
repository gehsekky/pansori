// 2024 PHB PC-turn d20 reaction window. SRD Heroic Inspiration:
// "expend it to reroll any die immediately after rolling it, and you
// must use the new roll." Pansori MVP wires Inspiration for attack
// rolls only (saves + checks deferred), and only when the original
// attack MISSED — UX simplification, RAW allows reroll on any d20.
//
// Architecture: when a PC attacks + misses + has Inspiration (and
// hasn't pre-declared it via `spend_inspiration`), attack/index.ts
// stashes a PendingPcD20Reaction with:
//   - pre-attack snapshot (rewind on accept)
//   - proposed snapshot (commit on decline)
//   - AttackContext blob (re-resolve on accept)
// The resolver in reaction.ts re-runs resolveOneAttack with a forced
// new d20 on accept, or commits the proposed snapshot on decline.

import type { GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../../campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'PC d20 Reaction Test',
  ship_name: 'PC d20 Reaction Test',
  intro: '',
  seed_id: 'pc-d20-reaction',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: enemyId,
        name: 'Goblin',
        hp: 20,
        ac: 18, // high AC so low rolls miss
        damage: '1d6',
        toHit: 4,
        xp: 20,
      },
    ],
  },
  loot: {},
  npcs: {},
};

function buildState(pc: ReturnType<typeof makeChar>): GameState {
  return {
    ...makeState({ id: pc.id }, { current_room: 'entry_hall', combat_active: true }),
    characters: [pc],
    active_character_id: pc.id,
    initiative_order: [
      { id: pc.id, roll: 18, is_enemy: false },
      { id: enemyId, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: pc.id,
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: pc.hp,
        maxHp: pc.max_hp,
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

function makeFighter(opts: { inspiration?: boolean } = {}) {
  return makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 5,
    str: 14, // +2 mod
    inventory: [{ instance_id: 'gs-1', id: 'longsword', name: 'Longsword' }],
    equipped_weapon: 'gs-1',
    weapon_proficiencies: ['martial'],
    inspiration: opts.inspiration ?? false,
  });
}

describe('PC d20 reaction window — Heroic Inspiration', () => {
  it('pauses after a missed attack when PC has Inspiration', async () => {
    // d20 = 2 → 2 + 2 (STR) + 3 (prof) = 7 vs AC 18 → miss.
    vi.spyOn(Math, 'random').mockReturnValue(0.05); // → d20 = 2
    const pc = makeFighter({ inspiration: true });
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildState(pc),
      seed,
      context: ctx,
    });
    const pending = result.newState.pending_reaction;
    expect(pending).toBeDefined();
    expect(pending?.kind).toBe('pc_d20');
    if (pending?.kind === 'pc_d20') {
      expect(pending.source).toBe('inspiration');
      expect(pending.rollerCharId).toBe('pc-1');
      expect(pending.originalHit).toBe(false);
    }
  });

  it('does NOT pause when PC has no Inspiration', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05); // d20 = 2 → miss
    const pc = makeFighter({ inspiration: false });
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildState(pc),
      seed,
      context: ctx,
    });
    expect(result.newState.pending_reaction).toBeUndefined();
  });

  it('does NOT pause when the attack hits', async () => {
    // d20 = 19 → 19 + 2 + 3 = 24 vs AC 18 → hit.
    vi.spyOn(Math, 'random').mockReturnValue(0.95); // d20 = 20 → crit, hit
    const pc = makeFighter({ inspiration: true });
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildState(pc),
      seed,
      context: ctx,
    });
    expect(result.newState.pending_reaction).toBeUndefined();
  });

  it('surfaces accept/decline choices when pending_reaction is pc_d20', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05);
    const pc = makeFighter({ inspiration: true });
    const state = buildState(pc);
    // Manually set pending_reaction to skip the action setup.
    const pendingState: GameState = {
      ...state,
      pending_reaction: {
        kind: 'pc_d20',
        source: 'inspiration',
        rollerCharId: 'pc-1',
        rollContext: 'attack',
        originalD20: 2,
        originalTotal: 7,
        originalHit: false,
        eligibleCharIds: ['pc-1'],
        attackContext: {} as unknown,
        pendingProposedChar: pc,
        pendingProposedSt: state,
        resumeFromInitiativeIdx: 0,
      },
    };
    const choices = generateChoices(pendingState, seed, ctx);
    const acceptLabel = choices.find((c) => c.label.includes('Spend Heroic Inspiration'));
    const declineLabel = choices.find((c) => c.label.includes('Decline'));
    expect(acceptLabel).toBeDefined();
    expect(declineLabel).toBeDefined();
  });

  it('accept rerolls — if new d20 hits, damage applies + Inspiration consumed', async () => {
    // First action: d20 = 2 (miss), pauses. Second action (accept):
    // d20 = 20 (crit, hits). Force every Math.random to 0.99 — the
    // reroll path uses the first random call for the new d20, and
    // subsequent calls for damage. 0.99 keeps damage at max d-face.
    // For the first attack's d20, we override with 0.05 explicitly.
    let firstRoll = true;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      if (firstRoll) {
        firstRoll = false;
        return 0.05; // first attack d20 = 2 → miss
      }
      return 0.99; // reroll d20 = 20 + crit damage rolls at max
    });
    const pc = makeFighter({ inspiration: true });
    const result1 = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildState(pc),
      seed,
      context: ctx,
    });
    expect(result1.newState.pending_reaction?.kind).toBe('pc_d20');
    const result2 = await takeAction({
      action: { type: 'resolve_reaction', accept: true },
      history: [],
      state: result1.newState,
      seed,
      context: ctx,
    });
    // Reroll on a crit (d20 = 20) deals enough damage to kill the
    // goblin outright. Pansori's kill path removes the entity from
    // the list; check enemies_killed instead.
    expect(result2.newState.enemies_killed).toContain(enemyId);
    const afterPc = result2.newState.characters.find((c) => c.id === 'pc-1');
    expect(afterPc?.inspiration).toBe(false); // spent
    expect(result2.newState.pending_reaction).toBeUndefined();
  });

  it('accept rerolls — if new d20 still misses, no damage, Inspiration still consumed', async () => {
    // Sequence: d20 = 2 (miss → pause), d20 = 2 (still miss).
    const rolls = [0.05, 0.05];
    let i = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      const v = rolls[i] ?? 0.5;
      i++;
      return v;
    });
    const pc = makeFighter({ inspiration: true });
    const result1 = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildState(pc),
      seed,
      context: ctx,
    });
    const result2 = await takeAction({
      action: { type: 'resolve_reaction', accept: true },
      history: [],
      state: result1.newState,
      seed,
      context: ctx,
    });
    const enemyEnt = result2.newState.entities?.find((e) => e.id === enemyId);
    expect(enemyEnt?.hp).toBe(20); // unchanged
    const afterPc = result2.newState.characters.find((c) => c.id === 'pc-1');
    expect(afterPc?.inspiration).toBe(false); // spent regardless
  });

  it('decline commits the missed attack + Inspiration retained', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05);
    const pc = makeFighter({ inspiration: true });
    const result1 = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildState(pc),
      seed,
      context: ctx,
    });
    const result2 = await takeAction({
      action: { type: 'resolve_reaction', accept: false },
      history: [],
      state: result1.newState,
      seed,
      context: ctx,
    });
    const afterPc = result2.newState.characters.find((c) => c.id === 'pc-1');
    expect(afterPc?.inspiration).toBe(true); // retained
    const enemyEnt = result2.newState.entities?.find((e) => e.id === enemyId);
    expect(enemyEnt?.hp).toBe(20); // miss committed
    expect(result2.newState.pending_reaction).toBeUndefined();
  });
});
