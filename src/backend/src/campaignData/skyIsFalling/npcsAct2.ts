// Act II NPCs — authored as CampaignRoomNpc objects and embedded into their
// rooms (npcs live inside rooms; see roomsAct2.ts). Dialogue uses label (button)
// / say (spoken line) / reply (NPC) / condition (hidden gate) / check (CHA social
// roll) / consequences, exactly as the Act I npcs.ts board. Root-level options
// behave as a hub: a childless leaf plays its reply and leaves the menu in place.
//
// Flag vocabulary written/read by the Act II modules:
//   met_quentin    — the party has spoken with Quentin Vance at court. Set on
//                    Quentin's opening response (meeting him IS the trigger;
//                    D-09). Closes q_act2_open.
//   coords_decoded — RESERVED for slice 2 (the Library decode payoff): the
//                    star-metal coordinates have been read with Lady Elara.
//   decode_step_N  — RESERVED for slice 2: the per-step decode sub-flags that
//                    roll up into coords_decoded.
//   library_access — RESERVED for slice 2 (optional): Elara grants restricted
//                    archive access, gated on met_quentin.
//
// Retry-friendly discipline (Act I LORIEN incident, npcs.ts L193-200): no check
// in this file converts a quest-giver to hostile on failure. The court friction
// lives in prose, never a dice wall — Vane's contempt and Quentin's needling are
// tone, not a gate.

import type { CampaignRoomNpc } from '../../services/campaignContent.js';

// ── Commander Lucian Vane (returning) — the court's cold welcome · court ─────
// Reuses id `npc_vane` for continuity with Act I (RESEARCH inventory): the
// commander the party tangled with at Silverford now receives them at the
// Valerion court. Friendly attitude so dialogue opens with no CHA gate — his
// polished contempt is all in the lines. This Act II beat sets NO new flags
// (it's tone/texture); the silverford_outcome truce/war flavor options are
// deferred to Phase 5 (D-12) and intentionally NOT authored here.
export const VANE_ACT2: CampaignRoomNpc = {
  id: 'npc_vane',
  name: 'Commander Lucian Vane',
  attitude: 'friendly',
  icon: 'knight-helmet',
  hp: 52,
  ac: 18,
  damage: '1d8+3',
  toHit: 6,
  xp: 0,
  greeting: [
    'Vane stands at the foot of the dais in court silver, every buckle still ' +
      'aligned. "The Gavel’s circuit court, come to the heartland at last. You ' +
      'have travelled a long way to be of so little consequence. Speak, then — ' +
      'the court is generous with its patience today."',
  ],
  firstGreeting: [
    'The court hushes as you cross the long floor. Lucian Vane detaches himself ' +
      'from a knot of ministers and meets you halfway, smiling the way a blade ' +
      'is polished. "So. The two who meddled at Silverford have followed the ' +
      'thread inland. How tenacious. How tiresome. Mind your manners here — this ' +
      'is not a bog you can invoke your Law across."',
  ],
  goodbye: ['Vane inclines his head a precise inch and turns back to the ministers.'],
  responses: [
    {
      id: 'vane_why_summoned',
      label: 'Ask why the circuit court was called to Valerion at all.',
      say: 'The Gavel does not ride this far for a border quarrel, Commander. Why are we here?',
      reply:
        'Vane’s smile does not move. "You are here because a faded letter of marque ' +
        'says you must be heard, and because it costs this house nothing to hear ' +
        'you. The matter is delicate, the company delicate, and your reputations — ' +
        'forgive me — are not. Tread carefully, Justiciars. The heartland remembers ' +
        'its slights longer than the frontier does."',
    },
    {
      id: 'vane_the_court',
      label: 'Ask who else holds the court’s ear.',
      say: 'Whose word carries weight in this hall, Commander?',
      reply:
        '"Older names than mine, and far older than yours." His glance flicks toward ' +
        'a younger man lounging near the colonnade. "Young Vance, for one — he will ' +
        'find you soon enough; he finds everyone. And Lady Elara keeps the great ' +
        'Library, if your business runs to dusty things. Mine runs to keeping this ' +
        'court from embarrassing itself. Do not make my work harder."',
    },
  ],
};

// ── Quentin Vance — the needling cameo · court ───────────────────────────────
// NEW npc (`npc_quentin`). The friction cameo ONLY: his full "Old Money" /
// quentin_exposed tree is Phase 4 (D-08). Meeting him IS the trigger — his
// opening response sets met_quentin on first talk (D-09), no check required.
// Friendly so the menu opens cleanly; the needling stays in prose.
export const QUENTIN: CampaignRoomNpc = {
  id: 'npc_quentin',
  name: 'Quentin Vance',
  attitude: 'friendly',
  icon: 'fancy',
  hp: 9,
  ac: 12,
  damage: '1d4',
  toHit: 2,
  xp: 0,
  greeting: [
    'A languid young man in court finery peels off the colonnade to intercept you, ' +
      'a wine cup turning idly in his fingers. "Ah — the Gavel’s frontier curiosities. ' +
      'I had to come look. One hears such colorful things."',
  ],
  responses: [
    {
      id: 'quentin_introductions',
      label: 'Return the greeting — let him have his sport.',
      say: 'You have us at a disadvantage. And you are?',
      reply:
        '"Quentin Vance. Of the Vances — but then everyone here is, in some diluted ' +
        'way." He sips. "I make it my business to know who walks into this court, and ' +
        'why. You two are far more interesting than your reputations suggest, which is ' +
        'either a compliment or a warning. I haven’t decided. Do enjoy the heartland’s ' +
        'hospitality while it lasts."',
      // Meeting Quentin is the trigger — no check; this closes q_act2_open (D-09).
      consequences: [{ type: 'set_flag', key: 'met_quentin', value: true }],
    },
    {
      id: 'quentin_gossip',
      label: 'Ask what the court whispers about the Vances.',
      say: 'And what should two curiosities know about the company we’re keeping?',
      reply:
        '"Oh, nothing one can prove." His smile is all teeth. "Old money, old debts, ' +
        'old doors that stay locked. Lady Elara could tell you more than I — she reads ' +
        'everything, that one. Me? I only watch. It’s remarkable what people forget ' +
        'they’ve let slip, with a glass in their hand and a frontier nobody listening."',
    },
  ],
};
