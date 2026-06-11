// Act I NPCs — authored as CampaignRoomNpc objects and embedded into their
// rooms (npcs live inside rooms; see rooms.ts). Dialogue uses label (button) /
// say (spoken line) / reply (NPC) / condition (hidden gate) / check (CHA social
// roll) / consequences. Root-level options behave as a hub: a childless leaf
// plays its reply and leaves the menu in place, so each spine NPC is a small
// "ask about…" board the player works through.
//
// Flag vocabulary written/read here (the Act I evidence + clock):
//   heard_vargis     — took the Case File #107 briefing (quest step s_brief)
//   clue_thirdparty  — proof a third party is involved (Lorien intel OR the
//                      causeway insignia object); gates the diplomacy branch
//   vargis_ally      — Vargis privately admits his men have turned (persuasion)
//   vane_delay       — bought the Valerion line a few hours' delay (intimidation)
//   martha_hint      — Martha "reads" the shard's frequency (Act II thread)
//   store_cleared    — Halda's stockroom rats are dead; the shop opens
//   time_blocks      — the 24h clock (counts up; war at >= 6). Interrogations
//                      cost a block (adjust_flag +1 on the check's success).

import type { CampaignRoomNpc } from '../../services/campaignContent.js';

// ── Commander Vargis — the compromised zealot · garrison_hall_room ──────────
export const VARGIS: CampaignRoomNpc = {
  id: 'npc_vargis',
  name: 'Commander Vargis',
  // Friendly so talking opens straight on the greeting (no CHA gate) — he WANTS
  // the Gavel's help. His wariness lives in the dialogue, not a dice wall.
  attitude: 'friendly',
  icon: 'orc-head',
  hp: 52,
  ac: 18,
  damage: '1d8+3',
  toHit: 6,
  xp: 0,
  greeting: [
    'A towering orc in scarred Malgovian iron looks up from a field map, eyes ' +
      'ringed with exhaustion. "Justiciars. Good. Maybe the Gavel can stop this ' +
      'before my men and Vane’s gut each other over a corpse-pile."',
  ],
  firstGreeting: [
    'The garrison hall stinks of lamp-oil and wet armor. Commander Vargis — an ' +
      'orc the size of a door — plants both fists on the map table. "You’re the ' +
      'circuit court’s pair. You have until the Valerion line moves. Less, if ' +
      'Vane loses his temper. Ask."',
  ],
  goodbye: ['"Make it fast, Justiciar. The clock is the enemy here."'],
  responses: [
    {
      id: 'ask_brief',
      label: 'Open Case File #107 — what happened at Miller’s Thicket?',
      say: 'Walk us through it, Commander. From the top.',
      reply:
        'Vargis drags a soot-stained ledger across the map. "Logging village. ' +
        'Forty souls. Gone in a night — burned so hot the ground turned to glass. ' +
        'My scouts found a relic-vault cracked open nearby, empty. Valerion says ' +
        'we did it. We didn’t. Find me proof of that before the horns sound."',
      consequences: [{ type: 'set_flag', key: 'heard_vargis', value: true }],
    },
    {
      id: 'ask_troops',
      label: 'Present the third-party evidence — your own men have been turned.',
      say:
        'Commander. This insignia came off one of your troopers. He wasn’t taking ' +
        'orders from you anymore.',
      // Hidden until the party actually holds third-party proof.
      condition: { fact: 'flags', path: '$.clue_thirdparty', operator: 'equal', value: true },
      check: {
        skill: 'persuasion',
        dc: 14,
        successReply:
          'Vargis is silent a long moment. "...Three of mine have gone strange. ' +
          'Cold. I told myself it was the war-nerves." He exhales like a bellows. ' +
          '"All right. The garrison stands down. Bring this to Vane and I’ll back ' +
          'your word."',
        failReply:
          '"You accuse my garrison of treason on a scrap of tin?" His jaw sets. ' +
          '"Bring me something I can’t wave away."',
        onSuccess: [
          { type: 'set_flag', key: 'vargis_ally', value: true },
          { type: 'set_faction_rep', factionId: 'malgovia', delta: 15 },
          { type: 'adjust_flag', key: 'time_blocks', delta: 1 },
        ],
        onFail: [{ type: 'set_faction_rep', factionId: 'malgovia', delta: -5 }],
      },
    },
    {
      id: 'ask_clock',
      label: 'How long do we really have?',
      say: 'Be honest with us, Commander. When do the horns sound?',
      reply:
        '"Vane’s heavy horse is a half-day out and his patience is shorter. ' +
        'Every hour you spend slogging the Sunder-Carr is an hour closer to the ' +
        'first arrow. Choose your steps." He taps the marsh on the map.',
    },
  ],
};

// ── Commander Lucian Vane — the aristocratic vanguard · vane_command ────────
export const VANE: CampaignRoomNpc = {
  id: 'npc_vane',
  name: 'Commander Lucian Vane',
  // Friendly = no CHA gate to open dialogue; his contempt is all in the prose.
  attitude: 'friendly',
  icon: 'knight-helmet',
  hp: 52,
  ac: 18,
  damage: '1d8+3',
  toHit: 6,
  xp: 0,
  greeting: [
    'Lucian Vane does not rise. Silver plate, every buckle aligned, a face ' +
      'composed into polite contempt. "The Gavel’s errand-boys. One who threw ' +
      'away his name, and one who never had much of one. Say your piece quickly."',
  ],
  goodbye: ['Vane has already turned back to his maps.'],
  responses: [
    {
      id: 'appeal_honor',
      label: 'Buy time — hold the Valerion advance.',
      say:
        'Commander Vane. Move on Silverford today and you march your house into a ' +
        'massacre someone else arranged. Hold the line. Give us the hours.',
      // Only worth attempting once the party has real evidence in hand.
      condition: { fact: 'flags', path: '$.clue_thirdparty', operator: 'equal', value: true },
      check: {
        skill: 'intimidation',
        dc: 15,
        successReply:
          'Vane’s composure thins. "...The court will hear that I showed restraint. ' +
          'Not mercy — restraint." He raises one gauntleted finger. "You have until ' +
          'dusk. Waste it and I will not be so reasonable."',
        failReply:
          '"Restraint is for those who can afford it. I have a name to restore — ' +
          'thanks in no small part to your partner." He smiles thinly. "We march."',
        onSuccess: [
          { type: 'set_flag', key: 'vane_delay', value: true },
          { type: 'adjust_flag', key: 'time_blocks', delta: 1 },
        ],
        onFail: [{ type: 'set_faction_rep', factionId: 'valerion', delta: -5 }],
      },
    },
    {
      id: 'demand_access',
      label: 'Invoke Lex Supra Regna — demand unescorted access to the Thicket.',
      say: 'The Law is above kingdoms, Commander. We search the Thicket. Your men stand aside.',
      once: true,
      reply:
        'Vane’s lip curls, but the Gavel signet is the Gavel signet. "Tramp through ' +
        'the bog, then. My line does not move for your convenience — and it does ' +
        'not move against you. Yet."',
    },
  ],
};

// ── Lorien — the cynical outcast broker · lorien_den_room ───────────────────
export const LORIEN: CampaignRoomNpc = {
  id: 'npc_lorien',
  name: 'Lorien',
  proper_noun: true,
  // Friendly = talkable without a CHA gate; his distrust is in the lines (and a
  // failed Deception on `pry_intel` still sours him to hostile).
  attitude: 'friendly',
  icon: 'hood',
  hp: 27,
  ac: 14,
  damage: '1d6+2',
  toHit: 5,
  xp: 0,
  greeting: [
    'An ancient elf reclines amid crates that smell of brine and gun-oil, ' +
      'turning a coin over his knuckles. "Two Gavel hounds in my parlor. I hate ' +
      'both your empires equally, if that earns any trust. Probably not."',
  ],
  responses: [
    {
      id: 'pry_intel',
      label: 'Lean on him — who’s been buying star-metal scrap?',
      say:
        'You move scrap through this swamp, Lorien. Someone’s been buying cold, ' +
        'non-magnetic "star-metal." Names. Now.',
      // The hub path to clue_thirdparty (so the evidence isn't single-threaded
      // against the causeway). A clean Deception read gets it without coin.
      check: {
        skill: 'deception',
        dc: 13,
        successReply:
          'Lorien’s coin stops. "...Fine. Someone with deep Valerion pockets has ' +
          'been buying the ugly grey scrap — the kind that drinks a cantrip dead. ' +
          'Same buyer who’s been paying soldiers to look the other way. That’s not ' +
          'a border raid. That’s a third hand at the table."',
        failReply:
          'He laughs. "Nice try. I’ve lied to better than you for three centuries. ' +
          'Come back when you’re holding something I can’t talk my way around."',
        onSuccess: [{ type: 'set_flag', key: 'clue_thirdparty', value: true }],
        onFail: [{ type: 'set_npc_attitude', npcId: 'npc_lorien', attitude: 'hostile' }],
      },
    },
    {
      id: 'lorien_rumors',
      label: 'Buy a rumor about the marsh.',
      say: 'What does the swamp say, broker?',
      reply:
        '"The peat’s been coughing up lights that don’t flicker like marsh-gas — ' +
        'they hunt. And the old giant tomb-mound past the ash-pit? Something down ' +
        'there is humming. Mind your casters near it."',
    },
    {
      id: 'lorien_favor',
      label: 'Ask if there’s work — goodwill is currency too.',
      say: 'We could use a friend in this swamp, Lorien. Anything you need quietly done?',
      condition: { fact: 'flags', path: '$.found_crate', operator: 'notEqual', value: true },
      once: true,
      reply:
        '"A rival ‘misplaced’ a crate of mine here in the den — back behind the ' +
        'brine barrels. Fetch it before he does and I’ll remember it. I’m a ' +
        'better friend than I look."',
      consequences: [{ type: 'start_quest', questId: 'q_lorien_favor' }],
    },
  ],
};

// ── Sister Martha — the relic keeper cameo · vault_room ─────────────────────
export const MARTHA: CampaignRoomNpc = {
  id: 'npc_martha',
  name: 'Sister Martha',
  attitude: 'friendly',
  icon: 'blindfold',
  hp: 9,
  ac: 10,
  damage: '1d4',
  toHit: 2,
  xp: 0,
  greeting: [
    'A blind, elderly woman sits among the vault’s reliquaries, fingertips ' +
      'resting on a velvet cloth. "Step closer, children. My eyes are gone but my ' +
      'hands still hear the old things sing."',
  ],
  responses: [
    {
      id: 'show_shard',
      label: 'Let Sister Martha touch the Chrono-Shard.',
      say: 'Sister — tell us what you make of this. We pulled it from the tomb-mound.',
      // Only when the shard is actually in the party's hands.
      condition: { fact: 'party_items', operator: 'contains', value: 'chrono_shard' },
      once: true,
      reply:
        'Her fingers find the shard and recoil. "Oh. Oh, this one does not sing — ' +
        'it *listens*. The holy relics in this vault, child... they all listen, on ' +
        'the same cold frequency. I have wondered, all these years, who is meant to ' +
        'be hearing." She presses it back into Julian’s hand. "These are not sacred. ' +
        'They are an ear pressed to the sky."',
      consequences: [{ type: 'set_flag', key: 'martha_hint', value: true }],
    },
  ],
};

// ── Halda Bremmer — the storekeeper (combat venue → merchant) · store_room ──
// Starts indifferent and cowering behind the counter while giant rats overrun
// her stockroom (the room seeds the rats). enter_shop requires a FRIENDLY NPC,
// so the shop stays shut until the rat-clear rule flips her to friendly +
// sets store_cleared (see rules.ts). Stock resolves from the SRD item catalog.
export const HALDA: CampaignRoomNpc = {
  id: 'npc_storekeeper',
  name: 'Halda Bremmer',
  attitude: 'indifferent',
  icon: 'shopping-bag',
  hp: 9,
  ac: 11,
  damage: '1d4',
  toHit: 2,
  xp: 0,
  shopGold: 200,
  shop: [
    { itemId: 'healing_potion', price: 50, qty: 5 },
    { itemId: 'torch', price: 1, qty: 20 },
    { itemId: 'hooded_lantern', price: 5, qty: 2 },
    { itemId: 'rope_hempen', price: 1, qty: 5 },
    { itemId: 'rations', price: 2, qty: 10 },
    { itemId: 'antitoxin', price: 50, qty: 3 },
    { itemId: 'arrows', price: 1, qty: 10 },
  ],
  greeting: [
    'A stout woman is wedged behind an overturned counter, brandishing a broom. ' +
      '"Don’t mind the squealing! Stockroom’s gone to the rats — giant ones, ' +
      'fast ones. I’ll not sell a pin till they’re dead. Clear ’em and the shop’s ' +
      'yours, frontier prices and all."',
  ],
  firstGreeting: [
    'Something the size of a dog skitters across the floorboards. From behind a ' +
      'barricade of crates, Halda Bremmer jabs a broom at the dark. "Oh, thank the ' +
      'Saints — armed folk! My stockroom’s a nest of giant rats and I’m no fighter. ' +
      'Put them down and I’ll open the shop to you. Word of a Bremmer."',
  ],
  responses: [
    {
      id: 'accept_rats',
      label: 'Take the job — clear the rats.',
      say: 'Stay behind the counter, Halda. We’ll handle the vermin.',
      condition: { fact: 'flags', path: '$.store_cleared', operator: 'notEqual', value: true },
      reply: '"Bless you. Mind the big one in the flour sacks — it’s got a temper."',
      consequences: [{ type: 'start_quest', questId: 'q_store_rats' }],
    },
    {
      id: 'halda_thanks',
      label: 'Ask after the shop.',
      say: 'Rats are dead, Halda. About those frontier prices…',
      // Only surfaces once the stockroom is clear.
      condition: { fact: 'flags', path: '$.store_cleared', operator: 'equal', value: true },
      reply:
        '"A Bremmer keeps her word. Everything’s yours at the friendly rate — and ' +
        'take this, on the house." She presses a healing draught into your hands. ' +
        '"Now. What do you need?"',
      once: true,
      consequences: [
        { type: 'set_flag', key: 'halda_grateful', value: true },
        { type: 'give_item', itemId: 'healing_potion' },
      ],
    },
  ],
};

// ── Dockside side-quest givers · docks_room ─────────────────────────────────
export const DOCKHAND: CampaignRoomNpc = {
  id: 'npc_dockhand',
  name: 'Old Pell',
  proper_noun: true,
  attitude: 'friendly',
  icon: 'fishing-pole',
  hp: 9,
  ac: 10,
  damage: '1d4',
  toHit: 2,
  xp: 0,
  greeting: [
    'A weathered dockhand mends a net with shaking hands. "You’re the law, aye? ' +
      'Got no coin for the law. But if you’re crossing the Drowned Causeway ' +
      'anyhow…"',
  ],
  responses: [
    {
      id: 'lost_locket',
      label: 'Hear him out.',
      say: 'We’re headed that way. What is it?',
      once: true,
      reply:
        '"My mother’s locket went off the causeway when the planks gave. Silver, ' +
        'a heron on the front. If you spot it in the muck… it’s all I’ve left of ' +
        'her." He looks away. "I’d be in your debt. So would she, were she here."',
      consequences: [{ type: 'start_quest', questId: 'q_lost_locket' }],
    },
    {
      id: 'tall_tales',
      label: 'Trade rumors over a drink.',
      say: 'Buy you a cup, Pell? For the local color.',
      once: true,
      reply:
        '"Heh — the law buys a round! Then hear this: the Thicket didn’t burn like ' +
        'lamp-oil. Burned *clean*. No raider sets a fire that tidy. And the soldiers ' +
        'poking the bog lately don’t blink enough. Make of it what you will."',
      consequences: [{ type: 'set_flag', key: 'heard_tales', value: true }],
    },
  ],
};

export const LOGGER_WIFE: CampaignRoomNpc = {
  id: 'npc_logger_wife',
  name: 'Bree Hollin',
  proper_noun: true,
  attitude: 'friendly',
  icon: 'person',
  hp: 9,
  ac: 10,
  damage: '1d4',
  toHit: 2,
  xp: 0,
  greeting: [
    'A young woman grips the dock rail, knuckles white. "You’re going to the ' +
      'Thicket, aren’t you. My husband logged there. Nobody will tell me what ' +
      'they found. Please — when you go… learn what happened to him."',
  ],
  responses: [
    {
      id: 'missing_logger',
      label: 'Promise to learn her husband’s fate.',
      say: 'We’ll find out what happened to him. You have my word.',
      once: true,
      reply:
        '"His name is Tomas. He carved a heron into the haft of his axe — like the ' +
        'one on Pell’s locket; they were close." Her voice steadies. "Bring me the ' +
        'truth. Even if it’s the hard kind."',
      consequences: [{ type: 'start_quest', questId: 'q_missing_logger' }],
    },
  ],
};
