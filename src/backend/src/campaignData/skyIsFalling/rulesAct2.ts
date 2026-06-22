// Act II script rules — the combat→flag wiring for the Weaver-cell raid
// (q_fuel_cell, MQ-03). Mirrors Act I's rules.ts `store_flip` idiom: a rule
// fires when the room's named enemy instances appear in `enemies_killed`, then
// sets the room-clear flag (+ a narrative beat). Three escalating rooms, three
// rules; the core rule writes the relic outcome.
//
// LOAD-BEARING SEED WIRING (RESEARCH Pitfall 2): this module MUST be concatenated
// into index.ts's `rules` section (`[...RULES, ...RULES_ACT2]`). Without it the
// rules never seed and EVERY raid clear silently no-ops — the quest can never
// close. The matching spec asserts the seeded section contains these names.
//
// NAMED-ID CONTRACT (RESEARCH Pitfall 1): every `enemies_killed contains` value
// is the EXPLICIT named id pinned on a count-1 placement in roomsAct2.ts
// (e.g. `library_undercroft_core#magus`), NEVER a positional `roomId#0/#1` id.
// The materializer (campaignContent.materializeRoomEnemies) uses a placement's
// `id` verbatim as the enemy id, so the strings here must match those ids
// exactly. A drift between the two is caught by the id-integrity spec.
//
// Flag vocabulary written by this module:
//   undercroft_approach_clear — bool; the approach room is cleared (q_fuel_cell
//                               step s_approach keys on it).
//   undercroft_inner_clear    — bool; the inner room is cleared (step s_inner).
//   relic_fuel_cell           — string 'party'; the core is cleared and the
//                               Heart of the Saint is the party's (D-01/D-05).
//                               `sect` is the read-as-NOT-'party' fallback the
//                               Phase-5 ending reads — there is NO authored
//                               'sect' write (D-02; verified in Task 4's spec).

import type { GameRule } from '../../types.js';

// Module-private flag helper, re-declared per the established convention (rules.ts
// keeps its own `flag()`; modules do not import each other's helpers).
const killed = (enemyId: string) => ({
  fact: 'enemies_killed',
  operator: 'contains',
  value: enemyId,
});

export const RULES_ACT2: GameRule[] = [
  // ── Raid clear: the approach gallery ───────────────────────────────────────
  // The Subverted Sentry vanguard at the stair-foot is down. Keyed on the two
  // named approach sentries (roomsAct2 library_undercroft_approach#sentry1/2).
  {
    name: 'fuel_cell_approach_clear',
    once: true,
    conditions: {
      all: [
        killed('library_undercroft_approach#sentry1'),
        killed('library_undercroft_approach#sentry2'),
      ],
    },
    consequences: [
      { type: 'set_flag', key: 'undercroft_approach_clear', value: true },
      {
        type: 'add_narrative',
        text:
          'The last sentry folds against a broken pillar and goes still. The ' +
          'stair-foot is yours — and the hum from deeper in the dark has not ' +
          'paused for a moment.',
      },
    ],
  },

  // ── Raid clear: the reliquary catacombs ────────────────────────────────────
  // The Subverted Vanguard line and its attending Adept are down. Keyed on the
  // named inner enemies (roomsAct2 library_undercroft_inner#vanguard1/2/#adept).
  {
    name: 'fuel_cell_inner_clear',
    once: true,
    conditions: {
      all: [
        killed('library_undercroft_inner#vanguard1'),
        killed('library_undercroft_inner#vanguard2'),
        killed('library_undercroft_inner#adept'),
      ],
    },
    consequences: [
      { type: 'set_flag', key: 'undercroft_inner_clear', value: true },
      {
        type: 'add_narrative',
        text:
          'The catacomb falls quiet but for the cabling’s hiss. Past the sealed ' +
          'inner door, the cold blue glow of the cradle waits — and so does ' +
          'whatever the cell left to guard it.',
      },
    ],
  },

  // ── Raid clear: the cell core — the relic is the party's (D-01/D-05) ────────
  // The climactic stand: exactly one Weaver Magus + two Weaver Adepts. Keyed on
  // their named ids (roomsAct2 library_undercroft_core#magus/#adept1/#adept2).
  // Writes relic_fuel_cell = STRING 'party' — the success outcome of the race.
  {
    name: 'fuel_cell_core_clear',
    once: true,
    conditions: {
      all: [
        killed('library_undercroft_core#magus'),
        killed('library_undercroft_core#adept1'),
        killed('library_undercroft_core#adept2'),
      ],
    },
    consequences: [
      { type: 'set_flag', key: 'relic_fuel_cell', value: 'party' },
      {
        type: 'add_narrative',
        text: 'The cradle goes dark. The Heart of the Saint is yours.',
      },
    ],
  },
];
