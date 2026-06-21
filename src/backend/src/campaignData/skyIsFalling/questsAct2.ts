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
];
