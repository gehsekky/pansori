// The Act I act-graph. One playable act (the Sunder-Carr investigation) that
// branches, on the silverford_outcome flag the diplomacy/war rules set, into one
// of two TERMINAL ending acts. Entering a terminal act resolves the campaign
// (the FE shows the ending screen). Until Act II is built, both endings close on
// "To be continued…", branched so the world the party made is the one they see.
//
// The branch is flag-driven (silverford_outcome), evaluated every action by the
// act-transition system — the first matching edge fires.

import type { Act } from '../../types.js';

export const ACTS: Act[] = [
  {
    id: 'act1',
    name: 'Act I — The Forensic Trail of Star-Metal',
    startingRegionId: 'sunder_carr',
    startPos: { x: 1, y: 6 },
    onStart: [
      'Twenty-four hours. The Sunder-Carr stretches out grey and cold, and ' +
        'somewhere in it is the truth that stops a war — if you can reach it in time.',
    ],
    transitions: [
      {
        when: { fact: 'flags', path: '$.silverford_outcome', operator: 'equal', value: 'truce' },
        to: 'act1_end_truce',
      },
      {
        when: { fact: 'flags', path: '$.silverford_outcome', operator: 'equal', value: 'war' },
        to: 'act1_end_war',
      },
    ],
  },
  {
    id: 'act1_end_truce',
    name: 'Silverford Holds',
    startingRegionId: 'sunder_carr',
    startPos: { x: 1, y: 6 },
    ending: {
      outcome: 'Truce at Silverford',
      text:
        'The armies stand down. Vargis and Vane will not embrace — but they will ' +
        'wait, and waiting is everything. In Julian’s case rests the Chrono-Shard, ' +
        'humming its cold patient note; in Sister Martha’s words, a thread that ' +
        'will not let go: these relics are not holy. They are listening. You have ' +
        'bought the world a little time, and made the first enemy who will not ' +
        'forgive it.\n\nThe Sky Is Falling — Act I complete. To be continued…',
    },
  },
  {
    id: 'act1_end_war',
    name: 'The Battle of Silverford',
    startingRegionId: 'sunder_carr',
    startPos: { x: 1, y: 6 },
    ending: {
      outcome: 'The Battle of Silverford',
      text:
        'The Battle of Silverford burns into the marsh behind you — two armies ' +
        'bled white over a massacre neither committed, exactly as someone planned. ' +
        'You carry the proof out of the Sunder-Carr too late to stop it, but not ' +
        'too late to use it. The war you failed to prevent has taught both empires ' +
        'to hate the wrong enemy — and somewhere a faceless hand is satisfied.\n\n' +
        'The Sky Is Falling — Act I complete. To be continued…',
    },
  },
];
