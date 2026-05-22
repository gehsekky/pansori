// Sentinel feat reaction tests. Constructs the
// `pending_reaction: sentinel` directly and exercises the resolver
// (accept-with-melee-hit, accept-melee-miss, decline). The
// detection path (party-wide eligibility in `runEnemyMultiattackLoop`)
// is covered by integration through enemy turns and isn't unit-tested
// here.

import type { GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import { context as ctx } from '../../contexts/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const goblinId = `${ctx.startRoomId}#0`;

const seedWithGoblin: Seed = {
  context_id: ctx.id,
  world_name: 'Sentinel Test',
  ship_name: 'Sentinel Test',
  intro: '',
  seed_id: 'sentinel-test',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      {
        id: goblinId,
        name: 'Goblin',
        hp: 20,
        ac: 12,
        damage: '1d6',
        toHit: 3,
        xp: 20,
      },
    ],
  },
  loot: {},
  npcs: {},
};

const buildSentinelState = (): GameState => {
  // Fighter L5 with Sentinel; targeted PC is a Wizard (the one
  // the goblin hit) who is adjacent to the fighter.
  const fighter = makeChar({
    id: 'fighter-1',
    name: 'Garm',
    character_class: 'Fighter',
    level: 5,
    str: 16,
    hp: 30,
    max_hp: 30,
    feats: ['sentinel'],
    inventory: [{ instance_id: 'sw-1', id: 'longsword', name: 'Longsword' }],
    equipped_weapon: 'sw-1',
    weapon_proficiencies: ['simple', 'martial'],
  });
  const wizard = makeChar({
    id: 'wiz-1',
    name: 'Nim',
    character_class: 'Wizard',
    level: 5,
    hp: 22,
    max_hp: 22,
  });
  return {
    ...makeState({ id: 'fighter-1' }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [fighter, wizard],
    active_character_id: 'fighter-1',
    initiative_order: [
      { id: 'fighter-1', roll: 18, is_enemy: false },
      { id: 'wiz-1', roll: 14, is_enemy: false },
      { id: goblinId, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'fighter-1',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: 'wiz-1',
        isEnemy: false,
        pos: { x: 5, y: 5 },
        hp: 22,
        maxHp: 22,
        conditions: [],
        condition_durations: {},
      },
      {
        id: goblinId,
        isEnemy: true,
        pos: { x: 6, y: 5 },
        hp: 20,
        maxHp: 20,
        conditions: [],
        condition_durations: {},
      },
    ],
    pending_reaction: {
      kind: 'sentinel',
      attackerEnemyId: goblinId,
      // Pansori reaction-validator convention: targetCharId is the
      // REACTOR, not the original attack target. Sentinel's reactor
      // is the fighter (the protector); the wizard was the hit ally.
      targetCharId: 'fighter-1',
      triggerAttackerEnemyId: goblinId,
      resumeFromInitiativeIdx: 2,
      resumeFromMultiattackIdx: 1,
      narrativeSoFar: "[Goblin's turn] hits Wizard.",
      eligibleCharIds: ['fighter-1'],
    },
  };
};

describe('Sentinel — accept reacts with a melee attack against the attacker', () => {
  it('hits the enemy on a high roll', async () => {
    // d20 → 20 → auto-hit.
    mockRandom(0.99);
    const state = buildSentinelState();
    const result = await takeAction({
      action: { type: 'resolve_reaction', accept: true },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).toMatch(/intercepts with Sentinel/);
    expect(result.narrative).toMatch(/hits.*Goblin/);
    // Goblin took damage.
    const goblinEnt = result.newState.entities?.find((e) => e.id === goblinId);
    expect(goblinEnt!.hp).toBeLessThan(20);
    // (turn_actions.reaction_used is set during the handler but resets
    //  on the round-2 PC turn start after the enemy turn resumes —
    //  same flakiness pattern as influence.spec.ts; verified by
    //  narrative + damage outcome instead.)
  });

  it('misses cleanly on a low roll', async () => {
    mockRandom(0); // d20 → 1 → miss
    const state = buildSentinelState();
    const result = await takeAction({
      action: { type: 'resolve_reaction', accept: true },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).toMatch(/swings with Sentinel|misses/);
    // Goblin took no damage.
    const goblinEnt = result.newState.entities?.find((e) => e.id === goblinId);
    expect(goblinEnt!.hp).toBe(20);
  });
});

describe('Sentinel — decline does nothing', () => {
  it('keeps the reaction available and applies no damage', async () => {
    const state = buildSentinelState();
    const result = await takeAction({
      action: { type: 'resolve_reaction', accept: false },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    const fighter = result.newState.characters.find((c) => c.id === 'fighter-1')!;
    expect(fighter.turn_actions.reaction_used).toBe(false);
    const goblinEnt = result.newState.entities?.find((e) => e.id === goblinId);
    expect(goblinEnt!.hp).toBe(20); // unchanged
  });
});
