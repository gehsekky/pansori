import type { Context } from '../types.js';

// ─── Vale of Shadows — First Adventure Module ─────────────────────────────────
//
// Locations:
//   town_millhaven   — hub town with 3 districts
//   dungeon_crypt    — Shattered Crypt dungeon (8 rooms, 10×10 grid)
//   wilderness_road  — The Old Road (travel connector with encounters)
//
// Quests:
//   quest_shipment   — The Missing Shipment  (Merchant Guild)
//   quest_crypt      — Beneath the Surface   (Temple of Selûne)
//   quest_shadow     — Shadow Dealings       (Slums contact)
//
// Factions:
//   faction_guild    — Merchant Guild   (shop prices)
//   faction_watch    — City Watch       (encounter frequency)

export const context: Context = {
  id: 'vale_of_shadows',
  worldNoun: 'vale',
  mapType: 'campaign',
  startRoomId: 'millhaven_square',
  escapeRoomId: 'dungeon_crypt_exit',
  escapeTriggers: ['escape', 'leave', 'ascend', 'climb out', 'exit the crypt'],
  escapeChoiceText: 'Climb out of the crypt — RETURN TO MILLHAVEN',

  worldNames: ['Vale of Shadows', 'The Darkened Vale', 'Millhaven and the Shattered Crypt'],

  // ─── Classes ─────────────────────────────────────────────────────────────────

  classPrimaryStats: {
    Fighter: 'str',
    Rogue: 'dex',
    Wizard: 'int',
    Cleric: 'wis',
    Ranger: 'dex',
    Paladin: 'str',
    Bard: 'cha',
  },

  classHitDie: {
    Fighter: 10,
    Rogue: 8,
    Wizard: 6,
    Cleric: 8,
    Ranger: 10,
    Paladin: 10,
    Bard: 8,
  },

  classSkills: {
    Fighter: ['athletics', 'intimidation'],
    Rogue: ['stealth', 'sleight_of_hand', 'deception', 'perception'],
    Wizard: ['arcana', 'investigation', 'history'],
    Cleric: ['medicine', 'religion', 'insight'],
    Ranger: ['perception', 'stealth', 'nature', 'survival'],
    Paladin: ['athletics', 'persuasion', 'insight'],
    Bard: ['persuasion', 'deception', 'performance', 'perception'],
  },

  classArmorProficiencies: {
    Fighter: ['light', 'medium', 'heavy', 'shield'],
    Rogue: ['light'],
    Wizard: [],
    Cleric: ['light', 'medium', 'shield'],
    Ranger: ['light', 'medium', 'shield'],
    Paladin: ['light', 'medium', 'heavy', 'shield'],
    Bard: ['light'],
  },

  classWeaponProficiencies: {
    Fighter: ['simple', 'martial'],
    Rogue: ['simple', 'martial'],
    Wizard: ['simple'],
    Cleric: ['simple'],
    Ranger: ['simple', 'martial'],
    Paladin: ['simple', 'martial'],
    Bard: ['simple', 'martial'],
  },

  classSavingThrows: {
    Fighter: ['str', 'con'],
    Rogue: ['dex', 'int'],
    Wizard: ['int', 'wis'],
    Cleric: ['wis', 'cha'],
    Ranger: ['str', 'dex'],
    Paladin: ['wis', 'cha'],
    Bard: ['dex', 'cha'],
  },

  classFeatures: {
    Fighter: ['extra_attack', 'second_wind'],
    Rogue: ['sneak_attack', 'cunning_action'],
    Wizard: ['spellcasting'],
    Cleric: ['spellcasting', 'channel_divinity'],
    Ranger: ['extra_attack', 'favored_enemy'],
    Paladin: ['divine_smite', 'lay_on_hands'],
    Bard: ['spellcasting', 'bardic_inspiration'],
  },

  classStartingLoot: {
    Fighter: ['longsword', 'chain_mail', 'shield'],
    Rogue: ['shortsword', 'leather_armor'],
    Wizard: ['quarterstaff', 'component_pouch'],
    Cleric: ['mace', 'chain_mail', 'holy_symbol'],
    Ranger: ['shortsword', 'longbow', 'leather_armor'],
    Paladin: ['longsword', 'chain_mail', 'shield'],
    Bard: ['rapier', 'leather_armor'],
  },

  spellcastingAbility: {
    Wizard: 'int',
    Cleric: 'wis',
    Bard: 'cha',
    Paladin: 'cha',
  },

  // ─── Intro texts ──────────────────────────────────────────────────────────────

  introTexts: [
    `You arrive in Millhaven, a market town nestled at the edge of the Vale of Shadows. Merchants hawk their wares in the square, but unease hangs in the air — the old crypt beyond the hills has been making sounds at night, and two of the Guild's supply wagons have gone missing on the Old Road.`,
    `The sun is setting over Millhaven as you ride in. The innkeeper greets you with a worried look — there's trouble in the vale, and coin to be made for those with sword or spell.`,
    `Rain patters on the cobblestones of Millhaven's market square. A priest from the Temple of Selûne approaches you the moment you dismount — they need capable adventurers, and word travels fast in small towns.`,
  ],

  // ─── Room pool (roguelike — not used in campaign mode, but required by type) ─

  roomPool: [],

  // ─── Enemy templates ──────────────────────────────────────────────────────────

  enemyTemplates: [
    {
      name: 'Skeleton Warrior',
      cr: 0.25,
      hp: 13,
      ac: 13,
      damage: '1d6+2',
      toHit: 4,
      xp: 50,
      str: 10,
      dex: 14,
      con: 15,
      int: 6,
      wis: 8,
      cha: 5,
      resistances: ['piercing'],
      vulnerabilities: ['bludgeoning'],
      immunities: ['poison'],
      condition_immunities: ['poisoned', 'exhaustion'],
      damageType: 'slashing',
    },
    {
      name: 'Crypt Ghoul',
      cr: 1,
      hp: 22,
      ac: 13,
      damage: '2d6+2',
      toHit: 4,
      xp: 200,
      str: 13,
      dex: 15,
      con: 10,
      int: 7,
      wis: 10,
      cha: 6,
      onHitEffect: { condition: 'paralyzed', ability: 'con', dc: 10 },
      condition_immunities: ['poisoned', 'charmed'],
      damageType: 'piercing',
    },
    {
      name: 'Shadow',
      cr: 0.5,
      hp: 16,
      ac: 12,
      damage: '2d6+2',
      toHit: 4,
      xp: 100,
      str: 6,
      dex: 14,
      con: 13,
      int: 6,
      wis: 10,
      cha: 8,
      resistances: [
        'acid',
        'fire',
        'thunder',
        'lightning',
        'cold',
        'bludgeoning',
        'piercing',
        'slashing',
      ],
      immunities: ['necrotic', 'poison'],
      condition_immunities: [
        'exhaustion',
        'frightened',
        'grappled',
        'paralyzed',
        'petrified',
        'poisoned',
        'prone',
        'restrained',
      ],
      damageType: 'necrotic',
    },
    {
      name: 'Bandit Ruffian',
      cr: 0.125,
      hp: 11,
      ac: 12,
      damage: '1d6+1',
      toHit: 3,
      xp: 25,
      str: 11,
      dex: 12,
      con: 12,
      int: 10,
      wis: 10,
      cha: 10,
      damageType: 'slashing',
    },
    {
      name: 'Crypt Lord',
      cr: 5,
      hp: 97,
      ac: 17,
      damage: '2d6+4',
      toHit: 7,
      xp: 1800,
      str: 18,
      dex: 10,
      con: 18,
      int: 11,
      wis: 10,
      cha: 16,
      multiattack: 3,
      resistances: ['bludgeoning', 'piercing', 'slashing'],
      immunities: ['poison', 'necrotic'],
      condition_immunities: ['charmed', 'exhaustion', 'frightened', 'paralyzed', 'poisoned'],
      onHitEffect: { condition: 'frightened', ability: 'wis', dc: 13 },
      damageType: 'necrotic',
    },
  ],

  // ─── Loot table ───────────────────────────────────────────────────────────────

  lootTable: [
    {
      id: 'longsword',
      name: 'Longsword',
      weight: 5,
      desc: 'A well-balanced martial blade.',
      type: 'weapon',
      slot: 'weapon',
      damage: '1d8',
      versatileDamage: '1d10',
      damageType: 'slashing',
      range: 'melee',
      weaponType: 'martial',
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['sword', 'blade'],
    },
    {
      id: 'shortsword',
      name: 'Shortsword',
      weight: 5,
      desc: 'A light, quick blade favored by rogues.',
      type: 'weapon',
      slot: 'weapon',
      damage: '1d6',
      damageType: 'piercing',
      finesse: true,
      light: true,
      range: 'melee',
      weaponType: 'martial',
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['short sword'],
    },
    {
      id: 'rapier',
      name: 'Rapier',
      weight: 4,
      desc: 'A slender thrusting sword with exceptional balance.',
      type: 'weapon',
      slot: 'weapon',
      damage: '1d8',
      damageType: 'piercing',
      finesse: true,
      range: 'melee',
      weaponType: 'martial',
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['dueling sword'],
    },
    {
      id: 'mace',
      name: 'Mace',
      weight: 4,
      desc: 'A heavy flanged bludgeon.',
      type: 'weapon',
      slot: 'weapon',
      damage: '1d6',
      damageType: 'bludgeoning',
      range: 'melee',
      weaponType: 'simple',
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['club', 'flanged mace'],
    },
    {
      id: 'quarterstaff',
      name: 'Quarterstaff',
      weight: 4,
      desc: 'A sturdy oak staff, versatile in trained hands.',
      type: 'weapon',
      slot: 'weapon',
      damage: '1d6',
      versatileDamage: '1d8',
      damageType: 'bludgeoning',
      range: 'melee',
      weaponType: 'simple',
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['staff', 'oak staff'],
    },
    {
      id: 'longbow',
      name: 'Longbow',
      weight: 3,
      desc: 'A tall yew bow with impressive range.',
      type: 'weapon',
      slot: 'weapon',
      damage: '1d8',
      damageType: 'piercing',
      range: 'ranged',
      weaponType: 'martial',
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['bow', 'yew bow'],
    },
    {
      id: 'chain_mail',
      name: 'Chain Mail',
      weight: 6,
      desc: 'Interlocked steel rings — heavy but protective.',
      type: 'armor',
      slot: 'armor',
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: null,
      armorCategory: 'heavy',
      armorAcBase: 16,
      dexCapToAc: 0,
      aliases: ['mail', 'chainmail'],
    },
    {
      id: 'leather_armor',
      name: 'Leather Armor',
      weight: 7,
      desc: 'Hardened leather offering basic protection.',
      type: 'armor',
      slot: 'armor',
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: null,
      armorCategory: 'light',
      armorAcBase: 11,
      aliases: ['leather', 'hide'],
    },
    {
      id: 'shield',
      name: 'Shield',
      weight: 5,
      desc: 'A sturdy wooden shield, +2 AC.',
      type: 'armor',
      slot: 'shield',
      damage: null,
      ac_bonus: 2,
      heal: null,
      effect: null,
      armorCategory: 'shield',
      aliases: ['wooden shield', 'buckler'],
    },
    {
      id: 'healing_potion',
      name: 'Healing Potion',
      weight: 4,
      desc: 'A crimson vial of restorative magic. Restores 2d4+2 HP.',
      type: 'consumable',
      slot: null,
      damage: null,
      ac_bonus: null,
      heal: '2d4+2',
      effect: null,
      aliases: ['potion', 'red potion'],
    },
    {
      id: 'holy_symbol',
      name: 'Holy Symbol',
      weight: 2,
      desc: "A silver crescent of Selûne — a cleric's spellcasting focus.",
      type: 'misc',
      slot: null,
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: 'spellcasting_focus',
      aliases: ['symbol', 'holy focus'],
    },
    {
      id: 'component_pouch',
      name: 'Component Pouch',
      weight: 2,
      desc: 'A leather pouch of spellcasting components.',
      type: 'misc',
      slot: null,
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: 'spellcasting_focus',
      aliases: ['pouch', 'spell components'],
    },
    {
      id: 'guild_ledger',
      name: 'Guild Ledger',
      weight: 3,
      desc: "A waterlogged ledger bearing the Merchant Guild's stamp — evidence of the missing shipment.",
      type: 'misc',
      slot: null,
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['ledger', 'book', 'shipping records'],
    },
    {
      id: 'shadow_evidence',
      name: 'Incriminating Letter',
      weight: 1,
      desc: "A letter bearing Captain Vane's seal, arranging bribes with the bandits.",
      type: 'misc',
      slot: null,
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['letter', 'evidence'],
    },
    {
      id: 'moonstone_amulet',
      name: 'Moonstone Amulet',
      weight: 2,
      desc: 'A silver amulet set with a glowing moonstone. Grants +1 to Wisdom saving throws.',
      type: 'misc',
      slot: null,
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: '+1_wis_save',
      requiresAttunement: true,
      aliases: ['amulet', 'moonstone'],
    },
  ],

  // ─── NPC templates ───────────────────────────────────────────────────────────

  npcTemplates: [
    {
      id: 'npc_aldric',
      name: 'Aldric the Merchant',
      attitude: 'friendly',
      hp: 4,
      ac: 10,
      damage: '1d4',
      toHit: 0,
      xp: 0,
      greeting:
        "Thank the gods — capable folk! Two of our supply wagons vanished on the Old Road three days past. I'll pay well for anyone who finds what happened to them and recovers the shipping ledger.",
      responses: [
        {
          label: "I'll look into the missing shipment.",
          reply:
            'Wonderful! The ledger would prove our goods were never delivered — the Guild needs it to claim compensation. Last seen near the old crypt road.',
          consequences: [
            { type: 'advance_quest', questId: 'quest_shipment', stepId: 'step_talk_aldric' },
          ],
        },
        {
          label: 'What do you know about the crypt?',
          reply:
            "Nothing good. Locals avoid it. Word is, something stirs within — lights at night, groaning sounds. An old wizard sealed it years ago, but seals don't last forever.",
        },
        {
          label: "I'll need supplies.",
          reply: 'Of course. Browse what I have — Guild members get a fair price.',
        },
      ],
      persuasionDC: 12,
      shop: [
        { itemId: 'healing_potion', price: 50 },
        { itemId: 'rope', price: 1 },
        { itemId: 'torch', price: 1 },
      ],
    },
    {
      id: 'npc_sister_maren',
      name: 'Sister Maren',
      attitude: 'friendly',
      hp: 8,
      ac: 11,
      damage: '1d4',
      toHit: 2,
      xp: 0,
      greeting:
        "Selûne's blessing upon you, traveler. I am Sister Maren of the Temple. The crypt to the north — something evil has taken root there. I need brave souls to descend and cleanse it.",
      responses: [
        {
          label: 'Tell me about the crypt.',
          reply:
            'It is the Shattered Crypt — an old noble tomb from the Third Age. A lich was sealed within, long ago. We fear the seal has weakened. The Crypt Lord must be destroyed.',
          consequences: [
            { type: 'advance_quest', questId: 'quest_crypt', stepId: 'step_learn_crypt' },
          ],
        },
        {
          label: 'I will clear the crypt.',
          reply:
            'Bless you. Destroy the Crypt Lord at the lowest level. The moonstone amulet within is sacred to Selûne — please return it to the temple.',
          consequences: [
            { type: 'advance_quest', questId: 'quest_crypt', stepId: 'step_learn_crypt' },
          ],
        },
        {
          label: 'Can you heal my wounds?',
          reply: 'For a small donation to the temple, yes.',
          consequences: [{ type: 'modify_hp', amount: 8 }],
        },
      ],
      persuasionDC: 10,
    },
    {
      id: 'npc_dusk',
      name: 'Dusk',
      attitude: 'indifferent',
      hp: 14,
      ac: 13,
      damage: '1d6+2',
      toHit: 4,
      xp: 0,
      greeting:
        "Eyes down, stranger. What brings you to the Lantern District? If it's trouble with the Watch, we might have common cause.",
      responses: [
        {
          label: 'Tell me about the City Watch.',
          reply:
            "Captain Vane's rotten from the boots up. Taking coin from the road bandits to look the other way. I have proof — or I will, if you can get into his office.",
          consequences: [
            { type: 'advance_quest', questId: 'quest_shadow', stepId: 'step_meet_dusk' },
          ],
        },
        {
          label: 'What do you need me to do?',
          reply:
            "Vane keeps a letter in his strongbox at the garrison. Get it. It ties him to the bandit raids. Bring it to me and I'll make sure the right people see it.",
          consequences: [
            { type: 'advance_quest', questId: 'quest_shadow', stepId: 'step_meet_dusk' },
          ],
        },
        {
          label: 'Not interested.',
          reply: "Your loss. Don't say I didn't offer.",
        },
      ],
      persuasionDC: 14,
    },
  ],

  npcSpawnChance: 0, // NPCs are placed explicitly in campaign rooms

  // ─── Narratives ───────────────────────────────────────────────────────────────

  narratives: {
    roomArrival: {
      millhaven_square: [
        'You stand in the town square of Millhaven. Merchants hawk their wares, children dodge between market stalls, and the smell of bread mingles with woodsmoke.',
        "Millhaven's market square bustles with nervous energy. People speak in hushed tones about the sounds from the hills.",
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
    enemyAttacks: [
      'The {enemy} attacks!',
      '{enemy} strikes at you!',
      '{enemy} presses the assault!',
    ],
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
    sneakFail: [
      'Your boot catches on a loose stone — the element of surprise is lost!',
      'A creak of leather betrays you.',
    ],
    deathLines: ['{name} falls, life fading...', '{name} collapses — not long now...'],
    escapeLines: [
      'You emerge from the crypt into the cool night air. Millhaven awaits.',
      'You climb the ancient steps and breathe free air once more.',
    ],
    enemyDeflected: [
      "{enemy}'s blow glances off your armor.",
      '{enemy} attacks but finds no opening.',
      "You turn aside {enemy}'s strike.",
    ],
    levelUp: [
      'Your trials have made you stronger — you have reached level {level}!',
      'Experience crystallizes into power — you advance to level {level}!',
    ],
    noEscapeNearby: ['There is no way out from here.'],
    escapeBlocked: ['An enemy stands between you and escape!'],
    combatStart: [
      '{enemy} bars your path — initiative is drawn!',
      'Combat begins! {enemy} readies for battle.',
    ],
    shortRest: ['You tend your wounds and catch your breath.'],
    longRest: ['The party makes camp and rests through the night.'],
  },

  // ─── Campaign data ────────────────────────────────────────────────────────────

  campaign: {
    world_name: 'Vale of Shadows',
    intro:
      'The Vale of Shadows stretches before you — a land of ancient tombs, suspicious merchants, and shadows that move against the light.',

    // Town rooms
    rooms: [
      {
        id: 'millhaven_square',
        name: 'Market Square',
        desc: 'The bustling heart of Millhaven. Merchant stalls, a central well, and the road north to the hills.',
      },
      {
        id: 'millhaven_temple',
        name: 'Temple of Selûne',
        desc: 'A modest stone temple, its silver crescent glinting above the door. Candles burn within.',
        canRest: true,
      },
      {
        id: 'millhaven_market',
        name: 'Merchant District',
        desc: 'Guild warehouses and market stalls. Aldric the Merchant holds court here.',
      },
      {
        id: 'millhaven_slums',
        name: 'Lantern District',
        desc: 'Narrow alleys and shuttered windows. Someone is watching from the shadows.',
      },
      {
        id: 'millhaven_garrison',
        name: 'Garrison Office',
        desc: 'A stone building bearing the City Watch crest. A strongbox sits behind the desk.',
      },
      {
        id: 'road_north',
        name: 'The Old Road',
        desc: 'A rutted track leading north through the hills. Fresh wagon tracks veer off near a stand of dead trees.',
      },

      // Dungeon rooms (Shattered Crypt — 8 rooms)
      {
        id: 'dungeon_crypt_entrance',
        name: 'Crypt Entrance',
        desc: 'Crumbling stone steps lead down. Crude graffiti warns: "Abandon hope." Torch brackets line the walls.',
        canRest: false,
      },
      {
        id: 'dungeon_antechamber',
        name: 'Antechamber',
        desc: 'A vaulted chamber of black stone. Funeral urns line the alcoves, some shattered. Bones litter the floor.',
      },
      {
        id: 'dungeon_charnel_hall',
        name: 'Charnel Hall',
        desc: 'A long corridor flanked by sealed burial niches. The seals on several niches have been broken from within.',
      },
      {
        id: 'dungeon_offering_chamber',
        name: 'Chamber of Offerings',
        desc: 'An altar to a forgotten death deity stands at the center. Coins and grave goods have been disturbed.',
      },
      {
        id: 'dungeon_shadow_gallery',
        name: 'Shadow Gallery',
        desc: 'Torchlight barely penetrates here. Paintings on the wall shift when you look away.',
      },
      {
        id: 'dungeon_ossuary',
        name: 'Ossuary',
        desc: 'Bones are stacked floor to ceiling in ornate patterns. The artistry is almost beautiful.',
      },
      {
        id: 'dungeon_crypt_throne',
        name: 'Throne of the Dead',
        desc: 'A massive chamber with a raised dais. An ancient throne of black stone dominates the room. Something powerful waits here.',
      },
      {
        id: 'dungeon_crypt_exit',
        name: 'Hidden Passage',
        desc: 'A narrow shaft cuts upward through the rock, emerging near the crypt entrance above.',
      },
    ],

    // Room connections
    connections: {
      // Town navigation
      millhaven_square: ['millhaven_temple', 'millhaven_market', 'millhaven_slums', 'road_north'],
      millhaven_temple: ['millhaven_square'],
      millhaven_market: ['millhaven_square', 'millhaven_garrison'],
      millhaven_slums: ['millhaven_square', 'millhaven_garrison'],
      millhaven_garrison: ['millhaven_market', 'millhaven_slums'],
      road_north: ['millhaven_square', 'dungeon_crypt_entrance'],

      // Dungeon (linear + some loops)
      dungeon_crypt_entrance: ['road_north', 'dungeon_antechamber'],
      dungeon_antechamber: [
        'dungeon_crypt_entrance',
        'dungeon_charnel_hall',
        'dungeon_offering_chamber',
      ],
      dungeon_charnel_hall: ['dungeon_antechamber', 'dungeon_shadow_gallery'],
      dungeon_offering_chamber: ['dungeon_antechamber', 'dungeon_ossuary'],
      dungeon_shadow_gallery: ['dungeon_charnel_hall', 'dungeon_crypt_throne'],
      dungeon_ossuary: ['dungeon_offering_chamber', 'dungeon_crypt_throne'],
      dungeon_crypt_throne: ['dungeon_shadow_gallery', 'dungeon_ossuary', 'dungeon_crypt_exit'],
      dungeon_crypt_exit: ['dungeon_crypt_throne'],
    },

    // Enemy placements (roomId → Enemy[])
    enemies: {
      dungeon_antechamber: [
        {
          id: 'dungeon_antechamber#0',
          name: 'Skeleton Warrior',
          hp: 13,
          ac: 13,
          damage: '1d6+2',
          toHit: 4,
          xp: 50,
          resistances: ['piercing'],
          vulnerabilities: ['bludgeoning'],
          immunities: ['poison'],
          condition_immunities: ['poisoned', 'exhaustion'],
        },
      ],
      dungeon_charnel_hall: [
        {
          id: 'dungeon_charnel_hall#0',
          name: 'Skeleton Warrior',
          hp: 13,
          ac: 13,
          damage: '1d6+2',
          toHit: 4,
          xp: 50,
          resistances: ['piercing'],
          vulnerabilities: ['bludgeoning'],
          immunities: ['poison'],
          condition_immunities: ['poisoned', 'exhaustion'],
        },
        {
          id: 'dungeon_charnel_hall#1',
          name: 'Skeleton Warrior',
          hp: 13,
          ac: 13,
          damage: '1d6+2',
          toHit: 4,
          xp: 50,
          resistances: ['piercing'],
          vulnerabilities: ['bludgeoning'],
          immunities: ['poison'],
          condition_immunities: ['poisoned', 'exhaustion'],
        },
      ],
      dungeon_offering_chamber: [
        {
          id: 'dungeon_offering_chamber#0',
          name: 'Crypt Ghoul',
          hp: 22,
          ac: 13,
          damage: '2d6+2',
          toHit: 4,
          xp: 200,
          onHitEffect: { condition: 'paralyzed', ability: 'con', dc: 10 },
          condition_immunities: ['poisoned', 'charmed'],
        },
      ],
      dungeon_shadow_gallery: [
        {
          id: 'dungeon_shadow_gallery#0',
          name: 'Shadow',
          hp: 16,
          ac: 12,
          damage: '2d6+2',
          toHit: 4,
          xp: 100,
          resistances: [
            'acid',
            'fire',
            'thunder',
            'lightning',
            'cold',
            'bludgeoning',
            'piercing',
            'slashing',
          ],
          immunities: ['necrotic', 'poison'],
          condition_immunities: [
            'exhaustion',
            'frightened',
            'grappled',
            'paralyzed',
            'petrified',
            'poisoned',
            'prone',
            'restrained',
          ],
        },
      ],
      dungeon_ossuary: [
        {
          id: 'dungeon_ossuary#0',
          name: 'Crypt Ghoul',
          hp: 22,
          ac: 13,
          damage: '2d6+2',
          toHit: 4,
          xp: 200,
          onHitEffect: { condition: 'paralyzed', ability: 'con', dc: 10 },
          condition_immunities: ['poisoned', 'charmed'],
        },
      ],
      dungeon_crypt_throne: [
        {
          id: 'dungeon_crypt_throne#0',
          name: 'Crypt Lord',
          hp: 97,
          ac: 17,
          damage: '2d6+4',
          toHit: 7,
          xp: 1800,
          multiattack: 3,
          resistances: ['bludgeoning', 'piercing', 'slashing'],
          immunities: ['poison', 'necrotic'],
          condition_immunities: ['charmed', 'exhaustion', 'frightened', 'paralyzed', 'poisoned'],
          onHitEffect: { condition: 'frightened', ability: 'wis', dc: 13 },
        },
        // Boss room minions: two Skeleton Warriors flank the Crypt Lord
        {
          id: 'dungeon_crypt_throne#minion_a',
          name: 'Skeleton Warrior',
          hp: 13,
          ac: 13,
          damage: '1d6+2',
          toHit: 4,
          xp: 50,
          resistances: ['piercing'],
          vulnerabilities: ['bludgeoning'],
          immunities: ['poison'],
          condition_immunities: ['poisoned', 'exhaustion'],
        },
        {
          id: 'dungeon_crypt_throne#minion_b',
          name: 'Skeleton Warrior',
          hp: 13,
          ac: 13,
          damage: '1d6+2',
          toHit: 4,
          xp: 50,
          resistances: ['piercing'],
          vulnerabilities: ['bludgeoning'],
          immunities: ['poison'],
          condition_immunities: ['poisoned', 'exhaustion'],
        },
      ],
      road_north: [
        {
          id: 'road_north#0',
          name: 'Bandit Ruffian',
          hp: 11,
          ac: 12,
          damage: '1d6+1',
          toHit: 3,
          xp: 25,
        },
        {
          id: 'road_north#1',
          name: 'Bandit Ruffian',
          hp: 11,
          ac: 12,
          damage: '1d6+1',
          toHit: 3,
          xp: 25,
        },
      ],
    },

    // Loot placements
    loot: {
      dungeon_antechamber: {
        id: 'healing_potion',
        name: 'Healing Potion',
        weight: 4,
        desc: 'A crimson vial.',
        type: 'consumable',
        slot: null,
        damage: null,
        ac_bonus: null,
        heal: '2d4+2',
        effect: null,
        aliases: ['potion'],
      },
      dungeon_offering_chamber: {
        id: 'guild_ledger',
        name: 'Guild Ledger',
        weight: 3,
        desc: "A waterlogged ledger bearing the Guild's stamp.",
        type: 'misc',
        slot: null,
        damage: null,
        ac_bonus: null,
        heal: null,
        effect: null,
        aliases: ['ledger'],
      },
      dungeon_ossuary: {
        id: 'healing_potion',
        name: 'Healing Potion',
        weight: 4,
        desc: 'A crimson vial.',
        type: 'consumable',
        slot: null,
        damage: null,
        ac_bonus: null,
        heal: '2d4+2',
        effect: null,
        aliases: ['potion'],
      },
      dungeon_crypt_throne: {
        id: 'moonstone_amulet',
        name: 'Moonstone Amulet',
        weight: 2,
        desc: 'A glowing moonstone amulet, sacred to Selûne.',
        type: 'misc',
        slot: null,
        damage: null,
        ac_bonus: null,
        heal: null,
        effect: '+1_wis_save',
        requiresAttunement: true,
        aliases: ['amulet'],
      },
      millhaven_garrison: {
        id: 'shadow_evidence',
        name: 'Incriminating Letter',
        weight: 1,
        desc: "A letter bearing the Captain's seal.",
        type: 'misc',
        slot: null,
        damage: null,
        ac_bonus: null,
        heal: null,
        effect: null,
        aliases: ['letter'],
      },
    },

    startingLoot: ['healing_potion'],

    // ─── Locations ──────────────────────────────────────────────────────────────

    locations: [
      {
        id: 'town_millhaven',
        name: 'Millhaven',
        type: 'town',
        desc: "A market town at the vale's edge. Three distinct districts serve different needs.",
        districts: [
          {
            id: 'district_market',
            name: 'Merchant District',
            desc: 'Guild warehouses and merchant stalls. Guild members pay reduced prices.',
            roomId: 'millhaven_market',
          },
          {
            id: 'district_temple',
            name: 'Temple District',
            desc: 'The Temple of Selûne offers rest and healing.',
            roomId: 'millhaven_temple',
          },
          {
            id: 'district_lantern',
            name: 'Lantern District',
            desc: 'The rougher part of town. Information available for a price.',
            roomId: 'millhaven_slums',
          },
        ],
        connections: ['wilderness_old_road'],
      },
      {
        id: 'wilderness_old_road',
        name: 'The Old Road',
        type: 'wilderness',
        desc: 'A rutted track through sparse woodland. Bandits have been raiding caravans here.',
        connections: ['town_millhaven', 'dungeon_shattered_crypt'],
        encounterTable: ['Bandit Ruffian'],
        encounterChance: 0.4,
      },
      {
        id: 'dungeon_shattered_crypt',
        name: 'Shattered Crypt',
        type: 'dungeon',
        desc: 'An ancient tomb complex, sealed for generations. Something powerful has broken those seals from within.',
        gridWidth: 10,
        gridHeight: 10,
        rooms: [], // Rooms are defined in campaign.rooms and campaign.connections above
        connections: ['wilderness_old_road'],
      },
    ],

    // ─── Quests ─────────────────────────────────────────────────────────────────

    quests: [
      {
        id: 'quest_shipment',
        title: 'The Missing Shipment',
        desc: "The Merchant Guild's supply wagons vanished on the Old Road. Find the Guild Ledger in the crypt and return it to Aldric.",
        giverNpcId: 'npc_aldric',
        factionId: 'faction_guild',
        repGain: 20,
        steps: [
          {
            id: 'step_talk_aldric',
            desc: 'Speak with Aldric the Merchant to learn about the missing shipment.',
            condition: { all: [{ fact: 'action', operator: 'equal', value: 'talk_response' }] },
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
            desc: 'Return the ledger to Aldric in Millhaven.',
            condition: {
              all: [
                { fact: 'loot_taken', operator: 'contains', value: 'guild_ledger' },
                { fact: 'location_id', operator: 'equal', value: 'town_millhaven' },
              ],
            },
          },
        ],
        rewards: [
          { type: 'give_gold', amount: 150 },
          { type: 'set_faction_rep', factionId: 'faction_guild', delta: 20 },
          {
            type: 'add_narrative',
            text: "Aldric presses a purse of 150 gold into your hand and logs your name in the Guild's books.",
          },
        ],
      },
      {
        id: 'quest_crypt',
        title: 'Beneath the Surface',
        desc: 'Sister Maren of the Temple of Selûne needs the Crypt Lord destroyed and the Moonstone Amulet recovered.',
        giverNpcId: 'npc_sister_maren',
        factionId: 'faction_guild',
        repGain: 0,
        steps: [
          {
            id: 'step_learn_crypt',
            desc: 'Learn about the threat in the Shattered Crypt from Sister Maren.',
            condition: { all: [{ fact: 'action', operator: 'equal', value: 'talk_response' }] },
          },
          {
            id: 'step_kill_lord',
            desc: 'Defeat the Crypt Lord in the Throne of the Dead.',
            condition: {
              all: [
                { fact: 'enemies_killed', operator: 'contains', value: 'dungeon_crypt_throne' },
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
            condition: { all: [{ fact: 'action', operator: 'equal', value: 'talk_response' }] },
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
                { fact: 'room_id', operator: 'equal', value: 'millhaven_slums' },
              ],
            },
          },
        ],
        rewards: [
          { type: 'give_gold', amount: 75 },
          { type: 'set_faction_rep', factionId: 'faction_watch', delta: -10 },
          {
            type: 'add_narrative',
            text: 'Dusk takes the letter with a tight smile. "Captain Vane\'s days are numbered. You\'ve made some useful friends today."',
          },
        ],
      },
    ],

    // ─── Factions ────────────────────────────────────────────────────────────────

    factions: [
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
    ],
  },

  // ─── Spell table ──────────────────────────────────────────────────────────────

  spellTable: {
    sacred_flame: {
      id: 'sacred_flame',
      name: 'Sacred Flame',
      level: 0,
      castTime: 'action',
      damageType: 'radiant',
      damage: '1d8',
      savingThrow: 'dex',
      saveEffect: 'negates',
      desc: 'Radiant flame descends on a target. DEX save or take 1d8 radiant damage.',
    },
    cure_wounds: {
      id: 'cure_wounds',
      name: 'Cure Wounds',
      level: 1,
      castTime: 'action',
      heal: '1d8+3',
      desc: 'You heal a creature you touch for 1d8 + spell modifier HP.',
    },
    guiding_bolt: {
      id: 'guiding_bolt',
      name: 'Guiding Bolt',
      level: 1,
      castTime: 'action',
      damageType: 'radiant',
      damage: '4d6',
      attackRoll: true,
      desc: 'A flash of light streaks toward a target. Spell attack roll, 4d6 radiant on hit.',
    },
    magic_missile: {
      id: 'magic_missile',
      name: 'Magic Missile',
      level: 1,
      castTime: 'action',
      damageType: 'force',
      damage: '1d4+1',
      desc: 'Three magical darts each deal 1d4+1 force damage, automatically hitting.',
    },
    hold_person: {
      id: 'hold_person',
      name: 'Hold Person',
      level: 2,
      castTime: 'action',
      concentration: true,
      condition: 'paralyzed',
      conditionDuration: 3,
      savingThrow: 'wis',
      saveEffect: 'negates',
      desc: 'Target must make a WIS save or be paralyzed for up to 3 rounds (Concentration).',
    },
    bless: {
      id: 'bless',
      name: 'Bless',
      level: 1,
      castTime: 'action',
      concentration: true,
      narrative: 'You bless your allies — they gain +1d4 to attack rolls and saving throws.',
      desc: 'Concentration. Allies gain +1d4 to attack rolls and saving throws.',
    },
    thunderwave: {
      id: 'thunderwave',
      name: 'Thunderwave',
      level: 1,
      castTime: 'action',
      damageType: 'thunder',
      damage: '2d8',
      savingThrow: 'con',
      saveEffect: 'half',
      desc: 'A wave of thunderous force erupts from you. CON save or take 2d8 thunder, half on success.',
    },
    bardic_inspiration_spell: {
      id: 'bardic_inspiration_spell',
      name: 'Bardic Inspiration',
      level: 0,
      castTime: 'bonus_action',
      narrative: 'Your stirring words inspire an ally, granting them +1d6 on their next roll.',
      desc: 'Bonus action. One ally gains a Bardic Inspiration die (1d6) to add to one roll.',
    },
    divine_smite_spell: {
      id: 'divine_smite_spell',
      name: 'Divine Smite',
      level: 1,
      castTime: 'action',
      damageType: 'radiant',
      damage: '2d8',
      desc: 'When you hit with a melee attack, you may expend a spell slot to deal +2d8 radiant damage.',
    },
  },

  classSpells: {
    Cleric: ['sacred_flame', 'cure_wounds', 'guiding_bolt', 'hold_person', 'bless'],
    Wizard: ['magic_missile', 'hold_person', 'thunderwave'],
    Paladin: ['divine_smite_spell', 'cure_wounds', 'bless'],
    Bard: ['bardic_inspiration_spell', 'cure_wounds'],
  },

  classSpellSlots: {
    Cleric: [
      { 1: 2 }, // level 1
      { 1: 3 }, // level 2
      { 1: 4, 2: 2 }, // level 3
      { 1: 4, 2: 3 }, // level 4
      { 1: 4, 2: 3, 3: 2 }, // level 5
    ],
    Wizard: [{ 1: 2 }, { 1: 3 }, { 1: 4, 2: 2 }, { 1: 4, 2: 3 }, { 1: 4, 2: 3, 3: 2 }],
    Paladin: [{ 1: 2 }, { 1: 2 }, { 1: 3, 2: 0 }, { 1: 3, 2: 0 }, { 1: 4, 2: 2 }],
    Bard: [{ 1: 2 }, { 1: 3 }, { 1: 4, 2: 2 }, { 1: 4, 2: 3 }, { 1: 4, 2: 3, 3: 2 }],
  },

  // ─── Game rules (script engine) ──────────────────────────────────────────────

  rules: [
    {
      name: 'guild_ledger_found',
      once: true,
      priority: 5,
      conditions: {
        all: [
          { fact: 'loot_taken', operator: 'contains', value: 'guild_ledger' },
          { fact: 'flags', operator: 'notContain', value: 'rule_fired_guild_ledger_found' },
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
  ],
};
