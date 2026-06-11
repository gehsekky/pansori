// Act I quests. The main investigation (q_case_107) is startActive — the party
// begins with direction. Its steps track the forensic flags the room objects /
// NPCs set; s_resolve completes when the diplomacy-or-war branch fires (rules.ts
// sets act1_resolved). Side quests are the light layer: the store unlock, two
// dockside errands, and Lorien's goodwill — none required to resolve the act.
//
// Step conditions read CampaignFacts: flags via {fact:'flags', path:'$.x'},
// inventory via {fact:'party_items', operator:'contains'}.

import type { Quest } from '../../types.js';

const flag = (key: string, value: boolean | string | number = true) => ({
  fact: 'flags',
  path: `$.${key}`,
  operator: 'equal',
  value,
});

export const QUESTS: Quest[] = [
  // ── The main case ──────────────────────────────────────────────────────────
  {
    id: 'q_case_107',
    title: 'Case File #107',
    desc:
      'Miller’s Thicket was wiped out and a vault-relic stolen. You have until the ' +
      'armies clash to prove who really did it — or the Battle of Silverford ' +
      'settles the question in blood.',
    actId: 'act1',
    giverNpcId: 'npc_vargis',
    startActive: true,
    steps: [
      {
        id: 's_brief',
        desc: 'Take the Case File #107 briefing from Commander Vargis.',
        condition: flag('heard_vargis'),
      },
      {
        id: 's_investigate',
        desc: 'Determine the true cause of the massacre at the ash-pit.',
        condition: flag('clue_burn'),
      },
      {
        id: 's_recover',
        desc: 'Recover the strange artifact from the tomb-mound.',
        condition: { fact: 'party_items', operator: 'contains', value: 'chrono_shard' },
      },
      {
        id: 's_thirdparty',
        desc: 'Prove a third party is behind the massacre.',
        condition: flag('clue_thirdparty'),
      },
      {
        id: 's_resolve',
        desc: 'Force a verdict before the clock runs out.',
        condition: flag('act1_resolved'),
      },
    ],
    rewards: [
      { type: 'give_xp', amount: 800 },
      {
        type: 'add_narrative',
        text: 'The first thread of a far larger conspiracy is in your hands. The Gavel will want to know.',
      },
    ],
  },

  // ── Side quests (the light layer) ───────────────────────────────────────────
  {
    id: 'q_store_rats',
    title: 'Rats in the Pantry',
    desc: 'Halda Bremmer won’t open her shop until the giant rats in her stockroom are dead.',
    actId: 'act1',
    giverNpcId: 'npc_storekeeper',
    steps: [
      {
        id: 's_clear',
        desc: 'Clear the giant rats from Bremmer’s stockroom.',
        condition: flag('store_cleared'),
      },
    ],
    rewards: [{ type: 'give_xp', amount: 100 }],
  },
  {
    id: 'q_lost_locket',
    title: 'The Drowned Keepsake',
    desc: 'Old Pell lost his late mother’s silver locket off the Drowned Causeway.',
    actId: 'act1',
    giverNpcId: 'npc_dockhand',
    steps: [
      {
        id: 's_find',
        desc: 'Recover Pell’s locket from the causeway muck.',
        condition: flag('found_locket'),
      },
    ],
    rewards: [
      { type: 'give_gold', amount: 40 },
      { type: 'give_xp', amount: 50 },
    ],
  },
  {
    id: 'q_missing_logger',
    title: 'One Who Walked Out',
    desc: 'Bree Hollin begs you to learn the fate of her husband Tomas at Miller’s Thicket.',
    actId: 'act1',
    giverNpcId: 'npc_logger_wife',
    steps: [
      {
        id: 's_learn',
        desc: 'Read the truth of the massacre at the ash-pit.',
        condition: flag('clue_burn'),
      },
    ],
    rewards: [
      { type: 'give_xp', amount: 75 },
      {
        type: 'add_narrative',
        text: 'You can tell Bree the truth now — that the Thicket did not fall to any raid, and that her husband never had a chance to run.',
      },
    ],
  },
  {
    id: 'q_tall_tales',
    title: 'A Round on the House',
    desc: 'Buy a round at the docks and trade rumors with Old Pell.',
    actId: 'act1',
    giverNpcId: 'npc_dockhand',
    steps: [
      {
        id: 's_drink',
        desc: 'Share a drink and a rumor with Old Pell.',
        condition: flag('heard_tales'),
      },
    ],
    rewards: [{ type: 'give_xp', amount: 25 }],
  },
  {
    id: 'q_lorien_favor',
    title: 'A Smuggler’s Goodwill',
    desc: 'Lorien wants a "misplaced" crate recovered from his den before a rival finds it.',
    actId: 'act1',
    giverNpcId: 'npc_lorien',
    steps: [
      {
        id: 's_crate',
        desc: 'Recover Lorien’s crate from behind the brine barrels.',
        condition: flag('found_crate'),
      },
    ],
    rewards: [
      { type: 'set_npc_attitude', npcId: 'npc_lorien', attitude: 'friendly' },
      { type: 'give_xp', amount: 50 },
    ],
  },
];
