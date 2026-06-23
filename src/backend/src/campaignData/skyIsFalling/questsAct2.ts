// Act II quests. The court-arrival opener (q_act2_open, "The Faded Crest") is
// startActive — the party carries into Act II already holding the thread, the
// same way q_case_107 opens Act I. Its single step closes the moment the party
// meets Quentin Vance in the Valerion court (met_quentin), turning the arrival
// friction beat into the act's first completed objective.
//
// Step conditions read CampaignFacts: flags via {fact:'flags', path:'$.x'},
// inventory via {fact:'party_items', operator:'contains'} (none needed here).
//
// Flag vocabulary read by this module (set in npcsAct2.ts):
//   met_quentin    — the party has spoken with Quentin Vance at court (set on
//                    his opening response; D-09). Closes q_act2_open.
//   library_access — Lady Elara has granted restricted archive access (set on
//                    her grant line, gated on met_quentin; D-11). The
//                    gaining-access step of q_library keys on it.
//   coords_decoded — the "Mythic Geometry" decode is solved (set on Elara's
//                    final decode beat, both the martha_hint and neutral paths;
//                    D-04/D-05). The closing step of q_library keys on it.
//   undercroft_approach_clear — bool; the raid's approach gallery is cleared
//                    (set by RULES_ACT2 fuel_cell_approach_clear). q_fuel_cell
//                    step s_approach keys on it.
//   undercroft_inner_clear — bool; the reliquary catacombs are cleared (set by
//                    RULES_ACT2 fuel_cell_inner_clear). step s_inner keys on it.
//   relic_fuel_cell — string 'party'; the cell core is cleared and the Heart of
//                    the Saint is the party's (set by RULES_ACT2
//                    fuel_cell_core_clear; D-01/D-05). q_fuel_cell's closing step
//                    keys on it. SECT CONTRACT (D-02/A4): there is NO authored
//                    'sect' write — the engine surfaces a game-over on TPK/retreat
//                    rather than writing 'sect'. The Phase-5 ending reads
//                    `sect` = "relic_fuel_cell is NOT 'party'" (read-as-absence).
//   jarek_stance   — string ('allied' | 'wary' | 'hostile'); the outcome of the
//                    Jarek ball negotiation (set in JAREK's tree, npcsAct2.ts;
//                    D-07). q_jarek's stance step keys on it being set to ANY of
//                    the three values (an `any`-of-values condition) — the quest
//                    closes the moment the negotiation resolves, whichever way.
//                    The quest is NOT startActive: jarek_stance being set is also
//                    the auto-accept trigger (D-09 — encountering Jarek IS the
//                    activation; the negotiation is the encounter).
//   jarek_ambush_cleared — bool; the ballroom ambush is resolved (set by
//                    RULES_ACT2 jarek_ambush_clear when the two named ball
//                    troopers are down; D-08). q_jarek's ambush step keys on it
//                    — but ONLY the hostile path ever raises the ambush, so this
//                    step is gated so a peaceful (allied/wary) outcome still
//                    closes the quest (see q_jarek below).

import type { Quest } from '../../types.js';

const flag = (key: string, value: boolean | string | number = true) => ({
  fact: 'flags',
  path: `$.${key}`,
  operator: 'equal',
  value,
});

export const QUESTS_ACT2: Quest[] = [
  // ── The Act II opener — court arrival ───────────────────────────────────────
  {
    id: 'q_act2_open',
    title: 'The Faded Crest',
    desc:
      'The Gavel’s circuit has carried you into the Valerion heartland, where a ' +
      'faded letter of marque and a colder welcome await. Present yourselves at ' +
      'the royal court and take the measure of the house that summoned you — ' +
      'before its politics take the measure of you.',
    actId: 'act2',
    // Reused id for continuity (RESEARCH A4 — cosmetic): Lucian Vane returns as
    // the court's voice. No npc-side wiring depends on the giver id here.
    giverNpcId: 'npc_vane',
    // startActive: the engine seeds this quest as `active` at Act II entry, the
    // same mechanism as Act I's q_case_107 — NO acts.ts edit is required (D-10).
    startActive: true,
    steps: [
      {
        id: 's_met_quentin',
        desc: 'Cross the court floor and exchange words with Quentin Vance.',
        condition: flag('met_quentin'),
      },
    ],
    rewards: [
      { type: 'give_xp', amount: 400 },
      {
        type: 'add_narrative',
        text:
          'The court has shown you its face — gracious, brittle, and watching. ' +
          'Whatever the Vance name is guarding, you have just stepped inside its walls.',
      },
    ],
  },
  // ── The Library decode — "Mythic Geometry" ──────────────────────────────────
  // NOT startActive: Lady Elara's grant line fires `start_quest q_library` once
  // the party has met Quentin (library_access gate; D-11). The gaining-access
  // step keys on `library_access`; the closing step keys on `coords_decoded`,
  // set on Elara's final decode beat (both the martha_hint callback path and the
  // neutral path; D-04/D-05). Every step flag has a setting site in ELARA's tree
  // (npcsAct2.ts) — the flag-linkage contract (Pitfall 3).
  {
    id: 'q_library',
    title: 'Mythic Geometry',
    desc:
      'Lady Elara Aurellion has opened the restricted stacks of the Grand Library. ' +
      'The star-metal does not carry a map — it carries a projection, the sky folded ' +
      'down onto a plane, written in a geometry only the heartland’s deepest archive ' +
      'can read. Work the folds with Elara, layer by layer, until the cold frequency ' +
      'resolves into a place — the coordinates the Gavel sent you to find.',
    actId: 'act2',
    giverNpcId: 'npc_elara',
    // No startActive — Elara's dialogue activates it (D-11).
    steps: [
      {
        id: 's_access',
        desc: 'Win Lady Elara’s leave to bring the riddle into the restricted stacks.',
        condition: flag('library_access'),
      },
      {
        id: 's_decode',
        desc: 'Fold the star-metal’s geometry flat with Elara until the coordinates resolve.',
        condition: flag('coords_decoded'),
      },
    ],
    rewards: [
      { type: 'give_xp', amount: 600 },
      {
        type: 'add_narrative',
        text:
          'The coordinates hold steady on the vellum, plain at last — a place the sky ' +
          'has been naming all along. Whatever waits there, you finally know where to ' +
          'point the Gavel’s long road next.',
      },
    ],
  },
  // ── The fuel-cell raid — "The Heart of the Saint" (MQ-03) ───────────────────
  // NOT startActive: Elara hands it off once the decode resolves — her tree fires
  // `start_quest q_fuel_cell` gated on coords_decoded (D-03), revealing that the
  // coordinates point DOWN, into the undercroft beneath her own library. The three
  // steps track the raid room-by-room; the flags they key on are written by
  // RULES_ACT2 (combat→flag, the store_flip idiom), NOT by dialogue (D-05/D-06).
  // The closing step keys on relic_fuel_cell='party' — the core-clear outcome.
  {
    id: 'q_fuel_cell',
    title: 'The Heart of the Saint',
    desc:
      'The coordinates point down — into a hidden undercroft beneath the Grand ' +
      'Library, where a Weaver cell is wringing the star-metal’s fuel-cell open. ' +
      'Descend through the catacombs, fight the cell room by room, and reach the ' +
      'cradle before they finish. The Heart of the Saint must not be theirs.',
    actId: 'act2',
    giverNpcId: 'npc_elara',
    // No startActive — Elara's coords_decoded handoff activates it (D-03).
    steps: [
      {
        id: 's_approach',
        desc: 'Clear the undercroft stair-gallery of the Weaver-cell’s sentries.',
        condition: flag('undercroft_approach_clear'),
      },
      {
        id: 's_inner',
        desc: 'Fight through the reliquary catacombs to the sealed inner door.',
        condition: flag('undercroft_inner_clear'),
      },
      {
        id: 's_core',
        desc: 'Break the cell’s last stand at the cradle and seize the fuel-cell.',
        condition: flag('relic_fuel_cell', 'party'),
      },
    ],
    rewards: [
      { type: 'give_xp', amount: 800 },
      {
        type: 'add_narrative',
        text:
          'The cradle is dark and the undercroft is silent. The Heart of the Saint ' +
          'is in your keeping now — and whatever the sky has been falling toward, ' +
          'the cell will not be the ones to meet it.',
      },
    ],
  },
  // ── The Inquisitor's Suspicion — "q_jarek" (MQ-04 / NPC-02) ──────────────────
  // NOT startActive: encountering High Inquisitor Jarek at the ball IS the
  // activation (D-09). Mechanically, the auto-accept trigger and the completing
  // step are the SAME beat — jarek_stance being set to any of its three values.
  // The negotiation is the encounter: the instant the player resolves Jarek's
  // tree (talk him down → allied, demur → wary, or provoke him → hostile), the
  // stance flag is written, the quest auto-accepts AND its single step closes.
  // The step keys on jarek_stance via an `any`-of-values condition (D-07): a
  // quest that simply RECORDS the negotiation outcome for the Phase-5 ending,
  // whichever way it went. The hostile-path ballroom ambush is tracked
  // separately by RULES_ACT2 jarek_ambush_clear (jarek_ambush_cleared) — it is
  // NOT a completion gate here, so an allied/wary party (who never fight) still
  // closes the quest cleanly.
  {
    id: 'q_jarek',
    title: 'The Inquisitor’s Suspicion',
    desc:
      'High Inquisitor Jarek of Malgovia stalks the heartland’s grand ball, certain ' +
      'the star-metal you carry is the arcane plague his order was raised to burn. ' +
      'Convince him you are the cure’s cartographers, not its carriers — talk him into ' +
      'an ally, leave him wary, or push him too far and answer his Subverted under the ' +
      'chandeliers. However it ends, the inquisitor will remember it.',
    actId: 'act2',
    giverNpcId: 'npc_jarek',
    // No startActive — resolving Jarek's negotiation (any stance) activates AND
    // completes it (D-09; the negotiation is the encounter).
    steps: [
      {
        id: 's_stance',
        desc: 'Settle the High Inquisitor’s suspicion at the ball — for good or ill.',
        // Keyed on jarek_stance being set to ANY of its three authored values, so
        // the quest closes on whichever outcome the player reached. A flat
        // `flag('jarek_stance', x)` couldn't cover all three; the `any` does — and
        // an unset jarek_stance matches none of them, so the quest never
        // auto-accepts before the player has actually met and resolved Jarek.
        condition: {
          any: [
            flag('jarek_stance', 'allied'),
            flag('jarek_stance', 'wary'),
            flag('jarek_stance', 'hostile'),
          ],
        },
      },
    ],
    rewards: [
      { type: 'give_xp', amount: 500 },
      {
        type: 'add_narrative',
        text:
          'Whatever passed between you and the inquisitor under the chandeliers, the ' +
          'measure is taken now. Jarek knows what you carry — and you know what he ' +
          'will do about it when the sky finishes falling.',
      },
    ],
  },
];
