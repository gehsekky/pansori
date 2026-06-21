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
//   met_quentin — the party has spoken with Quentin Vance at court (set on
//                 his opening response; D-09). Closes q_act2_open.

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
];
