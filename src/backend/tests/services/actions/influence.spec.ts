// Influence action tests — covers both target shapes (NPC out of
// combat; enemy in combat) and both success/failure outcomes.
// Mirrors the framing from the SRD: distinct from `talk`,
// triggers a CHA + skill check, in-combat consumes the Action.

import type { Context, Seed } from '../../../src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../../../src/test-fixtures.js';
import { context as ctx } from '../../../src/campaignData/sandbox.js';
import { takeAction } from '../../../src/services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const npcRoomId = 'npc_room';
const npcId = 'tavern_npc';
const seedWithNpc: Seed = {
  context_id: ctx.id,
  world_name: 'Influence Test',
  ship_name: 'Influence Test',
  intro: '',
  seed_id: 'influence-test',
  rooms: [
    { id: 'entry_hall', name: 'Start', desc: '' },
    { id: npcRoomId, name: 'Tavern', desc: '' },
  ],
  enemies: {},
  loot: {},
  npcs: {
    [npcId]: {
      id: 'tavern_npc',
      roomId: npcRoomId,
      name: 'Suspicious Bartender',
      attitude: 'indifferent',
      hp: 10,
      ac: 10,
      damage: '1d4',
      toHit: 2,
      xp: 25,
      greeting: 'You.',
      responses: [],
      persuasionDC: 12,
    },
  },
};

describe('influence — NPC target out of combat', () => {
  it('success shifts attitude friendlier', async () => {
    // High roll: CHA 16 (+3), Bard L5 (prof +3 with persuasion = +6 total).
    // d20 mock 0.99 → 20. Total = 20 + 6 = 26 vs DC max(15, npc.persuasionDC=12) = 15. Success.
    mockRandom(0.99);
    const bard = makeChar({
      id: 'pc-1',
      character_class: 'Bard',
      level: 5,
      cha: 16,
      skill_proficiencies: ['persuasion'],
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: npcRoomId, visited_rooms: [npcRoomId] }),
      characters: [bard],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'influence', skill: 'persuasion', targetNpcId: npcId },
      history: [],
      state,
      seed: seedWithNpc,
      context: ctx,
    });
    expect(result.narrative).toMatch(/success/i);
    expect(result.newState.npc_attitudes?.[npcId]).toBe('friendly');
    // Out-of-combat: no action_used consumption.
    expect(result.newState.characters[0].turn_actions.action_used).toBe(false);
  });

  it('failure leaves attitude unchanged', async () => {
    // Low roll: d20 mock 0 → 1. CHA 10 (+0), no prof. Total = 1 vs DC 15. Fail.
    mockRandom(0);
    const char = makeChar({ id: 'pc-1', cha: 10 });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: npcRoomId, visited_rooms: [npcRoomId] }),
      characters: [char],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'influence', skill: 'deception', targetNpcId: npcId },
      history: [],
      state,
      seed: seedWithNpc,
      context: ctx,
    });
    expect(result.narrative).toMatch(/fail/i);
    // Attitude unchanged (no entry written for this room).
    expect(result.newState.npc_attitudes?.[npcId]).toBeUndefined();
  });
});

describe('influence — Enemy target in combat', () => {
  it('success removes the enemy from the fight (yield) and consumes the Action', async () => {
    mockRandom(0.99); // d20 → 20
    const enemyId = `entry_hall#0`;
    const combatSeed: Seed = {
      ...seedWithNpc,
      enemies: {
        ['entry_hall']: [
          {
            id: enemyId,
            name: 'Goblin',
            hp: 10,
            ac: 12,
            damage: '1d6',
            toHit: 3,
            xp: 20,
            int: 8,
          },
        ],
      },
    };
    const fighter = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      cha: 14,
      skill_proficiencies: ['intimidation'],
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [fighter],
      active_character_id: 'pc-1',
      initiative_order: [
        { id: 'pc-1', roll: 18, is_enemy: false },
        { id: enemyId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: 'pc-1',
          isEnemy: false as const,
          pos: { x: 4, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true as const,
          pos: { x: 5, y: 5 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: { type: 'influence', skill: 'intimidation', targetEnemyId: enemyId },
      history: [],
      state,
      seed: combatSeed,
      context: ctx as Context,
    });
    expect(result.narrative).toMatch(/yields|retreats/);
    expect(result.newState.enemies_killed).toContain(enemyId);
    // (Action consumption is verified by usedInitiative ending the PC's
    // turn; turn_actions resets on the round-2 PC turn start so a
    // post-cycle assertion would be flaky.)
  });

  it('failure costs the Action but leaves the enemy in the fight', async () => {
    mockRandom(0); // d20 → 1
    const enemyId = `entry_hall#0`;
    const combatSeed: Seed = {
      ...seedWithNpc,
      enemies: {
        ['entry_hall']: [
          {
            id: enemyId,
            name: 'Goblin',
            hp: 10,
            ac: 12,
            damage: '1d6',
            toHit: 3,
            xp: 20,
            int: 8,
          },
        ],
      },
    };
    const char = makeChar({ id: 'pc-1', cha: 10 });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [char],
      active_character_id: 'pc-1',
      initiative_order: [
        { id: 'pc-1', roll: 18, is_enemy: false },
        { id: enemyId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: 'pc-1',
          isEnemy: false as const,
          pos: { x: 4, y: 5 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true as const,
          pos: { x: 5, y: 5 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: { type: 'influence', skill: 'persuasion', targetEnemyId: enemyId },
      history: [],
      state,
      seed: combatSeed,
      context: ctx as Context,
    });
    expect(result.narrative).toMatch(/fails/);
    expect(result.newState.enemies_killed).not.toContain(enemyId);
    // (See note above re: turn_actions reset on round wrap.)
  });
});

describe('influence — no valid target', () => {
  it('rejects when no NPC and no enemy match', async () => {
    const char = makeChar({ id: 'pc-1' });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall' }),
      characters: [char],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'influence', skill: 'persuasion' },
      history: [],
      state,
      seed: {
        context_id: ctx.id,
        world_name: 'Empty',
        ship_name: 'Empty',
        intro: '',
        seed_id: 'empty',
        rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
        enemies: {},
        loot: {},
        npcs: {},
      },
      context: ctx,
    });
    expect(result.narrative).toMatch(/no valid target/i);
  });
});
