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
    id: 'quest_shipment',
    title: 'The Missing Shipment',
    desc: "The Merchant Guild's supply wagons vanished on the Old Road. Find the Guild Ledger in the crypt and return it to Aldric.",
    startActive: true, // the Malgovia's opening quest — active from the start
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
];
