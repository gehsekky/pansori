// Lucky feat — save / ability-check / influence-check hooks.
// Companion to useLuck.spec.ts (which covers the attack-roll hook).
// Verifies that the `luck_pending` flag is consumed on the right
// d20 sites and grants advantage.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;

const seedWithStunningGoblin: Seed = {
  context_id: ctx.id,
  world_name: 'Luck Save Test',
  ship_name: 'Luck Save Test',
  intro: '',
  seed_id: 'luck-save-test',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      {
        id: enemyId,
        name: 'Stun Goblin',
        hp: 50,
        ac: 5,
        damage: '1d4',
        toHit: 20, // forces hit so onHitEffect resolves
        xp: 20,
        con: 14,
        // Force a save on every hit. High DC so a low d20 fails reliably.
        onHitEffect: { condition: 'stunned', ability: 'con', dc: 18 },
      },
    ],
  },
  loot: {},
  npcs: {},
};

describe('use_luck — onHitEffect save', () => {
  it('grants advantage on the save and clears luck_pending after the enemy hits', async () => {
    // Mock d20: enemy attack d20 → 10 (irrelevant; toHit 20 hits anything),
    // damage d4 → 1, save d20 #1 → 5 (would fail), save d20 #2 → 19 (would pass
    // with luck advantage taking the higher of two rolls).
    //
    // d() = Math.floor(Math.random() * 20) + 1
    // Enemy attack uses random, then damage, then save (with advantage = 2d20).
    // We over-mock to be safe; extras fall through to vitest defaults.
    mockRandom(0.5, 0.0, 0.2, 0.95, 0.5, 0.5, 0.5);
    const pc = makeChar({
      id: 'pc-1',
      con: 10,
      feats: ['lucky'],
      class_resource_uses: { feat_lucky_uses: 1 },
      turn_actions: {
        action_used: false,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
        luck_pending: true, // armed for the next d20
      },
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
      characters: [pc],
      active_character_id: 'pc-1',
      initiative_order: [
        { id: 'pc-1', roll: 5, is_enemy: false },
        { id: enemyId, roll: 18, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: 'pc-1',
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
          hp: 50,
          maxHp: 50,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    // End the PC's turn so the enemy attacks them.
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: seedWithStunningGoblin,
      context: ctx,
    });
    const pcAfter = result.newState.characters[0];
    expect(pcAfter.turn_actions.luck_pending).toBeFalsy();
    expect(result.narrative).toMatch(/Luck point spent on the save/i);
  });
});

const seedWithNpc: Seed = {
  context_id: ctx.id,
  world_name: 'Influence Luck Test',
  ship_name: 'Influence Luck Test',
  intro: '',
  seed_id: 'influence-luck',
  rooms: [
    { id: ctx.startRoomId, name: 'Start', desc: '' },
    { id: 'tavern', name: 'Tavern', desc: '' },
  ],
  connections: { [ctx.startRoomId]: ['tavern'], tavern: [ctx.startRoomId] },
  enemies: {},
  loot: {},
  npcs: {
    tavern: {
      id: 'barkeep',
      roomId: 'tavern',
      name: 'Stern Barkeep',
      attitude: 'indifferent',
      hp: 10,
      ac: 10,
      damage: '1d4',
      toHit: 2,
      xp: 25,
      greeting: '.',
      responses: [],
      persuasionDC: 12,
    },
  },
};

describe('use_luck — influence ability check', () => {
  it('grants advantage on the Influence d20 and clears luck_pending', async () => {
    // Without luck: d20 → 3, cha+prof would lose. With luck:
    // second d20 → 18, takes the higher.
    // d20#1 random=0.1 → 3; d20#2 random=0.9 → 19. Total: 19 + 3 + 3 = 25 > DC 15.
    mockRandom(0.1, 0.9);
    const bard = makeChar({
      id: 'bard-1',
      character_class: 'Bard',
      level: 5,
      cha: 16,
      skill_proficiencies: ['persuasion'],
      feats: ['lucky'],
      class_resource_uses: { feat_lucky_uses: 1 },
      turn_actions: {
        action_used: false,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
        luck_pending: true,
      },
    });
    const state = {
      ...makeState({ id: 'bard-1' }, { current_room: 'tavern', visited_rooms: ['tavern'] }),
      characters: [bard],
      active_character_id: 'bard-1',
    };
    const result = await takeAction({
      action: { type: 'influence', skill: 'persuasion', targetNpcRoomId: 'tavern' },
      history: [],
      state,
      seed: seedWithNpc,
      context: ctx,
    });
    expect(result.newState.characters[0].turn_actions.luck_pending).toBeFalsy();
    // Without luck the check would fail (3+3+3=9 < 15); with luck it succeeds.
    expect(result.narrative).toMatch(/success/i);
  });

  it('does NOT consume luck_pending when the flag is not set', async () => {
    mockRandom(0.1);
    const bard = makeChar({
      id: 'bard-1',
      character_class: 'Bard',
      cha: 16,
      skill_proficiencies: ['persuasion'],
      feats: ['lucky'],
      class_resource_uses: { feat_lucky_uses: 1 },
    });
    const state = {
      ...makeState({ id: 'bard-1' }, { current_room: 'tavern', visited_rooms: ['tavern'] }),
      characters: [bard],
      active_character_id: 'bard-1',
    };
    const result = await takeAction({
      action: { type: 'influence', skill: 'persuasion', targetNpcRoomId: 'tavern' },
      history: [],
      state,
      seed: seedWithNpc,
      context: ctx,
    });
    // Luck pool unchanged.
    expect(result.newState.characters[0].class_resource_uses?.feat_lucky_uses).toBe(1);
  });
});
