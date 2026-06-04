import type { Context, Faction, GameRule, Quest } from '../../types.js';

export const narratives: Context['narratives'] = {
  roomArrival: {
    // Opening frame only — the party begins on the regional grid (see
    // initMapState), so this describes the vale map, not a room.
    millhaven_square: [
      "The Old Road brings you to the edge of Malgovia. Millhaven's lantern-lit walls stand to the east; the wooded hills past it hide the bandit camp and the Shattered Crypt. Your map of the vale lies open before you.",
    ],
    dungeon_crypt_entrance: [
      'Mossy steps lead down into the Shattered Crypt. Cold air breathes from the darkness below.',
      'The iron doors of the crypt hang ajar, groaning softly. Torchlight flickers from within.',
    ],
    dungeon_crypt_exit: [
      'A shaft of pale light falls from above — the entrance to the crypt, and freedom beyond.',
    ],
  },
  genericArrival: [
    'The shadows shift as you enter.',
    'Dust motes drift in the pale torchlight.',
    'Something skitters in the darkness.',
    'An eerie silence greets you.',
  ],
  weaponVerbs: {
    longsword: ['cleaves', 'slashes', 'cuts'],
    shortsword: ['thrusts', 'stabs', 'jabs'],
    rapier: ['pierces', 'lunges', 'skewers'],
    mace: ['smashes', 'bludgeons', 'cracks'],
    quarterstaff: ['strikes', 'sweeps', 'clubs'],
    longbow: ['pins', 'skewers', 'pierces'],
    unarmed: ['punches', 'strikes', 'slams'],
  },
  classStyle: {
    Fighter: [
      'with disciplined precision',
      'using superior technique',
      'exploiting a gap in their guard',
    ],
    Rogue: ['from the shadows', 'finding the weak point', 'with practiced ease'],
    Wizard: ['channeling arcane energy through the strike', 'with focused concentration'],
    Cleric: ['invoking divine strength', 'guided by faith'],
    Ranger: ["with ranger's instinct", "reading the enemy's stance"],
    Paladin: ['with holy conviction', 'driven by sacred oath'],
    Bard: ['with unexpected flair', "using the enemy's own momentum"],
  },
  enemyReactions: {
    'Skeleton Warrior': [
      'Its bones rattle with the impact.',
      'Ancient dust shakes from its frame.',
      'It staggers but keeps fighting.',
    ],
    'Crypt Ghoul': [
      'It shrieks with unnatural fury.',
      'The wound steams with cold ichor.',
      'It snaps its jaws in pain.',
    ],
    Shadow: [
      'It writhes and contracts.',
      'The darkness disperses briefly.',
      'A hollow wail echoes.',
    ],
    'Bandit Ruffian': [
      'It curses under its breath.',
      'Blood soaks its tunic.',
      'It stumbles back a step.',
    ],
    'Crypt Lord': [
      'THAT is merely an annoyance to me.',
      'The lich king laughs — a sound like cracking ice.',
      'Ancient power radiates from its wounds.',
    ],
  },
  deathSaveStatus: {
    1: ['You cling to life by a thread.', 'Darkness crowds the edges of your vision.'],
    2: ['Death whispers your name.', 'The world grows very cold.'],
    3: ['You are beyond help now.'],
  },
  combatHit: {
    healthy: [
      'With fluid confidence, {enemy} reels from the blow.',
      'Your attack connects cleanly — {enemy} staggers.',
      'A solid strike lands on {enemy}.',
    ],
    hurt: [
      'Despite your wounds, you land a telling blow on {enemy}.',
      'Gritting through the pain, your attack finds {enemy}.',
      'Desperate and determined, your strike connects with {enemy}.',
    ],
    critical: [
      'Barely standing, you somehow find the strength to strike {enemy}.',
      'On sheer will alone, your blow hammers {enemy}.',
    ],
  },
  combatMiss: {
    healthy: [
      "Your strike glances off {enemy}'s guard.",
      '{enemy} sidesteps neatly.',
      'Your blow goes wide.',
    ],
    hurt: [
      'Pain throws off your aim — {enemy} avoids it.',
      'Your wounded arm betrays you; {enemy} steps aside.',
    ],
    critical: [
      'You can barely lift your weapon — the attack fails entirely.',
      '{enemy} brushes aside your feeble attempt.',
    ],
  },
  enemyAttacks: ['The {enemy} attacks!', '{enemy} strikes at you!', '{enemy} presses the assault!'],
  killShot: [
    '{enemy} collapses, broken and still.',
    '{enemy} falls — the threat is ended.',
    'With a final blow, {enemy} is destroyed.',
  ],
  lootPickedUp: [
    'You pocket the {item}.',
    'The {item} joins your inventory.',
    'You take the {item}.',
  ],
  noLoot: ['There is nothing of value here.', 'The area has already been stripped clean.'],
  alreadyLooted: ['You have already taken what was here.'],
  noEnemy: ['There is no enemy here to fight.', 'The area is clear.'],
  alreadyDead: ['That foe is already defeated.'],
  sneakSuccess: [
    'You slip into the shadows undetected.',
    'Moving like a ghost, you disappear from sight.',
  ],
  deathLines: ['{name} falls, life fading...', '{name} collapses — not long now...'],
  enemyDeflected: [
    "{enemy}'s blow glances off your armor.",
    '{enemy} attacks but finds no opening.',
    "You turn aside {enemy}'s strike.",
  ],
  levelUp: [
    'Your trials have made you stronger — you have reached level {level}!',
    'Experience crystallizes into power — you advance to level {level}!',
  ],
  combatStart: [
    '{enemy} bars your path — initiative is drawn!',
    'Combat begins! {enemy} readies for battle.',
  ],
  shortRest: ['You tend your wounds and catch your breath.'],
  longRest: ['The party makes camp and rests through the night.'],
};

export const quests: Quest[] = [
  {
    id: 'quest_arrival',
    title: 'The Road to Pinegate',
    desc: "Months on the road have left the party restless, and the pine-dark hills of Malgovia finally rise ahead. Word on the road said the village of Pinegate, at the vale's southern edge, needs capable hands — and where there's trouble, there's coin. Make your way to Pinegate.",
    startActive: true, // the opening quest — frames the party's arrival in the vale
    // No giver: it's the prologue. Completes the moment the party reaches Pinegate
    // town, where Old Elise has the first real job (the Silent Grove).
    steps: [
      {
        id: 'step_reach_pinegate',
        desc: 'Travel to the village of Pinegate.',
        condition: {
          all: [{ fact: 'current_town_id', operator: 'equal', value: 'pinegate_town' }],
        },
      },
    ],
    rewards: [
      { type: 'give_xp', amount: 50 },
      {
        type: 'add_narrative',
        text: "Pinegate's lanterns flicker a wary welcome. By the well, an old woman watches you approach — she has the look of someone with a problem worth coin.",
      },
    ],
  },
  {
    id: 'quest_shipment',
    title: 'The Missing Shipment',
    desc: "The Merchant Guild's supply wagons vanished on the Old Road. Find the Guild Ledger in the crypt and return it to Aldric.",
    // Mid-tier arc — discovered by visiting Millhaven after the beginner grove.
    giverNpcId: 'npc_aldric',
    factionId: 'faction_guild',
    repGain: 20,
    steps: [
      {
        id: 'step_talk_aldric',
        desc: 'Speak with Aldric the Merchant to learn about the missing shipment.',
        // Scoped to Aldric's room so a talk_response in any other room
        // doesn't auto-accept this quest under the new auto-acceptance
        // model. The any-of inside still matches both the new
        // talk_response path and the legacy accept_quest action.
        condition: {
          all: [
            { fact: 'room_id', operator: 'equal', value: 'millhaven_market' },
            {
              any: [
                { fact: 'action', operator: 'equal', value: 'talk_response' },
                { fact: 'action', operator: 'equal', value: 'accept_quest' },
              ],
            },
          ],
        },
      },
      {
        id: 'step_find_ledger',
        desc: 'Find the Guild Ledger in the Shattered Crypt.',
        condition: {
          all: [{ fact: 'loot_taken', operator: 'contains', value: 'guild_ledger' }],
        },
      },
      {
        id: 'step_return_ledger',
        desc: 'Return the ledger to Aldric in the Merchant District.',
        // Completes when the party is back in Aldric's venue room with the ledger.
        condition: {
          all: [
            { fact: 'loot_taken', operator: 'contains', value: 'guild_ledger' },
            { fact: 'room_id', operator: 'equal', value: 'millhaven_market' },
          ],
        },
      },
    ],
    rewards: [
      {
        type: 'add_narrative',
        text: 'Aldric leafs through the waterlogged pages. "This is it — proof the wagons were never delivered." He presses a purse into your hand and marks the Guild\'s books with your name.',
      },
      { type: 'consume_item', itemId: 'guild_ledger' },
      { type: 'give_gold', amount: 150 },
      { type: 'give_xp', amount: 300 },
      // Faction rep is bumped by the quest's `repGain` field above;
      // we surface a narrative line in route/game.ts when that fires.
    ],
  },
  {
    id: 'quest_crypt',
    title: 'Beneath the Surface',
    desc: 'Sister Maren of the Temple of Selûne needs the Crypt Lord destroyed and the Moonstone Amulet recovered.',
    giverNpcId: 'npc_sister_maren',
    // No faction reward — the Temple of Selûne isn't a tracked faction
    // (only the Merchant Guild + City Watch are). Previously mis-tagged to
    // faction_guild with repGain 0 (inert).
    steps: [
      {
        id: 'step_learn_crypt',
        desc: 'Learn about the threat in the Shattered Crypt from Sister Maren.',
        condition: {
          all: [
            { fact: 'room_id', operator: 'equal', value: 'millhaven_temple' },
            {
              any: [
                { fact: 'action', operator: 'equal', value: 'talk_response' },
                { fact: 'action', operator: 'equal', value: 'accept_quest' },
              ],
            },
          ],
        },
      },
      {
        id: 'step_kill_lord',
        desc: 'Defeat the Crypt Lord in the Throne of the Dead.',
        condition: {
          all: [
            {
              fact: 'enemies_killed',
              operator: 'contains',
              value: 'dungeon_crypt_throne#0',
            },
          ],
        },
      },
      {
        id: 'step_recover_amulet',
        desc: 'Recover the Moonstone Amulet from the crypt.',
        condition: {
          all: [{ fact: 'loot_taken', operator: 'contains', value: 'moonstone_amulet' }],
        },
      },
    ],
    rewards: [
      { type: 'give_gold', amount: 200 },
      { type: 'give_xp', amount: 1500 },
      { type: 'modify_hp', amount: 20 },
      {
        type: 'add_narrative',
        text: 'Sister Maren places her hands on your shoulders and speaks a blessing of Selûne. You feel wounds close and strength return.',
      },
    ],
  },
  {
    id: 'quest_shadow',
    title: 'Shadow Dealings',
    desc: 'Dusk in the Lantern District has evidence that Captain Vane is corrupt. Find the incriminating letter in the garrison strongbox.',
    giverNpcId: 'npc_dusk',
    factionId: 'faction_watch',
    repGain: -10,
    steps: [
      {
        id: 'step_meet_dusk',
        desc: 'Meet Dusk in the Lantern District.',
        condition: {
          all: [
            { fact: 'room_id', operator: 'equal', value: 'millhaven_lantern' },
            {
              any: [
                { fact: 'action', operator: 'equal', value: 'talk_response' },
                { fact: 'action', operator: 'equal', value: 'accept_quest' },
              ],
            },
          ],
        },
      },
      {
        id: 'step_find_letter',
        desc: 'Retrieve the incriminating letter from the garrison.',
        condition: {
          all: [{ fact: 'loot_taken', operator: 'contains', value: 'shadow_evidence' }],
        },
      },
      {
        id: 'step_deliver_letter',
        desc: 'Deliver the letter to Dusk.',
        condition: {
          all: [
            { fact: 'loot_taken', operator: 'contains', value: 'shadow_evidence' },
            { fact: 'room_id', operator: 'equal', value: 'millhaven_lantern' },
          ],
        },
      },
    ],
    rewards: [
      { type: 'give_gold', amount: 75 },
      { type: 'give_xp', amount: 200 },
      // Faction rep penalty is applied via `repGain: -10` above;
      // route surfaces the narrative line. Don't duplicate via a
      // set_faction_rep reward (would double-count).
      {
        type: 'add_narrative',
        text: 'Dusk takes the letter with a tight smile. "Captain Vane\'s days are numbered. You\'ve made some useful friends today."',
      },
    ],
  },

  // ── Whispering Pines (folded) ────────────────────────────────────────────
  {
    id: 'quest_trapper',
    title: 'The Missing Trapper',
    desc: 'Old Halden the trapper has been missing three days. Innkeeper Brann wants him back — or proof of his fate. His silver locket should be enough.',
    giverNpcId: 'npc_brann',
    factionId: 'faction_wardens',
    repGain: 10,
    steps: [
      {
        id: 'step_talk_brann',
        desc: 'Speak with Innkeeper Brann about the missing trapper.',
        condition: {
          all: [
            { fact: 'room_id', operator: 'equal', value: 'pines_tavern' },
            {
              any: [
                { fact: 'action', operator: 'equal', value: 'talk_response' },
                { fact: 'action', operator: 'equal', value: 'accept_quest' },
              ],
            },
          ],
        },
      },
      {
        id: 'step_find_locket',
        desc: "Find Halden's locket in the Iceshard Spire.",
        condition: {
          all: [{ fact: 'loot_taken', operator: 'contains', value: 'halden_locket' }],
        },
      },
      {
        id: 'step_return_locket',
        desc: 'Return the locket to Innkeeper Brann at the Pine Tavern.',
        // Completes when the party is back in Brann's venue room with the locket.
        condition: {
          all: [
            { fact: 'loot_taken', operator: 'contains', value: 'halden_locket' },
            { fact: 'room_id', operator: 'equal', value: 'pines_tavern' },
          ],
        },
      },
    ],
    rewards: [
      { type: 'give_gold', amount: 80 },
      { type: 'give_xp', amount: 250 },
      // Faction rep bumped via `repGain: 10` above — route surfaces
      // the narrative line.
      {
        type: 'add_narrative',
        text: 'Brann presses a purse of 80 gold into your hand and bows his head. "His daughter will rest easier knowing."',
      },
    ],
  },
  {
    id: 'quest_cult',
    title: 'Silence the Spire',
    desc: 'Captain Riese has charged you with breaking the Frostspire Cult: kill the Frost Acolyte and bring back their idol.',
    giverNpcId: 'npc_riese',
    factionId: 'faction_wardens',
    repGain: 30,
    steps: [
      {
        id: 'step_meet_riese',
        desc: 'Speak with Captain Riese at the Warden Post.',
        condition: {
          all: [
            { fact: 'room_id', operator: 'equal', value: 'pines_warden' },
            {
              any: [
                { fact: 'action', operator: 'equal', value: 'talk_response' },
                { fact: 'action', operator: 'equal', value: 'accept_quest' },
              ],
            },
          ],
        },
      },
      {
        id: 'step_kill_acolyte',
        desc: 'Defeat the Frost Acolyte at the Ritual Apex.',
        condition: {
          all: [
            {
              fact: 'enemies_killed',
              operator: 'contains',
              value: 'spire_ritual_apex#boss',
            },
          ],
        },
      },
      {
        id: 'step_recover_idol',
        desc: 'Recover the Frostspire Idol.',
        condition: {
          all: [{ fact: 'loot_taken', operator: 'contains', value: 'cult_idol' }],
        },
      },
    ],
    rewards: [
      { type: 'give_gold', amount: 250 },
      { type: 'give_xp', amount: 1500 },
      { type: 'modify_hp', amount: 15 },
      // Faction rep bumped via `repGain: 30` above.
      {
        type: 'add_narrative',
        text: 'Captain Riese turns the idol in her hands, then drops it into the brazier. "For a generation, then. Drink with us tonight."',
      },
    ],
  },

  // ── Grove of Thorns (folded) ─────────────────────────────────────────────
  {
    id: 'quest_silent_grove',
    title: 'The Silent Grove',
    desc: "Old Elise needs someone to walk Mareth's path: reach the Ancient Oak, defeat the Fey Trickster that silenced her, and recover the Oak's heart.",
    // Discovered (not startActive) — Old Elise hands it over when you reach
    // Pinegate; it's the beginner grove arc proper. The full arc (defeat the
    // Trickster + recover the heart) is one quest — the former separate
    // "Break the Trickster's Hold" was redundant (same kill trigger).
    giverNpcId: 'npc_elise_elder',
    factionId: 'faction_verdant',
    repGain: 45,
    steps: [
      {
        id: 'step_talk_elise',
        desc: 'Speak with Old Elise in Pinegate Square.',
        condition: {
          all: [
            {
              fact: 'flags',
              path: '$.rule_fired_step_talk_elise',
              operator: 'equal',
              value: true,
            },
          ],
        },
      },
      {
        id: 'step_take_charm',
        desc: "Take Mareth's Charm from the Burnt Stump lodge.",
        condition: {
          all: [{ fact: 'loot_taken', operator: 'contains', value: 'circle_charm' }],
        },
      },
      {
        id: 'step_reach_oak',
        desc: "Reach the Ancient Oak at the grove's heart.",
        condition: {
          all: [{ fact: 'visited_rooms', operator: 'contains', value: 'ancient_oak' }],
        },
      },
      {
        // The quest pays out only once the Trickster is beaten — Old Elise's
        // charge was "defeat the Fey Trickster at the heart and the grove will
        // mend," so reaching the Oak alone no longer completes it.
        id: 'step_defeat_trickster',
        desc: 'Defeat the Fey Trickster at the heart of the grove.',
        condition: {
          all: [{ fact: 'enemies_killed', operator: 'contains', value: 'ancient_oak#0' }],
        },
      },
      {
        // With the Trickster slain, recover the Oak's heart to fully mend the
        // grove. (Folded in from the former "Break the Trickster's Hold" quest,
        // which keyed its first step on the same kill — a redundant duplicate.)
        id: 'step_take_heart',
        desc: 'Recover the Heart of the Ancient Oak from the grove sanctum.',
        condition: { all: [{ fact: 'loot_taken', operator: 'contains', value: 'oak_heart' }] },
      },
    ],
    // Rewards merged from the former two-quest grove arc. The combined XP award
    // counts toward the SRD advancement table (leveling is XP-gated). Malgovia
    // stays open-ended: no `set_escape`, so finishing the grove doesn't end the
    // adventure (the crypt is the bigger fight).
    rewards: [
      { type: 'give_gold', amount: 400 },
      { type: 'give_xp', amount: 1850 },
      // Faction rep bumped via `repGain: 45` above.
      {
        type: 'add_narrative',
        text: "Old Elise presses your hand in both of hers. 'The Verdant Circle remembers you.' The grove sighs — a long, green release; Pinegate will sleep easy tonight.",
      },
    ],
  },
];

export const factions: Faction[] = [
  {
    id: 'faction_guild',
    name: 'Merchant Guild',
    thresholds: { hostile: -50, unfriendly: -10, neutral: 0, friendly: 20, exalted: 60 },
    shopPriceModifiers: {
      hostile: 1.5,
      unfriendly: 1.2,
      neutral: 1.0,
      friendly: 0.9,
      exalted: 0.75,
    },
  },
  {
    id: 'faction_watch',
    name: 'City Watch',
    thresholds: { hostile: -50, unfriendly: -10, neutral: 0, friendly: 20, exalted: 60 },
    shopPriceModifiers: {
      hostile: 1.0,
      unfriendly: 1.0,
      neutral: 1.0,
      friendly: 1.0,
      exalted: 1.0,
    },
  },

  // ── Whispering Pines (folded) ────────────────────────────────────────────
  {
    id: 'faction_wardens',
    name: 'Pine Wardens',
    thresholds: { hostile: -50, unfriendly: -10, neutral: 0, friendly: 20, exalted: 60 },
    shopPriceModifiers: {
      hostile: 1.5,
      unfriendly: 1.2,
      neutral: 1.0,
      friendly: 0.85,
      exalted: 0.7,
    },
  },

  // ── Grove of Thorns (folded) ─────────────────────────────────────────────
  {
    id: 'faction_verdant',
    name: 'Verdant Circle',
    thresholds: { hostile: -50, unfriendly: -10, neutral: 0, friendly: 20, exalted: 60 },
    shopPriceModifiers: {
      hostile: 1.5,
      unfriendly: 1.2,
      neutral: 1.0,
      friendly: 0.85, // bigger discount than Vale — druids share with kin
      exalted: 0.7,
    },
  },
];

export const rules: GameRule[] = [
  {
    name: 'guild_ledger_found',
    once: true,
    priority: 5,
    conditions: {
      all: [
        { fact: 'loot_taken', operator: 'contains', value: 'guild_ledger' },
        { fact: 'flags', operator: 'doesNotContain', value: 'rule_fired_guild_ledger_found' },
      ],
    },
    consequences: [
      { type: 'advance_quest', questId: 'quest_shipment', stepId: 'step_find_ledger' },
      {
        type: 'add_narrative',
        text: "You recognise the Guild's stamp on the waterlogged ledger — this is what Aldric was looking for.",
      },
    ],
  },

  // ── Whispering Pines (folded) ────────────────────────────────────────────
  {
    name: 'halden_locket_found',
    once: true,
    priority: 5,
    conditions: {
      all: [
        { fact: 'loot_taken', operator: 'contains', value: 'halden_locket' },
        { fact: 'flags', operator: 'doesNotContain', value: 'rule_fired_halden_locket_found' },
      ],
    },
    consequences: [
      { type: 'advance_quest', questId: 'quest_trapper', stepId: 'step_find_locket' },
      {
        type: 'add_narrative',
        text: "You recognise the engraving — Halden's daughter's name. The cult had him here.",
      },
    ],
  },
  {
    name: 'cult_idol_recovered',
    once: true,
    priority: 5,
    conditions: {
      all: [
        { fact: 'loot_taken', operator: 'contains', value: 'cult_idol' },
        { fact: 'flags', operator: 'doesNotContain', value: 'rule_fired_cult_idol_recovered' },
      ],
    },
    consequences: [
      { type: 'advance_quest', questId: 'quest_cult', stepId: 'step_recover_idol' },
      {
        type: 'add_narrative',
        text: 'The idol grows cold in your hand. Captain Riese will want to see this immediately.',
      },
    ],
  },

  // ── Grove of Thorns (folded) ─────────────────────────────────────────────
  {
    name: 'step_talk_elise',
    conditions: {
      all: [
        {
          any: [
            { fact: 'action', operator: 'equal', value: 'talk_response' },
            { fact: 'action', operator: 'equal', value: 'accept_quest' },
          ],
        },
        { fact: 'room_id', operator: 'equal', value: 'pinegate_square' },
        // Scope to Old Elise specifically — Pinegate Square also hosts Bram the
        // Woodcutter, and talking to him must NOT hand over the Silent Grove.
        { fact: 'npc_id', operator: 'equal', value: 'npc_elise_elder' },
      ],
    },
    // No consequence needed — `once` makes the engine set the
    // `rule_fired_step_talk_elise` flag, which the quest step's condition
    // checks. (Previously also set a dead `talked_elise` flag nothing read.)
    consequences: [],
    once: true,
  },
];
