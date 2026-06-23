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
//   jarek_ambush_cleared      — bool; the ballroom ambush is resolved — the two
//                               named Subverted troopers (roomsAct2
//                               valerion_ball_room#trooper1/2) are down (Plan
//                               04-02, D-08). Set by jarek_ambush_clear below.
//                               This rule marks the ambush resolved ONLY; it does
//                               NOT touch jarek_stance (no authored hostility on
//                               the quest-giver — the stance is set in dialogue).
//   quentin_exposed           — bool; the Quentin "Old Money" exposé closes — the
//                               Weaver Magus lieutenant in the Vance-estate cellar
//                               (roomsAct2 vance_cellar_room#lieutenant) is down
//                               and the master ledger is secured, proving Quentin's
//                               Sect funding (Plan 04-03, D-10). Set by
//                               quentin_lieutenant_down below, keyed on the named
//                               lieutenant kill. NOT set in dialogue — the evidence
//                               gauntlet (quentin_evidence_* in npcsAct2.ts) gathers
//                               proof, but the lieutenant kill is the payoff that
//                               writes quentin_exposed. q_quentin_thread's final
//                               step keys on it; the Phase-5 ending branches on it.

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

  // ── Ambush clear: the Jarek ballroom ambush (Plan 04-02, D-08) ──────────────
  // The two named Subverted troopers Jarek loosed at the ball are down. Keyed on
  // their count-1 named ids (roomsAct2 valerion_ball_room#trooper1/2). Sets
  // jarek_ambush_cleared=true + a narrative beat. This rule marks the ambush
  // RESOLVED only — it does NOT write jarek_stance (the stance is decided in
  // dialogue; no authored hostility-on-the-quest-giver). once:true.
  {
    name: 'jarek_ambush_clear',
    once: true,
    conditions: {
      all: [killed('valerion_ball_room#trooper1'), killed('valerion_ball_room#trooper2')],
    },
    consequences: [
      { type: 'set_flag', key: 'jarek_ambush_cleared', value: true },
      {
        type: 'add_narrative',
        text:
          'The last of Jarek’s Subverted folds across an overturned banquet table, and ' +
          'the ballroom is suddenly, ringingly quiet but for the swing of a cracked ' +
          'chandelier. The inquisitor himself is gone — slipped out under the cover of ' +
          'his own ambush. You have his measure now, and his enmity.',
      },
    ],
  },

  // ── Exposé clear: the Vance-cellar lieutenant (Plan 04-03, D-10) ────────────
  // Quentin's Weaver Magus LIEUTENANT, guarding the master ledger in the
  // Vance-estate counting-house, is down. Keyed on its count-1 named id (roomsAct2
  // vance_cellar_room#lieutenant). Sets quentin_exposed=true + a narrative beat
  // (the ledger secured, the Sect funding proven) → q_quentin_thread's final step
  // closes. once:true. The evidence gauntlet (npcsAct2 quentin_evidence_*) gathers
  // the trail, but THIS kill is the payoff that writes the exposed flag.
  {
    name: 'quentin_lieutenant_down',
    once: true,
    conditions: {
      all: [killed('vance_cellar_room#lieutenant')],
    },
    consequences: [
      { type: 'set_flag', key: 'quentin_exposed', value: true },
      {
        type: 'add_narrative',
        text:
          'The Weaver lieutenant crumples across the strongroom table, and the master ' +
          'ledger lies open beneath its outflung hand — every diverted consignment, ' +
          'every Sect payment, signed in Quentin Vance’s own measured hand. The proof ' +
          'is yours now. Old money has a paper trail after all, and you are holding it.',
      },
    ],
  },
];
