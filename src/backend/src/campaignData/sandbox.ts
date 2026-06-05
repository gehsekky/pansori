import {
  SRD_CLASS_ARMOR_PROFICIENCIES,
  SRD_CLASS_FEATURES,
  SRD_CLASS_HIT_DIE,
  SRD_CLASS_PRIMARY_STATS,
  SRD_CLASS_SAVING_THROWS,
  SRD_CLASS_SKILLS,
  SRD_CLASS_SKILL_CHOICES,
  SRD_CLASS_STARTING_EQUIPMENT,
  SRD_CLASS_WEAPON_PROFICIENCIES,
  SRD_FEATS,
  SRD_MONSTERS,
  SRD_SPELLCASTING_ABILITY,
  SRD_SPELLS,
  srdBackgrounds,
  srdItems,
} from './srd/index.js';
import type { Context } from '../types.js';

export const context: Context = {
  id: 'sandbox',
  displayNoun: 'dungeon',
  // A small defined grid campaign (the engine focuses on authored campaigns).
  gridWidth: 8,
  gridHeight: 8,

  // ─── Classes ──────────────────────────────────────────────────────────────────
  classPrimaryStats: { ...SRD_CLASS_PRIMARY_STATS },

  classHitDie: { ...SRD_CLASS_HIT_DIE },

  classSkills: { ...SRD_CLASS_SKILLS },
  classSkillChoices: { ...SRD_CLASS_SKILL_CHOICES },

  classArmorProficiencies: { ...SRD_CLASS_ARMOR_PROFICIENCIES },

  classWeaponProficiencies: { ...SRD_CLASS_WEAPON_PROFICIENCIES },

  classSavingThrows: { ...SRD_CLASS_SAVING_THROWS },

  classFeatures: { ...SRD_CLASS_FEATURES },

  // Per-class starting gear — auto-equipped at session start
  classStartingEquipment: { ...SRD_CLASS_STARTING_EQUIPMENT },
  classStartingLoot: {
    Fighter: ['longsword', 'chain_mail', 'shield'],
    Rogue: ['shortsword', 'dagger', 'leather_armor'],
    Wizard: ['quarterstaff', 'healing_potion'],
    Cleric: ['mace', 'chain_shirt', 'shield'],
    Ranger: ['longbow', 'shortsword', 'studded_leather'],
    Paladin: ['longsword', 'chain_mail', 'shield', 'healing_potion'],
    Bard: ['rapier', 'leather_armor', 'healing_potion'],
    Druid: ['quarterstaff', 'leather_armor', 'healing_potion'],
    Sorcerer: ['dagger', 'healing_potion'],
    Warlock: ['dagger', 'leather_armor', 'healing_potion'],
    Monk: ['shortsword', 'dart'],
    Barbarian: ['greataxe', 'handaxe', 'healing_potion'],
  },

  // ─── Backgrounds ──────────────────────────────────────────────────────────────
  backgrounds: srdBackgrounds(),

  // ─── Spell system ─────────────────────────────────────────────────────────────
  spellTable: { ...SRD_SPELLS },

  // ─── Feat system ──────────────────────────────────────────────────────────────
  featTable: { ...SRD_FEATS },

  classSpells: {
    Wizard: ['fire_bolt', 'magic_missile', 'thunderwave', 'misty_step', 'fireball', 'animate_dead'],
    Cleric: [
      'sacred_flame',
      'cure_wounds',
      'guiding_bolt',
      'hold_person',
      'bless',
      'spiritual_weapon',
      'animate_dead',
    ],
    Druid: ['shillelagh', 'entangle', 'cure_wounds', 'healing_word'],
    Sorcerer: ['fire_bolt', 'sleep', 'burning_hands', 'misty_step', 'fireball'],
    Warlock: ['eldritch_blast', 'hex', 'charm_person'],
    Bard: ['charm_person', 'healing_word', 'sleep', 'hold_person'],
    Paladin: ['bless', 'cure_wounds', 'guiding_bolt'],
    Ranger: ['cure_wounds', 'entangle'],
  },

  spellcastingAbility: { ...SRD_SPELLCASTING_ABILITY },

  // ─── Enemy templates ──────────────────────────────────────────────────────────
  // Pure SRD bestiary roster — no themed overrides.
  enemyTemplates: [
    SRD_MONSTERS.goblin,
    SRD_MONSTERS.skeleton,
    SRD_MONSTERS.orc,
    SRD_MONSTERS.cult_fanatic,
    SRD_MONSTERS.ogre,
  ],
  // ─── Loot table ───────────────────────────────────────────────────────────────
  lootTable: [
    // Shared SRD weapons, armor, and gear (canonical definitions).
    ...srdItems(
      'dagger',
      'handaxe',
      'quarterstaff',
      'mace',
      'shortbow',
      'spear',
      'shortsword',
      'rapier',
      'longsword',
      'greatsword',
      'battleaxe',
      'greataxe',
      'glaive',
      'halberd',
      'pike',
      'longbow',
      'hand_crossbow',
      'light_crossbow',
      'heavy_crossbow',
      'leather_armor',
      'studded_leather',
      'chain_shirt',
      'chain_mail',
      'plate_armor',
      'shield',
      'healing_potion',
      'healers_kit'
    ),
    // Campaign-specific custom item (magic weapon, requires attunement).
    {
      id: 'plus1_longsword',
      name: '+1 Longsword',
      desc: '1d8+1 slashing (1d10+1 two-handed), magical',
      weight: 6,
      type: 'weapon',
      slot: 'weapon',
      damage: '1d8+1',
      versatileDamage: '1d10+1',
      finesse: false,
      range: 'melee',
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['+1 longsword', 'magic sword', 'enchanted longsword'],
      weaponType: 'martial',
      damageType: 'slashing',
      requiresAttunement: true,
    },
  ],

  // ─── Campaign (3-level grid map) ───────────────────────────────────────────────
  // A short defined dungeon: one regional site ("The Testing Grounds") whose
  // rooms chain via per-cell `exits`. Deliberately compact — sandbox exists to
  // exercise the rules engine, not to be a long adventure.
  campaign: {
    world_name: 'The Testing Grounds',
    intro:
      'A clinical stone dungeon built to stress-test every rule of combat. Step inside and begin.',
    rooms: [
      {
        id: 'entry_hall',
        name: 'Entry Hall',
        desc: 'A torchlit stone corridor. Crumbling archways lead deeper into the dungeon. A weapon rack on the wall holds a dusty blade.',
        gridWidth: 8,
        gridHeight: 8,
        entryPos: { x: 0, y: 0 },
        exits: [
          {
            pos: { x: 7, y: 0 },
            toRoomId: 'guard_post',
            entrancePos: { x: 0, y: 0 },
            label: 'Deeper in',
          },
          { pos: { x: 0, y: 7 }, ascends: true, label: 'Leave the dungeon' },
        ],
        objects: [
          {
            id: 'weapon_rack',
            name: 'Weapon Rack',
            desc: 'A rusted iron rack holding an assortment of old weapons.',
            interactText: 'You examine the weapon rack.',
            searchable: true,
            searchDC: 10,
            lootIds: ['dagger'],
            foundText: 'Beneath the rust, a serviceable dagger.',
            emptyText: 'You miss it on the first pass. Look again.',
          },
        ],
      },
      {
        id: 'guard_post',
        name: 'Guard Post',
        desc: 'A crude goblin sentry post. Alarm bells hang from a string across the doorway. Crossbow bolts are scattered on the floor.',
        gridWidth: 8,
        gridHeight: 8,
        entryPos: { x: 0, y: 0 },
        exits: [
          {
            pos: { x: 0, y: 1 },
            toRoomId: 'entry_hall',
            entrancePos: { x: 7, y: 0 },
            label: 'Back to the entry hall',
          },
          {
            pos: { x: 7, y: 7 },
            toRoomId: 'bone_crypt',
            entrancePos: { x: 0, y: 0 },
            label: 'Into the crypt',
          },
        ],
      },
      {
        id: 'bone_crypt',
        name: 'Bone Crypt',
        desc: 'Shelves carved into the walls hold hundreds of bones. The air is deathly still.',
        gridWidth: 8,
        gridHeight: 8,
        entryPos: { x: 0, y: 0 },
        exits: [
          {
            pos: { x: 0, y: 1 },
            toRoomId: 'guard_post',
            entrancePos: { x: 7, y: 7 },
            label: 'Back to the guard post',
          },
          {
            pos: { x: 7, y: 7 },
            toRoomId: 'storage_room',
            entrancePos: { x: 0, y: 0 },
            label: 'Through to storage',
          },
        ],
        trap: {
          id: 'pressure_plate',
          name: 'Pressure Plate',
          desc: 'A subtle depression in the floor stone, connected to a spring-loaded spear mechanism.',
          dc: 13,
          damage: '2d6',
          damageType: 'piercing',
          triggerNarrative:
            'A plate depresses underfoot — spears erupt from the walls! {name} takes {dmg} piercing damage.',
          detectNarrative:
            'You spot a slight discoloration in the floor stones — a pressure plate. Stepping on it would be bad.',
          disarmSuccess: 'With careful hands, you jam the mechanism. The trap is disabled.',
          disarmFail:
            'Your attempt to jam the mechanism fails — it triggers! Spears slam from the walls.',
        },
      },
      {
        id: 'storage_room',
        name: 'Storage Room',
        desc: 'Barrels and crates are stacked against the walls. The room is quiet — a rare moment of safety.',
        canRest: true,
        gridWidth: 8,
        gridHeight: 8,
        entryPos: { x: 0, y: 0 },
        exits: [
          {
            pos: { x: 0, y: 1 },
            toRoomId: 'bone_crypt',
            entrancePos: { x: 7, y: 7 },
            label: 'Back to the crypt',
          },
          {
            pos: { x: 7, y: 7 },
            toRoomId: 'great_hall',
            entrancePos: { x: 0, y: 0 },
            label: 'Into the great hall',
          },
        ],
        objects: [
          {
            id: 'supply_crate',
            name: 'Supply Crate',
            desc: 'A heavy wooden crate, sealed with iron bands.',
            interactText: 'You pry open the crate.',
            searchable: true,
            searchDC: 10,
            lootIds: ['healing_potion'],
            foundText: 'Inside: a vial of red liquid. A healing potion.',
            emptyText: 'The lid jams. Get a better grip and try again.',
          },
        ],
      },
      {
        id: 'great_hall',
        name: 'Great Hall',
        desc: 'A cavernous chamber with a crumbling stone throne at one end. Something large patrols the center.',
        gridWidth: 8,
        gridHeight: 8,
        entryPos: { x: 0, y: 0 },
        exits: [
          {
            pos: { x: 0, y: 1 },
            toRoomId: 'storage_room',
            entrancePos: { x: 7, y: 7 },
            label: 'Back to storage',
          },
          {
            pos: { x: 7, y: 7 },
            toRoomId: 'cultist_chamber',
            entrancePos: { x: 0, y: 0 },
            label: 'To the cultist chamber',
          },
        ],
      },
      {
        id: 'cultist_chamber',
        name: 'Cultist Chamber',
        desc: 'Ritual candles surround a dark altar. A robed figure turns to face you, eyes wild with fervor.',
        gridWidth: 8,
        gridHeight: 8,
        entryPos: { x: 0, y: 0 },
        exits: [
          {
            pos: { x: 0, y: 1 },
            toRoomId: 'great_hall',
            entrancePos: { x: 7, y: 7 },
            label: 'Back to the great hall',
          },
          {
            pos: { x: 7, y: 0 },
            toRoomId: 'exit_gate',
            entrancePos: { x: 0, y: 0 },
            label: 'Toward the gate',
          },
        ],
      },
      {
        id: 'exit_gate',
        name: 'Exit Gate',
        desc: 'Iron-banded doors stand at the far end of the chamber. Freedom — if you can reach it.',
        gridWidth: 8,
        gridHeight: 8,
        entryPos: { x: 0, y: 0 },
        exits: [
          {
            pos: { x: 0, y: 1 },
            toRoomId: 'cultist_chamber',
            entrancePos: { x: 7, y: 0 },
            label: 'Back to the cultist chamber',
          },
          { pos: { x: 7, y: 7 }, ascends: true, label: 'Force the gate — leave the dungeon' },
        ],
      },
    ],
    regions: [
      {
        id: 'sandbox_region',
        name: 'The Testing Grounds',
        desc: 'A featureless approach to the dungeon mouth.',
        feetPerSquare: 5280,
        gridWidth: 6,
        gridHeight: 5,
        startPos: { x: 1, y: 2 },
        sites: [
          {
            id: 'site_dungeon',
            name: 'The Dungeon',
            pos: { x: 3, y: 2 },
            kind: 'local',
            entryRoomId: 'entry_hall',
          },
        ],
      },
    ],
    enemies: {
      guard_post: [{ ...SRD_MONSTERS.goblin, id: 'guard_post#0' }],
      bone_crypt: [{ ...SRD_MONSTERS.skeleton, id: 'bone_crypt#0' }],
      great_hall: [{ ...SRD_MONSTERS.ogre, id: 'great_hall#0' }],
      cultist_chamber: [{ ...SRD_MONSTERS.cult_fanatic, id: 'cultist_chamber#0' }],
    },
    loot: {
      great_hall: [
        {
          id: 'plus1_longsword',
          name: '+1 Longsword',
          desc: '1d8+1 slashing (1d10+1 two-handed), magical',
          weight: 6,
          type: 'weapon',
          slot: 'weapon',
          damage: '1d8+1',
          versatileDamage: '1d10+1',
          finesse: false,
          range: 'melee',
          ac_bonus: null,
          heal: null,
          effect: null,
          aliases: ['+1 longsword', 'magic sword', 'enchanted longsword'],
          weaponType: 'martial',
          damageType: 'slashing',
          requiresAttunement: true,
        },
      ],
    },
  },

  // ─── Narratives (minimal/functional for dev context) ──────────────────────────
  narratives: {
    roomArrival: {
      entry_hall: ['You stand at the entrance. The dungeon awaits.'],
      guard_post: ['A goblin sentry spots you immediately.'],
      bone_crypt: ['The dead stir as you enter.'],
      great_hall: ['Something large moves in the shadows.'],
      storage_room: ['Quiet. You can rest here.'],
      cultist_chamber: ['Candlelight flickers across a robed figure.'],
      exit_gate: ['The gate. So close.'],
    },
    genericArrival: [
      'You move into the room, senses alert.',
      'The room opens before you.',
      'You enter cautiously.',
    ],
    weaponVerbs: {
      dagger: ['stabs with', 'drives', 'flicks'],
      handaxe: ['hurls', 'chops with', 'swings'],
      quarterstaff: ['strikes with', 'sweeps', 'thrusts'],
      mace: ['bludgeons with', 'slams', 'swings'],
      shortbow: ['fires', 'looses an arrow with', 'shoots'],
      shortsword: ['slashes with', 'drives', 'cuts with'],
      rapier: ['thrusts with', 'lunges with', 'parries then drives'],
      longsword: ['swings', 'cleaves with', 'drives'],
      greatsword: ['cleaves with', 'brings down', 'sweeps'],
      longbow: ['fires', 'looses', 'shoots'],
      plus1_longsword: ['swings the gleaming blade', 'drives the magical sword', 'cleaves with'],
    },
    classStyle: {
      Fighter: ['with disciplined form', 'with martial precision', 'leveraging years of training'],
      Rogue: ['from the shadows', 'finding the gap in their guard', 'with practiced efficiency'],
      Wizard: ['channeling arcane energy', 'with calculated intent', 'augmented by magic'],
      Cleric: ['invoking divine power', 'with righteous force', 'guided by faith'],
      Ranger: ["with hunter's instinct", 'with practiced aim', 'reading the terrain'],
    },
    enemyReactions: {
      Goblin: ['shrieks', 'snarls', 'snaps its teeth', 'chatters angrily'],
      Skeleton: ['rattles its bones', 'clacks its jaw', 'advances silently'],
      Orc: ['roars', 'bellows', 'lets out a war cry'],
      'Cult Fanatic': ['mutters a dark prayer', 'snarls with zealous fury', 'raises a dagger'],
      Ogre: ['bellows', 'slams its fists together', 'stomps the ground'],
    },
    deathSaveStatus: {
      1: ['Clinging to life.'],
      2: ['One foot in the grave.'],
      3: ['Stable — but unconscious.'],
    },
    combatHit: {
      high: ['A decisive strike — the enemy staggers.', 'Clean hit. The {enemy} reels.'],
      mid: ['Your attack connects. The {enemy} is hurt.', 'You land a solid blow on the {enemy}.'],
      low: ['A glancing blow, but it counts.', "You scrape past the {enemy}'s guard."],
    },
    combatMiss: {
      high: ['Your attack goes wide. The {enemy} is fast.', 'Near miss — the {enemy} dodges.'],
      mid: ['Attack misses.', 'The {enemy} deflects your strike.'],
      low: ['You swing wide.', 'The attack fails to connect.'],
    },
    enemyAttacks: [
      'The {enemy} strikes back for {dmg} damage.',
      'The {enemy} retaliates — {dmg} damage.',
      '{enemy} attacks: {dmg} damage.',
    ],
    killShot: [
      'The {enemy} falls. +{xp} XP.',
      '{enemy} is defeated. +{xp} XP.',
      'Down goes the {enemy}. +{xp} XP.',
    ],
    lootPickedUp: ['You pick up the {item}.', 'You take the {item}.'],
    noLoot: ['Nothing here to take.'],
    alreadyLooted: ['Already taken.'],
    noEnemy: ['No enemy here.'],
    alreadyDead: ['The remains of your foe lie still.'],
    sneakSuccess: ['You slip past the {enemy} undetected.'],
    deathLines: [
      'Slain by {enemy}. The dungeon claims another soul.',
      'The darkness of {world} takes you.',
    ],
    enemyDeflected: [
      'The {enemy} swings — deflected by your {armor}!',
      "Your {armor} turns the {enemy}'s blow.",
    ],
    levelUp: ['Level up! You grow stronger.', 'You feel a surge of power — level gained.'],
  },
};
