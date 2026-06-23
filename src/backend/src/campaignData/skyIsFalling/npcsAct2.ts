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
  ],
};
