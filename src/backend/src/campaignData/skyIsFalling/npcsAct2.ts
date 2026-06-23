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
//   library_access — Lady Elara has granted restricted archive access. Set on
//                    her grant-access line, gated on met_quentin (D-11). Read by
//                    q_library's gaining-access step.
//   decode_step_1  — the party has read the first layer of the star-metal's
//   decode_step_2    geometry with Elara (the three retry-friendly persuasion
//   decode_step_3    beats of the "Mythic Geometry" gauntlet). Set on each
//                    decode check's onSuccess.
//   coords_decoded — the Library decode payoff: the star-metal coordinates have
//                    been read. Set on the final decode beat — on BOTH the
//                    martha_hint callback line AND the neutral line (D-04/D-05).
//                    Never hard-gated on chrono_shard (the decode proceeds
//                    without it; D-06 safety net). Closes q_library.
//   jarek_stance   — STRING ('allied' | 'wary' | 'hostile'): the outcome of the
//                    High Inquisitor Jarek negotiation at the ball (D-07). Set in
//                    JAREK's tree below — 'allied' on the persuasion check's
//                    onSuccess, 'wary' on the neutral-exit line, 'hostile' on the
//                    separate confrontational option (which trips the room-placed
//                    ambush; D-08). A FAILED check sets nothing (retry-friendly).
//                    q_jarek's stance step keys on it; the Phase-5 ending branches
//                    on it.
//   quentin_thread_started — bool; the party has accepted Quentin's "Old Money"
//                    thread. Set on QUENTIN's once start_quest beat (D-12), gated
//                    on met_quentin. Gates the investigation gauntlet so the
//                    evidence beats only appear once the thread is live.
//   quentin_evidence_ledger — bool; the party has talked a counting-house clerk
//   quentin_evidence_witness   into confirming a name (persuasion), pried a
//   quentin_evidence_seal      frightened witness's account loose (deception/
//                    intimidation framing as Quentin's tree, never investigation),
//                    and matched the Vance wax-seal on the diverted bills. The
//                    three retry-friendly CHA evidence beats (D-10, the q_library
//                    decode-gauntlet shape). Set on each evidence check's
//                    onSuccess. Read by q_quentin_thread's intermediate steps and
//                    by the lieutenant-room reveal line below.
//   quentin_exposed — bool; the exposé closes — the Weaver Magus lieutenant in
//                    the Vance-estate cellar is down and the ledger is secured,
//                    proving Quentin's Sect funding (D-10). NOT set in dialogue:
//                    written by RULES_ACT2's quentin_lieutenant_down rule on the
//                    named lieutenant kill (see rulesAct2.ts). q_quentin_thread's
//                    final step keys on it; the Phase-5 ending branches on it.
//
// Flags READ but never re-set by this module (Act I carry threads):
//   martha_hint    — set in Act I by Sister Martha touching the Chrono-Shard
//                    (npcs.ts show_shard). When present, Elara's final beat adds
//                    a callback connecting Martha's "cold frequency" to the
//                    coordinates. Optional in Act I → never a hard gate (D-04).
//   chrono_shard   — an Act I party_item (the star-metal shard). When carried,
//                    Elara offers a flavor line about projecting the geometry;
//                    its ABSENCE never blocks the decode (D-06).
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
// (it's tone/texture).
//
// Act I carry flavor (Phase 5, Plan 05-02 — BR-01/BR-02): Vane carries the
// silverford_outcome echo. His court-arrival WELCOME shifts in COLOR with the
// war the party left in the Sunder-Carr (truce vs war), and he exposes one
// war-state read on the conflict — but ALL of it is flavor-only. These leaves
// carry NO consequences (no flag/faction write — BR-02 "no mechanical impact
// this cycle"); the un-gated greeting + the un-gated court questions remain so a
// flagless party (didn't finish Act I cleanly) is never dead-ended (D-07).
// silverford_outcome is READ here, never WRITTEN.
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
    // ── BR-01: the court-arrival welcome, COLORED by silverford_outcome ────────
    // Two sibling leaves (truce vs war) tint the welcome with the war the party
    // left in the Sunder-Carr. Both are flavor-only (NO consequences) and the
    // story converges either way — the un-gated greeting/firstGreeting and the
    // court-question leaves above carry the spine, so a flagless party simply
    // never sees these and is never dead-ended (D-06/D-07). silverford_outcome is
    // READ, never written.
    {
      id: 'vane_welcome_truce',
      label: 'Let him take your measure as the ones who brokered the Silverford truce.',
      condition: {
        fact: 'flags',
        path: '$.silverford_outcome',
        operator: 'equal',
        value: 'truce',
      },
      say: 'You’ll have heard, Commander. Silverford holds. Two armies stood down rather than bleed.',
      reply:
        'Vane’s smile thins to something colder. "Oh, the heartland heard. A truce ' +
        'brokered by circuit Justiciars over the heads of two standing armies — yes, ' +
        'that travelled. There are ministers in this hall who lost a tidy war to your ' +
        'meddling, and they have long memories and longer dinners. You bought peace ' +
        'in the marsh and a great many quiet enemies in the capital. Wear it well."',
    },
    {
      id: 'vane_welcome_war',
      label: 'Let him take your measure as the ones who came from the burning of Silverford.',
      condition: {
        fact: 'flags',
        path: '$.silverford_outcome',
        operator: 'equal',
        value: 'war',
      },
      say: 'You’ll have heard, Commander. Silverford burned. The armies met before anyone could stop it.',
      reply:
        'For an instant the polish leaves Vane’s face and something older shows ' +
        'through. "The Battle of Silverford. Yes. We heard the courier lists read out ' +
        'in this very hall — name after name after name." The mask returns. "Do not ' +
        'imagine that buys you sympathy here. A frontier that burns is a frontier the ' +
        'heartland need no longer pretend to respect. You arrive trailing smoke, ' +
        'Justiciars. See that you do not bring it indoors."',
    },
    // ── BR-02: Vane's one war-state READ on the conflict (truce/war siblings) ──
    // The Imperium noble's private read on the war he half-owns — pure tone, NO
    // consequences (D-08/D-09: one gated line each, flavor-only). Distinct beat
    // from the arrival welcome above: this is him talking ABOUT the war when
    // asked, not greeting the party with it.
    {
      id: 'vane_warread_truce',
      label: 'Ask the Commander what the heartland makes of a frontier that chose peace.',
      condition: {
        fact: 'flags',
        path: '$.silverford_outcome',
        operator: 'equal',
        value: 'truce',
      },
      say: 'And what does Valerion make of a truce in the Sunder-Carr, Commander — honestly?',
      reply:
        '"Honestly." He says the word like a rare coin. "It makes the capital nervous. ' +
        'A frontier that can make its own peace is a frontier that has stopped needing ' +
        'us — and nothing frightens old money like being unneeded. Half this court ' +
        'would have preferred the war; a war they could sell. You took that from them. ' +
        'I find I do not much mind. But I am not the half you should worry about."',
    },
    {
      id: 'vane_warread_war',
      label: 'Ask the Commander what the heartland makes of the war in the Sunder-Carr.',
      condition: {
        fact: 'flags',
        path: '$.silverford_outcome',
        operator: 'equal',
        value: 'war',
      },
      say: 'And what does Valerion make of the war in the Sunder-Carr, Commander — honestly?',
      reply:
        '"Honestly? It makes the capital comfortable." His voice is very even. "A ' +
        'burning frontier is a frontier that still needs the heartland’s armies, the ' +
        'heartland’s coin, the heartland’s permission. There are men in this hall who ' +
        'will dine well on that war for a decade. I am not certain I am one of them — ' +
        'but I have learned not to say so over the soup. You lit no fire, Justiciars. ' +
        'Remember that, when the comfortable men in this room try to hand you the ash."',
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
    // ── "Old Money" — start the exposé thread (D-12) ─────────────────────────
    // The Phase-3 cameo becomes a reckoning: once the party has crossed the court
    // and met Quentin (met_quentin), this `once` beat fires start_quest
    // q_quentin_thread and sets quentin_thread_started (the gauntlet's gate).
    // Player-driven: the rivalry the court friction established becomes the hook.
    {
      id: 'quentin_old_money',
      label: 'Press the needling back — ask whose old debts pay the Vance bills now.',
      say:
        'You watch everyone, Vance. So watch this: a house this gilded, this quiet about ' +
        'its ledgers, in a heartland the Weavers are hollowing from below? Old money has ' +
        'to come from somewhere new. We mean to find out where yours does.',
      condition: { fact: 'flags', path: '$.met_quentin', operator: 'equal', value: true },
      once: true,
      reply:
        'For the first time the wine cup goes still. The languid smile thins to ' +
        'something colder and far older. "Careful, frontier. People who go looking ' +
        'into Vance accounts tend to find the accounting looks back." A beat — then ' +
        'the mask slides up again, lazy as ever. "But by all means. Pull the thread. ' +
        'You’ll only hang yourselves in it. The clerks, the witnesses, the seals — ' +
        'they all answer to old money in the end. Even you will, eventually."',
      consequences: [
        { type: 'set_flag', key: 'quentin_thread_started', value: true },
        { type: 'start_quest', questId: 'q_quentin_thread' },
      ],
    },
    // ── Investigation gauntlet — three retry-friendly CHA evidence beats (D-10) ─
    // The q_library decode-gauntlet shape: CHA-only checks (persuasion / deception
    // / intimidation — NEVER investigation/history/arcana, which would silently
    // roll off Charisma), each onFail: [] (never hostile), failReply invites a
    // retry, NO `once` on the check nodes. Each onSuccess sets one evidence
    // sub-flag. Gated forward in order on quentin_thread_started → ledger →
    // witness, so the trail resolves layer by layer. The party-wide skill-check
    // discipline (D-13): the rolls are never Julian-specific — Julian's family
    // ruin pays off as condition-gated FLAVOR below, never as a gated roll.
    // SRD: Ability Checks — DC 13/14/15 (an escalating heartland-court trail).
    {
      id: 'quentin_evidence_clerk',
      label: 'Lean on a Vance counting-house clerk for the name on the diverted bills.',
      say: 'A frontier nobody buys a clerk a drink, friend. Whose name is on the grey-scrap bills?',
      condition: {
        fact: 'flags',
        path: '$.quentin_thread_started',
        operator: 'equal',
        value: true,
      },
      check: {
        skill: 'persuasion',
        dc: 13,
        successReply:
          'The clerk’s nerve folds over the third cup. "...The relic consignments. ' +
          'Routed through a holding account, signed off downstairs — the old cellar ' +
          'counting-house under the estate. I never saw the buyer’s face, only the ' +
          'seal." A Vance seal, on bills paying for star-metal. The first thread holds.',
        failReply:
          'The clerk catches himself and sets the cup down. "I’ve said nothing, and ' +
          'I’ll keep saying it." No matter — there are other cups, other nights. ' +
          'Buy another round and try the approach again.',
        onSuccess: [{ type: 'set_flag', key: 'quentin_evidence_ledger', value: true }],
        onFail: [],
      },
    },
    {
      id: 'quentin_evidence_witness',
      label: 'Coax a frightened witness into placing Quentin at the cellar handoffs.',
      say:
        'You saw who came down to the counting-house, didn’t you. We can keep your name ' +
        'out of it — but only if you give us his.',
      condition: {
        fact: 'flags',
        path: '$.quentin_evidence_ledger',
        operator: 'equal',
        value: true,
      },
      check: {
        skill: 'deception',
        dc: 14,
        successReply:
          'You promise a protection you may not be able to give, and it loosens the ' +
          'witness’s tongue. "Young master Quentin. Always Quentin, down the cellar ' +
          'stair past midnight, with the hooded ones who hum. He signs, they carry it ' +
          'off." Quentin’s own hand on the Sect’s payments. The second thread holds.',
        failReply:
          'The witness shrinks back, unconvinced. "You can’t protect anyone from the ' +
          'Vances. No one can." Not yet, at least — soften the angle and try the ' +
          'promise again.',
        onSuccess: [{ type: 'set_flag', key: 'quentin_evidence_witness', value: true }],
        onFail: [],
      },
    },
    // ── Julian's family-ruin callback (D-13): the martha_hint BOTH-PATHS idiom ──
    // Felt in WORDS, like martha_hint pays off in Elara's decode — NEVER a hard
    // gate, NEVER a Julian-specific roll. TWO sibling lines, BOTH gated on the
    // witness evidence (the trail's progress) and BOTH reaching the SAME outcome
    // (set quentin_evidence_seal):
    //   • the callback line additionally gated on `julian_in_party` (a party-wide
    //     presence flavor flag, NOT a roll) — it lands the personal blow, tying the
    //     Vance fraud to the house Julian's family lost.
    //   • a neutral sibling gated ONLY on the witness evidence — so a party without
    //     Julian (or with him downed) reaches the exact same seal-match outcome.
    // Robust for any composition: the seal match (and the lieutenant reveal it
    // unlocks) is never blocked on the optional Julian thread.
    {
      id: 'quentin_evidence_seal_julian',
      label: 'Match the Vance seal — and name the house it once ruined (Julian).',
      say:
        'This is the seal that broke a wizard’s family a decade gone — Julian’s house, ' +
        'bled white by a Vance "loan" that was never meant to be repaid. The same seal ' +
        'is on the Sect’s bills. You didn’t just fund them, Vance. You practiced on us first.',
      condition: {
        all: [
          { fact: 'flags', path: '$.quentin_evidence_witness', operator: 'equal', value: true },
          { fact: 'flags', path: '$.julian_in_party', operator: 'equal', value: true },
        ],
      },
      reply:
        'Julian lays the old foreclosure beside the new bills, and the wax matches ' +
        'tooth for tooth — the same seal that gutted his family now stamped across the ' +
        'Sect’s star-metal payments. "Ten years," he says quietly. "Ten years I told ' +
        'myself it was just money." It was never just money. The seal is proof, and ' +
        'it is personal now. The trail points one place: the cellar counting-house.',
      consequences: [{ type: 'set_flag', key: 'quentin_evidence_seal', value: true }],
    },
    {
      id: 'quentin_evidence_seal_neutral',
      label: 'Match the Vance wax-seal on the foreclosures to the seal on the Sect’s bills.',
      say:
        'Pull every Vance foreclosure of the last decade and lay them beside the ' +
        'grey-scrap bills. If the wax matches, the man who funds the Weavers signs ' +
        'his own ruin into every ledger he touches.',
      // Neutral path: gated ONLY on the witness evidence, NOT on julian_in_party,
      // so a party that lacks Julian still reaches quentin_evidence_seal (D-13).
      condition: {
        fact: 'flags',
        path: '$.quentin_evidence_witness',
        operator: 'equal',
        value: true,
      },
      reply:
        'You lay a decade of Vance foreclosures beside the grey-scrap bills, and the ' +
        'wax tells on itself — the same seal that ruined a dozen heartland houses now ' +
        'stamped across the Sect’s star-metal payments. Proof, in cold wax. The trail ' +
        'points one place: the old cellar counting-house under the estate.',
      consequences: [{ type: 'set_flag', key: 'quentin_evidence_seal', value: true }],
    },
    // ── The lieutenant-room reveal (narrative only) ──────────────────────────
    // Once all three evidence threads hold (ledger + witness + seal), this `once`
    // beat names the place the exposé must be carried — the Vance-estate cellar
    // counting-house, where Quentin's Weaver Magus lieutenant guards the master
    // ledger. It sets NO flag (quentin_exposed is written by the lieutenant kill,
    // RULES_ACT2 quentin_lieutenant_down) — it is the prose handoff into the fight.
    {
      id: 'quentin_lieutenant_reveal',
      label: 'Follow the trail down — into the Vance-estate counting-house.',
      say: 'The bills, the witness, the seal — they all run downstairs. We finish this in the cellar.',
      condition: {
        all: [
          { fact: 'flags', path: '$.quentin_evidence_ledger', operator: 'equal', value: true },
          { fact: 'flags', path: '$.quentin_evidence_witness', operator: 'equal', value: true },
          { fact: 'flags', path: '$.quentin_evidence_seal', operator: 'equal', value: true },
        ],
      },
      once: true,
      reply:
        'The paper trail ends at a single iron-bound door beneath the Vance estate — ' +
        'the old counting-house cellar, where the master ledger is kept and a hooded ' +
        'Weaver lieutenant keeps it. "Quentin won’t be there," you say. "Men like him ' +
        'never are. But his ledger will be, and the thing he set to guard it." Take the ' +
        'cellar stair. Put the lieutenant down, seize the ledger, and the exposé is done.',
    },
  ],
};

// ── Lady Elara Aurellion — keeper of the Grand Library · grand_library_room ──
// NEW npc (`npc_elara`). The slice-2 anchor: she grants restricted archive
// access + starts q_library (gated on met_quentin from slice 1), then walks the
// party through the "Mythic Geometry" decode gauntlet that reads the star-
// metal's coordinates (coords_decoded).
//
// DECODE MECHANISM (load-bearing — Option A): every decode check is a CHA
// `check: { skill: 'persuasion', … }` framed as working WITH Elara through the
// geometry — NOT arcana/investigation/history (the check.skill union is CHA-only
// and social.ts always rolls char.cha; an Arcana check would silently roll off
// Charisma, mechanically wrong). The checks are retry-friendly per the LORIEN
// idiom (onFail: [], no set_npc_attitude→hostile, failReply invites a retry) —
// the decode is a beat, not a gate (D-03).
//
// CHRONO_SHARD SAFETY NET (D-06): the decode checks live OUTSIDE any shard gate,
// so coords_decoded is reachable whether or not the party carries chrono_shard.
// The shard only adds a flavor line (it "projects" the geometry); its absence
// never dead-ends the decode.
//
// MARTHA_HINT BOTH-PATHS (D-04/D-05): the final beat has TWO sibling lines — a
// martha_hint-gated callback (connecting Sister Martha's "cold frequency" to the
// coordinates) and a neutral line for parties who skipped her in Act I. BOTH set
// coords_decoded; progression is NEVER hard-gated on the optional martha_hint.
// Friendly attitude so the menu opens with no CHA gate.
export const ELARA: CampaignRoomNpc = {
  id: 'npc_elara',
  name: 'Lady Elara Aurellion',
  attitude: 'friendly',
  icon: 'spectacles',
  hp: 13,
  ac: 12,
  damage: '1d4',
  toHit: 3,
  xp: 0,
  greeting: [
    'A spare, grey-eyed woman looks up from a decoding-table strewn with charts, ' +
      'a brass rule still in her hand. "Justiciars. Word travels even into the ' +
      'stacks. You carry something the court would rather stayed buried — and I ' +
      'have spent forty years learning to read buried things. Sit. Let us see what ' +
      'the star-metal is trying to say."',
  ],
  firstGreeting: [
    'The Grand Library opens around you like the inside of a shell, gallery on ' +
      'gallery of vellum climbing into the dome. At a long lamp-lit table a woman ' +
      'in scholar’s grey lifts her head before you have made a sound. "You walk ' +
      'like people who have found an answer and lost the question," she says. "I ' +
      'am Elara Aurellion. The court keeps me down here with its dangerous books. ' +
      'I suspect you are about to become one of them."',
  ],
  goodbye: ['Elara is already bent back over the charts, the brass rule moving.'],
  responses: [
    // 1. Grant access + start quest (D-11), gated on met_quentin (slice 1).
    // Mirrors the LORIEN favor idiom (npcs.ts L213-222): condition-gated, once,
    // start_quest + set_flag consequences. Until the party has crossed the court
    // and met Quentin, this option stays hidden (the archive is restricted).
    {
      id: 'elara_grant_access',
      label: 'Ask leave to bring the star-metal’s riddle into the archive.',
      say:
        'Lady Elara — the court grants us little, but the Vances said you read what ' +
        'others cannot. We have a thing that listens on a cold frequency, and ' +
        'coordinates we cannot place. Will you open the restricted stacks to us?',
      condition: { fact: 'flags', path: '$.met_quentin', operator: 'equal', value: true },
      once: true,
      reply:
        '"The restricted stacks." She studies you a moment, then sets down the rule. ' +
        '"The court would have me turn you out. The court has never had to read a ' +
        'thing that reads back. Granted — on my authority, which down here is the ' +
        'only authority that matters. Bring your riddle to the long table. We will ' +
        'call it Mythic Geometry, and we will solve it together."',
      consequences: [
        { type: 'set_flag', key: 'library_access', value: true },
        { type: 'start_quest', questId: 'q_library' },
      ],
    },
    // 2a. Decode gauntlet — first layer. Retry-friendly persuasion check (D-01/
    // D-02/D-03): onFail: [] (never hostile), failReply invites a retry, NO once.
    // Gated on library_access so it appears only after the grant. Framed as
    // working WITH Elara through the projection — never a lone Arcana wall.
    // SRD: Ability Checks — DC 13 (an easy/standard heartland-archive task).
    {
      id: 'elara_decode_1',
      label: 'Lay the coordinates out with Elara and read the first layer.',
      say: 'Walk it with me, Lady. Where does a frequency like this even begin?',
      condition: { fact: 'flags', path: '$.library_access', operator: 'equal', value: true },
      check: {
        skill: 'persuasion',
        dc: 13,
        successReply:
          'You talk it through with her, your instinct meeting her training, until the ' +
          'first nested figure resolves under the lamp. "There," she breathes. "Not a ' +
          'map. A *projection* — the sky folded down onto a plane. Keep going with me."',
        failReply:
          'The figures swim and refuse to settle. Elara taps the chart, unbothered. ' +
          '"No — you are reading it as a map. It is not a map. Breathe, and let us try ' +
          'the lines again, together."',
        onSuccess: [{ type: 'set_flag', key: 'decode_step_1', value: true }],
        onFail: [],
      },
    },
    // 2b. Decode gauntlet — second layer. Gated on decode_step_1 (the layers
    // resolve in order). DC 14. Retry-friendly. Optional chrono_shard FLAVOR line
    // lives separately below — this beat proceeds with or without the shard.
    {
      id: 'elara_decode_2',
      label: 'Press into the second layer of the geometry.',
      say: 'The projection folds again here. Help me follow the crease.',
      condition: { fact: 'flags', path: '$.decode_step_1', operator: 'equal', value: true },
      check: {
        skill: 'persuasion',
        dc: 14,
        successReply:
          '"Yes — yes, you see it." Elara’s rule races across the vellum. "Each fold ' +
          'is a bearing the sky takes on itself. Two solved. One layer left, and it is ' +
          'the deep one."',
        failReply:
          'The second fold collapses back into noise. "Patience," Elara says, not ' +
          'unkindly. "The geometry does not punish a wrong turn. It simply waits. ' +
          'Again — show me where the crease wants to go."',
        onSuccess: [{ type: 'set_flag', key: 'decode_step_2', value: true }],
        onFail: [],
      },
    },
    // 2c — optional chrono_shard FLAVOR line (D-06 safety net made explicit):
    // a flavor-only beat available WHEN the party carries the shard. It sets NO
    // decode flag and gates NOTHING — it merely sharpens the read. The decode
    // (decode_3 → coords_decoded) never requires it, so a shard-less party is
    // never dead-ended.
    {
      id: 'elara_shard_projection',
      label: 'Lay the Chrono-Shard on the chart and let it cast the figure.',
      say: 'Lady — the shard itself listens. Set it on the lines and see what it throws.',
      condition: { fact: 'party_items', operator: 'contains', value: 'chrono_shard' },
      reply:
        'You rest the cold grey shard on the vellum. It drinks the lamplight and throws ' +
        'a faint lattice across the table — the same geometry, but *true*, every bearing ' +
        'humming into place. "Oh," Elara says softly. "It is its own key. Well. This will ' +
        'go faster than I feared." The figures hold steady where they swam before.',
    },
    // 3. Final decode beat → coords_decoded. TWO sibling lines (D-04/D-05), BOTH
    // gated on decode_step_2 (the gauntlet's progress), NEITHER hard-gated on the
    // optional martha_hint. The first carries the explicit Act I callback; the
    // second is the neutral path. BOTH fire coords_decoded so the decode always
    // completes regardless of the Act I Martha thread or the chrono_shard.
    {
      id: 'elara_decode_final_martha',
      label: 'Solve the deep layer — recall Sister Martha’s "cold frequency."',
      say:
        'The blind sister in the marsh vault said the holy relics all listened on one ' +
        'cold frequency. This is that frequency, isn’t it — written as a place.',
      // Act I callback. Gated on BOTH the decode progress AND the optional
      // martha_hint — but a neutral sibling below covers parties without it, so
      // martha_hint is never a hard gate on coords_decoded.
      condition: {
        all: [
          { fact: 'flags', path: '$.decode_step_2', operator: 'equal', value: true },
          { fact: 'flags', path: '$.martha_hint', operator: 'equal', value: true },
        ],
      },
      reply:
        'Elara goes very still. "Say that again — *one* cold frequency. Of course. The ' +
        'relics were never sacred; they were an ear, all tuned to the same sky." The ' +
        'last fold opens like a held breath. "There. Coordinates. Your sister in the ' +
        'marsh heard the whole of it through a single shard — she simply could not see ' +
        'the place it pointed to. We can. We have it."',
      consequences: [
        { type: 'set_flag', key: 'decode_step_3', value: true },
        { type: 'set_flag', key: 'coords_decoded', value: true },
      ],
    },
    {
      id: 'elara_decode_final_neutral',
      label: 'Solve the deep layer — push the last fold open with Elara.',
      say: 'One fold left, Lady. Walk the deep layer with me — all the way down.',
      // Neutral path: gated ONLY on the decode progress, NOT on martha_hint, so a
      // party that skipped Martha in Act I still reaches coords_decoded (D-04).
      condition: { fact: 'flags', path: '$.decode_step_2', operator: 'equal', value: true },
      reply:
        'You work the last fold together, line by patient line, until the deep figure ' +
        'turns over and holds. "There it is," Elara whispers. "Not a frequency, not a ' +
        'projection — a *place*. The sky was telling us where, all along, to anyone ' +
        'patient enough to fold it flat. Coordinates. We have them."',
      consequences: [
        { type: 'set_flag', key: 'decode_step_3', value: true },
        { type: 'set_flag', key: 'coords_decoded', value: true },
      ],
    },
    // 4. Fuel-cell raid hand-off (D-03). Once the decode resolves (coords_decoded),
    // Elara reads where the coordinates point — DOWN, into the undercroft beneath
    // her own library — and fires `start_quest q_fuel_cell`, revealing the descent
    // (the grand_library_room → library_undercroft_approach exit, authored in
    // Phase 2). `once` so the hand-off fires a single time; gated purely on
    // coords_decoded so it appears the moment the gauntlet closes.
    // Flag vocabulary note: this beat starts q_fuel_cell, whose step flags
    // (undercroft_approach_clear / undercroft_inner_clear / relic_fuel_cell) are
    // written by RULES_ACT2's raid-clear rules — NOT here. (See rulesAct2.ts.)
    {
      id: 'elara_fuel_cell_handoff',
      label: 'Ask Elara what the coordinates actually point to.',
      say: 'We have the place, Lady. Where is it — what are we walking into?',
      condition: { fact: 'flags', path: '$.coords_decoded', operator: 'equal', value: true },
      once: true,
      reply:
        'Elara’s eyes go to the floor between you, then to the deep stacks behind her. ' +
        '"That is the part I have been dreading," she says quietly. "The coordinates ' +
        'do not point out across Utgard. They point *down*. There is an undercroft ' +
        'beneath this very library — older than the Grand Library, sealed for ' +
        'centuries. The Heart of the Saint is down there, and so, I think, is whoever ' +
        'has been listening on that cold frequency. If they reach the cradle first, ' +
        'they wring the fuel-cell open and the sky finishes falling. Go. The hidden ' +
        'stair is in the corner — I will hold the door behind you."',
      consequences: [{ type: 'start_quest', questId: 'q_fuel_cell' }],
    },
    // 5. EVE-OF-DEPARTURE DEBRIEF (D-03/D-05) — the carry/resolution beat. The
    // opener is gated on the SAME double-flag the act-close trigger names
    // (q_fuel_cell complete + coords_decoded), so it is reachable exactly when
    // the act is about to resolve. Its CHILD leaves give each accumulated flag a
    // felt, condition-gated callback (pure flavor — say + reply, NO consequences
    // on the callbacks), and the elara_depart child writes act2_departed — the
    // third edge gate — so the debrief always plays before the ending screen.
    //
    // No `once` on the opener: the debrief is replayable so the player can hear
    // every callback before choosing to depart (the depart leaf itself is the
    // point of no return — taking it trips the act-close transition).
    {
      id: 'elara_debrief',
      label: 'Take leave of Lady Elara on the eve of departure.',
      say:
        'It’s done, Lady. The coordinates are read and the cradle is behind us, one ' +
        'way or another. Before we ride for the Sunder-Gate — walk it back with us. ' +
        'Tell us what we leave behind.',
      condition: {
        all: [
          { fact: 'quests_completed', operator: 'contains', value: 'q_fuel_cell' },
          { fact: 'flags', path: '$.coords_decoded', operator: 'equal', value: true },
        ],
      },
      reply:
        'Elara sets the brass rule down for the first time since you met her. "The eve ' +
        'of a long road," she says. "Sit a moment. Let us count what this act cost, and ' +
        'what it bought. Then go — the sky will not wait, and neither, I think, will ' +
        'whatever you are riding toward."',
      responses: [
        // (1) relic_fuel_cell — BOTH a 'party'-gated callback AND a neutral/
        // absence leaf (the no-dead-end both-paths pattern). 'party' is the only
        // authored win value; its absence is the loss read (Phase 4 D-02).
        {
          id: 'elara_debrief_relic_secured',
          label: 'The Heart of the Saint — we carry it out.',
          condition: {
            fact: 'flags',
            path: '$.relic_fuel_cell',
            operator: 'equal',
            value: 'party',
          },
          say: 'The fuel-cell is ours, Lady. We pulled it from the cradle in time.',
          reply:
            '"You held it." Elara’s relief is a quiet, careful thing. "The Heart of the ' +
            'Saint, out of the dark and in your keeping. Whatever it is truly listening ' +
            'for, it listens for you now — guard it the way you would a loaded thing, ' +
            'because that is what it is."',
        },
        {
          id: 'elara_debrief_relic_lost',
          // Neutral/absence leaf — reachable whenever relic_fuel_cell is NOT
          // 'party' (the loss read). Plays its reply, sets nothing.
          label: 'The cradle — we left it behind.',
          condition: {
            not: {
              fact: 'flags',
              path: '$.relic_fuel_cell',
              operator: 'equal',
              value: 'party',
            },
          },
          say: 'We didn’t hold it, Lady. The cell stayed in the cradle — in another hand.',
          reply:
            'Elara is silent a long moment. "Then someone else carries the Heart of the ' +
            'Saint, and they will have heard what you heard — where the sky points. We ' +
            'are not ahead of them anymore. We are even, at best, and racing the same ' +
            'cold note north. So be it. Even is not lost. Ride."',
        },
        // (2) quentin_exposed — a true-gated callback. No neutral sibling needed:
        // the thread either closed (exposed) or it simply did not come up.
        {
          id: 'elara_debrief_quentin',
          label: 'Quentin Vance — we unmasked him.',
          condition: { fact: 'flags', path: '$.quentin_exposed', operator: 'equal', value: true },
          say: 'The Vance heir was the leak, Lady. We have the proof of it now.',
          reply:
            '"So the old money was rotten at the root after all." Elara’s mouth thins. ' +
            '"You did the court a service it will never thank you for. Quentin Vance ' +
            'unmasked — that is one knife you will not feel in your back on the road. ' +
            'Few enough can say the same of this city."',
        },
        // (3) jarek_stance — three sibling string-gated leaves (allied/wary/
        // hostile), matching the Phase-4 stance vocabulary.
        {
          id: 'elara_debrief_jarek_allied',
          label: 'High Inquisitor Jarek — we brought him to our side.',
          condition: { fact: 'flags', path: '$.jarek_stance', operator: 'equal', value: 'allied' },
          say: 'Jarek hears us now, Lady. The inquisitor rides with our purpose, not against it.',
          reply:
            '"You turned a plague-burner into an ally." Elara shakes her head, almost ' +
            'admiring. "An inquisitor’s reach is long and his memory longer. You will be ' +
            'glad of Jarek before the end — fear that has chosen a direction is a ' +
            'formidable thing to have at your back rather than your throat."',
        },
        {
          id: 'elara_debrief_jarek_wary',
          label: 'High Inquisitor Jarek — we left him watching.',
          condition: { fact: 'flags', path: '$.jarek_stance', operator: 'equal', value: 'wary' },
          say: 'Jarek didn’t move against us, Lady — but he didn’t move with us either.',
          reply:
            '"A watching inquisitor." Elara nods slowly. "Not the worst outcome, nor the ' +
            'best. He keeps his suspicion and his reach both, and you keep your road. ' +
            'Mind that a man like Jarek does not stay neutral forever — the next time ' +
            'you cross him, he will have decided. Pray he decides your way."',
        },
        {
          id: 'elara_debrief_jarek_hostile',
          label: 'High Inquisitor Jarek — we made an enemy under the chandeliers.',
          condition: { fact: 'flags', path: '$.jarek_stance', operator: 'equal', value: 'hostile' },
          say: 'We crossed Jarek, Lady. The ballroom ended in steel. He’ll not forget it.',
          reply:
            'Elara exhales. "Then you ride north with an inquisitor’s order behind you as ' +
            'well as whatever waits ahead. Jarek does not forgive, and his crusade does ' +
            'not lack for hands. Watch the road behind you as closely as the one in ' +
            'front — fear that has been humiliated is the most patient hunter there is."',
        },
        // (4) silverford_outcome — truce/war sibling leaves (Elara's war callback
        // is folded here per D-08, not given a separate war-state line).
        {
          id: 'elara_debrief_silverford_truce',
          label: 'The Sunder-Carr — we left a truce behind us.',
          condition: {
            fact: 'flags',
            path: '$.silverford_outcome',
            operator: 'equal',
            value: 'truce',
          },
          say: 'We left Silverford holding, Lady. Two armies standing down instead of bleeding.',
          reply:
            '"A truce in the marsh." Something eases in Elara’s grey eyes. "You bought the ' +
            'borderlands time, and time is the rarest coin there is. Carry that with you. ' +
            'When the road grows dark, remember you have already once made two empires ' +
            'choose to wait instead of burn. It can be done. You have done it."',
        },
        {
          id: 'elara_debrief_silverford_war',
          label: 'The Sunder-Carr — we left a war burning.',
          condition: {
            fact: 'flags',
            path: '$.silverford_outcome',
            operator: 'equal',
            value: 'war',
          },
          say: 'Silverford burned, Lady. The armies met before we could stop them. We carry that.',
          reply:
            'Elara’s face is grave. "The Battle of Silverford. I heard the couriers — two ' +
            'armies bled white over a massacre neither committed, exactly as someone ' +
            'planned. You could not stop it; few could have. But you carry the proof of ' +
            'who lit it, and that proof is a war’s worth of leverage. Use it. Let the ' +
            'dead in the marsh buy something with their deaths."',
        },
        // THE DEPART CHOICE (D-03) — writes act2_departed, the third edge gate.
        // No `once`: replayable-safe, but taking it trips the act-close transition
        // (the next action evaluates act2's edges and resolves the campaign).
        {
          id: 'elara_depart',
          label: 'Set out for the Sunder-Gate.',
          say:
            'We’ve counted it, Lady. There’s nothing left here but the road. We ride for ' +
            'the Sunder-Gate at first light — see what the sky was pointing at all along.',
          reply:
            'Elara stands and, for the first time, offers her hand. "Then go, Justiciars, ' +
            'and go well. The Grand Library will keep your secret and your seat — come ' +
            'back to it if the road allows. I do not think it will, for a long while. ' +
            'Ride for the Sunder-Gate. Whatever answers the sky, answer it standing." She ' +
            'releases your hand. "The eve is over. It is the road now."',
          consequences: [{ type: 'set_flag', key: 'act2_departed', value: true }],
        },
      ],
    },
  ],
};

// ── High Inquisitor Jarek — the arcane-plague paranoiac · valerion_ball_room ──
// NEW npc (`npc_jarek`). The act's tonal counterpoint (MQ-04 / NPC-02): a
// Malgovian inquisitor met under the chandeliers of the high-society ball, whose
// arcane-plague terror can be talked DOWN (allied), left UNSETTLED (wary), or
// PROVOKED into a ballroom ambush (hostile). `attitude: 'friendly'` so the menu
// opens with no CHA gate — his menace is in the lines, not a locked door.
//
// jarek_stance VOCABULARY (load-bearing — the flag the Phase-5 ending branches
// on, D-07): a STRING flag with three authored values —
//   allied  — set on the retry-friendly persuasion check's onSuccess (the party
//             convinces him they are not plague-carriers). The warm outcome.
//   wary    — set on the neutral/partial exit line's consequences (the default;
//             he stays suspicious but holds his hand). The middle outcome.
//   hostile — set on a SEPARATE, deliberate confrontational option's consequences
//             (the player CHOOSES to push him over the edge). Trips the ambush.
//
// RETRY-FRIENDLY DISCIPLINE (Act I LORIEN incident, npcs.ts L193-200; D-08):
// the persuasion check is a beat, NOT a gate. onFail: [] (NEVER hostile), the
// failReply invites another attempt, and the check carries NO `once`. A FAILED
// roll never sets jarek_stance and never turns him hostile — hostility is ONLY
// reachable via the explicit confrontational option below. This honors the
// "no looping hostility-on-fail check" rule: the dice never force a fight.
//
// AMBUSH MECHANISM (engine read, Plan 04-02 Task 1; D-08): the hostile option
// sets jarek_stance='hostile' + an ambush NARRATIVE only — it does NOT fire a
// spawn_enemy (a dialogue spawn_enemy adds a stray pos-(5,5) entity that never
// starts initiative and whose synthetic id can't be a clear-rule target). The
// ambush troopers are ROOM-PLACED in valerion_ball_room (roomsAct2.ts) with named
// ids the jarek_ambush_clear rule (rulesAct2.ts) keys on; attacking one starts
// combat the normal PC-attack way. The hostile narrative is the cue that the
// already-present Subverted troopers draw their blades.
//
// Cameo stat block (Claude's Discretion, D-07): an inquisitor with a personal
// guard's heft — NOT a pushover, but not a boss. He himself is not the ambush
// (the named room troopers are); his block is the cameo-combat fallback.
export const JAREK: CampaignRoomNpc = {
  id: 'npc_jarek',
  name: 'High Inquisitor Jarek',
  attitude: 'friendly',
  icon: 'pointy-hat',
  hp: 39,
  ac: 16,
  damage: '1d8+2',
  toHit: 5,
  xp: 0,
  greeting: [
    'A tall man in Malgovian inquisitor’s black detaches himself from the dancers, ' +
      'a silver plague-ward glinting at his throat. He does not bow. "The frontier ' +
      'Justiciars. I am told you carry star-metal into a ballroom full of clean ' +
      'people. You will forgive me if I do not applaud."',
  ],
  firstGreeting: [
    'The music thins as a man in inquisitor’s black crosses the floor toward you, ' +
      'and the dancers part for him the way a crowd parts from a held torch. A ' +
      'silver ward hangs at his throat, etched against the arcane plague his order ' +
      'was raised to burn. "High Inquisitor Jarek," he says, without warmth. "I ' +
      'make it my business to know what walks into a room. And what walked into ' +
      'this one is listening to a frequency that has killed cities. Convince me, ' +
      'Justiciars, that I should let you keep breathing the same air as these ' +
      'people — or do not, and we will resolve it another way."',
  ],
  goodbye: [
    'Jarek watches you go without blinking, one hand never far from the ward at his throat.',
  ],
  responses: [
    // 1. The negotiation — a retry-friendly persuasion check → jarek_stance=allied.
    // CHA-only union (NEVER arcana/investigation — those would silently roll off
    // Charisma, RESEARCH Anti-Pattern). onFail: [] (no hostility, no flag set), NO
    // `once`, failReply invites a retry. SRD: Ability Checks — DC 15 (a hard sell:
    // talking a plague-inquisitor off his fear).
    {
      id: 'jarek_reassure',
      label: 'Make the case that the star-metal is the cure’s key, not the contagion.',
      say:
        'Inquisitor — we did not bring a plague into your ball. We brought the thing ' +
        'that reads where the plague comes FROM. Burn us, and you burn the only map ' +
        'to the source. Hear me out, fully, before you decide what we are.',
      check: {
        skill: 'persuasion',
        dc: 15,
        successReply:
          'Jarek listens — truly listens, the way few of his order ever do — and the ' +
          'hand at his ward slowly lowers. "...A map to the source," he says at last. ' +
          '"Not carriers. Cartographers. I have hunted this thing for eleven years and ' +
          'never once been offered its address." A thin, dangerous smile. "Very well. ' +
          'You have an inquisitor’s ear, and his reach. Use them well — I will know if ' +
          'you waste them."',
        failReply:
          'Jarek’s jaw tightens, but his hand stays at his side. "No. That is the ' +
          'sound of clever people explaining a corpse. I am not yet convinced — but I ' +
          'am not yet decided against you, either. Try again, Justiciars. Make me ' +
          'believe it. My patience is longer than my mercy."',
        onSuccess: [{ type: 'set_flag', key: 'jarek_stance', value: 'allied' }],
        // No hostility, no flag, on a failed roll — the dice never force the issue
        // (LORIEN idiom). Hostility is the explicit option below, never this check.
        onFail: [],
      },
    },
    // 2. The neutral/partial exit → jarek_stance='wary' (the default; D-07). A
    // childless leaf: it plays its reply, sets the flag, and leaves the menu. The
    // party can walk away without convincing OR provoking him — he simply keeps a
    // cold eye on them. Safe to take at any time; sets wary so the Phase-5 ending
    // has a middle outcome even for a party that never rolled the check.
    {
      id: 'jarek_demur',
      label: 'Decline to argue it out — let him keep his suspicions, and go.',
      say:
        'We won’t talk circles under your chandeliers, Inquisitor. Believe what you ' +
        'like of us. We have work below this city, and it will not wait on your ward.',
      reply:
        'Jarek inclines his head a precise degree, granting nothing. "Then we ' +
        'understand each other imperfectly, which is the heartland’s native ' +
        'condition. Go about your work, Justiciars. I will be watching it — and you ' +
        '— with the particular attention I reserve for things I have not yet decided ' +
        'to burn."',
      consequences: [{ type: 'set_flag', key: 'jarek_stance', value: 'wary' }],
    },
    // 3. The SEPARATE confrontational path → jarek_stance='hostile' + ambush
    // narrative (D-08). This is a DELIBERATE player choice, not a punished roll —
    // it sets hostile and cues the already-room-placed Subverted troopers to draw.
    // NO spawn_enemy (engine read, Task 1): the ambush is the room's `enemies`,
    // attackable the normal way; this beat only sets the flag and tells the player
    // the trap has sprung. Hidden behind no condition so it is always an available
    // path, but it is its own option — a failed jarek_reassure never lands here.
    {
      id: 'jarek_provoke',
      label: 'Call his crusade what it is — a butcher’s fear in a holy collar.',
      say:
        'Eleven years of burning the sick to feel clean, Inquisitor? That isn’t an ' +
        'inquisition. It’s a frightened man with a torch and a title. We’ll find the ' +
        'source with or without your blessing — and the bodies on your ledger are ' +
        'yours, not the plague’s.',
      reply:
        'For one heartbeat Jarek does not move. Then he lifts two fingers, almost ' +
        'gently — and across the ballroom the music dies as the liveried "servants" ' +
        'set down their trays and draw steel from beneath them. "You mistake fear ' +
        'for cowardice," he says, very quietly, backing into the crowd as his ' +
        'Subverted close in around you. "It is the only sane response to what you ' +
        'carry. Take them — and mind the chandeliers."',
      consequences: [
        { type: 'set_flag', key: 'jarek_stance', value: 'hostile' },
        {
          type: 'add_narrative',
          text:
            'The dancers scatter screaming for the doors. The trap was always set — ' +
            'Jarek’s troopers were among the guests the whole time. Steel is out under ' +
            'the chandeliers, and the only way past it is through.',
        },
      ],
    },
    // ── BR-02: Jarek's silverford_outcome carry read (truce/war siblings) ──────
    // The war the party left in the Sunder-Carr feeds the Malgovian inquisitor's
    // arcane-plague paranoia — a frontier in flames is, to him, a frontier where
    // the plague spreads unwatched. Pure flavor: NO consequences, no jarek_stance
    // write, no faction effect (D-08/D-09 — flavor-only, BR-02). silverford_outcome
    // is READ, never written. These are available whatever his stance: tone, not
    // a gate. The war leaf is the load-bearing one (the Phase-5 spec asserts it);
    // the truce sibling keeps the carry-echo symmetric.
    {
      id: 'jarek_silverford_truce',
      label: 'Tell the Inquisitor the Sunder-Carr stands down — a truce, not a fire.',
      condition: {
        fact: 'flags',
        path: '$.silverford_outcome',
        operator: 'equal',
        value: 'truce',
      },
      say: 'For what it’s worth, Inquisitor — the frontier we came from holds. We left a truce, not a pyre.',
      reply:
        'Jarek’s eyes narrow a fraction. "A truce. So the Sunder-Carr is quiet, and ' +
        'watched, and counting its own. Good. The plague loves a battlefield — all ' +
        'those bodies, no one to burn them clean, the sickness walking out of the ' +
        'dead before the carrion birds do. You did my order a service and never knew ' +
        'it. A quiet frontier is one I do not have to set alight myself. See that it ' +
        'stays quiet."',
    },
    {
      id: 'jarek_silverford_war',
      label: 'Tell the Inquisitor the Sunder-Carr is burning — a war the party could not stop.',
      condition: {
        fact: 'flags',
        path: '$.silverford_outcome',
        operator: 'equal',
        value: 'war',
      },
      say: 'For what it’s worth, Inquisitor — the frontier we came from is at war. Silverford burned.',
      reply:
        'Something cold and certain settles over Jarek’s face. "Then it is already ' +
        'too late for that ground, and you have only confirmed what my order has ' +
        'always known: where men make war, the plague makes harvest. A battlefield is ' +
        'a thousand open doors, Justiciars, and no one to bar a single one. If your ' +
        'star-metal truly reads the source, you had best read it fast — because every ' +
        'corpse in the Sunder-Carr tonight is a candle I cannot reach to snuff."',
    },
  ],
};
