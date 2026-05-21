// Grove of Thorns — a Druid-themed campaign that showcases Wild Shape
// Beast Forms and the 2024 Druid features.
//
// Premise: the Verdant Circle's last druid has gone silent. The grove's
// beasts are turning hostile. The party (ideally with a druid) enters
// the grove to investigate, fights through awakened wolves and giant
// spiders, and confronts a fey trickster who has been corrupting the
// place from inside the Ancient Oak.
//
// Designed around: Wild Shape (Wolf for pack tactics, Black Bear for
// resistance vs. trickster bite), Druid spell list (Entangle, Cure
// Wounds), and faction rep with the Verdant Circle (discount on the
// Pinegate herbalist's potions).

import {
  SRD_CLASS_ARMOR_PROFICIENCIES,
  SRD_CLASS_FEATURES,
  SRD_CLASS_HIT_DIE,
  SRD_CLASS_PRIMARY_STATS,
  SRD_CLASS_SAVING_THROWS,
  SRD_CLASS_SKILLS,
  SRD_CLASS_WEAPON_PROFICIENCIES,
  SRD_MONSTERS,
  SRD_SPELLCASTING_ABILITY,
  SRD_SPELLS,
} from './srd/index.js';
import type { Context } from '../types.js';

export const context: Context = {
  id: 'grove_of_thorns',
  worldNoun: 'grove',
  mapType: 'campaign',
  gridEnabled: true,
  gridWidth: 10,
  gridHeight: 10,
  startRoomId: 'pinegate_square',
  escapeRoomId: 'grove_sanctum_exit',
  escapeTriggers: ['escape', 'leave', 'return to pinegate', 'descend'],
  escapeChoiceText: 'Return to Pinegate — END THE QUEST',

  worldNames: ['The Verdant Reach', 'Pinegate and the Ancient Grove', 'The Old Wood'],

  // ─── Classes (SRD spreads) ──────────────────────────────────────────────────

  classPrimaryStats: { ...SRD_CLASS_PRIMARY_STATS },
  classHitDie: { ...SRD_CLASS_HIT_DIE },
  classSkills: { ...SRD_CLASS_SKILLS },
  classArmorProficiencies: { ...SRD_CLASS_ARMOR_PROFICIENCIES },
  classWeaponProficiencies: { ...SRD_CLASS_WEAPON_PROFICIENCIES },
  classSavingThrows: { ...SRD_CLASS_SAVING_THROWS },
  classFeatures: { ...SRD_CLASS_FEATURES },

  classStartingLoot: {
    Fighter: ['longsword', 'chain_mail', 'shield'],
    Rogue: ['shortsword', 'leather_armor'],
    Wizard: ['quarterstaff', 'component_pouch'],
    // Cleric kit: scale mail + shield (Cleric is light/medium/shield only)
    Cleric: ['mace', 'scale_mail', 'shield', 'holy_symbol'],
    Ranger: ['shortsword', 'longbow', 'leather_armor'],
    Paladin: ['longsword', 'chain_mail', 'shield'],
    Bard: ['rapier', 'leather_armor'],
    // Druid gets quarterstaff (Shillelagh target) + leather + a starting potion
    Druid: ['quarterstaff', 'leather_armor', 'healing_potion'],
    Sorcerer: ['dagger', 'component_pouch', 'healing_potion'],
    Warlock: ['dagger', 'leather_armor', 'healing_potion'],
    Monk: ['shortsword', 'dart'],
    Barbarian: ['greataxe', 'handaxe', 'healing_potion'],
  },

  // ─── Backgrounds (campaign-flavored) ─────────────────────────────────────────

  backgrounds: [
    {
      id: 'soldier',
      name: 'Soldier',
      desc: 'You served Pinegate Watch before the grove went silent.',
      skillProficiencies: ['athletics', 'intimidation'],
      feature: 'Military Rank',
      featureDesc: 'Pinegate guards and ex-soldiers recognise your authority.',
    },
    {
      id: 'criminal',
      name: 'Criminal',
      desc: 'You poached the grove for years. You know its hidden paths.',
      skillProficiencies: ['stealth', 'deception'],
      toolProficiency: "Thieves' Tools",
      feature: 'Criminal Contact',
      featureDesc: 'A discreet contact who can fence rare grove herbs.',
    },
    {
      id: 'sage',
      name: 'Sage',
      desc: 'You studied old fey lore — exactly the wrong kind of knowledge that suddenly matters.',
      skillProficiencies: ['arcana', 'history'],
      feature: 'Researcher',
      featureDesc: 'If you do not know information, you know where to find it.',
    },
    {
      id: 'acolyte',
      name: 'Acolyte',
      desc: 'You spent years at a forest shrine to the Wild Mother.',
      skillProficiencies: ['religion', 'insight'],
      feature: 'Shelter of the Faithful',
      featureDesc: 'You and your companions receive healing and care at temples.',
    },
  ],

  introTexts: [
    `Pinegate is the last village before the Verdant Reach. Two weeks ago, Mother Mareth — the Circle's druid — went silent. Trappers come back wounded or not at all. The villagers are afraid to enter the grove. You arrive at the bridge over the Thornwater with steel and spellcraft.`,
    `The road bends through pine and bramble until Pinegate's lantern-lights show. An elderly woman waits at the village well: "Strangers with sword and spell — the Circle is dying. Will you walk into the grove with me?"`,
    `Bells ring slow over Pinegate as you arrive. Smoke rises from the Verdant Hall — empty, you'll later learn. The grove past the river has gone too quiet.`,
  ],

  roomPool: [], // unused in campaign mode but required

  // ─── Spell system ────────────────────────────────────────────────────────────

  spellTable: { ...SRD_SPELLS },
  classSpells: {
    Cleric: ['sacred_flame', 'cure_wounds', 'guiding_bolt', 'healing_word', 'hold_person', 'bless'],
    Wizard: ['fire_bolt', 'magic_missile', 'thunderwave', 'misty_step', 'shield'],
    // Druid spell list (the campaign's focus): shillelagh for melee buff,
    // entangle for grove fights, healing_word + cure_wounds for support.
    Druid: ['shillelagh', 'entangle', 'cure_wounds', 'healing_word', 'thunderwave'],
    Sorcerer: ['fire_bolt', 'sleep', 'burning_hands', 'shield', 'misty_step'],
    Warlock: ['eldritch_blast', 'hex', 'charm_person', 'hellish_rebuke'],
    Bard: ['bardic_inspiration_spell', 'charm_person', 'healing_word', 'cure_wounds'],
    Paladin: ['divine_smite_spell', 'cure_wounds', 'bless'],
    Ranger: ['cure_wounds', 'entangle'],
  },
  classSpellSlots: {
    Druid: [{ 1: 2 }, { 1: 3 }, { 1: 4, 2: 2 }, { 1: 4, 2: 3 }, { 1: 4, 2: 3, 3: 2 }],
    Cleric: [{ 1: 2 }, { 1: 3 }, { 1: 4, 2: 2 }, { 1: 4, 2: 3 }, { 1: 4, 2: 3, 3: 2 }],
    Wizard: [{ 1: 2 }, { 1: 3 }, { 1: 4, 2: 2 }, { 1: 4, 2: 3 }, { 1: 4, 2: 3, 3: 2 }],
    Sorcerer: [{ 1: 2 }, { 1: 3 }, { 1: 4, 2: 2 }, { 1: 4, 2: 3 }, { 1: 4, 2: 3, 3: 2 }],
    Bard: [{ 1: 2 }, { 1: 3 }, { 1: 4, 2: 2 }, { 1: 4, 2: 3 }, { 1: 4, 2: 3, 3: 2 }],
    Paladin: [{ 1: 2 }, { 1: 2 }, { 1: 3 }, { 1: 3 }, { 1: 4, 2: 2 }],
    Ranger: [{ 1: 2 }, { 1: 3 }, { 1: 4 }, { 1: 4, 2: 2 }, { 1: 4, 2: 3 }],
    Warlock: [{ 1: 1 }, { 1: 2 }, { 2: 2 }, { 2: 2 }, { 3: 2 }],
  },
  spellcastingAbility: { ...SRD_SPELLCASTING_ABILITY },

  // ─── Enemy templates ────────────────────────────────────────────────────────

  enemyTemplates: [
    // SRD wolf, magically awakened — int 10 (vs base 3) + stronger bite
    // (2d4+2 vs 1d6+1). Reads as a wolf that thinks like a person.
    {
      ...SRD_MONSTERS.wolf,
      name: 'Awakened Wolf',
      damage: '2d4+2',
      int: 10,
    },
    // Pure SRD entries — already themed for a fey grove.
    SRD_MONSTERS.giant_spider,
    SRD_MONSTERS.brown_bear,
    {
      name: 'Fey Trickster',
      cr: 4,
      hp: 60,
      ac: 14,
      damage: '1d6+3',
      toHit: 5,
      xp: 1100,
      str: 10,
      dex: 17,
      con: 14,
      int: 14,
      wis: 13,
      cha: 16,
      multiattack: 2,
      // Charms instead of paralyzes — boss flavor: it's not killing
      // you, it's seducing you into the grove. Charmed PCs lose their
      // turn (engine handles via the existing charmed condition).
      onHitEffect: { condition: 'charmed', ability: 'wis', dc: 13 },
      // Casts charm_person (cantrip-like flavor; engine resolves as
      // damage spell with negates-save). Bursts a fey-charm 30% of turns.
      spells: ['hex'],
      castChance: 0.3,
      spellSaveDC: 13,
      damageType: 'piercing',
    },
  ],

  // ─── Loot table ─────────────────────────────────────────────────────────────

  lootTable: [
    // Weapons (used in classStartingLoot)
    {
      id: 'dagger',
      name: 'Dagger',
      weight: 1,
      desc: 'A small, finely-balanced blade.',
      type: 'weapon',
      slot: 'weapon',
      damage: '1d4',
      damageType: 'piercing',
      finesse: true,
      light: true,
      range: 'melee',
      weaponType: 'simple',
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['knife', 'dagger'],
      thrown: { normalRange: 20, longRange: 60 },
      mastery: 'nick',
    },
    {
      id: 'shortsword',
      name: 'Shortsword',
      weight: 2,
      desc: 'A light blade favored by rogues.',
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
      mastery: 'vex',
    },
    {
      id: 'rapier',
      name: 'Rapier',
      weight: 2,
      desc: "A duelist's blade with a needle point.",
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
      aliases: ['rapier'],
      mastery: 'vex',
    },
    {
      id: 'longsword',
      name: 'Longsword',
      weight: 5,
      desc: 'A versatile martial blade.',
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
      aliases: ['sword', 'long sword'],
      mastery: 'sap',
    },
    {
      id: 'greataxe',
      name: 'Greataxe',
      weight: 7,
      desc: 'A massive two-handed axe.',
      type: 'weapon',
      slot: 'weapon',
      damage: '1d12',
      damageType: 'slashing',
      range: 'melee',
      heavy: true,
      weaponType: 'martial',
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['greataxe'],
      mastery: 'cleave',
    },
    {
      id: 'handaxe',
      name: 'Handaxe',
      weight: 2,
      desc: 'A small throwing axe.',
      type: 'weapon',
      slot: 'weapon',
      damage: '1d6',
      damageType: 'slashing',
      light: true,
      range: 'melee',
      weaponType: 'simple',
      ac_bonus: null,
      heal: null,
      effect: null,
      thrown: { normalRange: 20, longRange: 60 },
      aliases: ['hand axe', 'axe'],
      mastery: 'vex',
    },
    {
      id: 'mace',
      name: 'Mace',
      weight: 4,
      desc: 'A solid metal-headed cudgel.',
      type: 'weapon',
      slot: 'weapon',
      damage: '1d6',
      damageType: 'bludgeoning',
      range: 'melee',
      weaponType: 'simple',
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['mace'],
      mastery: 'sap',
    },
    {
      id: 'quarterstaff',
      name: 'Quarterstaff',
      weight: 4,
      desc: "A druid's typical weapon — a stout length of oak.",
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
      aliases: ['staff', 'quarterstaff'],
      mastery: 'topple',
    },
    {
      id: 'longbow',
      name: 'Longbow',
      weight: 2,
      desc: 'A tall yew bow.',
      type: 'weapon',
      slot: 'weapon',
      damage: '1d8',
      damageType: 'piercing',
      range: 'ranged',
      heavy: true,
      weaponType: 'martial',
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['bow', 'longbow'],
      mastery: 'slow',
    },
    {
      id: 'dart',
      name: 'Dart',
      weight: 0,
      desc: 'A small thrown weapon.',
      type: 'weapon',
      slot: 'weapon',
      damage: '1d4',
      damageType: 'piercing',
      range: 'ranged',
      weaponType: 'simple',
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['dart'],
      finesse: true,
      thrown: { normalRange: 20, longRange: 60 },
    },
    // Armor
    {
      id: 'leather_armor',
      name: 'Leather Armor',
      weight: 10,
      desc: 'Hardened leather, light and quiet.',
      type: 'armor',
      slot: 'armor',
      armorCategory: 'light',
      armorAcBase: 11,
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['leather', 'leather armor'],
    },
    {
      id: 'scale_mail',
      name: 'Scale Mail',
      weight: 6,
      desc: 'Overlapping steel scales over a leather backing.',
      type: 'armor',
      slot: 'armor',
      armorCategory: 'medium',
      armorAcBase: 14,
      dexCapToAc: 2,
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['scale', 'scalemail'],
    },
    {
      id: 'chain_mail',
      name: 'Chain Mail',
      weight: 6,
      desc: 'Interlocked steel rings — heavy but protective.',
      type: 'armor',
      slot: 'armor',
      armorCategory: 'heavy',
      armorAcBase: 16,
      dexCapToAc: 0,
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['mail', 'chainmail'],
    },
    {
      id: 'shield',
      name: 'Shield',
      weight: 6,
      desc: '+2 AC while equipped.',
      type: 'armor',
      slot: 'shield',
      armorCategory: 'shield',
      ac_bonus: 2,
      damage: null,
      heal: null,
      effect: null,
      aliases: ['shield'],
    },
    // Misc starting items
    {
      id: 'holy_symbol',
      name: 'Holy Symbol',
      weight: 1,
      desc: "A cleric's spellcasting focus.",
      type: 'misc',
      slot: null,
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['holy symbol'],
    },
    {
      id: 'component_pouch',
      name: 'Component Pouch',
      weight: 2,
      desc: 'Holds spell components for arcane spellcasting.',
      type: 'misc',
      slot: null,
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['component pouch'],
    },
    {
      id: 'healing_potion',
      name: 'Healing Potion',
      weight: 1,
      desc: 'A red elixir that closes wounds — 2d4+2 HP.',
      type: 'consumable',
      slot: null,
      heal: '2d4+2',
      damage: null,
      ac_bonus: null,
      effect: null,
      aliases: ['potion', 'healing potion'],
    },
    // Campaign loot
    {
      id: 'circle_charm',
      name: "Mareth's Charm",
      weight: 0,
      desc: 'An acorn carved with the Verdant Circle sigil. The druid Mareth carried this.',
      type: 'misc',
      slot: null,
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['charm', 'acorn', 'mareth charm'],
    },
    {
      id: 'oak_heart',
      name: 'Heart of the Ancient Oak',
      weight: 2,
      desc: "A fist-sized seedpod glowing with green light. The grove's heart, freed from the trickster.",
      type: 'misc',
      slot: null,
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: null,
      requiresAttunement: true,
      aliases: ['heart', 'oak heart', 'seedpod'],
    },
  ],

  // ─── Campaign payload ───────────────────────────────────────────────────────

  campaign: {
    world_name: 'The Verdant Reach',
    intro:
      "Pinegate is the last village before the Verdant Reach. The Circle's druid Mareth has gone silent for two weeks; the grove's beasts turn savage. You stand at the bridge over the Thornwater. Steel won't be enough — but you have a chance.",

    rooms: [
      {
        id: 'pinegate_square',
        name: 'Pinegate Village',
        desc: 'A small village square with a stone well at its center. Pine trees rise dark beyond the houses. Lanterns burn even at midday.',
      },
      {
        id: 'pinegate_lodge',
        name: 'The Burnt Stump (lodge)',
        desc: "A timber-frame lodge serving as inn, common-hall, and informal council seat. A fire crackles. Mareth's carved charm hangs on the wall.",
      },
      {
        id: 'thornwater_bridge',
        name: 'Thornwater Bridge',
        desc: 'A stone bridge across rushing water. The pines on the far bank stand too still. A faded Verdant Circle banner hangs from the rail.',
      },
      {
        id: 'grove_entrance',
        name: 'Grove Entrance',
        desc: "The path widens into a clearing of standing stones. Wolf-eyes glow from the underbrush. The Circle's old gateway arch is here — and broken.",
      },
      {
        id: 'thornwood_maze',
        name: 'The Thornwood Maze',
        desc: 'A winding stretch of thorn-thicket where the path forks and rejoins. Webs glint between branches. Something many-legged moves overhead.',
      },
      {
        id: 'ancient_oak',
        name: 'The Ancient Oak',
        desc: "A vast, ancient oak at the grove's heart. Roots curl up from the earth in a circular dais, splitting the approach into braided paths. A figure in fey green stands at the trunk — the Trickster, with two trained bears flanking it.",
        // Gnarled roots arching up through the floor — split the approach so
        // the bears can't all converge at once.
        obstacles: [
          { x: 4, y: 3 },
          { x: 6, y: 3 },
          { x: 3, y: 5 },
          { x: 7, y: 5 },
          { x: 5, y: 6 },
        ],
        // Thorned undergrowth in patches — slows movement near the dais.
        difficultTerrain: [
          { x: 4, y: 5 },
          { x: 5, y: 5 },
          { x: 6, y: 5 },
          { x: 5, y: 4 },
        ],
      },
      {
        id: 'grove_sanctum_exit',
        name: 'Grove Sanctum',
        desc: "A sunlit clearing past the Oak. Mareth's charm warms in your hand. The path back to Pinegate is open.",
      },
    ],
    connections: {
      pinegate_square: ['pinegate_lodge', 'thornwater_bridge'],
      pinegate_lodge: ['pinegate_square'],
      thornwater_bridge: ['pinegate_square', 'grove_entrance'],
      grove_entrance: ['thornwater_bridge', 'thornwood_maze'],
      thornwood_maze: ['grove_entrance', 'ancient_oak'],
      ancient_oak: ['thornwood_maze', 'grove_sanctum_exit'],
      grove_sanctum_exit: ['ancient_oak'],
    },

    enemies: {
      grove_entrance: [
        {
          id: 'grove_entrance#0',
          name: 'Awakened Wolf',
          hp: 11,
          ac: 13,
          damage: '2d4+2',
          toHit: 4,
          xp: 50,
          str: 12,
          dex: 15,
          con: 12,
          int: 10,
          wis: 12,
          cha: 8,
        },
        {
          id: 'grove_entrance#1',
          name: 'Awakened Wolf',
          hp: 11,
          ac: 13,
          damage: '2d4+2',
          toHit: 4,
          xp: 50,
          str: 12,
          dex: 15,
          con: 12,
          int: 10,
          wis: 12,
          cha: 8,
        },
      ],
      thornwood_maze: [
        {
          id: 'thornwood_maze#0',
          name: 'Giant Spider',
          hp: 13,
          ac: 14,
          damage: '1d8',
          toHit: 5,
          xp: 100,
          str: 8,
          dex: 16,
          con: 11,
          int: 2,
          wis: 11,
          cha: 4,
          onHitEffect: { condition: 'poisoned', ability: 'con', dc: 11 },
        },
        {
          id: 'thornwood_maze#1',
          name: 'Giant Spider',
          hp: 13,
          ac: 14,
          damage: '1d8',
          toHit: 5,
          xp: 100,
          str: 8,
          dex: 16,
          con: 11,
          int: 2,
          wis: 11,
          cha: 4,
          onHitEffect: { condition: 'poisoned', ability: 'con', dc: 11 },
        },
      ],
      ancient_oak: [
        {
          id: 'ancient_oak#0',
          name: 'Fey Trickster',
          hp: 60,
          ac: 14,
          damage: '1d6+3',
          toHit: 5,
          xp: 1100,
          str: 10,
          dex: 17,
          con: 14,
          int: 14,
          wis: 13,
          cha: 16,
          multiattack: 2,
          onHitEffect: { condition: 'charmed', ability: 'wis', dc: 13 },
          spells: ['hex'],
          castChance: 0.3,
          spellSaveDC: 13,
        },
        {
          id: 'ancient_oak#1',
          name: 'Brown Bear',
          hp: 34,
          ac: 11,
          damage: '2d6+4',
          toHit: 5,
          xp: 200,
          str: 19,
          dex: 10,
          con: 16,
          int: 2,
          wis: 13,
          cha: 7,
          multiattack: 2,
        },
      ],
    },

    loot: {
      pinegate_lodge: {
        id: 'circle_charm',
        name: "Mareth's Charm",
        weight: 0,
        desc: 'An acorn carved with the Verdant Circle sigil. Mareth left it before she vanished.',
        type: 'misc',
        slot: null,
        damage: null,
        ac_bonus: null,
        heal: null,
        effect: null,
        aliases: ['charm', 'acorn'],
      },
      grove_sanctum_exit: {
        id: 'oak_heart',
        name: 'Heart of the Ancient Oak',
        weight: 2,
        desc: "The grove's heart, restored. Pulses warm and green.",
        type: 'misc',
        slot: null,
        damage: null,
        ac_bonus: null,
        heal: null,
        effect: null,
        requiresAttunement: true,
        aliases: ['heart', 'oak heart'],
      },
    },

    npcs: {
      pinegate_square: {
        roomId: 'pinegate_square',
        id: 'npc_mareth_elder',
        name: 'Old Elise (village elder)',
        attitude: 'friendly',
        factionId: 'faction_verdant',
        hp: 6,
        ac: 10,
        damage: '1d4',
        toHit: 0,
        xp: 0,
        greeting:
          'Mother Mareth went into the grove two weeks ago and never returned. The beasts have gone savage. We need someone — anyone — to walk the path she walked.',
        responses: [
          {
            label: "We'll find Mareth and the grove's heart.",
            reply:
              'Bless you. Take her charm from the lodge — it will let the Oak know you are no enemy. Defeat the Fey Trickster at the heart and the grove will mend.',
            consequences: [
              { type: 'advance_quest', questId: 'quest_silent_grove', stepId: 'step_talk_elise' },
            ],
          },
          {
            label: 'What do you know about this Fey Trickster?',
            reply:
              "A Sidhe creature. It charms first, kills second. Don't look it in the eye. Mareth must have refused its bargain. Hex magic is its mark.",
          },
          {
            label: 'Mareth made deals with fey before?',
            reply:
              'The Verdant Circle works with old powers, but this one came uninvited. Whatever pact it offered, Mareth refused — that is why the grove is in pain.',
          },
        ],
        persuasionDC: 10,
      },
      pinegate_lodge: {
        roomId: 'pinegate_lodge',
        id: 'npc_tamsin_herbalist',
        name: 'Tamsin the Herbalist',
        attitude: 'friendly',
        factionId: 'faction_verdant',
        hp: 8,
        ac: 11,
        damage: '1d4',
        toHit: 1,
        xp: 0,
        greeting:
          'Welcome. The grove has not yielded medicine in weeks — what I have left, I sell. Circle-members get a fair price.',
        responses: [
          {
            label: 'Show me your wares.',
            reply: 'Take what you need — coin or rep.',
          },
          {
            label: 'What can you tell me about the grove?',
            reply:
              'The Ancient Oak is at the heart. Mareth used to commune with it. If you reach it and the Oak still lives, plant her charm at its roots — the grove will know.',
          },
        ],
        persuasionDC: 10,
        shop: [{ itemId: 'healing_potion', price: 50 }],
      },
    },

    quests: [
      {
        id: 'quest_silent_grove',
        title: 'The Silent Grove',
        desc: "Old Elise needs someone to walk Mareth's path. Reach the Ancient Oak and find what silenced her.",
        giverNpcId: 'npc_mareth_elder',
        factionId: 'faction_verdant',
        repGain: 15,
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
        ],
        rewards: [
          { type: 'give_gold', amount: 100 },
          { type: 'give_xp', amount: 350 },
          // Faction rep bumped via `repGain: 15` above.
          {
            type: 'add_narrative',
            text: "Old Elise presses your hand in both of hers. 'The Verdant Circle remembers you.'",
          },
        ],
      },
      {
        id: 'quest_break_trickster',
        title: "Break the Trickster's Hold",
        desc: "The Fey Trickster has bound the Ancient Oak. Defeat it and recover the Oak's heart.",
        giverNpcId: 'npc_mareth_elder',
        factionId: 'faction_verdant',
        repGain: 30,
        steps: [
          {
            id: 'step_kill_trickster',
            desc: 'Defeat the Fey Trickster at the Ancient Oak.',
            condition: {
              all: [{ fact: 'enemies_killed', operator: 'contains', value: 'ancient_oak#0' }],
            },
          },
          {
            id: 'step_take_heart',
            desc: 'Recover the Heart of the Ancient Oak from the Grove Sanctum.',
            condition: { all: [{ fact: 'loot_taken', operator: 'contains', value: 'oak_heart' }] },
          },
        ],
        rewards: [
          { type: 'give_gold', amount: 300 },
          { type: 'give_xp', amount: 1500 },
          // Faction rep bumped via `repGain: 30` above.
          { type: 'set_escape' },
          {
            type: 'add_narrative',
            text: 'The grove sighs — a long, green release. Pinegate will sleep easy tonight.',
          },
        ],
      },
    ],

    factions: [
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
    ],

    recommendedPartySize: 3,
    // Recommended composition centers on a Druid — this campaign is the
    // showcase for Wild Shape Beast Forms. Cleric for healing, Fighter to
    // tank the bear minions at the Ancient Oak.
    recommendedComposition: ['Druid', 'Cleric', 'Fighter'],
  },

  // ─── Rules ──────────────────────────────────────────────────────────────────

  rules: [
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
        ],
      },
      consequences: [{ type: 'set_flag', key: 'talked_elise', value: true }],
      once: true,
    },
  ],

  // ─── Narratives ─────────────────────────────────────────────────────────────

  narratives: {
    roomArrival: {
      pinegate_square: [
        'Lantern-light spills across the village square. The well is dry but the firelight is warm.',
        'A few villagers nod and step aside as you pass — newcomers are rare and welcome these weeks.',
      ],
      pinegate_lodge: [
        "Smoke curls from the lodge's hearth. Mareth's charm hangs over the bar, untouched in two weeks.",
        'The Burnt Stump is quiet. The few drinkers here look up briefly, then return to staring at their mugs.',
      ],
      thornwater_bridge: [
        'The river churns dark beneath you. The grove rises silent past the bridge — every birdsong gone.',
        'Frost coats the bridge rail despite the season. The Verdant banner ripples with no wind.',
      ],
      grove_entrance: [
        'The clearing of standing stones. Wolf-eyes track you from the bracken.',
        "The Circle's gateway arch is shattered. Awakened wolves stalk the perimeter.",
      ],
      thornwood_maze: [
        'Spider-silk glints between trunks. Something many-legged shifts overhead.',
        'The path turns and re-turns through thorn. Cobwebs catch on your cloak.',
      ],
      ancient_oak: [
        'The Ancient Oak rises ahead — its bark gone grey, its leaves curled. A figure in fey green stands at its trunk. Two trained bears flank it.',
        'A circle of upraised roots forms a dais around the Oak. The Trickster smiles too widely. The bears are ready.',
      ],
      grove_sanctum_exit: [
        "The Oak's breath returns slow. The path to Pinegate is open. Mareth — if any of her is left — would be proud.",
      ],
    },
    genericArrival: [
      'Pine resin sharp in the air.',
      'Something small rustles in the underbrush.',
      'Sunlight cuts through the canopy at an odd angle.',
    ],
    weaponVerbs: {
      longsword: ['cleaves', 'cuts', 'slashes'],
      shortsword: ['stabs', 'jabs', 'cuts'],
      rapier: ['lunges', 'thrusts', 'pierces'],
      mace: ['cracks', 'smashes', 'bludgeons'],
      quarterstaff: ['strikes', 'sweeps', 'clubs'],
      longbow: ['pins', 'shoots', 'pierces'],
      greataxe: ['cleaves', 'sweeps', 'brings down'],
      handaxe: ['hacks', 'chops', 'hurls'],
      dagger: ['stabs', 'flicks', 'drives'],
      dart: ['fires', 'flicks', 'throws'],
      unarmed: ['punches', 'kicks', 'strikes'],
    },
    classStyle: {
      Fighter: ['with cold precision', 'guard up, blade low', "reading the enemy's stance"],
      Rogue: ['from the foliage', 'finding the soft place', 'exploiting the moment'],
      Wizard: ['arcane focus alight', 'with measured incantation', 'rune-cold and steady'],
      Cleric: ["with the Wild Mother's blessing", 'invoking the green', 'guided by oath'],
      Druid: ["with the grove's own hand", 'channeling the wild', 'rooted and certain'],
      Ranger: ["with ranger's instinct", 'reading the woodland', 'tracking the gap'],
      Paladin: ['with sacred oath', 'shield and faith together', 'unbending'],
      Bard: ['mocking the strike home', 'with strange grace', 'a verse on the blade'],
    },
    enemyReactions: {
      'Awakened Wolf': [
        'The wolf snarls — too aware for a beast.',
        'It circles, eyes flickering with strange thought.',
        'It snaps and pulls back. There is something behind its eyes.',
      ],
      'Giant Spider': [
        'The spider chitters.',
        'It scuttles sideways along the web.',
        'Mandibles work air, dripping venom.',
      ],
      'Brown Bear': [
        'The bear roars — long and shaking.',
        'It rears up to its full height.',
        'Claws rake the dirt as it shifts stance.',
      ],
      'Fey Trickster': [
        '"Such effort. Are you sure this is the side you want to be on?"',
        '"I could give you the grove, you know. Pristine. Yours."',
        'It laughs, and the laugh is not for you.',
      ],
    },
    deathSaveStatus: {
      1: ['Pine-smell sharp. The world is too green.'],
      2: ["The Oak's shadow rises over you."],
      3: ['Stable. The grove holds you for now.'],
    },
    combatHit: {
      healthy: [
        'Your strike connects on {enemy}.',
        '{enemy} reels.',
        'A clean blow lands on {enemy}.',
      ],
      hurt: [
        'Bloodied but steady — you find a hit on {enemy}.',
        'You drive the strike through pain. {enemy} staggers.',
      ],
      critical: [
        'On the edge of falling, you still find {enemy}.',
        'One last good hit on {enemy}.',
      ],
    },
    combatMiss: {
      healthy: ['Your blow glances off {enemy}.', '{enemy} sidesteps.', 'The strike goes wide.'],
      hurt: ['Pain throws your aim. {enemy} dodges.'],
      critical: ['Your strength fails. The strike misses entirely.'],
    },
    enemyAttacks: ['{enemy} strikes!', 'The {enemy} attacks!', '{enemy} closes for {dmg} damage!'],
    killShot: [
      '{enemy} falls. +{xp} XP.',
      'Down goes {enemy}. +{xp} XP.',
      'The {enemy} drops. +{xp} XP.',
    ],
    lootPickedUp: ['You take the {item}.'],
    noLoot: ['Nothing to take here.'],
    alreadyLooted: ['Already gathered.'],
    noEnemy: ['No foe present.'],
    alreadyDead: ['The body is still.'],
    sneakSuccess: ['You slip past the {enemy} unnoticed.'],
    sneakFail: ['The {enemy} spots you — {dmg} damage.'],
    deathLines: [
      'The grove takes you back to the soil.',
      'Mareth — wherever she is — would have asked them to leave you whole.',
    ],
    escapeLines: ['You walk back through the Thornwater toward Pinegate. The grove sleeps.'],
    enemyDeflected: [
      'The {enemy} strikes — your {armor} turns the blow.',
      "Your {armor} catches the {enemy}'s attack.",
    ],
    levelUp: ['Level up — you grow keener.', "The Wild Mother's favor settles on you."],
    noEscapeNearby: ["You aren't at the grove's edge yet."],
    escapeBlocked: ['stands between you and the path home.'],
  },
};
