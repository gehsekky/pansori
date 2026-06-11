// Act I script rules — the per-action "when X, do Y" layer (RuleFacts: flags,
// enemies_killed, visited_rooms, room_id, …). Three jobs:
//
//  1. The store flip: when all five stockroom rats are dead, open Halda's shop
//     (set store_cleared + flip her to friendly so enter_shop works).
//  2. The 24-hour clock: time_blocks counts UP. Entering each MARSH room costs a
//     block (geography enforces scarcity); the two interrogations cost a block
//     each (on the dialogue check's success — see npcs.ts). Town hub rooms are
//     free. War fires at 6.
//  3. The branch: diplomacy (real evidence secured) → truce; else the clock
//     hits 6 → war. Both set silverford_outcome + act1_resolved; act1's
//     transitions (acts.ts) then carry the party to the matching ending.
//
// Rules read flags via {fact:'flags', path:'$.x'}; only flags / enemies_killed /
// visited_rooms are used (the fields the runtime RuleFacts actually carries).

import type { GameRule } from '../../types.js';

const flag = (key: string, value: boolean | string | number = true, operator = 'equal') => ({
  fact: 'flags',
  path: `$.${key}`,
  operator,
  value,
});
const visited = (roomId: string) => ({
  fact: 'visited_rooms',
  operator: 'contains',
  value: roomId,
});
// A once-per-marsh-room clock tick.
const clockTick = (roomId: string): GameRule => ({
  name: `clock_${roomId}`,
  once: true,
  conditions: { all: [visited(roomId)] },
  consequences: [{ type: 'adjust_flag', key: 'time_blocks', delta: 1 }],
});

export const RULES: GameRule[] = [
  // 1. Store flip — all three positional rats (store_room#0..#2) dead. Must
  // match the Giant Rat count in store_room (rooms.ts) exactly.
  {
    name: 'store_flip',
    once: true,
    conditions: {
      all: [
        { fact: 'enemies_killed', operator: 'contains', value: 'store_room#0' },
        { fact: 'enemies_killed', operator: 'contains', value: 'store_room#1' },
        { fact: 'enemies_killed', operator: 'contains', value: 'store_room#2' },
      ],
    },
    consequences: [
      { type: 'set_flag', key: 'store_cleared', value: true },
      { type: 'set_npc_attitude', npcId: 'npc_storekeeper', attitude: 'friendly' },
      {
        type: 'add_narrative',
        text: 'The last rat goes still. Halda lowers her broom — and her guard. "Right then. The shop’s yours."',
      },
    ],
  },

  // 2. The clock — one block per marsh leg (interrogations add their own).
  clockTick('thicket_approach'),
  clockTick('thicket_ashpit'),
  clockTick('tomb_mound'),
  clockTick('causeway'),
  clockTick('vane_command'),

  // 3a. Diplomacy — real evidence in hand (ash-pit truth + recovered shard +
  // third-party proof) AND a commander brought onside. Higher priority than war
  // so a success on the same action wins, and it sets act1_resolved (blocking war).
  {
    name: 'act1_diplomacy',
    once: true,
    priority: 20,
    conditions: {
      all: [
        flag('act1_resolved', true, 'notEqual'),
        flag('clue_burn'),
        flag('found_shard'),
        flag('clue_thirdparty'),
        { any: [flag('vargis_ally'), flag('vane_delay')] },
      ],
    },
    consequences: [
      { type: 'set_flag', key: 'act1_resolved', value: true },
      { type: 'set_flag', key: 'silverford_outcome', value: 'truce' },
      { type: 'set_faction_rep', factionId: 'malgovia', delta: 20 },
      { type: 'set_faction_rep', factionId: 'valerion', delta: 20 },
      {
        type: 'add_narrative',
        text:
          'You lay the evidence between the two commanders: the clean burn, the ' +
          'listening shard, the faceless sigil on a turned trooper. The horns do ' +
          'not sound. For one held breath, the armies stand down — and look, for ' +
          'the first time, in the same direction.',
      },
    ],
  },

  // 3b. War — the clock runs out before the case is closed. The failure-state
  // is consequence, not game-over: the story continues into a harsher world.
  {
    name: 'act1_war',
    once: true,
    priority: 10,
    conditions: {
      all: [
        flag('act1_resolved', true, 'notEqual'),
        flag('time_blocks', 6, 'greaterThanInclusive'),
      ],
    },
    consequences: [
      { type: 'set_flag', key: 'act1_resolved', value: true },
      { type: 'set_flag', key: 'silverford_outcome', value: 'war' },
      { type: 'set_flag', key: 'silverford_burned', value: true },
      { type: 'set_faction_rep', factionId: 'malgovia', delta: -10 },
      { type: 'set_faction_rep', factionId: 'valerion', delta: -10 },
      {
        type: 'add_narrative',
        text:
          'The horns sound first. Before you can lay the proof down, the Valerion ' +
          'heavy horse hits the Malgovian line at the edge of Silverford, and the ' +
          'Sunder-Carr drinks the blood of both. The truth you carry is still true ' +
          '— it is simply too late to stop the Battle of Silverford.',
      },
    ],
  },
];
